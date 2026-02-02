/**
 * Terminal OpenClaw Executor
 *
 * Executes tasks using OpenClaw Gateway via WebSocket RPC.
 * This enables running tasks assigned to openclaw@astrid.cc in terminal mode.
 *
 * OpenClaw is a self-hosted AI agent worker that connects via WebSocket.
 * Users register their gateway URL in Astrid settings.
 */

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
} from './terminal-base.js'
import { DEFAULT_MODELS } from '../utils/agent-config.js'

// ============================================================================
// TYPES
// ============================================================================

export interface TerminalOpenClawOptions {
  gatewayUrl?: string
  authToken?: string
  model?: string
  maxTurns?: number
  timeout?: number
  pollIntervalMs?: number
}

/**
 * OpenClaw session state
 */
interface OpenClawSession {
  sessionId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  messages: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp: number
  }>
}

/**
 * OpenClaw WebSocket RPC message
 */
interface OpenClawRPCMessage {
  jsonrpc: '2.0'
  id?: string | number
  method?: string
  params?: unknown
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

/**
 * OpenClaw event from WebSocket
 */
interface OpenClawEvent {
  type: 'progress' | 'tool_call' | 'thinking' | 'complete' | 'error'
  sessionId: string
  data: unknown
  timestamp: number
}

// ============================================================================
// WEBSOCKET RPC CLIENT (Minimal SDK Version)
// ============================================================================

/**
 * Simple WebSocket RPC client for OpenClaw Gateway
 * This is a minimal version for the SDK - full version is in lib/ai/openclaw-rpc-client.ts
 */
class OpenClawRPCClient {
  private ws: WebSocket | null = null
  private pendingCalls = new Map<string | number, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    timeout: NodeJS.Timeout
  }>()
  private eventListeners = new Map<string, Set<(event: OpenClawEvent) => void>>()
  private messageId = 0
  private status: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected'

  constructor(
    private gatewayUrl: string,
    private authToken?: string,
    private timeoutMs: number = 30000
  ) {}

  getStatus(): string {
    return this.status
  }

  async connect(): Promise<void> {
    if (this.status === 'connected') return

    this.status = 'connecting'

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'))
      }, this.timeoutMs)

      try {
        // Use dynamic import for ws in Node.js environments
        this.createWebSocket().then(ws => {
          this.ws = ws as unknown as WebSocket

          this.ws.onopen = () => {
            clearTimeout(timeout)
            this.status = 'connected'
            console.log(`✅ Connected to OpenClaw Gateway: ${this.gatewayUrl}`)

            // Authenticate if token provided
            if (this.authToken) {
              this.call('auth', { token: this.authToken })
                .catch(err => console.warn('Auth warning:', err))
            }

            resolve()
          }

          this.ws.onerror = (error) => {
            clearTimeout(timeout)
            this.status = 'error'
            reject(new Error(`WebSocket error: ${error}`))
          }

          this.ws.onclose = () => {
            this.status = 'disconnected'
            console.log('🔌 Disconnected from OpenClaw Gateway')
          }

          this.ws.onmessage = (event) => {
            this.handleMessage(event.data as string)
          }
        }).catch(err => {
          clearTimeout(timeout)
          this.status = 'error'
          reject(err)
        })
      } catch (error) {
        clearTimeout(timeout)
        this.status = 'error'
        reject(error)
      }
    })
  }

  private async createWebSocket(): Promise<unknown> {
    // Check if we're in a browser or Node.js environment
    if (typeof WebSocket !== 'undefined') {
      return new WebSocket(this.gatewayUrl)
    } else {
      // Node.js - use ws package
      const { default: WS } = await import('ws')
      return new WS(this.gatewayUrl)
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.status = 'disconnected'

    // Clear pending calls
    for (const [, pending] of this.pendingCalls) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Connection closed'))
    }
    this.pendingCalls.clear()
  }

  async call<T>(method: string, params: unknown): Promise<T> {
    if (!this.ws || this.status !== 'connected') {
      throw new Error('Not connected to OpenClaw Gateway')
    }

    const id = ++this.messageId
    const message: OpenClawRPCMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCalls.delete(id)
        reject(new Error(`RPC call timeout: ${method}`))
      }, this.timeoutMs)

      this.pendingCalls.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      })

      this.ws!.send(JSON.stringify(message))
    })
  }

  subscribe(sessionId: string, callback: (event: OpenClawEvent) => void): () => void {
    if (!this.eventListeners.has(sessionId)) {
      this.eventListeners.set(sessionId, new Set())
    }
    this.eventListeners.get(sessionId)!.add(callback)

    // Return unsubscribe function
    return () => {
      this.eventListeners.get(sessionId)?.delete(callback)
    }
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as OpenClawRPCMessage

      // Handle RPC response
      if (message.id !== undefined && this.pendingCalls.has(message.id)) {
        const pending = this.pendingCalls.get(message.id)!
        this.pendingCalls.delete(message.id)
        clearTimeout(pending.timeout)

        if (message.error) {
          pending.reject(new Error(message.error.message))
        } else {
          pending.resolve(message.result)
        }
        return
      }

      // Handle event notification
      if (message.method === 'session_event' && message.params) {
        const event = message.params as OpenClawEvent
        const listeners = this.eventListeners.get(event.sessionId) ||
                          this.eventListeners.get('*')
        if (listeners) {
          for (const listener of listeners) {
            listener(event)
          }
        }
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error)
    }
  }

  /**
   * Send a task to OpenClaw Gateway
   */
  async sendTask(params: {
    prompt: string
    model: string
    maxTurns: number
    workingDirectory?: string
  }): Promise<{ sessionId: string }> {
    return this.call('sessions_send', params)
  }

  /**
   * Get session history
   */
  async getSessionHistory(sessionId: string): Promise<OpenClawSession> {
    return this.call('sessions_history', { sessionId })
  }

  /**
   * List active sessions
   */
  async listSessions(): Promise<Array<{ id: string; status: string }>> {
    return this.call('sessions_list', {})
  }

  /**
   * Ping the gateway
   */
  async ping(): Promise<{ pong: boolean; version?: string }> {
    return this.call('ping', {})
  }
}

