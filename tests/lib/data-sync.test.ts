import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock navigator.onLine
let mockOnline = true
vi.stubGlobal('navigator', {
  get onLine() { return mockOnline }
})

// Mock document.hidden
vi.stubGlobal('document', {
  hidden: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
})

// Mock window
vi.stubGlobal('window', {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
})

// Mock CacheManager
vi.mock('@/lib/cache-manager', () => ({
  CacheManager: {
    setTasks: vi.fn(),
    setTask: vi.fn(),
    setLists: vi.fn(),
    setList: vi.fn(),
    removeTask: vi.fn(),
    removeList: vi.fn(),
    getCommentsByTask: vi.fn().mockResolvedValue({ data: [] }),
    setComment: vi.fn(),
    clearAll: vi.fn()
  }
}))

// Mock OfflineSyncManager
vi.mock('@/lib/offline-sync', () => ({
  OfflineSyncManager: {
    syncPendingMutations: vi.fn().mockResolvedValue({ success: 0, failed: 0, errors: [] }),
    getMutationStats: vi.fn().mockResolvedValue({ pending: 0, failed: 0, completed: 0 })
  }
}))

// Mock OfflineSyncCursorOperations
vi.mock('@/lib/offline-db', () => ({
  OfflineSyncCursorOperations: {
    getAllCursors: vi.fn().mockResolvedValue([]),
    getCursor: vi.fn().mockResolvedValue(null),
    setCursor: vi.fn(),
    clearAllCursors: vi.fn()
  }
}))

// Mock CrossTabSync
vi.mock('@/lib/cross-tab-sync', () => ({
  CrossTabSync: {
    broadcastCacheUpdated: vi.fn()
  }
}))

