/**
 * Terminal Claude Executor
 *
 * Executes tasks using the local Claude Code CLI via spawn.
 * This enables running the astrid-agent in "terminal mode" where tasks
 * are processed by the local Claude Code installation instead of the API.
 *
 * Key features:
 * - Uses `claude --print` for non-interactive execution
 * - Supports session resumption via `--resume` flag
 * - Extracts PR URLs and git changes from output
 */

import { spawn } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import type { Session } from '../server/session-manager.js'
import type {
  TerminalExecutor,
  TerminalTaskContext,
  TerminalProgressCallback,
  TerminalCommentCallback,
  TerminalExecutorCallbacks,
  ParsedOutput,
  TerminalExecutionResult,
  OutputParserState,
} from './terminal-base.js'
import {
  createParserState,
  parseOutputChunk,
  formatContentAsComment,
  shouldUseWorktree,
  createWorktree,
  pushWorktreeChanges,
  type WorktreeResult,
} from './terminal-base.js'
import {
  buildWorkflowInstructions,
  getAgentWorkflowConfig,
} from '../config/agent-workflow.js'

// Re-export types from terminal-base for backwards compatibility
export type { TerminalExecutionResult, TerminalTaskContext } from './terminal-base.js'

// ============================================================================
// TYPES
// ============================================================================

export interface TerminalClaudeOptions {
  model?: string
  maxTurns?: number
  timeout?: number
}

// ============================================================================
// SESSION STORE
// ============================================================================

/**
 * Session data stored for each task
 */
interface StoredSession {
  claudeSessionId?: string
  worktreePath?: string
  branchName?: string
}

/**
 * Simple file-based session store for terminal mode.
 * Stores Claude session IDs and worktree paths for resumption support.
 */
class TerminalSessionStore {
  private storagePath: string
  private sessions: Map<string, StoredSession> = new Map()
  private loaded = false

  constructor() {
    // Store in ~/.astrid-agent/sessions.json
    const homeDir = os.homedir()
    const dataDir = process.env.ASTRID_AGENT_DATA_DIR || path.join(homeDir, '.astrid-agent')
    this.storagePath = path.join(dataDir, 'terminal-sessions.json')
  }

  async load(): Promise<void> {
    if (this.loaded) return

    try {
      const dir = path.dirname(this.storagePath)
      await fs.mkdir(dir, { recursive: true })

      const data = await fs.readFile(this.storagePath, 'utf-8')
      const parsed = JSON.parse(data) as Record<string, StoredSession | string>

      // Handle migration from old format (string) to new format (StoredSession)
      this.sessions = new Map()
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') {
          // Old format: just claudeSessionId
          this.sessions.set(key, { claudeSessionId: value })
        } else {
          // New format: StoredSession object
          this.sessions.set(key, value)
        }
      }

      this.loaded = true
      console.log(`📂 Loaded ${this.sessions.size} terminal sessions from ${this.storagePath}`)
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.sessions = new Map()
        this.loaded = true
      } else {
        console.warn(`⚠️ Could not load terminal sessions: ${(error as Error).message}`)
        this.sessions = new Map()
        this.loaded = true
      }
    }
  }

  async save(): Promise<void> {
    try {
      const data = Object.fromEntries(this.sessions)
      const dir = path.dirname(this.storagePath)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(this.storagePath, JSON.stringify(data, null, 2))
    } catch (error) {
      console.warn(`⚠️ Could not save terminal sessions: ${(error as Error).message}`)
    }
  }

  async getSession(taskId: string): Promise<StoredSession | undefined> {
    await this.load()
    return this.sessions.get(taskId)
  }

  async getClaudeSessionId(taskId: string): Promise<string | undefined> {
    const session = await this.getSession(taskId)
    return session?.claudeSessionId
  }

  async setClaudeSessionId(taskId: string, claudeSessionId: string): Promise<void> {
    await this.load()
    const existing = this.sessions.get(taskId) || {}
    this.sessions.set(taskId, { ...existing, claudeSessionId })
    await this.save()
    console.log(`🔗 Stored Claude session ${claudeSessionId} for task ${taskId}`)
  }

  async setWorktree(taskId: string, worktreePath: string, branchName: string): Promise<void> {
    await this.load()
    const existing = this.sessions.get(taskId) || {}
    this.sessions.set(taskId, { ...existing, worktreePath, branchName })
    await this.save()
    console.log(`🌳 Stored worktree path for task ${taskId}: ${worktreePath}`)
  }

  async getWorktree(taskId: string): Promise<{ path: string; branch: string } | undefined> {
    const session = await this.getSession(taskId)
    if (session?.worktreePath && session?.branchName) {
      return { path: session.worktreePath, branch: session.branchName }
    }
    return undefined
  }

  async deleteSession(taskId: string): Promise<void> {
    await this.load()
    if (this.sessions.has(taskId)) {
      this.sessions.delete(taskId)
      await this.save()
    }
  }
}