// ============================================================================
// TERMINAL OPENCLAW EXECUTOR
// ============================================================================

export class TerminalOpenClawExecutor implements TerminalExecutor {
  private gatewayUrl: string
  private authToken: string | undefined
  private model: string
  private maxTurns: number
  private timeout: number
  private pollIntervalMs: number

  constructor(options: TerminalOpenClawOptions = {}) {
    this.gatewayUrl = options.gatewayUrl || process.env.OPENCLAW_GATEWAY_URL || ''
    this.authToken = options.authToken || process.env.OPENCLAW_AUTH_TOKEN
    this.model = options.model || process.env.OPENCLAW_MODEL || DEFAULT_MODELS.openclaw
    this.maxTurns = options.maxTurns || parseInt(process.env.OPENCLAW_MAX_TURNS || '50', 10)
    this.timeout = options.timeout || parseInt(process.env.OPENCLAW_TIMEOUT || '900000', 10) // 15 min default
    this.pollIntervalMs = options.pollIntervalMs || parseInt(process.env.OPENCLAW_POLL_INTERVAL || '2000', 10)
  }

  /**
   * Check if OpenClaw Gateway URL is configured
   */
  async checkAvailable(): Promise<boolean> {
    if (!this.gatewayUrl) {
      return false
    }

    // Optionally test connection
    try {
      const client = new OpenClawRPCClient(this.gatewayUrl, this.authToken, 5000)
      await client.connect()
      const result = await client.ping()
      client.disconnect()
      return result.pong === true
    } catch {
      // Gateway not reachable
      return false
    }
  }

  /**
   * Build the prompt for OpenClaw
   */
  private buildPrompt(session: Session, context?: TerminalTaskContext): string {
    const commentHistory = formatCommentHistory(context?.comments)

    return `# Task: ${session.title}

${session.description || ''}
${commentHistory}

## Working Directory
${session.projectPath || process.cwd()}

## Workflow Requirements

1. Understand the task and analyze the codebase
2. Make the requested changes with proper error handling
3. Run tests if available: \`npm run predeploy\` or \`npm test\`
4. Commit changes with a clear message
5. Create a PR if appropriate: \`gh pr create\`

## Output Requirements

Your response should include:
1. What changes you made and why
2. Files modified
3. Test results
4. PR URL if created

Begin by analyzing the task and relevant code.`
  }