describe('DataSyncManager', () => {
  let DataSyncManager: any
  let CacheManager: any
  let OfflineSyncManager: any
  let OfflineSyncCursorOperations: any

  beforeEach(async () => {
    vi.resetModules()
    mockOnline = true
    mockFetch.mockReset()

    const dataSyncModule = await import('@/lib/data-sync')
    DataSyncManager = dataSyncModule.DataSyncManager

    const cacheModule = await import('@/lib/cache-manager')
    CacheManager = cacheModule.CacheManager

    const offlineSyncModule = await import('@/lib/offline-sync')
    OfflineSyncManager = offlineSyncModule.OfflineSyncManager

    const offlineDbModule = await import('@/lib/offline-db')
    OfflineSyncCursorOperations = offlineDbModule.OfflineSyncCursorOperations
  })

  afterEach(() => {
    vi.clearAllMocks()
    DataSyncManager.stopPeriodicSync()
  })

  describe('performFullSync', () => {
    it('should fetch all tasks and lists', async () => {
      const mockTasks = [{ id: 'task-1', title: 'Task 1' }]
      const mockLists = [{ id: 'list-1', name: 'List 1' }]

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ lists: mockLists })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ tasks: mockTasks })
        })

      const result = await DataSyncManager.performFullSync()

      expect(result.status).toBe('success')
      expect(result.tasksUpdated).toBe(1)
      expect(result.listsUpdated).toBe(1)
      expect(CacheManager.setLists).toHaveBeenCalledWith(mockLists, true)
      expect(CacheManager.setTasks).toHaveBeenCalledWith(mockTasks, true)
    })

    it('should return error when offline', async () => {
      mockOnline = false

      const result = await DataSyncManager.performFullSync()

      expect(result.status).toBe('error')
      expect(result.error).toBe('Offline')
    })

    it('should sync pending mutations first', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ lists: [] }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ tasks: [] }) })

      await DataSyncManager.performFullSync()

      expect(OfflineSyncManager.syncPendingMutations).toHaveBeenCalled()
    })

    it('should skip mutation sync when option set', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ lists: [] }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ tasks: [] }) })

      await DataSyncManager.performFullSync({ skipMutationSync: true })

      expect(OfflineSyncManager.syncPendingMutations).not.toHaveBeenCalled()
    })

    it('should update sync cursors after success', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ lists: [] }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ tasks: [] }) })

      await DataSyncManager.performFullSync()

      expect(OfflineSyncCursorOperations.setCursor).toHaveBeenCalledWith('list', expect.any(String))
      expect(OfflineSyncCursorOperations.setCursor).toHaveBeenCalledWith('task', expect.any(String))
    })
  })

  describe('performIncrementalSync', () => {
    it('should use updatedSince parameter when cursor exists', async () => {
      const cursorDate = '2024-01-01T00:00:00.000Z'
      vi.mocked(OfflineSyncCursorOperations.getCursor)
        .mockResolvedValueOnce({ entity: 'task', cursor: cursorDate, lastSync: Date.now() })
        .mockResolvedValueOnce({ entity: 'list', cursor: cursorDate, lastSync: Date.now() })

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ lists: [] }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ tasks: [] }) })

      await DataSyncManager.performIncrementalSync()

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`updatedSince=${encodeURIComponent(cursorDate)}`),
        expect.any(Object)
      )
    })

    it('should handle deleted items', async () => {
      const mockTasks = [{ id: 'task-1', title: 'Task 1' }]
      const deletedIds = ['task-2', 'task-3']

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ lists: [], deletedIds: [] }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ tasks: mockTasks, deletedIds }) })

      const result = await DataSyncManager.performIncrementalSync()

      expect(result.deletedIds).toContain('task-2')
      expect(result.deletedIds).toContain('task-3')
      expect(CacheManager.removeTask).toHaveBeenCalledWith('task-2', true)
      expect(CacheManager.removeTask).toHaveBeenCalledWith('task-3', true)
    })

    it('should return idle when sync already in progress', async () => {
      // Start a sync that takes time
      mockFetch.mockImplementation(() => new Promise(resolve =>
        setTimeout(() => resolve({ ok: true, json: () => Promise.resolve({ lists: [], tasks: [] }) }), 100)
      ))

      const sync1 = DataSyncManager.performIncrementalSync()
      const sync2 = DataSyncManager.performIncrementalSync()

      const [result1, result2] = await Promise.all([sync1, sync2])

      // One should succeed, one should return idle
      expect([result1.status, result2.status]).toContain('idle')
    })
  })

  describe('syncTaskComments', () => {
    it('should fetch and cache comments', async () => {
      const mockComments = [
        { id: 'comment-1', taskId: 'task-1', content: 'Test' }
      ]

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ comments: mockComments }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )

      const result = await DataSyncManager.syncTaskComments('task-1')

      expect(result).toHaveLength(1)
      expect(CacheManager.setComment).toHaveBeenCalledWith(mockComments[0], true)
    })

    it('should return cached comments when offline', async () => {
      mockOnline = false
      const cachedComments = [{ id: 'cached-1', content: 'Cached' }]
      vi.mocked(CacheManager.getCommentsByTask).mockResolvedValue({ data: cachedComments })

      const result = await DataSyncManager.syncTaskComments('task-1')

      expect(result).toEqual(cachedComments)
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('resetSyncCursors', () => {
    it('should clear cursors and cache', async () => {
      await DataSyncManager.resetSyncCursors()

      expect(OfflineSyncCursorOperations.clearAllCursors).toHaveBeenCalled()
      expect(CacheManager.clearAll).toHaveBeenCalled()
    })
  })

  describe('sync status', () => {
    it('should report syncing status', async () => {
      expect(DataSyncManager.isSyncing()).toBe(false)
    })

    it('should return last sync result', () => {
      const lastResult = DataSyncManager.getLastSyncResult()
      // Initially null
      expect(lastResult).toBeNull()
    })

    it('should notify listeners on sync complete', async () => {
      const callback = vi.fn()
      const unsubscribe = DataSyncManager.onSyncComplete(callback)

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ lists: [] }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ tasks: [] }) })

      await DataSyncManager.performFullSync()

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        status: 'success'
      }))

      unsubscribe()
    })
  })

  describe('getSyncStatus', () => {
    it('should return comprehensive sync status', async () => {
      vi.mocked(OfflineSyncCursorOperations.getAllCursors).mockResolvedValue([
        { entity: 'task', cursor: '2024-01-01', lastSync: Date.now() }
      ])

      const status = await DataSyncManager.getSyncStatus()

      expect(status.isSyncing).toBe(false)
      expect(status.cursors).toHaveLength(1)
      expect(status.pendingMutations).toBeDefined()
    })
  })
})
