/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'

// Generate test keypair for astrid-signed auth mode tests
const testKeyPair = crypto.generateKeyPairSync('ed25519')
const testPrivateKeyPem = testKeyPair.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string

// Mock ws module
const mockWsInstance = {
  on: vi.fn(),
  send: vi.fn(),
  close: vi.fn(),
  readyState: 1, // OPEN
}

vi.mock('ws', () => {
  return {
    default: vi.fn(() => mockWsInstance),
    WebSocket: vi.fn(() => mockWsInstance),
  }
})

import {
  OpenClawRPCClient,
  createOpenClawClient,
  testOpenClawConnection,
  type OpenClawRPCClientConfig,
  type AuthMode,
} from '@/lib/ai/openclaw-rpc-client'

describe('OpenClaw RPC Client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWsInstance.readyState = 1 // Reset to OPEN
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockConfig: OpenClawRPCClientConfig = {
    gatewayUrl: 'ws://localhost:18789',
    authToken: 'test-token',
    reconnect: { enabled: false },
    connectionTimeoutMs: 5000,
    logger: vi.fn(),
  }

  describe('createOpenClawClient', () => {
    it('should create a client instance', () => {
      const client = createOpenClawClient(mockConfig)
      expect(client).toBeInstanceOf(OpenClawRPCClient)
    })

    it('should use default reconnection settings when not specified', () => {
      const client = createOpenClawClient({
        gatewayUrl: 'ws://localhost:18789',
      })
      expect(client).toBeInstanceOf(OpenClawRPCClient)
      expect(client.getStatus()).toBe('disconnected')
    })
  })

  describe('connection status', () => {
    it('should start with disconnected status', () => {
      const client = createOpenClawClient(mockConfig)
      expect(client.getStatus()).toBe('disconnected')
    })
  })

  describe('disconnect', () => {
    it('should close the WebSocket connection when disconnected', () => {
      const client = createOpenClawClient(mockConfig)

      // Disconnect without connecting first - should not throw
      client.disconnect()
      expect(client.getStatus()).toBe('disconnected')
    })

    it('should close WebSocket and update status', async () => {
      const client = createOpenClawClient(mockConfig)

      // Simulate a partial connection setup
      const connectPromise = client.connect()

      // Get the message handler to simulate challenge-response
      const onOpenCallback = mockWsInstance.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'open'
      )?.[1] as (() => void) | undefined
      const onMessageCallback = mockWsInstance.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'message'
      )?.[1] as ((data: Buffer) => void) | undefined

      // Trigger open event
      if (onOpenCallback) onOpenCallback()

      // Simulate challenge event
      if (onMessageCallback) {
        onMessageCallback(Buffer.from(JSON.stringify({
          type: 'event',
          event: 'connect.challenge'
        })))
      }

      // Check that a connect request was sent
      expect(mockWsInstance.send).toHaveBeenCalled()
      const sentMessage = JSON.parse(mockWsInstance.send.mock.calls[0][0])
      expect(sentMessage.method).toBe('connect')

      // Simulate successful auth response
      if (onMessageCallback) {
        onMessageCallback(Buffer.from(JSON.stringify({
          type: 'res',
          id: sentMessage.id,
          ok: true,
          payload: { version: '1.0' }
        })))
      }

      await connectPromise

      client.disconnect()
      expect(mockWsInstance.close).toHaveBeenCalled()
      expect(client.getStatus()).toBe('disconnected')
    }, 10000)
  })

  describe('subscribe', () => {
    it('should return an unsubscribe function', () => {
      const client = createOpenClawClient(mockConfig)
      const callback = vi.fn()

      const unsubscribe = client.subscribe('session-123', callback)

      expect(typeof unsubscribe).toBe('function')
    })

    it('should allow multiple subscribers for the same session', () => {
      const client = createOpenClawClient(mockConfig)
      const callback1 = vi.fn()
      const callback2 = vi.fn()

      const unsubscribe1 = client.subscribe('session-123', callback1)
      const unsubscribe2 = client.subscribe('session-123', callback2)

      expect(typeof unsubscribe1).toBe('function')
      expect(typeof unsubscribe2).toBe('function')
    })

    it('should allow wildcard subscriptions', () => {
      const client = createOpenClawClient(mockConfig)
      const callback = vi.fn()

      const unsubscribe = client.subscribe('*', callback)

      expect(typeof unsubscribe).toBe('function')
    })
  })

  describe('call method', () => {
    it('should throw if not connected', async () => {
      const client = createOpenClawClient(mockConfig)

      await expect(client.call('ping', {})).rejects.toThrow(
        'Not connected to OpenClaw Gateway'
      )
    })
  })

  describe('high-level API methods', () => {
    it('should have sendTask method', () => {
      const client = createOpenClawClient(mockConfig)
      expect(typeof client.sendTask).toBe('function')
    })

    it('should have resumeSession method', () => {
      const client = createOpenClawClient(mockConfig)
      expect(typeof client.resumeSession).toBe('function')
    })

    it('should have listSessions method', () => {
      const client = createOpenClawClient(mockConfig)
      expect(typeof client.listSessions).toBe('function')
    })

    it('should have getSessionHistory method', () => {
      const client = createOpenClawClient(mockConfig)
      expect(typeof client.getSessionHistory).toBe('function')
    })

    it('should have stopSession method', () => {
      const client = createOpenClawClient(mockConfig)
      expect(typeof client.stopSession).toBe('function')
    })

    it('should have getGatewayStatus method', () => {
      const client = createOpenClawClient(mockConfig)
      expect(typeof client.getGatewayStatus).toBe('function')
    })

    it('should have ping method', () => {
      const client = createOpenClawClient(mockConfig)
      expect(typeof client.ping).toBe('function')
    })
  })
})