  /**
   * Start a new session to process a task via OpenClaw Gateway
   */
  async startSession(
    session: Session,
    prompt?: string,
    context?: TerminalTaskContext,
    callbacks?: TerminalExecutorCallbacks
  ): Promise<TerminalExecutionResult> {
    const { onProgress, onComment } = callbacks || {}
    const userPrompt = prompt || this.buildPrompt(session, context)

    console.log(`🦞 Starting OpenClaw terminal session for task: ${session.title}`)
    console.log(`   Gateway: ${this.gatewayUrl}`)
    console.log(`   Model: ${this.model}`)

    // Create parser state for detecting plans/questions
    const parserState = createParserState()

    // Connect to gateway
    const client = new OpenClawRPCClient(this.gatewayUrl, this.authToken, this.timeout)

    try {
      onProgress?.('Connecting to OpenClaw Gateway...')
      await client.connect()

      // Send task
      onProgress?.('Sending task to OpenClaw worker...')
      const { sessionId } = await client.sendTask({
        prompt: userPrompt,
        model: this.model,
        maxTurns: this.maxTurns,
        workingDirectory: session.projectPath,
      })

      console.log(`   Session ID: ${sessionId}`)

      // Subscribe to events
      let stdout = ''
      let prUrl: string | undefined
      let completed = false
      let error: string | undefined

      const unsubscribe = client.subscribe(sessionId, (event) => {
        switch (event.type) {
          case 'progress':
            const progressMsg = typeof event.data === 'string' ? event.data : JSON.stringify(event.data)
            onProgress?.(progressMsg)
            stdout += `\n${progressMsg}`

            // Parse for plans/questions
            if (onComment) {
              const detected = parseOutputChunk(progressMsg, parserState)
              for (const item of detected) {
                const comment = formatContentAsComment(item, 'OpenClaw')
                console.log(`📤 Posting ${item.type} comment to task...`)
                onComment(comment).catch(err => {
                  console.error(`⚠️ Failed to post ${item.type} comment:`, err)
                })
              }
            }
            break

          case 'tool_call':
            const toolData = event.data as { name: string; args?: unknown }
            onProgress?.(`Using tool: ${toolData.name}`)
            break

          case 'complete':
            completed = true
            const completeData = event.data as { summary?: string; prUrl?: string }
            if (completeData.summary) {
              stdout += `\n\n[Task Complete]\n${completeData.summary}`
            }
            if (completeData.prUrl) {
              prUrl = completeData.prUrl
            }
            break

          case 'error':
            error = typeof event.data === 'string' ? event.data : JSON.stringify(event.data)
            stdout += `\n\n[Error]\n${error}`
            break
        }
      })

      // Poll for completion
      const startTime = Date.now()
      while (!completed && !error && (Date.now() - startTime) < this.timeout) {
        await new Promise(resolve => setTimeout(resolve, this.pollIntervalMs))

        // Check session status
        try {
          const sessions = await client.listSessions()
          const ourSession = sessions.find(s => s.id === sessionId)
          if (ourSession?.status === 'completed') {
            completed = true
          } else if (ourSession?.status === 'failed') {
            error = 'Session failed'
          }
        } catch {
          // Continue polling
        }
      }

      // Get final session history
      try {
        const history = await client.getSessionHistory(sessionId)
        if (history.messages) {
          for (const msg of history.messages) {
            if (msg.role === 'assistant' && msg.content) {
              // Check for PR URL in message
              const msgPrUrl = extractPrUrl(msg.content)
              if (msgPrUrl) {
                prUrl = msgPrUrl
              }
            }
          }
        }
      } catch {
        // Ignore history errors
      }

      unsubscribe()
      client.disconnect()

      // Extract PR URL from output if not found
      if (!prUrl) {
        prUrl = extractPrUrl(stdout)
      }

      // Capture git changes
      const projectPath = session.projectPath || process.cwd()
      const changes = await captureGitChanges(projectPath)

      if (error) {
        return {
          exitCode: 1,
          stdout,
          stderr: error,
          modifiedFiles: changes.files,
          gitDiff: changes.diff,
        }
      }

      return {
        exitCode: 0,
        stdout,
        stderr: '',
        sessionId,
        modifiedFiles: changes.files,
        gitDiff: changes.diff,
        prUrl,
      }

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.error(`❌ OpenClaw terminal execution error:`, errorMsg)

      client.disconnect()

      return {
        exitCode: 1,
        stdout: '',
        stderr: errorMsg,
        modifiedFiles: [],
      }
    }
  }

  /**
   * Resume a session with new input
   */
  async resumeSession(
    session: Session,
    input: string,
    context?: TerminalTaskContext,
    callbacks?: TerminalExecutorCallbacks
  ): Promise<TerminalExecutionResult> {
    console.log(`🔄 Resuming OpenClaw session`)

    // For OpenClaw, resuming means starting a new conversation with the follow-up
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

    // Try to extract summary
    const summaryMatch = output.match(/\[Task Complete\]\s*\n([^\n]+)/i)
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
export const terminalOpenClawExecutor = new TerminalOpenClawExecutor()
