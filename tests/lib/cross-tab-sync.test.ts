import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock BroadcastChannel
class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = []
  name: string
  onmessage: ((event: MessageEvent) => void) | null = null
  onmessageerror: ((event: MessageEvent) => void) | null = null

  constructor(name: string) {
    this.name = name
    MockBroadcastChannel.instances.push(this)
  }

  postMessage(data: any) {
    // Broadcast to all other instances with same name
    MockBroadcastChannel.instances
      .filter(instance => instance !== this && instance.name === this.name)
      .forEach(instance => {
        if (instance.onmessage) {
          instance.onmessage(new MessageEvent('message', { data }))
        }
      })
  }

  close() {
    const index = MockBroadcastChannel.instances.indexOf(this)
    if (index > -1) {
      MockBroadcastChannel.instances.splice(index, 1)
    }
  }

  static reset() {
    MockBroadcastChannel.instances = []
  }
}

// Mock sessionStorage
const mockSessionStorage: Record<string, string> = {}
vi.stubGlobal('sessionStorage', {
  getItem: (key: string) => mockSessionStorage[key] || null,
  setItem: (key: string, value: string) => { mockSessionStorage[key] = value },
  removeItem: (key: string) => { delete mockSessionStorage[key] },
  clear: () => { Object.keys(mockSessionStorage).forEach(key => delete mockSessionStorage[key]) }
})

vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)

describe('CrossTabSync', () => {
  beforeEach(() => {
    MockBroadcastChannel.reset()
    vi.resetModules()
    Object.keys(mockSessionStorage).forEach(key => delete mockSessionStorage[key])
  })

  afterEach(() => {
    MockBroadcastChannel.reset()
  })

  it('should generate unique tab IDs', async () => {
    const { CrossTabSync } = await import('@/lib/cross-tab-sync')
    const tabId = CrossTabSync.getTabId()

    expect(tabId).toBeDefined()
    expect(tabId).toMatch(/^tab_\d+_[a-z0-9]+$/)
  })

  it('should persist tab ID in sessionStorage', async () => {
    const { CrossTabSync } = await import('@/lib/cross-tab-sync')
    const tabId = CrossTabSync.getTabId()

    expect(mockSessionStorage['astrid_tab_id']).toBe(tabId)
  })

  it('should check BroadcastChannel support', async () => {
    const { CrossTabSync } = await import('@/lib/cross-tab-sync')

    expect(CrossTabSync.isBroadcastSupported()).toBe(true)
  })

  it('should broadcast events to subscribers', async () => {
    const { CrossTabSync } = await import('@/lib/cross-tab-sync')

    const callback = vi.fn()
    CrossTabSync.subscribe(callback)

    // Create another "tab" by creating a new channel
    const otherChannel = new MockBroadcastChannel('astrid-sync-channel')
    otherChannel.postMessage({
      type: 'cache_updated',
      entity: 'task',
      entityId: 'task-123',
      timestamp: Date.now(),
      tabId: 'other-tab'
    })

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      type: 'cache_updated',
      entity: 'task',
      entityId: 'task-123'
    }))
  })

  it('should not receive own broadcasts', async () => {
    const { CrossTabSync } = await import('@/lib/cross-tab-sync')

    const callback = vi.fn()
    CrossTabSync.subscribe(callback)

    // Broadcast from same tab
    CrossTabSync.broadcast('cache_updated', {
      entity: 'task',
      entityId: 'task-123'
    })

    // Should not receive own message
    expect(callback).not.toHaveBeenCalled()
  })

  it('should filter events by type in subscribeToEvents', async () => {
    const { CrossTabSync } = await import('@/lib/cross-tab-sync')

    const callback = vi.fn()
    CrossTabSync.subscribeToEvents(['cache_updated'], callback)

    const otherChannel = new MockBroadcastChannel('astrid-sync-channel')

    // Send cache_updated - should receive
    otherChannel.postMessage({
      type: 'cache_updated',
      entity: 'task',
      timestamp: Date.now(),
      tabId: 'other-tab'
    })

    // Send entity_deleted - should not receive
    otherChannel.postMessage({
      type: 'entity_deleted',
      entity: 'task',
      timestamp: Date.now(),
      tabId: 'other-tab'
    })

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      type: 'cache_updated'
    }))
  })

  it('should unsubscribe correctly', async () => {
    const { CrossTabSync } = await import('@/lib/cross-tab-sync')

    const callback = vi.fn()
    const unsubscribe = CrossTabSync.subscribe(callback)

    unsubscribe()

    const otherChannel = new MockBroadcastChannel('astrid-sync-channel')
    otherChannel.postMessage({
      type: 'cache_updated',
      timestamp: Date.now(),
      tabId: 'other-tab'
    })

    expect(callback).not.toHaveBeenCalled()
  })

  it('should broadcast mutation queued event', async () => {
    const { CrossTabSync } = await import('@/lib/cross-tab-sync')

    const callback = vi.fn()

    // Create receiver channel
    const receiverChannel = new MockBroadcastChannel('astrid-sync-channel')
    receiverChannel.onmessage = (event) => callback(event.data)

    CrossTabSync.broadcastMutationQueued('task', 'task-123', 'create', { title: 'Test' })

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      type: 'mutation_queued',
      entity: 'task',
      entityId: 'task-123',
      data: expect.objectContaining({
        mutationType: 'create',
        title: 'Test'
      })
    }))
  })

  it('should broadcast mutation synced event with ID mapping', async () => {
    const { CrossTabSync } = await import('@/lib/cross-tab-sync')

    const callback = vi.fn()

    const receiverChannel = new MockBroadcastChannel('astrid-sync-channel')
    receiverChannel.onmessage = (event) => callback(event.data)

    CrossTabSync.broadcastMutationSynced('task', 'real-123', 'temp-123', 'real-123')

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      type: 'mutation_synced',
      entity: 'task',
      entityId: 'real-123',
      data: {
        tempId: 'temp-123',
        realId: 'real-123'
      }
    }))
  })

  it('should broadcast cache updated event', async () => {
    const { CrossTabSync } = await import('@/lib/cross-tab-sync')

    const callback = vi.fn()

    const receiverChannel = new MockBroadcastChannel('astrid-sync-channel')
    receiverChannel.onmessage = (event) => callback(event.data)

    CrossTabSync.broadcastCacheUpdated('task', 'task-123', { title: 'Updated' })

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      type: 'cache_updated',
      entity: 'task',
      entityId: 'task-123'
    }))
  })

  it('should broadcast entity deleted event', async () => {
    const { CrossTabSync } = await import('@/lib/cross-tab-sync')

    const callback = vi.fn()

    const receiverChannel = new MockBroadcastChannel('astrid-sync-channel')
    receiverChannel.onmessage = (event) => callback(event.data)

    CrossTabSync.broadcastEntityDeleted('task', 'task-123')

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      type: 'entity_deleted',
      entity: 'task',
      entityId: 'task-123'
    }))
  })

  it('should broadcast sync status events', async () => {
    const { CrossTabSync } = await import('@/lib/cross-tab-sync')

    const callback = vi.fn()

    const receiverChannel = new MockBroadcastChannel('astrid-sync-channel')
    receiverChannel.onmessage = (event) => callback(event.data)

    CrossTabSync.broadcastSyncStarted()
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      type: 'sync_started'
    }))

    CrossTabSync.broadcastSyncCompleted(5, 1)
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      type: 'sync_completed',
      data: { success: 5, failed: 1 }
    }))
  })
})