describe('testOpenClawConnection', () => {
  it('should return failure when connection fails', async () => {
    // The mock WebSocket won't trigger 'open' event, so it should timeout or fail
    const result = await testOpenClawConnection(
      'ws://nonexistent:18789',
      undefined,
      100 // Very short timeout
    )

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('should accept authMode parameter', async () => {
    const result = await testOpenClawConnection(
      'ws://nonexistent:18789',
      'test-token',
      100,
      'token'
    )

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('should accept userId for astrid-signed mode', async () => {
    vi.stubEnv('OPENCLAW_SIGNING_PRIVATE_KEY', testPrivateKeyPem)

    const result = await testOpenClawConnection(
      'ws://nonexistent:18789',
      undefined,
      100,
      'astrid-signed',
      'user-123'
    )

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()

    vi.unstubAllEnvs()
  })
})

describe('Auth Modes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWsInstance.readyState = 1
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('should create client with token auth mode by default', () => {
    const client = createOpenClawClient({
      gatewayUrl: 'ws://localhost:18789',
      authToken: 'my-token',
    })

    expect(client).toBeInstanceOf(OpenClawRPCClient)
  })

  it('should create client with tailscale auth mode', () => {
    const client = createOpenClawClient({
      gatewayUrl: 'ws://localhost:18789',
      authMode: 'tailscale',
    })

    expect(client).toBeInstanceOf(OpenClawRPCClient)
  })

  it('should create client with astrid-signed auth mode', () => {
    const client = createOpenClawClient({
      gatewayUrl: 'ws://localhost:18789',
      authMode: 'astrid-signed',
      userId: 'user-123',
    })

    expect(client).toBeInstanceOf(OpenClawRPCClient)
  })

  it('should create client with none auth mode', () => {
    const client = createOpenClawClient({
      gatewayUrl: 'ws://localhost:18789',
      authMode: 'none',
    })

    expect(client).toBeInstanceOf(OpenClawRPCClient)
  })

  describe('token auth mode connect flow', () => {
    it('should send token in connect request', async () => {
      const client = createOpenClawClient({
        gatewayUrl: 'ws://localhost:18789',
        authToken: 'test-token-abc',
        authMode: 'token',
        reconnect: { enabled: false },
        connectionTimeoutMs: 1000,
      })

      const connectPromise = client.connect()

      // Get callbacks
      const onOpenCallback = mockWsInstance.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'open'
      )?.[1] as (() => void) | undefined
      const onMessageCallback = mockWsInstance.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'message'
      )?.[1] as ((data: Buffer) => void) | undefined

      // Trigger open and challenge
      if (onOpenCallback) onOpenCallback()
      if (onMessageCallback) {
        onMessageCallback(Buffer.from(JSON.stringify({
          type: 'event',
          event: 'connect.challenge'
        })))
      }

      // Check the connect request
      const sentMessage = JSON.parse(mockWsInstance.send.mock.calls[0][0])
      expect(sentMessage.method).toBe('connect')
      expect(sentMessage.params.auth.mode).toBe('token')
      expect(sentMessage.params.auth.token).toBe('test-token-abc')

      // Complete connection
      if (onMessageCallback) {
        onMessageCallback(Buffer.from(JSON.stringify({
          type: 'res',
          id: sentMessage.id,
          ok: true
        })))
      }

      await connectPromise
      client.disconnect()
    }, 5000)
  })

  describe('tailscale auth mode connect flow', () => {
    it('should send tailscale mode in connect request', async () => {
      const client = createOpenClawClient({
        gatewayUrl: 'ws://localhost:18789',
        authMode: 'tailscale',
        reconnect: { enabled: false },
        connectionTimeoutMs: 1000,
      })

      const connectPromise = client.connect()

      const onOpenCallback = mockWsInstance.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'open'
      )?.[1] as (() => void) | undefined
      const onMessageCallback = mockWsInstance.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'message'
      )?.[1] as ((data: Buffer) => void) | undefined

      if (onOpenCallback) onOpenCallback()
      if (onMessageCallback) {
        onMessageCallback(Buffer.from(JSON.stringify({
          type: 'event',
          event: 'connect.challenge'
        })))
      }

      const sentMessage = JSON.parse(mockWsInstance.send.mock.calls[0][0])
      expect(sentMessage.method).toBe('connect')
      expect(sentMessage.params.auth.mode).toBe('tailscale')
      expect(sentMessage.params.auth.token).toBeUndefined()

      if (onMessageCallback) {
        onMessageCallback(Buffer.from(JSON.stringify({
          type: 'res',
          id: sentMessage.id,
          ok: true
        })))
      }

      await connectPromise
      client.disconnect()
    }, 5000)
  })

  describe('astrid-signed auth mode connect flow', () => {
    it('should send signature in connect request', async () => {
      vi.stubEnv('OPENCLAW_SIGNING_PRIVATE_KEY', testPrivateKeyPem)

      const client = createOpenClawClient({
        gatewayUrl: 'ws://localhost:18789',
        authMode: 'astrid-signed',
        userId: 'user-test-123',
        reconnect: { enabled: false },
        connectionTimeoutMs: 1000,
      })

      const connectPromise = client.connect()

      const onOpenCallback = mockWsInstance.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'open'
      )?.[1] as (() => void) | undefined
      const onMessageCallback = mockWsInstance.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'message'
      )?.[1] as ((data: Buffer) => void) | undefined

      if (onOpenCallback) onOpenCallback()
      if (onMessageCallback) {
        onMessageCallback(Buffer.from(JSON.stringify({
          type: 'event',
          event: 'connect.challenge'
        })))
      }

      const sentMessage = JSON.parse(mockWsInstance.send.mock.calls[0][0])
      expect(sentMessage.method).toBe('connect')
      expect(sentMessage.params.auth.mode).toBe('astrid-signed')
      expect(sentMessage.params.auth.signature).toBeDefined()
      expect(sentMessage.params.auth.signature.payload).toBeDefined()
      expect(sentMessage.params.auth.signature.payload.userId).toBe('user-test-123')
      expect(sentMessage.params.auth.signature.payload.gatewayUrl).toBe('ws://localhost:18789')
      expect(sentMessage.params.auth.signature.signature).toBeDefined()
      expect(sentMessage.params.auth.signature.keyId).toBeDefined()

      if (onMessageCallback) {
        onMessageCallback(Buffer.from(JSON.stringify({
          type: 'res',
          id: sentMessage.id,
          ok: true
        })))
      }

      await connectPromise
      client.disconnect()
    }, 5000)

    it('should reject if userId is missing for astrid-signed mode', async () => {
      vi.stubEnv('OPENCLAW_SIGNING_PRIVATE_KEY', testPrivateKeyPem)

      const client = createOpenClawClient({
        gatewayUrl: 'ws://localhost:18789',
        authMode: 'astrid-signed',
        // userId is intentionally missing
        reconnect: { enabled: false },
        connectionTimeoutMs: 1000,
      })

      const connectPromise = client.connect()

      const onOpenCallback = mockWsInstance.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'open'
      )?.[1] as (() => void) | undefined
      const onMessageCallback = mockWsInstance.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'message'
      )?.[1] as ((data: Buffer) => void) | undefined

      if (onOpenCallback) onOpenCallback()
      if (onMessageCallback) {
        onMessageCallback(Buffer.from(JSON.stringify({
          type: 'event',
          event: 'connect.challenge'
        })))
      }

      await expect(connectPromise).rejects.toThrow('userId is required for astrid-signed auth mode')

      client.disconnect()
    }, 5000)
  })

  describe('none auth mode connect flow', () => {
    it('should send none mode in connect request', async () => {
      const client = createOpenClawClient({
        gatewayUrl: 'ws://localhost:18789',
        authMode: 'none',
        reconnect: { enabled: false },
        connectionTimeoutMs: 1000,
      })

      const connectPromise = client.connect()

      const onOpenCallback = mockWsInstance.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'open'
      )?.[1] as (() => void) | undefined
      const onMessageCallback = mockWsInstance.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'message'
      )?.[1] as ((data: Buffer) => void) | undefined

      if (onOpenCallback) onOpenCallback()
      if (onMessageCallback) {
        onMessageCallback(Buffer.from(JSON.stringify({
          type: 'event',
          event: 'connect.challenge'
        })))
      }

      const sentMessage = JSON.parse(mockWsInstance.send.mock.calls[0][0])
      expect(sentMessage.method).toBe('connect')
      expect(sentMessage.params.auth.mode).toBe('none')

      if (onMessageCallback) {
        onMessageCallback(Buffer.from(JSON.stringify({
          type: 'res',
          id: sentMessage.id,
          ok: true
        })))
      }

      await connectPromise
      client.disconnect()
    }, 5000)
  })
})
