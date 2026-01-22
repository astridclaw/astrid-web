/**
 * Terminal Gemini Executor
 *
 * Executes tasks using Gemini API with local tool execution.
 * This enables running tasks assigned to gemini@astrid.cc in terminal mode.
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
  GEMINI_TOOL_DECLARATIONS,
  executeTool,
  truncateOutput,
  type ToolResult,
} from './shared/index.js'

// ============================================================================
// TYPES
// ============================================================================

export interface TerminalGeminiOptions {
  apiKey?: string
  model?: string
  maxTurns?: number
  timeout?: number
}

// ============================================================================
// API CALLS
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
  usageMetadata: { promptTokenCount: number; candidatesTokenCount: number }
}

async function callGemini(
  contents: GeminiContent[],
  systemInstruction: string,
  apiKey: string,
  model: string
): Promise<GeminiResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      tools: [{ functionDeclarations: GEMINI_TOOL_DECLARATIONS }],
      toolConfig: {
        functionCallingConfig: {
          mode: 'AUTO'
        }
      },
      generationConfig: { maxOutputTokens: 8192, temperature: 0.2 }
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gemini API error: ${error}`)
  }

  return response.json() as Promise<GeminiResponse>
}

// ============================================================================
// TERMINAL GEMINI EXECUTOR
// ============================================================================

export class TerminalGeminiExecutor implements TerminalExecutor {
  private apiKey: string
  private model: string
  private maxTurns: number
  private timeout: number

  constructor(options: TerminalGeminiOptions = {}) {
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY || ''
    this.model = options.model || process.env.GEMINI_MODEL || DEFAULT_MODELS.gemini
    this.maxTurns = options.maxTurns || parseInt(process.env.GEMINI_MAX_TURNS || '50', 10)
    this.timeout = options.timeout || parseInt(process.env.GEMINI_TIMEOUT || '900000', 10) // 15 min default
  }

  /**
   * Check if Gemini API key is configured
   */
  async checkAvailable(): Promise<boolean> {
    return !!this.apiKey
  }

  /**
   * Read project context files
   */
  private async readProjectContext(projectPath: string): Promise<string> {
    const MAX_CONTEXT_CHARS = 8000
    const contextFiles = ['ASTRID.md', 'GEMINI.md', 'README.md']
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

    console.log(`🚀 Starting Gemini terminal session for task: ${session.title}`)

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

    const contents: GeminiContent[] = [
      {
        role: 'user',
        parts: [{ text: commentHistory ? `${commentHistory}\n\n---\n\n${userPrompt}` : userPrompt }]
      }
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

        const response = await callGemini(contents, systemPrompt, this.apiKey, this.model)
        const candidate = response.candidates[0]

        if (!candidate) {
          stdout += '\n\n[No response from Gemini]'
          break
        }

        // Add model response to history
        contents.push({ role: 'model', parts: candidate.content.parts })

        // Handle text responses and post comments
        const textPart = candidate.content.parts.find(p => p.text)
        if (textPart?.text) {
          stdout += `\n\n${textPart.text}`
          console.log(`📝 Assistant: ${textPart.text.slice(0, 200)}...`)

          // Parse for plans/questions and post as comments
          if (onComment) {
            const detected = parseOutputChunk(textPart.text, parserState)
            for (const item of detected) {
              const comment = formatContentAsComment(item, 'Gemini')
              console.log(`📤 Posting ${item.type} comment to task...`)
              onComment(comment).catch(err => {
                console.error(`⚠️ Failed to post ${item.type} comment:`, err)
              })
            }
          }
        }

        // Handle function calls
        const functionCalls = candidate.content.parts.filter(p => p.functionCall)

        if (functionCalls.length > 0) {
          const functionResponses: GeminiContent['parts'] = []

          for (const part of functionCalls) {
            if (!part.functionCall) continue
            const { name, args } = part.functionCall

            onProgress?.(`Using tool: ${name}`)
            console.log(`🔧 Tool: ${name}`)

            // Check for task_complete
            if (name === 'task_complete') {
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
            const result = await executeTool(name, args, projectPath)
            stdout += `\n\n[${name}]: ${result.result.slice(0, 500)}${result.result.length > 500 ? '...' : ''}`

            // Track modified files
            if (result.fileChange) {
              if (!modifiedFiles.includes(result.fileChange.path)) {
                modifiedFiles.push(result.fileChange.path)
              }
            }

            // Add function response
            functionResponses.push({
              functionResponse: { name, response: { result: result.result.slice(0, 10000) } }
            })
          }

          // Add all function responses in a single user message
          contents.push({ role: 'user', parts: functionResponses })
          continue
        }

        // Check for stop condition
        if (candidate.finishReason === 'STOP') {
          // Check if we should prompt for completion
          if (!completeSummary) {
            contents.push({
              role: 'user',
              parts: [{ text: 'Please call task_complete to finalize your work, or continue if there is more to do.' }]
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
      console.error(`❌ Gemini terminal execution error:`, errorMsg)

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
   * Note: Gemini doesn't have native session management, so we rebuild context
   */
  async resumeSession(
    session: Session,
    input: string,
    context?: TerminalTaskContext,
    callbacks?: TerminalExecutorCallbacks
  ): Promise<TerminalExecutionResult> {
    console.log(`🔄 Resuming Gemini session (rebuilding context)`)

    // For Gemini, resuming means starting a new conversation with the follow-up
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
export const terminalGeminiExecutor = new TerminalGeminiExecutor()