// Singleton instance
export const terminalSessionStore = new TerminalSessionStore()

// ============================================================================
// TERMINAL CLAUDE EXECUTOR
// ============================================================================

export class TerminalClaudeExecutor implements TerminalExecutor {
  private model: string
  private maxTurns: number
  private timeout: number

  constructor(options: TerminalClaudeOptions = {}) {
    // Use 'opus' alias which points to Claude Opus 4.5
    this.model = options.model || process.env.CLAUDE_MODEL || 'opus'
    this.maxTurns = options.maxTurns || parseInt(process.env.CLAUDE_MAX_TURNS || '50', 10)
    this.timeout = options.timeout || parseInt(process.env.CLAUDE_TIMEOUT || '900000', 10) // 15 min default
  }

  /**
   * Capture git diff and modified files after execution
   * If baseline is provided, filters out pre-existing uncommitted files
   */
  async captureGitChanges(
    projectPath: string,
    baseline?: Set<string>
  ): Promise<{ diff: string; files: string[] }> {
    const { execSync } = await import('child_process')

    try {
      // Get modified files (staged and unstaged)
      const statusOutput = execSync('git status --porcelain', {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 10000
      })

      let files = statusOutput
        .split('\n')
        .filter(line => line.trim())
        .map(line => line.slice(3).trim()) // Remove status prefix

      // Filter out pre-existing files if baseline provided
      if (baseline && baseline.size > 0) {
        const originalCount = files.length
        files = files.filter(f => !baseline.has(f))
        if (originalCount !== files.length) {
          console.log(`📊 Filtered out ${originalCount - files.length} pre-existing uncommitted files`)
        }
      }

      // Get diff (staged and unstaged, limited to 5000 chars)
      let diff = ''
      try {
        diff = execSync('git diff HEAD --no-color', {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 10000,
          maxBuffer: 1024 * 1024 // 1MB max
        })

        // Truncate if too long
        if (diff.length > 5000) {
          diff = diff.slice(0, 5000) + '\n\n[... diff truncated ...]'
        }
      } catch {
        // No diff or not a git repo
      }

      console.log(`📊 Git changes: ${files.length} files modified by task`)
      return { diff, files }
    } catch {
      return { diff: '', files: [] }
    }
  }

  /**
   * Extract PR URL from Claude output
   */
  extractPrUrl(output: string): string | undefined {
    // Match GitHub PR URLs
    const prUrlPatterns = [
      /https:\/\/github\.com\/[^\/]+\/[^\/]+\/pull\/\d+/g,
      /PR URL:\s*(https:\/\/[^\s]+)/i,
      /Pull Request:\s*(https:\/\/[^\s]+)/i
    ]

    for (const pattern of prUrlPatterns) {
      const match = output.match(pattern)
      if (match) {
        return match[0].replace(/PR URL:\s*/i, '').replace(/Pull Request:\s*/i, '')
      }
    }

    return undefined
  }

