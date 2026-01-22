/**
 * OpenAI Agent Executor
 *
 * Thin wrapper around OpenAI API that uses config-driven prompts and validation.
 * All intelligence comes from .astrid.config.json, making this executor simple.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import type { ImplementationPlan } from './types'
import type { ResolvedAstridConfig } from './config/schema'
import {
  loadAstridConfig,
  detectPlatform,
  getInitialGlobPattern,
} from './config'
import {
  buildPlanningPrompt,
  buildExecutionPrompt,
  buildPlanningUserMessage,
  buildExecutionUserMessage,
  buildUseToolsPrompt,
  buildEmptyPlanRecoveryPrompt,
  buildRequestPlanPrompt,
  buildRequestCompletionPrompt,
  type PlanningPromptContext,
  type ExecutionPromptContext,
} from './config/prompt-builder'
import {
  OPENAI_TOOL_DEFINITIONS,
  executeTool,
} from './tools/tool-registry'
import {
  parsePlanFromText,
  type PlanValidationResult,
} from './validation/plan-validator'

// ============================================================================
// TYPES
// ============================================================================

export interface OpenAIAgentExecutorConfig {
  repoPath: string
  apiKey: string
  model?: string
  maxIterations?: number
  logger?: (level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void
  onProgress?: (message: string) => void
}

export interface PlanningResult {
  success: boolean
  plan?: ImplementationPlan
  error?: string
  /** The AI model's last text response - useful for showing user what went wrong */
  modelResponse?: string
  usage?: {
    inputTokens: number
    outputTokens: number
    costUSD: number
  }
}

// ============================================================================
// OPENAI API
// ============================================================================

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      role: 'assistant'
      content: string | null
      tool_calls?: Array<{
        id: string
        type: 'function'
        function: { name: string; arguments: string }
      }>
    }
    finish_reason: 'stop' | 'tool_calls' | 'length'
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
  }
}

