import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
  type OpenClawEvent,
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
    it('should close the WebSocket connection', async () => {
      const client = createOpenClawClient(mockConfig)

      // Simulate connection
      const connectPromise = client.connect()

      // Trigger the 'open' event
      const onOpenCallback = mockWsInstance.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'open'
      )?.[1] as (() => void) | undefined
      if (onOpenCallback) onOpenCallback()

      await connectPromise

      client.disconnect()
      expect(mockWsInstance.close).toHaveBeenCalled()
      expect(client.getStatus()).toBe('disconnected')
    })
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
})
