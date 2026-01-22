/**
 * Gemini Agent Executor
 *
 * Thin wrapper around Gemini API that uses config-driven prompts and validation.
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
  GEMINI_TOOL_DECLARATIONS,
  executeTool,
} from './tools/tool-registry'
import {
  parsePlanFromText,
  type PlanValidationResult,
} from './validation/plan-validator'

// ============================================================================
// TYPES
// ============================================================================

export interface GeminiAgentExecutorConfig {
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
// GEMINI API
// ============================================================================

interface GeminiContent {
  role: 'user' | 'model'
  parts: Array<{
    text?: string
    functionCall?: { name: string; args: Record<string, unknown> }
    functionResponse?: { name: string; response: { result: string } }
  }>
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      role: 'model'
      parts: Array<{
        text?: string
        functionCall?: { name: string; args: Record<string, unknown> }
      }>
    }
    finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER'
  }>
  usageMetadata: {
    promptTokenCount: number
    candidatesTokenCount: number
  }
}

async function callGemini(
  contents: GeminiContent[],
  systemInstruction: string,
  apiKey: string,
  config: ResolvedAstridConfig,
  model: string = 'gemini-2.0-flash'
): Promise<GeminiResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const { maxRetries, initialBackoffMs, maxBackoffMs, backoffMultiplier, apiTimeoutMs } = config.retry
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), apiTimeoutMs)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents,
          tools: [{ functionDeclarations: GEMINI_TOOL_DECLARATIONS }],
          toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
          generationConfig: {
            maxOutputTokens: config.agent.modelParameters.execution.maxTokens,
            temperature: config.agent.modelParameters.execution.temperature
          }
        })
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        return response.json()
      }

      const errorText = await response.text()

      // Retry on rate limit
      if (response.status === 429 && attempt < maxRetries - 1) {
        let waitTime = Math.min(initialBackoffMs * Math.pow(backoffMultiplier, attempt), maxBackoffMs)

        // Try to parse retry delay from response
        try {
          const errorData = JSON.parse(errorText)
          const retryDelay = errorData?.error?.details?.find((d: { '@type': string }) =>
            d['@type']?.includes('RetryInfo')
          )?.retryDelay
          if (retryDelay) {
            waitTime = parseInt(retryDelay) * 1000 || waitTime
          }
        } catch {
          // Use default backoff
        }

        console.log(`   ⏳ Rate limited, waiting ${waitTime / 1000}s...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
        continue
      }

      lastError = new Error(parseGeminiError(response.status, errorText))
      break
    } catch (fetchError) {
      clearTimeout(timeoutId)

      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        lastError = new Error(`Gemini API timed out after ${apiTimeoutMs / 1000}s`)
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

  throw lastError || new Error('Gemini API call failed')
}

function parseGeminiError(status: number, errorText: string): string {
  try {
    const errorData = JSON.parse(errorText)
    const message = errorData?.error?.message || ''
    const code = errorData?.error?.code || status

    if (code === 429 || message.includes('quota') || message.includes('rate')) {
      if (message.includes('free_tier')) {
        return 'Gemini API free tier limit reached'
      }
      return 'Gemini API rate limit exceeded'
    }
    if (code === 401 || code === 403) {
      return 'Gemini API key is invalid'
    }
    if (message) {
      return `Gemini API error: ${message.split('\n')[0].substring(0, 200)}`
    }
    return `Gemini API error (${code})`
  } catch {
    return `Gemini API error (${status})`
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

export async function planWithGemini(
  taskTitle: string,
  taskDescription: string | null,
  executorConfig: GeminiAgentExecutorConfig
): Promise<PlanningResult> {
  const log = executorConfig.logger || (() => {})
  const onProgress = executorConfig.onProgress || (() => {})
  const model = executorConfig.model || 'gemini-2.0-flash'

  log('info', 'Starting Gemini planning', { repoPath: executorConfig.repoPath, taskTitle })
  onProgress('Initializing Gemini for planning...')

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

  const contents: GeminiContent[] = [
    { role: 'user', parts: [{ text: userPrompt }] }
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

      const response = await callGemini(contents, systemPrompt, executorConfig.apiKey, config, model)
      totalInputTokens += response.usageMetadata?.promptTokenCount || 0
      totalOutputTokens += response.usageMetadata?.candidatesTokenCount || 0

      const candidate = response.candidates[0]
      if (!candidate) {
        return { success: false, error: 'No response from Gemini', modelResponse: lastModelResponse }
      }

      // Capture the model's text response for error reporting
      const currentTextPart = candidate.content.parts.find(p => p.text)
      if (currentTextPart?.text) {
        lastModelResponse = currentTextPart.text
      }

      // Add model response to history
      contents.push({ role: 'model', parts: candidate.content.parts })

      // Handle function calls
      const functionCalls = candidate.content.parts.filter(p => p.functionCall)

      if (functionCalls.length > 0) {
        const functionResponses: GeminiContent['parts'] = []

        for (const part of functionCalls) {
          if (!part.functionCall) continue

          const { name, args } = part.functionCall
          onProgress(`Using tool: ${name}`)
          log('info', 'Tool call', { tool: name })

          const result = await executeTool(name, args, executorConfig.repoPath, config)

          functionResponses.push({
            functionResponse: {
              name,
              response: { result: result.result.substring(0, config.validation.contextTruncationLength) }
            }
          })
        }

        contents.push({ role: 'user', parts: functionResponses })
        continue
      }

      // No function calls - check for text response with plan
      const textPart = candidate.content.parts.find(p => p.text)
      if (textPart?.text) {
        const validationResult = parsePlanFromText(textPart.text, config)

        if (validationResult.valid && validationResult.plan) {
          log('info', 'Planning complete', { files: validationResult.plan.files.length })
          return {
            success: true,
            plan: validationResult.plan,
            usage: {
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
              costUSD: (totalInputTokens * 0.00125 + totalOutputTokens * 0.005) / 1000
            }
          }
        }

        // Plan invalid - ask for correction
        if (validationResult.errors.includes('No JSON block found in response')) {
          // First iteration without tools? Prompt to use tools
          if (i === 0) {
            contents.push({ role: 'user', parts: [{ text: buildUseToolsPrompt() }] })
            continue
          }
        }

        // Empty plan
        if (validationResult.errors.some(e => e.includes('no files'))) {
          contents.push({ role: 'user', parts: [{ text: buildEmptyPlanRecoveryPrompt() }] })
          continue
        }
      }

      // Ask for plan
      if (candidate.finishReason === 'STOP') {
        contents.push({ role: 'user', parts: [{ text: buildRequestPlanPrompt() }] })
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

export async function executeWithGemini(
  plan: ImplementationPlan,
  taskTitle: string,
  taskDescription: string | null,
  executorConfig: GeminiAgentExecutorConfig
): Promise<ExecutionResultFull> {
  const log = executorConfig.logger || (() => {})
  const onProgress = executorConfig.onProgress || (() => {})
  const model = executorConfig.model || 'gemini-2.0-flash'

  log('info', 'Starting Gemini execution', {
    repoPath: executorConfig.repoPath,
    filesInPlan: plan.files.length
  })
  onProgress('Initializing Gemini agent...')

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

  const contents: GeminiContent[] = [
    { role: 'user', parts: [{ text: userPrompt }] }
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
            costUSD: (totalInputTokens * 0.00125 + totalOutputTokens * 0.005) / 1000
          }
        }
      }

      onProgress(`Implementation iteration ${i + 1}...`)

      const response = await callGemini(contents, systemPrompt, executorConfig.apiKey, config, model)
      totalInputTokens += response.usageMetadata?.promptTokenCount || 0
      totalOutputTokens += response.usageMetadata?.candidatesTokenCount || 0

      const candidate = response.candidates[0]
      if (!candidate) {
        return {
          success: false,
          files: [],
          commitMessage: '',
          prTitle: '',
          prDescription: '',
          error: 'No response from Gemini'
        }
      }

      contents.push({ role: 'model', parts: candidate.content.parts })

      const functionCalls = candidate.content.parts.filter(p => p.functionCall)

      if (functionCalls.length > 0) {
        const functionResponses: GeminiContent['parts'] = []

        for (const part of functionCalls) {
          if (!part.functionCall) continue

          const { name, args } = part.functionCall
          onProgress(`Using tool: ${name}`)
          log('info', 'Tool call', { tool: name })

          // Handle task_complete specially
          if (name === 'task_complete') {
            const files = Array.from(fileChanges.entries()).map(([p, c]) => ({ path: p, ...c }))
            return {
              success: true,
              files,
              commitMessage: (args.commit_message as string) || `feat: ${taskTitle}`,
              prTitle: (args.pr_title as string) || `feat: ${taskTitle}`,
              prDescription: (args.pr_description as string) || taskDescription || taskTitle,
              usage: {
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens,
                costUSD: (totalInputTokens * 0.00125 + totalOutputTokens * 0.005) / 1000
              }
            }
          }

          // Check if file existed before the operation (for action detection)
          let fileExistedBefore = false
          const filePath = args.file_path as string
          if (['write_file', 'write', 'edit_file', 'edit'].includes(name.toLowerCase())) {
            try {
              await fs.access(path.join(executorConfig.repoPath, filePath))
              fileExistedBefore = true
            } catch {
              // File doesn't exist yet
            }
          }

          const result = await executeTool(name, args, executorConfig.repoPath, config)

          // Track file changes from write/edit operations
          if (['write_file', 'write', 'edit_file', 'edit'].includes(name.toLowerCase()) && result.success) {
            try {
              const content = await fs.readFile(path.join(executorConfig.repoPath, filePath), 'utf-8')
              const action = fileExistedBefore || fileChanges.has(filePath) ? 'modify' : 'create'
              fileChanges.set(filePath, { content, action })
            } catch {
              // File might have been deleted
            }
          }

          functionResponses.push({
            functionResponse: {
              name,
              response: { result: result.result.substring(0, config.validation.contextTruncationLength) }
            }
          })
        }

        contents.push({ role: 'user', parts: functionResponses })
        continue
      }

      // No function calls - prompt for completion
      if (candidate.finishReason === 'STOP') {
        contents.push({ role: 'user', parts: [{ text: buildRequestCompletionPrompt() }] })
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
        costUSD: (totalInputTokens * 0.00125 + totalOutputTokens * 0.005) / 1000
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