async function callOpenAI(
  messages: OpenAIMessage[],
  apiKey: string,
  config: ResolvedAstridConfig,
  model: string = 'gpt-5.2'
): Promise<OpenAIResponse> {
  const { maxRetries, initialBackoffMs, maxBackoffMs, backoffMultiplier, apiTimeoutMs } = config.retry
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), apiTimeoutMs)

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages,
          tools: OPENAI_TOOL_DEFINITIONS,
          tool_choice: 'auto',
          max_tokens: config.agent.modelParameters.execution.maxTokens,
          temperature: config.agent.modelParameters.execution.temperature
        })
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        return response.json()
      }

      const errorText = await response.text()

      // Retry on rate limit
      if (response.status === 429 && attempt < maxRetries - 1) {
        const retryAfter = response.headers.get('retry-after')
        const waitTime = retryAfter
          ? parseInt(retryAfter) * 1000
          : Math.min(initialBackoffMs * Math.pow(backoffMultiplier, attempt), maxBackoffMs)

        console.log(`   ⏳ Rate limited, waiting ${waitTime / 1000}s...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
        continue
      }

      lastError = new Error(parseOpenAIError(response.status, errorText))
      break
    } catch (fetchError) {
      clearTimeout(timeoutId)

      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        lastError = new Error(`OpenAI API timed out after ${apiTimeoutMs / 1000}s`)
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, initialBackoffMs))
          continue
        }
      } else {
        lastError = fetchError instanceof Error ? fetchError : new Error(String(fetchError))
      }
      break
    }
  }

  throw lastError || new Error('OpenAI API call failed')
}

function parseOpenAIError(status: number, errorText: string): string {
  try {
    const errorData = JSON.parse(errorText)
    const message = errorData?.error?.message || ''
    const code = errorData?.error?.code || ''

    if (status === 429 || code === 'rate_limit_exceeded') {
      return 'OpenAI API rate limit exceeded'
    }
    if (status === 401 || code === 'invalid_api_key') {
      return 'OpenAI API key is invalid'
    }
    if (message) {
      return `OpenAI API error: ${message.split('\n')[0].substring(0, 200)}`
    }
    return `OpenAI API error (${status})`
  } catch {
    return `OpenAI API error (${status})`
  }
}

// ============================================================================
// CONTEXT LOADING
// ============================================================================

async function loadAstridMd(repoPath: string, maxLength: number): Promise<string | null> {
  try {
    const content = await fs.readFile(path.join(repoPath, 'ASTRID.md'), 'utf-8')
    return content.length > maxLength ? content.substring(0, maxLength) + '\n\n[truncated...]' : content
  } catch {
    return null
  }
}

// ============================================================================
// PLANNING
// ============================================================================

export async function planWithOpenAI(
  taskTitle: string,
  taskDescription: string | null,
  executorConfig: OpenAIAgentExecutorConfig
): Promise<PlanningResult> {
  const log = executorConfig.logger || (() => {})
  const onProgress = executorConfig.onProgress || (() => {})
  const model = executorConfig.model || 'gpt-5.2'

  log('info', 'Starting OpenAI planning', { repoPath: executorConfig.repoPath, taskTitle })
  onProgress('Initializing OpenAI for planning...')

  // Load config - all behavior comes from here
  const config = await loadAstridConfig(executorConfig.repoPath)
  const platform = detectPlatform(config, taskTitle, taskDescription || '')
  const initialPattern = getInitialGlobPattern(config, platform)

  // Load ASTRID.md for context
  const astridMd = await loadAstridMd(executorConfig.repoPath, config.validation.contextTruncationLength)
  if (astridMd) {
    onProgress('Loaded project context from ASTRID.md')
  }

  // Build prompt from config templates
  const promptContext: PlanningPromptContext = {
    taskTitle,
    taskDescription,
  }
  const systemPrompt = buildPlanningPrompt(config, promptContext, platform)
  const userPrompt = buildPlanningUserMessage(taskTitle, platform, initialPattern)

  const messages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ]

  let totalInputTokens = 0
  let totalOutputTokens = 0
  let lastModelResponse: string | undefined  // Track last model text for error reporting
  const maxIterations = executorConfig.maxIterations || config.agent.maxPlanningIterations

  // Timeout from config
  const timeoutMs = config.agent.planningTimeoutMinutes * 60 * 1000
  const startTime = Date.now()

  try {
    for (let i = 0; i < maxIterations; i++) {
      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        return { success: false, error: `Planning timed out after ${config.agent.planningTimeoutMinutes} minutes`, modelResponse: lastModelResponse }
      }

      onProgress(`Planning iteration ${i + 1}...`)

      const response = await callOpenAI(messages, executorConfig.apiKey, config, model)
      totalInputTokens += response.usage.prompt_tokens
      totalOutputTokens += response.usage.completion_tokens

      const choice = response.choices[0]
      const assistantMessage = choice.message

      // Capture the model's text response for error reporting
      if (assistantMessage.content) {
        lastModelResponse = assistantMessage.content
      }

      messages.push({
        role: 'assistant',
        content: assistantMessage.content,
        tool_calls: assistantMessage.tool_calls
      })

      // Handle tool calls
      if (assistantMessage.tool_calls?.length) {
        for (const toolCall of assistantMessage.tool_calls) {
          const args = JSON.parse(toolCall.function.arguments)
          onProgress(`Using tool: ${toolCall.function.name}`)
          log('info', 'Tool call', { tool: toolCall.function.name })

          const result = await executeTool(
            toolCall.function.name,
            args,
            executorConfig.repoPath,
            config
          )

          messages.push({
            role: 'tool',
            content: result.result.substring(0, config.validation.contextTruncationLength),
            tool_call_id: toolCall.id
          })
        }
        continue
      }

      // No tool calls - check for plan
      if (assistantMessage.content) {
        const validationResult = parsePlanFromText(assistantMessage.content, config)

        if (validationResult.valid && validationResult.plan) {
          log('info', 'Planning complete', { files: validationResult.plan.files.length })
          return {
            success: true,
            plan: validationResult.plan,
            usage: {
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
              costUSD: (totalInputTokens * 0.0025 + totalOutputTokens * 0.01) / 1000
            }
          }
        }

        // Plan invalid - ask for correction
        if (validationResult.errors.includes('No JSON block found in response')) {
          // First iteration without tools? Prompt to use tools
          if (i === 0) {
            messages.push({ role: 'user', content: buildUseToolsPrompt() })
            continue
          }
        }

        // Empty plan
        if (validationResult.errors.some(e => e.includes('no files'))) {
          messages.push({ role: 'user', content: buildEmptyPlanRecoveryPrompt() })
          continue
        }
      }

      // Ask for plan
      if (choice.finish_reason === 'stop') {
        messages.push({ role: 'user', content: buildRequestPlanPrompt() })
      }
    }

    return { success: false, error: 'Max iterations reached without producing a plan', modelResponse: lastModelResponse }
  } catch (error) {
    log('error', 'Planning failed', { error })
    return { success: false, error: error instanceof Error ? error.message : String(error), modelResponse: lastModelResponse }
  }
}

// ============================================================================
// EXECUTION
// ============================================================================

export interface ExecutionResultFull {
  success: boolean
  files: Array<{ path: string; content: string; action: 'create' | 'modify' | 'delete' }>
  commitMessage: string
  prTitle: string
  prDescription: string
  error?: string
  usage?: { inputTokens: number; outputTokens: number; costUSD: number }
}

export async function executeWithOpenAI(
  plan: ImplementationPlan,
  taskTitle: string,
  taskDescription: string | null,
  executorConfig: OpenAIAgentExecutorConfig
): Promise<ExecutionResultFull> {
  const log = executorConfig.logger || (() => {})
  const onProgress = executorConfig.onProgress || (() => {})
  const model = executorConfig.model || 'gpt-5.2'

  log('info', 'Starting OpenAI execution', {
    repoPath: executorConfig.repoPath,
    filesInPlan: plan.files.length
  })
  onProgress('Initializing OpenAI agent...')

  // Load config
  const config = await loadAstridConfig(executorConfig.repoPath)
  const platform = detectPlatform(config, taskTitle, taskDescription || '')

  // Build prompt from config templates
  const promptContext: ExecutionPromptContext = {
    taskTitle,
    taskDescription,
    plan,
  }
  const systemPrompt = buildExecutionPrompt(config, promptContext, platform)
  const userPrompt = buildExecutionUserMessage(taskTitle, plan)

  const messages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ]

  const fileChanges: Map<string, { content: string; action: 'create' | 'modify' | 'delete' }> = new Map()
  let totalInputTokens = 0
  let totalOutputTokens = 0
  const maxIterations = executorConfig.maxIterations || config.agent.maxExecutionIterations

  // Timeout from config
  const timeoutMs = config.agent.executionTimeoutMinutes * 60 * 1000
  const startTime = Date.now()

  try {
    for (let i = 0; i < maxIterations; i++) {
      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        const files = Array.from(fileChanges.entries()).map(([p, c]) => ({ path: p, ...c }))
        return {
          success: files.length > 0,
          files,
          commitMessage: `feat: ${taskTitle}`,
          prTitle: `feat: ${taskTitle}`,
          prDescription: taskDescription || taskTitle,
          error: `Execution timed out after ${config.agent.executionTimeoutMinutes} minutes`,
          usage: {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            costUSD: (totalInputTokens * 0.0025 + totalOutputTokens * 0.01) / 1000
          }
        }
      }

      onProgress(`Implementation iteration ${i + 1}...`)

      const response = await callOpenAI(messages, executorConfig.apiKey, config, model)
      totalInputTokens += response.usage.prompt_tokens
      totalOutputTokens += response.usage.completion_tokens

      const choice = response.choices[0]
      const assistantMessage = choice.message

      messages.push({
        role: 'assistant',
        content: assistantMessage.content,
        tool_calls: assistantMessage.tool_calls
      })

      if (assistantMessage.tool_calls?.length) {
        for (const toolCall of assistantMessage.tool_calls) {
          const args = JSON.parse(toolCall.function.arguments)
          const toolName = toolCall.function.name

          onProgress(`Using tool: ${toolName}`)
          log('info', 'Tool call', { tool: toolName })

          // Handle task_complete specially
          if (toolName === 'task_complete') {
            const files = Array.from(fileChanges.entries()).map(([p, c]) => ({ path: p, ...c }))
            return {
              success: true,
              files,
              commitMessage: args.commit_message as string,
              prTitle: args.pr_title as string,
              prDescription: args.pr_description as string,
              usage: {
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens,
                costUSD: (totalInputTokens * 0.0025 + totalOutputTokens * 0.01) / 1000
              }
            }
          }

          // Check if file existed before the operation (for action detection)
          let fileExistedBefore = false
          const filePath = args.file_path as string
          if (['write_file', 'write', 'edit_file', 'edit'].includes(toolName.toLowerCase())) {
            try {
              await fs.access(path.join(executorConfig.repoPath, filePath))
              fileExistedBefore = true
            } catch {
              // File doesn't exist yet
            }
          }

          const result = await executeTool(toolName, args, executorConfig.repoPath, config)

          // Track file changes from write/edit operations
          if (['write_file', 'write', 'edit_file', 'edit'].includes(toolName.toLowerCase()) && result.success) {
            try {
              const content = await fs.readFile(path.join(executorConfig.repoPath, filePath), 'utf-8')
              const action = fileExistedBefore || fileChanges.has(filePath) ? 'modify' : 'create'
              fileChanges.set(filePath, { content, action })
            } catch {
              // File might have been deleted
            }
          }

          messages.push({
            role: 'tool',
            content: result.result.substring(0, config.validation.contextTruncationLength),
            tool_call_id: toolCall.id
          })
        }
        continue
      }

      // No tool calls - prompt for completion
      if (choice.finish_reason === 'stop') {
        messages.push({ role: 'user', content: buildRequestCompletionPrompt() })
      }
    }

    // Max iterations reached
    const files = Array.from(fileChanges.entries()).map(([p, c]) => ({ path: p, ...c }))
    return {
      success: files.length > 0,
      files,
      commitMessage: `feat: ${taskTitle}`,
      prTitle: `feat: ${taskTitle}`,
      prDescription: taskDescription || taskTitle,
      error: 'Max iterations reached',
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        costUSD: (totalInputTokens * 0.0025 + totalOutputTokens * 0.01) / 1000
      }
    }
  } catch (error) {
    log('error', 'Execution failed', { error })
    return {
      success: false,
      files: [],
      commitMessage: '',
      prTitle: '',
      prDescription: '',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