  /**
   * Read project context files (CLAUDE.md, ASTRID.md)
   */
  async readProjectContext(projectPath: string): Promise<string> {
    const MAX_CONTEXT_CHARS = 4000
    const contextFiles = ['CLAUDE.md', 'ASTRID.md', 'CODEX.md']
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
   * Format comment history for context
   */
  formatCommentHistory(comments?: TerminalTaskContext['comments']): string {
    if (!comments || comments.length === 0) return ''

    const formatted = comments
      .slice(-10)
      .map(c => `**${c.authorName}** (${new Date(c.createdAt).toLocaleString()}):\n${c.content}`)
      .join('\n\n---\n\n')

    return `\n\n## Previous Discussion\n\n${formatted}`
  }

  /**
   * Build prompt from task details
   *
   * IMPORTANT: Keep prompts relatively concise. Very long prompts with complex
   * markdown can cause issues. Focus on essential instructions.
   *
   * NOTE: Workflow instructions are built from environment-based configuration.
   * See config/agent-workflow.ts for available environment variables.
   */
  async buildPrompt(
    session: Session,
    userMessage?: string,
    context?: TerminalTaskContext
  ): Promise<string> {
    if (userMessage) {
      // For follow-up messages, just return the message directly
      return userMessage
    }

    const description = session.description?.trim() || ''
    const config = getAgentWorkflowConfig()

    // Build workflow instructions based on configuration
    const workflowInstructions = buildWorkflowInstructions(
      session.taskId,
      session.title,
      config
    )

    const prompt = `# Task: ${session.title}

${description ? `## Description\n${description}\n\n` : ''}${workflowInstructions}`

    return prompt
  }

  /**
   * Start a new Claude Code session with retry logic
   * Uses git worktree isolation when enabled (default) to protect the main working directory
   */
  async startSession(
    session: Session,
    prompt?: string,
    context?: TerminalTaskContext,
    callbacks?: TerminalExecutorCallbacks
  ): Promise<TerminalExecutionResult> {
    const taskPrompt = prompt || await this.buildPrompt(session, undefined, context)
    const { onProgress, onComment } = callbacks || {}

    // Truncate prompt if too long (avoid ARG_MAX issues)
    const MAX_PROMPT_LENGTH = 50000
    let finalPrompt = taskPrompt
    if (taskPrompt.length > MAX_PROMPT_LENGTH) {
      finalPrompt = taskPrompt.slice(0, MAX_PROMPT_LENGTH) + '\n\n[... prompt truncated ...]'
    }

    console.log(`🚀 Starting new Claude Code session for task: ${session.title}`)

    // Determine working directory - use worktree if enabled
    const useWorktree = shouldUseWorktree() && session.projectPath
    let workingPath = session.projectPath || process.cwd()
    let worktreeResult: WorktreeResult | undefined

    if (useWorktree) {
      try {
        console.log(`🌳 Creating isolated worktree for task...`)
        worktreeResult = await createWorktree(session.projectPath!, session.taskId)
        workingPath = worktreeResult.worktreePath

        // Store worktree info for resumption
        await terminalSessionStore.setWorktree(
          session.taskId,
          worktreeResult.worktreePath,
          worktreeResult.branchName
        )

        console.log(`📁 Working directory (worktree): ${workingPath}`)
      } catch (error) {
        console.error(`⚠️ Failed to create worktree, falling back to main directory:`, error)
        workingPath = session.projectPath || process.cwd()
        console.log(`📁 Working directory (fallback): ${workingPath}`)
      }
    } else {
      console.log(`📁 Working directory: ${workingPath}`)
    }

    // Create a modified session with the working path
    const workingSession: Session = {
      ...session,
      projectPath: workingPath,
    }

    // Capture git baseline BEFORE execution to filter out pre-existing files
    let gitBaseline: Set<string> | undefined
    const { captureGitBaseline } = await import('./terminal-base.js')
    gitBaseline = await captureGitBaseline(workingPath)

    // Retry logic for intermittent Claude Code hangs
    const MAX_RETRIES = 3
    let lastError: Error | undefined
    let finalResult: TerminalExecutionResult | undefined

    try {
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
          console.log(`🔄 Retry attempt ${attempt}/${MAX_RETRIES} after ${delay}ms delay...`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }

        // Use stdin for prompt - more reliable than command-line args for long prompts
        const args = [
          '--print',
          '--model', this.model,
          '--output-format', 'text',
          '--dangerously-skip-permissions',
        ]

        const result = await this.runClaude(args, workingSession, { onProgress, onComment }, finalPrompt)

        // Check if we got actual output (not a timeout/hang)
        if (result.stdout.length > 0 || result.exitCode === 0) {
          // Store session ID for resumption
          if (result.sessionId) {
            await terminalSessionStore.setClaudeSessionId(session.taskId, result.sessionId)
          }

          // Capture git changes from working directory
          const changes = await this.captureGitChanges(workingPath)
          result.gitDiff = changes.diff
          result.modifiedFiles = changes.files

          // If using worktree, push changes and create PR
          if (worktreeResult && changes.files.length > 0) {
            console.log(`\n📤 Pushing changes from worktree...`)
            const prUrl = await pushWorktreeChanges(
              worktreeResult.worktreePath,
              worktreeResult.branchName,
              session.title
            )
            if (prUrl) {
              result.prUrl = prUrl
            }
          }

          // Extract PR URL from output if not already set
          if (!result.prUrl) {
            result.prUrl = this.extractPrUrl(result.stdout)
          }

          finalResult = result
          break
        }

        console.log(`⚠️ Attempt ${attempt} failed (no output received)`)
        lastError = new Error(`No output received from Claude Code (attempt ${attempt})`)
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

    if (finalResult) {
      return finalResult
    }

    // All retries failed, return empty result
    console.error(`❌ All ${MAX_RETRIES} attempts failed`)
    return {
      exitCode: -1,
      stdout: '',
      stderr: lastError?.message || 'All retry attempts failed',
    }
  }

  /**
   * Resume an existing Claude Code session with retry logic
   * Uses stored worktree path if available
   */
  async resumeSession(
    session: Session,
    input: string,
    context?: TerminalTaskContext,
    callbacks?: TerminalExecutorCallbacks
  ): Promise<TerminalExecutionResult> {
    const { onProgress, onComment } = callbacks || {}

    // Get stored Claude session ID and worktree info
    const claudeSessionId = await terminalSessionStore.getClaudeSessionId(session.taskId)
    const storedWorktree = await terminalSessionStore.getWorktree(session.taskId)

    if (!claudeSessionId) {
      console.log(`⚠️ No stored session for task ${session.taskId}, starting new session`)
      return this.startSession(session, input, context, callbacks)
    }

    const promptWithContext = await this.buildPrompt(session, input, context)

    // Determine working path - use stored worktree if available and still exists
    let workingPath = session.projectPath || process.cwd()
    let useStoredWorktree = false

    if (storedWorktree) {
      try {
        const fsModule = await import('fs/promises')
        await fsModule.access(storedWorktree.path)
        workingPath = storedWorktree.path
        useStoredWorktree = true
        console.log(`🔄 Resuming Claude Code session ${claudeSessionId}`)
        console.log(`🌳 Using stored worktree: ${workingPath}`)
      } catch {
        console.log(`⚠️ Stored worktree no longer exists, using main directory`)
      }
    } else {
      console.log(`🔄 Resuming Claude Code session ${claudeSessionId}`)
      console.log(`📁 Working directory: ${workingPath}`)
    }

    // Create a modified session with the working path
    const workingSession: Session = {
      ...session,
      projectPath: workingPath,
    }

    // Capture git baseline BEFORE execution to filter out pre-existing files
    const { captureGitBaseline } = await import('./terminal-base.js')
    const gitBaseline = await captureGitBaseline(workingPath)

    // Retry logic for intermittent Claude Code hangs
    const MAX_RETRIES = 3
    let lastError: Error | undefined

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000)
        console.log(`🔄 Retry attempt ${attempt}/${MAX_RETRIES} after ${delay}ms delay...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }

      // Use stdin for prompt - more reliable than command-line args
      const args = [
        '--print',
        '--resume', claudeSessionId,
        '--output-format', 'text',
        '--dangerously-skip-permissions',
      ]

      const result = await this.runClaude(args, workingSession, { onProgress, onComment }, promptWithContext)

      // Check if we got actual output
      if (result.stdout.length > 0 || result.exitCode === 0) {
        // Update session ID if we got a new one
        if (result.sessionId) {
          await terminalSessionStore.setClaudeSessionId(session.taskId, result.sessionId)
        }

        // Capture git changes (filtering out pre-existing files using baseline)
        const changes = await this.captureGitChanges(workingPath, gitBaseline)
        result.gitDiff = changes.diff
        result.modifiedFiles = changes.files

        // If using worktree and have changes, push them
        if (useStoredWorktree && storedWorktree && changes.files.length > 0) {
          console.log(`\n📤 Pushing changes from worktree...`)
          const prUrl = await pushWorktreeChanges(
            storedWorktree.path,
            storedWorktree.branch,
            session.title
          )
          if (prUrl) {
            result.prUrl = prUrl
          }
        }

        // Extract PR URL from output if not already set
        if (!result.prUrl) {
          result.prUrl = this.extractPrUrl(result.stdout)
        }

        return result
      }

      console.log(`⚠️ Attempt ${attempt} failed (no output received)`)
      lastError = new Error(`No output received from Claude Code (attempt ${attempt})`)
    }

    // All retries failed
    console.error(`❌ All ${MAX_RETRIES} attempts failed`)
    return {
      exitCode: -1,
      stdout: '',
      stderr: lastError?.message || 'All retry attempts failed',
    }
  }

  /**
   * Execute Claude Code CLI
   *
   * Uses stdin for prompt input instead of command-line args to avoid
   * issues with long prompts, special characters, and newlines.
   *
   * Parses output in real-time to detect plans, questions, and progress,
   * posting them as comments to the task via the onComment callback.
   */
  private runClaude(
    args: string[],
    session: Session,
    callbacks?: TerminalExecutorCallbacks,
    stdinInput?: string
  ): Promise<TerminalExecutionResult> {
    const { onProgress, onComment } = callbacks || {}

    return new Promise((resolve, reject) => {
      let stdout = ''
      let stderr = ''
      let extractedSessionId: string | undefined
      let lastProgressTime = Date.now()
      let lastOutputTime = Date.now()
      let heartbeatInterval: ReturnType<typeof setInterval> | null = null
      let initialTimeoutHandle: ReturnType<typeof setTimeout> | null = null

      // Create parser state for detecting plans/questions
      const parserState = createParserState()

      // Initial timeout: Claude CLI needs time to load context
      // Complex tasks may take 60-90s before producing output
      const INITIAL_TIMEOUT = 180000 // 3 minutes for first output
      const STALL_TIMEOUT = 300000 // 5 minutes of no output = stalled

      // Log command (without prompt for readability)
      console.log(`🤖 Running: claude ${args.join(' ')}`)
      if (stdinInput) {
        console.log(`📝 Prompt via stdin: ${stdinInput.length} chars (first 100: ${stdinInput.slice(0, 100).replace(/\n/g, '\\n')}...)`)
      }
      console.log(`⏱️ Timeouts: initial=${INITIAL_TIMEOUT / 1000}s, stall=${STALL_TIMEOUT / 1000}s, max=${this.timeout / 1000}s`)

      // Prepare environment with required tokens
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        CLAUDE_CODE_ENTRYPOINT: 'cli',
      }
      // Ensure GH_TOKEN is set for gh CLI (it prefers GH_TOKEN over GITHUB_TOKEN)
      if (process.env.GITHUB_TOKEN && !process.env.GH_TOKEN) {
        env.GH_TOKEN = process.env.GITHUB_TOKEN
      }

      const proc = spawn('claude', args, {
        cwd: session.projectPath || process.cwd(),
        env,
        stdio: [stdinInput ? 'pipe' : 'ignore', 'pipe', 'pipe']
      })

      console.log(`🚀 Claude process spawned with PID: ${proc.pid}`)

      if (!proc.pid) {
        reject(new Error('Failed to spawn Claude process'))
        return
      }

      // Write prompt to stdin if provided
      if (stdinInput && proc.stdin) {
        console.log(`📤 Writing prompt to stdin...`)
        proc.stdin.write(stdinInput)
        proc.stdin.end()
        console.log(`✅ Stdin closed`)
      }

      // Heartbeat: log status every 30 seconds
      heartbeatInterval = setInterval(() => {
        const elapsed = Math.round((Date.now() - lastOutputTime) / 1000)
        const totalElapsed = Math.round((Date.now() - lastProgressTime) / 1000)
        console.log(`💓 Heartbeat: ${totalElapsed}s elapsed, last output ${elapsed}s ago, stdout=${stdout.length} chars`)

        // Check for stall
        if (Date.now() - lastOutputTime > STALL_TIMEOUT) {
          console.error(`❌ Process stalled - no output for ${STALL_TIMEOUT / 1000}s, killing`)
          proc.kill('SIGTERM')
        }
      }, 30000)

      // Initial timeout: if no output within timeout, something is wrong
      initialTimeoutHandle = setTimeout(() => {
        if (stdout.length === 0 && stderr.length === 0) {
          console.error(`❌ No output received within ${INITIAL_TIMEOUT / 1000}s, killing process`)
          proc.kill('SIGTERM')
        }
      }, INITIAL_TIMEOUT)

      const cleanup = () => {
        if (heartbeatInterval) clearInterval(heartbeatInterval)
        if (initialTimeoutHandle) clearTimeout(initialTimeoutHandle)
      }

      if (!proc.stdout || !proc.stderr) {
        cleanup()
        reject(new Error('Failed to get stdout/stderr pipes from Claude process'))
        return
      }

      proc.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString()
        stdout += chunk
        lastOutputTime = Date.now()
        process.stdout.write(chunk) // Echo to console

        // Clear initial timeout once we get output
        if (initialTimeoutHandle) {
          clearTimeout(initialTimeoutHandle)
          initialTimeoutHandle = null
        }

        // Parse for session ID
        const lines = chunk.split('\n').filter(l => l.trim())
        for (const line of lines) {
          try {
            const json = JSON.parse(line)
            if (json.session_id) {
              extractedSessionId = json.session_id
              console.log(`🔑 Extracted session ID: ${extractedSessionId}`)
            }
            if (json.type === 'system' && json.session_id) {
              extractedSessionId = json.session_id
            }

            // Progress updates from JSON
            if (onProgress && Date.now() - lastProgressTime > 30000) {
              if (json.type === 'assistant' && json.message) {
                onProgress(`Working... ${json.message.slice(0, 200)}`)
                lastProgressTime = Date.now()
              }
            }
          } catch {
            // Not JSON, try regex patterns
            const sessionMatch = line.match(/Session ID:\s*([a-f0-9-]+)/i)
            if (sessionMatch) {
              extractedSessionId = sessionMatch[1]
            }
            const contextMatch = line.match(/"session_id":\s*"([a-f0-9-]+)"/i)
            if (contextMatch) {
              extractedSessionId = contextMatch[1]
            }
          }
        }

        // Parse chunk for plans, questions, and progress to post as comments
        if (onComment) {
          const detected = parseOutputChunk(chunk, parserState)
          for (const item of detected) {
            const comment = formatContentAsComment(item, 'Claude')
            console.log(`📤 Posting ${item.type} comment to task...`)
            onComment(comment).catch(err => {
              console.error(`⚠️ Failed to post ${item.type} comment:`, err)
            })

            // Also call onProgress for detected items
            if (onProgress && item.type === 'progress') {
              onProgress(item.content)
            }
          }
        }
      })

      proc.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString()
        stderr += chunk
        lastOutputTime = Date.now()
        console.error(`⚠️ stderr: ${chunk}`)
      })

      proc.on('close', (code) => {
        cleanup()
        console.log(`✅ Claude Code exited with code ${code}`)
        console.log(`📊 Final stats: stdout=${stdout.length} chars, stderr=${stderr.length} chars`)
        resolve({
          exitCode: code,
          stdout,
          stderr,
          sessionId: extractedSessionId
        })
      })

      proc.on('error', (error) => {
        cleanup()
        console.error(`❌ Claude Code execution error:`, error)
        reject(error)
      })

      // Max timeout
      setTimeout(() => {
        if (!proc.killed) {
          cleanup()
          console.log(`⏰ Max timeout (${this.timeout / 1000}s) reached, killing Claude Code process`)
          proc.kill('SIGTERM')
        }
      }, this.timeout)
    })
  }

  /**
   * Parse Claude Code output to extract key information
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

    // Try to extract summary (last substantial paragraph)
    const paragraphs = output.split(/\n\n+/).filter(p => p.trim().length > 50)
    if (paragraphs.length > 0) {
      result.summary = paragraphs[paragraphs.length - 1].trim().slice(0, 500)
    }

    return result
  }

  /**
   * Check if Claude Code CLI is available
   */
  async checkAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn('claude', ['--version'], {
        timeout: 5000
      })

      proc.on('close', (code) => {
        resolve(code === 0)
      })

      proc.on('error', () => {
        resolve(false)
      })
    })
  }
}

// Export singleton instance
export const terminalClaudeExecutor = new TerminalClaudeExecutor()
