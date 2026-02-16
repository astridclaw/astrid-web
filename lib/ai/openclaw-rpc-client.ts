/**
 * OpenClaw RPC Client
 *
 * WebSocket RPC client for communicating with OpenClaw Gateway.
 * OpenClaw uses a JSON-RPC style protocol over WebSocket for real-time
 * task execution and progress streaming.
 */

import WebSocket from 'ws'

// ============================================================================
// TYPES
// ============================================================================

export interface OpenClawEvent {
  type: 'progress' | 'tool_call' | 'thinking' | 'complete' | 'error' | 'output'
  sessionId: string
  data: unknown
  timestamp: number
}

export interface OpenClawSession {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  createdAt: number
  completedAt?: number
}

export interface OpenClawSessionResult {
  success: boolean
  sessionId: string
  output?: string
  error?: string
  files?: Array<{
    path: string
    action: 'create' | 'modify' | 'delete'
  }>
  commitHash?: string
  prUrl?: string
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface OpenClawRPCClientConfig {
  /** Gateway URL (ws:// or wss://) */
  gatewayUrl: string
  /** Optional authentication token */
  authToken?: string
  /** Reconnection settings */
  reconnect?: {
    enabled: boolean
    maxAttempts?: number
    initialDelayMs?: number
    maxDelayMs?: number
  }
  /** Connection timeout in ms */
  connectionTimeoutMs?: number
  /** Logger function */
  logger?: (level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void
}

interface ResolvedOpenClawRPCClientConfig {
  gatewayUrl: string
  authToken: string
  reconnect: {
    enabled: boolean
    maxAttempts: number
    initialDelayMs: number
    maxDelayMs: number
  }
  connectionTimeoutMs: number
  logger: (level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void
}

interface RPCRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: unknown
}

interface RPCResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

interface RPCNotification {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

// ============================================================================
// RPC CLIENT
// ============================================================================

export class OpenClawRPCClient {
  private ws: WebSocket | null = null
  private config: ResolvedOpenClawRPCClientConfig
  private status: ConnectionStatus = 'disconnected'
  private requestId = 0
  private pendingRequests: Map<string | number, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    timeout: ReturnType<typeof setTimeout>
  }> = new Map()
  private eventSubscribers: Map<string, Set<(event: OpenClawEvent) => void>> = new Map()
  private reconnectAttempts = 0
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  private connectionPromise: Promise<void> | null = null

  constructor(config: OpenClawRPCClientConfig) {
    this.config = {
      gatewayUrl: config.gatewayUrl,
      authToken: config.authToken || '',
      reconnect: {
        enabled: config.reconnect?.enabled ?? true,
        maxAttempts: config.reconnect?.maxAttempts ?? 5,
        initialDelayMs: config.reconnect?.initialDelayMs ?? 1000,
        maxDelayMs: config.reconnect?.maxDelayMs ?? 30000,
      },
      connectionTimeoutMs: config.connectionTimeoutMs ?? 30000,
      logger: config.logger || (() => {}),
    }
  }

  /**
   * Connect to the OpenClaw Gateway
   */
  async connect(): Promise<void> {
    if (this.status === 'connected' && this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    if (this.connectionPromise) {
      return this.connectionPromise
    }

    this.connectionPromise = this.doConnect()

    try {
      await this.connectionPromise
    } finally {
      this.connectionPromise = null
    }
  }

  private async doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.status = 'connecting'
      this.config.logger('info', 'Connecting to OpenClaw Gateway', { url: this.config.gatewayUrl })

      const connectionTimeout = setTimeout(() => {
        if (this.status === 'connecting') {
          this.ws?.close()
          this.status = 'error'
          reject(new Error(`Connection timeout after ${this.config.connectionTimeoutMs}ms`))
        }
      }, this.config.connectionTimeoutMs)

      try {
        // Build connection URL with auth token if provided
        const url = new URL(this.config.gatewayUrl)
        if (this.config.authToken) {
          url.searchParams.set('token', this.config.authToken)
        }

        this.ws = new WebSocket(url.toString())

        this.ws.on('open', () => {
          clearTimeout(connectionTimeout)
          this.status = 'connected'
          this.reconnectAttempts = 0
          this.config.logger('info', 'Connected to OpenClaw Gateway')
          resolve()
        })

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(data)
        })

        this.ws.on('close', (code: number, reason: Buffer) => {
          clearTimeout(connectionTimeout)
          const wasConnected = this.status === 'connected'
          this.status = 'disconnected'
          this.config.logger('info', 'Disconnected from OpenClaw Gateway', {
            code,
            reason: reason.toString()
          })

          // Reject pending requests
          for (const [id, pending] of this.pendingRequests) {
            clearTimeout(pending.timeout)
            pending.reject(new Error('Connection closed'))
            this.pendingRequests.delete(id)
          }

          // Attempt reconnection if enabled and was connected
          if (wasConnected && this.config.reconnect.enabled) {
            this.scheduleReconnect()
          }
        })

        this.ws.on('error', (error: Error) => {
          clearTimeout(connectionTimeout)
          this.config.logger('error', 'WebSocket error', { error: error.message })
          if (this.status === 'connecting') {
            this.status = 'error'
            reject(error)
          }
        })
      } catch (error) {
        clearTimeout(connectionTimeout)
        this.status = 'error'
        reject(error)
      }
    })
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return
    }

    if (this.reconnectAttempts >= this.config.reconnect.maxAttempts) {
      this.config.logger('error', 'Max reconnection attempts reached')
      this.status = 'error'
      return
    }

    const delay = Math.min(
      this.config.reconnect.initialDelayMs * Math.pow(2, this.reconnectAttempts),
      this.config.reconnect.maxDelayMs
    )

    this.config.logger('info', `Scheduling reconnection in ${delay}ms`, {
      attempt: this.reconnectAttempts + 1,
      maxAttempts: this.config.reconnect.maxAttempts
    })

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null
      this.reconnectAttempts++
      try {
        await this.connect()
      } catch (error) {
        this.config.logger('error', 'Reconnection failed', {
          error: error instanceof Error ? error.message : String(error)
        })
        this.scheduleReconnect()
      }
    }, delay)
  }

  /**
   * Disconnect from the Gateway
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }

    this.status = 'disconnected'
    this.config.logger('info', 'Disconnected from OpenClaw Gateway')
  }

  /**
   * Get current connection status
   */
  getStatus(): ConnectionStatus {
    return this.status
  }

  /**
   * Make an RPC call to the Gateway
   */
  async call<T>(method: string, params?: unknown, timeoutMs: number = 30000): Promise<T> {
    if (this.status !== 'connected' || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to OpenClaw Gateway')
    }

    const id = ++this.requestId

    const request: RPCRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`RPC call '${method}' timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      })

      this.ws!.send(JSON.stringify(request))
      this.config.logger('info', 'RPC call sent', { method, id })
    })
  }

  /**
   * Subscribe to events for a specific session
   * Returns unsubscribe function
   */
  subscribe(sessionId: string, onEvent: (event: OpenClawEvent) => void): () => void {
    if (!this.eventSubscribers.has(sessionId)) {
      this.eventSubscribers.set(sessionId, new Set())
    }

    this.eventSubscribers.get(sessionId)!.add(onEvent)

    // Return unsubscribe function
    return () => {
      const subscribers = this.eventSubscribers.get(sessionId)
      if (subscribers) {
        subscribers.delete(onEvent)
        if (subscribers.size === 0) {
          this.eventSubscribers.delete(sessionId)
        }
      }
    }
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString()) as RPCResponse | RPCNotification

      // Handle RPC response
      if ('id' in message && message.id !== undefined) {
        const pending = this.pendingRequests.get(message.id)
        if (pending) {
          clearTimeout(pending.timeout)
          this.pendingRequests.delete(message.id)

          if (message.error) {
            pending.reject(new Error(`RPC Error: ${message.error.message}`))
          } else {
            pending.resolve(message.result)
          }
        }
        return
      }

      // Handle RPC notification (events)
      if ('method' in message) {
        this.handleNotification(message)
      }
    } catch (error) {
      this.config.logger('error', 'Failed to parse message', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private handleNotification(notification: RPCNotification): void {
    const params = notification.params as { sessionId?: string; [key: string]: unknown } | undefined

    if (!params?.sessionId) {
      return
    }

    const event: OpenClawEvent = {
      type: this.mapMethodToEventType(notification.method),
      sessionId: params.sessionId,
      data: params,
      timestamp: Date.now(),
    }

    const subscribers = this.eventSubscribers.get(params.sessionId)
    if (subscribers) {
      for (const callback of subscribers) {
        try {
          callback(event)
        } catch (error) {
          this.config.logger('error', 'Event handler error', {
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }
    }

    // Also notify wildcard subscribers
    const wildcardSubscribers = this.eventSubscribers.get('*')
    if (wildcardSubscribers) {
      for (const callback of wildcardSubscribers) {
        try {
          callback(event)
        } catch (error) {
          this.config.logger('error', 'Wildcard event handler error', {
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }
    }
  }

  private mapMethodToEventType(method: string): OpenClawEvent['type'] {
    switch (method) {
      case 'session.progress':
        return 'progress'
      case 'session.tool_call':
        return 'tool_call'
      case 'session.thinking':
        return 'thinking'
      case 'session.complete':
        return 'complete'
      case 'session.error':
        return 'error'
      case 'session.output':
        return 'output'
      default:
        return 'progress'
    }
  }

  // ============================================================================
  // HIGH-LEVEL API METHODS
  // ============================================================================

  /**
   * Send a task to be executed
   */
  async sendTask(options: {
    prompt: string
    workingDir?: string
    model?: string
    maxTurns?: number
    systemPrompt?: string
    environment?: Record<string, string>
  }): Promise<{ sessionId: string }> {
    return this.call('sessions_send', {
      prompt: options.prompt,
      working_dir: options.workingDir,
      model: options.model,
      max_turns: options.maxTurns,
      system_prompt: options.systemPrompt,
      environment: options.environment,
    })
  }

  /**
   * Resume an existing session
   */
  async resumeSession(sessionId: string, prompt?: string): Promise<{ sessionId: string }> {
    return this.call('sessions_resume', {
      session_id: sessionId,
      prompt,
    })
  }

  /**
   * List all sessions
   */
  async listSessions(): Promise<OpenClawSession[]> {
    return this.call('sessions_list', {})
  }

  /**
   * Get session history/transcript
   */
  async getSessionHistory(sessionId: string): Promise<{
    sessionId: string
    messages: Array<{
      role: string
      content: string
      timestamp: number
    }>
  }> {
    return this.call('sessions_history', { session_id: sessionId })
  }

  /**
   * Stop a running session
   */
  async stopSession(sessionId: string): Promise<{ success: boolean }> {
    return this.call('sessions_stop', { session_id: sessionId })
  }

  /**
   * Get gateway status
   */
  async getGatewayStatus(): Promise<{
    version: string
    activeSessions: number
    uptime: number
  }> {
    return this.call('status', {})
  }

  /**
   * Ping the gateway to check connectivity
   */
  async ping(): Promise<{ pong: boolean; latencyMs: number }> {
    const start = Date.now()
    await this.call('ping', {}, 5000)
    return { pong: true, latencyMs: Date.now() - start }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create an OpenClaw RPC client
 */
export function createOpenClawClient(config: OpenClawRPCClientConfig): OpenClawRPCClient {
  return new OpenClawRPCClient(config)
}

/**
 * Test connection to an OpenClaw Gateway
 * Returns health status without maintaining connection
 */
export async function testOpenClawConnection(
  gatewayUrl: string,
  authToken?: string,
  timeoutMs: number = 10000
): Promise<{
  success: boolean
  latencyMs?: number
  error?: string
  version?: string
}> {
  const client = new OpenClawRPCClient({
    gatewayUrl,
    authToken,
    connectionTimeoutMs: timeoutMs,
    reconnect: { enabled: false },
  })

  try {
    await client.connect()
    const pingResult = await client.ping()
    const status = await client.getGatewayStatus()
    client.disconnect()

    return {
      success: true,
      latencyMs: pingResult.latencyMs,
      version: status.version,
    }
  } catch (error) {
    client.disconnect()
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
