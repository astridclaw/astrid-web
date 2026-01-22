/**
 * OpenAI Agent Executor
 *
 * Thin wrapper around OpenAI API that uses config-driven behavior.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { execSync } from 'child_process'
import { glob } from 'glob'
import type {
  ImplementationPlan,
  ExecutionResult,
  PlanningResult,
  Logger,
  ProgressCallback,
} from '../types/index.js'
import { DEFAULT_MODELS } from '../utils/agent-config.js'
import {
  loadAstridConfig,
  detectPlatform,
  generateStructurePrompt,
  generatePlatformHints,
  getInitialGlobPattern,
  isBlockedCommand,
  type ResolvedAstridConfig,
} from '../config/index.js'

// ============================================================================
// CONFIG
// ============================================================================

export interface OpenAIExecutorConfig {
  repoPath: string
  apiKey: string
  model?: string
  maxIterations?: number
  logger?: Logger
  onProgress?: ProgressCallback
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read the contents of a file',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Path to the file' }
        },
        required: ['file_path']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'write_file',
      description: 'Write content to a file',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Path to the file' },
          content: { type: 'string', description: 'Content to write' }
        },
        required: ['file_path', 'content']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_file',
      description: 'Edit a file by replacing old_string with new_string',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Path to the file' },
          old_string: { type: 'string', description: 'String to find' },
          new_string: { type: 'string', description: 'Replacement string' }
        },
        required: ['file_path', 'old_string', 'new_string']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_bash',
      description: 'Run a bash command',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The bash command' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'glob_files',
      description: 'Find files matching a glob pattern',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern' }
        },
        required: ['pattern']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'grep_search',
      description: 'Search for a pattern in files',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Search pattern' },
          file_pattern: { type: 'string', description: 'Optional glob pattern' }
        },
        required: ['pattern']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'task_complete',
      description: 'Signal that the task is complete',
      parameters: {
        type: 'object',
        properties: {
          commit_message: { type: 'string', description: 'Git commit message' },
          pr_title: { type: 'string', description: 'PR title' },
          pr_description: { type: 'string', description: 'PR description' }
        },
        required: ['commit_message', 'pr_title', 'pr_description']
      }
    }
  }
]

// ============================================================================
// TOOL EXECUTION
// ============================================================================

interface ToolResult {
  success: boolean
  result: string
  fileChange?: { path: string; content: string; action: 'create' | 'modify' | 'delete' }
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  repoPath: string,
  config: ResolvedAstridConfig
): Promise<ToolResult> {
  try {
    switch (name) {
      case 'read_file': {
        const filePath = path.join(repoPath, args.file_path as string)
        const content = await fs.readFile(filePath, 'utf-8')
        return { success: true, result: content }
      }

      case 'write_file': {
        const filePath = path.join(repoPath, args.file_path as string)
        const content = args.content as string
        let action: 'create' | 'modify' = 'create'
        try {
          await fs.access(filePath)
          action = 'modify'
        } catch {
          await fs.mkdir(path.dirname(filePath), { recursive: true })
        }
        await fs.writeFile(filePath, content, 'utf-8')
        return {
          success: true,
          result: `File ${action === 'create' ? 'created' : 'updated'}: ${args.file_path}`,
          fileChange: { path: args.file_path as string, content, action }
        }
      }

      case 'edit_file': {
        const filePath = path.join(repoPath, args.file_path as string)
        const oldContent = await fs.readFile(filePath, 'utf-8')
        const oldString = args.old_string as string
        const newString = args.new_string as string
        if (!oldContent.includes(oldString)) {
          return { success: false, result: `Error: Could not find string in file` }
        }
        const newContent = oldContent.replace(oldString, newString)
        await fs.writeFile(filePath, newContent, 'utf-8')
        return {
          success: true,
          result: `File edited: ${args.file_path}`,
          fileChange: { path: args.file_path as string, content: newContent, action: 'modify' }
        }
      }

      case 'run_bash': {
        const command = args.command as string
        if (isBlockedCommand(command, config)) {
          return { success: false, result: 'Error: Command blocked by safety policy' }
        }
        try {
          const output = execSync(command, {
            cwd: repoPath,
            encoding: 'utf-8',
            timeout: 60000,
            maxBuffer: 1024 * 1024
          })
          return { success: true, result: output || '(no output)' }
        } catch (error) {
          const err = error as { stderr?: string; message?: string }
          return { success: false, result: `Error: ${err.stderr || err.message}` }
        }
      }

      case 'glob_files': {
        const pattern = args.pattern as string
        const files = await glob(pattern, { cwd: repoPath, nodir: true })
        return {
          success: true,
          result: files.slice(0, config.validation.maxGlobResults).join('\n') || '(no matches)'
        }
      }

      case 'grep_search': {
        const pattern = args.pattern as string
        const filePattern = (args.file_pattern as string) || '.'
        try {
          const output = execSync(
            `grep -rn "${pattern.replace(/"/g, '\\"')}" ${filePattern} | head -${config.validation.maxGlobResults}`,
            { cwd: repoPath, encoding: 'utf-8', timeout: 30000 }
          )
          return { success: true, result: output || '(no matches)' }
        } catch {
          return { success: true, result: '(no matches)' }
        }
      }

      case 'task_complete':
        return { success: true, result: 'Task marked complete' }

      default:
        return { success: false, result: `Unknown tool: ${name}` }
    }
  } catch (error) {
    return { success: false, result: `Error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

// ============================================================================
// API CALLS
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
  usage: { prompt_tokens: number; completion_tokens: number }
}

async function callOpenAI(
  messages: OpenAIMessage[],
  apiKey: string,
  model: string,
  config: ResolvedAstridConfig
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
          tools: TOOLS,
          tool_choice: 'auto',
          max_tokens: config.agent.modelParameters.execution.maxTokens,
          temperature: config.agent.modelParameters.execution.temperature
        })
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        return response.json() as Promise<OpenAIResponse>
      }

      const errorText = await response.text()

      if (response.status === 429 && attempt < maxRetries - 1) {
        const waitTime = Math.min(initialBackoffMs * Math.pow(backoffMultiplier, attempt), maxBackoffMs)
        await new Promise(resolve => setTimeout(resolve, waitTime))
        continue
      }

      lastError = new Error(`OpenAI API error (${response.status}): ${errorText.substring(0, 200)}`)
      break
    } catch (fetchError) {
      clearTimeout(timeoutId)
      lastError = fetchError instanceof Error ? fetchError : new Error(String(fetchError))
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, initialBackoffMs))
        continue
      }
    }
  }

  throw lastError || new Error('OpenAI API call failed')
}

async function loadAstridMd(repoPath: string, maxLength: number): Promise<string | null> {
  try {
    const content = await fs.readFile(path.join(repoPath, 'ASTRID.md'), 'utf-8')
    return content.length > maxLength ? content.substring(0, maxLength) + '\n\n[truncated...]' : content
  } catch {
    // Try README.md as fallback
    try {
      const content = await fs.readFile(path.join(repoPath, 'README.md'), 'utf-8')
      const truncated = content.length > maxLength / 2
        ? content.substring(0, maxLength / 2) + '\n\n[README.md truncated...]'
        : content
      return `## Project Context (from README.md)\n\n${truncated}`
    } catch {
      return null
    }
  }
}

// ============================================================================
// PLANNING
// ============================================================================

export async function planWithOpenAI(
  taskTitle: string,
  taskDescription: string | null,
  executorConfig: OpenAIExecutorConfig
): Promise<PlanningResult> {
  const log = executorConfig.logger || (() => {})
  const onProgress = executorConfig.onProgress || (() => {})
  const model = executorConfig.model || DEFAULT_MODELS.openai

  log('info', 'Starting OpenAI planning', { repoPath: executorConfig.repoPath, taskTitle })
  onProgress('Initializing OpenAI for planning...')

  // Load config
  const config = await loadAstridConfig(executorConfig.repoPath)
  const platform = detectPlatform(config, taskTitle, taskDescription || '')
  const initialPattern = getInitialGlobPattern(config, platform)

  const astridMd = await loadAstridMd(executorConfig.repoPath, config.validation.contextTruncationLength)
  const structurePrompt = generateStructurePrompt(config)
  const platformHints = generatePlatformHints(platform)

  const systemPrompt = `You are an expert software engineer analyzing a codebase to create an implementation plan.

${structurePrompt}
${platformHints}
${astridMd ? `## Project Context\n${astridMd}\n` : ''}
${config.customInstructions ? `## Custom Instructions\n${config.customInstructions}\n` : ''}

## Your Task
Create an implementation plan for: "${taskTitle}"
${taskDescription ? `\nDetails: ${taskDescription}` : ''}

## EXPLORATION WORKFLOW (MANDATORY)

You MUST follow this workflow:

### Step 1: Understand Project Structure
- Use glob_files with patterns like "**/*.ts" or "**/*.tsx" to find source files
- Read package.json and config files to understand the project

### Step 2: Find Relevant Code
- Use grep_search to find related terms, functions, or patterns
- Read files that are likely to need changes
- Read adjacent files to understand context

### Step 3: Create Precise Plan
After reading at least 3-5 relevant files, create a surgical plan.

When ready, respond with ONLY a JSON block:
\`\`\`json
{
  "summary": "Brief summary",
  "approach": "High-level approach with technical details",
  "files": [{"path": "path/to/file.ts", "purpose": "Why", "changes": "Specific changes"}],
  "estimatedComplexity": "simple|medium|complex",
  "considerations": ["Edge case 1", "Testing requirement"]
}
\`\`\`

RULES:
- Maximum ${config.validation.maxFilesPerPlan} files
- Be SURGICAL: only list files that MUST change
- Include SPECIFIC file paths you discovered (no guessing)
- Follow existing patterns in the codebase`

  const messages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Start by calling glob_files with pattern "${initialPattern}" to find relevant files, then create an implementation plan for: ${taskTitle}` }
  ]

  let totalInputTokens = 0
  let totalOutputTokens = 0
  const maxIterations = executorConfig.maxIterations || config.agent.maxPlanningIterations
  const timeoutMs = config.agent.planningTimeoutMinutes * 60 * 1000
  const startTime = Date.now()

  try {
    for (let i = 0; i < maxIterations; i++) {
      if (Date.now() - startTime > timeoutMs) {
        return { success: false, error: `Planning timed out after ${config.agent.planningTimeoutMinutes} minutes` }
      }

      onProgress(`Planning iteration ${i + 1}...`)

      const response = await callOpenAI(messages, executorConfig.apiKey, model, config)
      totalInputTokens += response.usage.prompt_tokens
      totalOutputTokens += response.usage.completion_tokens

      const choice = response.choices[0]
      const assistantMessage = choice.message

      messages.push({
        role: 'assistant',
        content: assistantMessage.content,
        tool_calls: assistantMessage.tool_calls
      })

      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        for (const toolCall of assistantMessage.tool_calls) {
          const args = JSON.parse(toolCall.function.arguments)
          onProgress(`Using tool: ${toolCall.function.name}`)
          const result = await executeTool(toolCall.function.name, args, executorConfig.repoPath, config)
          messages.push({
            role: 'tool',
            content: result.result.substring(0, config.validation.contextTruncationLength),
            tool_call_id: toolCall.id
          })
        }
        continue
      }

      if (assistantMessage.content) {
        const jsonMatch = assistantMessage.content.match(/```json\s*([\s\S]*?)\s*```/)
        if (jsonMatch) {
          try {
            const plan = JSON.parse(jsonMatch[1]) as ImplementationPlan

            if (!plan.files || plan.files.length === 0) {
              messages.push({
                role: 'user',
                content: 'Your plan has no files. You MUST use glob_files and read_file first, then provide a plan with specific files. Please call glob_files now.'
              })
              continue
            }

            return {
              success: true,
              plan,
              usage: {
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens,
                costUSD: (totalInputTokens * 0.0025 + totalOutputTokens * 0.01) / 1000
              }
            }
          } catch {
            log('warn', 'Failed to parse plan JSON', {})
          }
        }

        if (i === 0) {
          messages.push({
            role: 'user',
            content: 'You must use the tools to explore the codebase. Please call glob_files with an appropriate pattern.'
          })
          continue
        }
      }

      if (choice.finish_reason === 'stop') {
        messages.push({ role: 'user', content: 'Please provide the implementation plan as a JSON block with at least one file.' })
      }
    }

    return { success: false, error: 'Max iterations reached' }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

// ============================================================================
// EXECUTION
// ============================================================================

export async function executeWithOpenAI(
  plan: ImplementationPlan,
  taskTitle: string,
  taskDescription: string | null,
  executorConfig: OpenAIExecutorConfig
): Promise<ExecutionResult> {
  const log = executorConfig.logger || (() => {})
  const onProgress = executorConfig.onProgress || (() => {})
  const model = executorConfig.model || DEFAULT_MODELS.openai

  log('info', 'Starting OpenAI execution', { repoPath: executorConfig.repoPath, filesInPlan: plan.files.length })
  onProgress('Initializing OpenAI agent...')

  // Load config
  const config = await loadAstridConfig(executorConfig.repoPath)
  const platform = detectPlatform(config, taskTitle, taskDescription || '')

  const astridMd = await loadAstridMd(executorConfig.repoPath, config.validation.contextTruncationLength)
  const structurePrompt = generateStructurePrompt(config)
  const platformHints = generatePlatformHints(platform)

  const systemPrompt = `You are an expert software engineer implementing changes to a codebase.

${structurePrompt}
${platformHints}
${astridMd ? `## Project Context\n${astridMd}\n` : ''}
${config.customInstructions ? `## Custom Instructions\n${config.customInstructions}\n` : ''}

## Task
Implement: "${taskTitle}"
${taskDescription ? `\nDetails: ${taskDescription}` : ''}

## Implementation Plan
${JSON.stringify(plan, null, 2)}

## IMPLEMENTATION WORKFLOW (MANDATORY)

### Step 1: Verify Understanding
- Re-read the files in the plan to confirm your approach
- Check import paths and dependencies

### Step 2: Implement Changes
- Make changes one file at a time
- Follow existing code style and patterns
- Write complete, production-ready code (no TODOs)

### Step 3: Verify Changes
- After making changes, run "npm run build" or tests via run_bash
- If build/tests fail, FIX the issues before continuing

### Step 4: Complete
- Call task_complete with good commit message and PR description

## Rules
- Follow the plan exactly
- Write complete code - no placeholders
- Test your changes before completing
- Handle edge cases properly`

  const messages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Please implement the changes according to the plan.' }
  ]

  const fileChanges: Map<string, { content: string; action: 'create' | 'modify' | 'delete' }> = new Map()
  let totalInputTokens = 0
  let totalOutputTokens = 0
  const maxIterations = executorConfig.maxIterations || config.agent.maxExecutionIterations
  const timeoutMs = config.agent.executionTimeoutMinutes * 60 * 1000
  const startTime = Date.now()

  try {
    for (let i = 0; i < maxIterations; i++) {
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

      const response = await callOpenAI(messages, executorConfig.apiKey, model, config)
      totalInputTokens += response.usage.prompt_tokens
      totalOutputTokens += response.usage.completion_tokens

      const choice = response.choices[0]
      const assistantMessage = choice.message

      messages.push({
        role: 'assistant',
        content: assistantMessage.content,
        tool_calls: assistantMessage.tool_calls
      })

      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        for (const toolCall of assistantMessage.tool_calls) {
          const args = JSON.parse(toolCall.function.arguments)
          const toolName = toolCall.function.name

          onProgress(`Using tool: ${toolName}`)

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

          const result = await executeTool(toolName, args, executorConfig.repoPath, config)
          if (result.fileChange) {
            fileChanges.set(result.fileChange.path, {
              content: result.fileChange.content,
              action: result.fileChange.action
            })
          }

          messages.push({
            role: 'tool',
            content: result.result.substring(0, config.validation.contextTruncationLength),
            tool_call_id: toolCall.id
          })
        }
        continue
      }

      if (choice.finish_reason === 'stop') {
        messages.push({
          role: 'user',
          content: 'Please call task_complete to finalize.'
        })
      }
    }

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
