/**
 * Terminal OpenAI Executor
 *
 * Executes tasks using OpenAI API with local tool execution.
 * This enables running tasks assigned to openai@astrid.cc in terminal mode.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import type { Session } from '../server/session-manager.js'
import type {
  TerminalExecutor,
  TerminalExecutionResult,
  TerminalTaskContext,
  TerminalExecutorCallbacks,
  ParsedOutput,
} from './terminal-base.js'
import {
  extractPrUrl,
  formatCommentHistory,
  captureGitChanges,
  buildDefaultPrompt,
  createParserState,
  parseOutputChunk,
  formatContentAsComment,
  shouldUseWorktree,
  createWorktree,
  pushWorktreeChanges,
  type WorktreeResult,
} from './terminal-base.js'
import { DEFAULT_MODELS } from '../utils/agent-config.js'
import {
  buildWorkflowInstructions,
  getAgentWorkflowConfig,
} from '../config/agent-workflow.js'
import {
  OPENAI_TOOLS,
  executeTool,
  truncateOutput,
  type ToolResult,
} from './shared/index.js'

// ============================================================================
// TYPES
// ============================================================================

export interface TerminalOpenAIOptions {
  apiKey?: string
  model?: string
  maxTurns?: number
  timeout?: number
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
  model: string
): Promise<OpenAIResponse> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120000) // 2 minute timeout

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
        tools: OPENAI_TOOLS,
        tool_choice: 'auto',
        max_tokens: 8192,
        temperature: 0.2
      })
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenAI API error (${response.status}): ${errorText.substring(0, 200)}`)
    }

    return response.json() as Promise<OpenAIResponse>
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

// ============================================================================
// TERMINAL OPENAI EXECUTOR
// ============================================================================

export class TerminalOpenAIExecutor implements TerminalExecutor {
  private apiKey: string
  private model: string
  private maxTurns: number
  private timeout: number

  constructor(options: TerminalOpenAIOptions = {}) {
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY || ''
    this.model = options.model || process.env.OPENAI_MODEL || DEFAULT_MODELS.openai
    this.maxTurns = options.maxTurns || parseInt(process.env.OPENAI_MAX_TURNS || '50', 10)
    this.timeout = options.timeout || parseInt(process.env.OPENAI_TIMEOUT || '900000', 10) // 15 min default
  }

  /**
   * Check if OpenAI API key is configured
   */
  async checkAvailable(): Promise<boolean> {
    return !!this.apiKey
  }

  /**
   * Read project context files
   */
  private async readProjectContext(projectPath: string): Promise<string> {
    const MAX_CONTEXT_CHARS = 8000
    const contextFiles = ['ASTRID.md', 'CODEX.md', 'README.md']
    let context = ''

    for (const file of contextFiles) {
      try {
        const filePath = path.join(projectPath, file)
        let content = await fs.readFile(filePath, 'utf-8')

        if (content.length > MAX_CONTEXT_CHARS) {
          content = content.slice(0, MAX_CONTEXT_CHARS) + '\n\n[... truncated ...]'
        }

        context += `\n\n## Project Instructions (from ${file})\n\n${content}`
        break // Only use the first found file
      } catch {
        // File doesn't exist, try next
      }
    }

    return context
  }

  /**
   * Build system prompt for the task
   * Uses configuration from environment variables - see config/agent-workflow.ts
   */
  private async buildSystemPrompt(session: Session): Promise<string> {
    const projectContext = await this.readProjectContext(session.projectPath || process.cwd())
    const config = getAgentWorkflowConfig()
    const workflowInstructions = buildWorkflowInstructions(session.taskId, session.title, config)

    return `You are an expert software engineer working on a coding task.
You have access to tools for reading, writing, and editing files, running bash commands, and searching the codebase.

${projectContext}

## Your Task
${session.title}
${session.description ? `\nDetails: ${session.description}` : ''}

${workflowInstructions}

## Additional Guidelines

- Understand the task by reading relevant files first
- Plan your approach - identify which files need changes
- Use the available tools to implement changes
- Complete the task by calling task_complete with a summary

CRITICAL: You must use ACTUAL FUNCTION CALLS, not text descriptions.
Do NOT write text saying "I will call X" - actually invoke the function.

Begin by reading the relevant files to understand the current state.`
  }

  /**
   * Start a new session to process a task
   * Uses git worktree isolation when enabled (default) to protect the main working directory
   */
  async startSession(
    session: Session,
    prompt?: string,
    context?: TerminalTaskContext,
    callbacks?: TerminalExecutorCallbacks
  ): Promise<TerminalExecutionResult> {
    const { onProgress, onComment } = callbacks || {}
    const userPrompt = prompt || buildDefaultPrompt(session, context)
    const commentHistory = formatCommentHistory(context?.comments)

    // Create parser state for detecting plans/questions
    const parserState = createParserState()

    console.log(`🚀 Starting OpenAI terminal session for task: ${session.title}`)

    // Determine working directory - use worktree if enabled
    const useWorktree = shouldUseWorktree() && session.projectPath
    let projectPath = session.projectPath || process.cwd()
    let worktreeResult: WorktreeResult | undefined

    if (useWorktree) {
      try {
        console.log(`🌳 Creating isolated worktree for task...`)
        worktreeResult = await createWorktree(session.projectPath!, session.taskId)
        projectPath = worktreeResult.worktreePath
        console.log(`📁 Working directory (worktree): ${projectPath}`)
      } catch (error) {
        console.error(`⚠️ Failed to create worktree, falling back to main directory:`, error)
        projectPath = session.projectPath || process.cwd()
        console.log(`📁 Working directory (fallback): ${projectPath}`)
      }
    } else {
      console.log(`📁 Working directory: ${projectPath}`)
    }

    console.log(`🤖 Model: ${this.model}`)

    // Build system prompt with potentially updated project path
    const workingSession: Session = { ...session, projectPath }
    const systemPrompt = await this.buildSystemPrompt(workingSession)

    const messages: OpenAIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: commentHistory ? `${commentHistory}\n\n---\n\n${userPrompt}` : userPrompt }
    ]

    const modifiedFiles: string[] = []
    let stdout = ''
    let prUrl: string | undefined
    let completeSummary: string | undefined
    const startTime = Date.now()

    try {
      for (let turn = 0; turn < this.maxTurns; turn++) {
        // Check timeout
        if (Date.now() - startTime > this.timeout) {
          stdout += '\n\n[Execution timed out]'
          break
        }

        onProgress?.(`Turn ${turn + 1}/${this.maxTurns}...`)

        const response = await callOpenAI(messages, this.apiKey, this.model)
        const choice = response.choices[0]
        const assistantMessage = choice.message

        // Add assistant message to history
        messages.push({
          role: 'assistant',
          content: assistantMessage.content,
          tool_calls: assistantMessage.tool_calls
        })

        // Log assistant response and post comments
        if (assistantMessage.content) {
          stdout += `\n\n${assistantMessage.content}`
          console.log(`📝 Assistant: ${assistantMessage.content.slice(0, 200)}...`)

          // Parse for plans/questions and post as comments
          if (onComment) {
            const detected = parseOutputChunk(assistantMessage.content, parserState)
            for (const item of detected) {
              const comment = formatContentAsComment(item, 'OpenAI')
              console.log(`📤 Posting ${item.type} comment to task...`)
              onComment(comment).catch(err => {
                console.error(`⚠️ Failed to post ${item.type} comment:`, err)
              })
            }
          }
        }

        // Handle tool calls
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
          for (const toolCall of assistantMessage.tool_calls) {
            const toolName = toolCall.function.name
            const args = JSON.parse(toolCall.function.arguments)

            onProgress?.(`Using tool: ${toolName}`)
            console.log(`🔧 Tool: ${toolName}`)

            // Check for task_complete
            if (toolName === 'task_complete') {
              completeSummary = args.summary as string
              stdout += `\n\n[Task Complete]\nSummary: ${completeSummary}`

              // Capture git changes
              const changes = await captureGitChanges(projectPath)

              // If using worktree and have changes, push them
              if (worktreeResult && changes.files.length > 0) {
                console.log(`\n📤 Pushing changes from worktree...`)
                const pushPrUrl = await pushWorktreeChanges(
                  worktreeResult.worktreePath,
                  worktreeResult.branchName,
                  session.title
                )
                if (pushPrUrl) {
                  prUrl = pushPrUrl
                }
              }

              if (!prUrl) {
                prUrl = extractPrUrl(stdout)
              }

              // Cleanup worktree before returning
              if (worktreeResult) {
                try {
                  await worktreeResult.cleanup()
                } catch (cleanupError) {
                  console.error(`⚠️ Worktree cleanup failed:`, cleanupError)
                }
              }

              return {
                exitCode: 0,
                stdout,
                stderr: '',
                modifiedFiles: changes.files.length > 0 ? changes.files : modifiedFiles,
                gitDiff: changes.diff,
                prUrl,
              }
            }

            // Execute tool
            const result = await executeTool(toolName, args, projectPath)
            stdout += `\n\n[${toolName}]: ${result.result.slice(0, 500)}${result.result.length > 500 ? '...' : ''}`

            // Track modified files
            if (result.fileChange) {
              if (!modifiedFiles.includes(result.fileChange.path)) {
                modifiedFiles.push(result.fileChange.path)
              }
            }

            // Add tool result to messages
            messages.push({
              role: 'tool',
              content: result.result.slice(0, 10000), // Truncate large outputs
              tool_call_id: toolCall.id
            })
          }
          continue
        }

        // Check for stop condition
        if (choice.finish_reason === 'stop') {
          // Check if we should prompt for completion
          if (!completeSummary) {
            messages.push({
              role: 'user',
              content: 'Please call task_complete to finalize your work, or continue if there is more to do.'
            })
          } else {
            break
          }
        }
      }

      // Capture final git changes
      const changes = await captureGitChanges(projectPath)

      // If using worktree and have changes, push them
      if (worktreeResult && changes.files.length > 0) {
        console.log(`\n📤 Pushing changes from worktree...`)
        const pushPrUrl = await pushWorktreeChanges(
          worktreeResult.worktreePath,
          worktreeResult.branchName,
          session.title
        )
        if (pushPrUrl) {
          prUrl = pushPrUrl
        }
      }

      if (!prUrl) {
        prUrl = extractPrUrl(stdout)
      }

      return {
        exitCode: 0,
        stdout,
        stderr: '',
        modifiedFiles: changes.files.length > 0 ? changes.files : modifiedFiles,
        gitDiff: changes.diff,
        prUrl,
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`❌ OpenAI terminal execution error:`, errorMsg)

      return {
        exitCode: 1,
        stdout,
        stderr: errorMsg,
        modifiedFiles,
      }
    } finally {
      // Cleanup worktree if it was created
      if (worktreeResult) {
        try {
          await worktreeResult.cleanup()
        } catch (cleanupError) {
          console.error(`⚠️ Worktree cleanup failed:`, cleanupError)
        }
      }
    }
  }

  /**
   * Resume a session with new input
   * Note: OpenAI doesn't have native session management, so we rebuild context
   */
  async resumeSession(
    session: Session,
    input: string,
    context?: TerminalTaskContext,
    callbacks?: TerminalExecutorCallbacks
  ): Promise<TerminalExecutionResult> {
    console.log(`🔄 Resuming OpenAI session (rebuilding context)`)

    // For OpenAI, resuming means starting a new conversation with the follow-up
    const fullPrompt = formatCommentHistory(context?.comments) +
      `\n\n---\n\n## Follow-up Request\n\n${input}`

    return this.startSession(session, fullPrompt, context, callbacks)
  }

  /**
   * Parse output to extract key information
   */
  parseOutput(output: string): ParsedOutput {
    const result: ParsedOutput = {}
    const lines = output.split('\n')
    const files: string[] = []

    for (const line of lines) {
      // Extract modified/created files
      const fileMatch = line.match(/(?:modified|created|edited|wrote):\s*[`'"]*([^`'"]+)[`'"]*/i)
      if (fileMatch) {
        files.push(fileMatch[1].trim())
      }

      // Extract PR URL
      const prMatch = line.match(/(https:\/\/github\.com\/[\w-]+\/[\w-]+\/pull\/\d+)/i)
      if (prMatch) {
        result.prUrl = prMatch[1]
      }

      // Extract error messages
      if (line.toLowerCase().includes('error:') || line.toLowerCase().includes('failed:')) {
        result.error = line.trim()
      }
    }

    if (files.length > 0) {
      result.files = [...new Set(files)]
    }

    // Try to extract summary (look for task_complete summary)
    const summaryMatch = output.match(/\[Task Complete\]\s*Summary:\s*([^\n]+)/i)
    if (summaryMatch) {
      result.summary = summaryMatch[1].trim()
    } else {
      // Fallback: last substantial paragraph
      const paragraphs = output.split(/\n\n+/).filter(p => p.trim().length > 50)
      if (paragraphs.length > 0) {
        result.summary = paragraphs[paragraphs.length - 1].trim().slice(0, 500)
      }
    }

    return result
  }
}

// Export singleton for convenience
export const terminalOpenAIExecutor = new TerminalOpenAIExecutor()
