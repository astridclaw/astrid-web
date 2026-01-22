import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock IndexedDB via Dexie
vi.mock('@/lib/offline-db', () => ({
  offlineDB: {
    tasks: { get: vi.fn(), put: vi.fn(), delete: vi.fn(), toArray: vi.fn(), where: vi.fn() },
    lists: { get: vi.fn(), put: vi.fn(), delete: vi.fn(), toArray: vi.fn() },
    comments: { get: vi.fn(), put: vi.fn(), delete: vi.fn(), where: vi.fn() },
    users: { get: vi.fn(), put: vi.fn() }
  },
  OfflineTaskOperations: {
    getTask: vi.fn(),
    getTasks: vi.fn(),
    getTasksByList: vi.fn(),
    saveTask: vi.fn(),
    saveTasks: vi.fn(),
    deleteTask: vi.fn()
  },
  OfflineListOperations: {
    getList: vi.fn(),
    getLists: vi.fn(),
    saveList: vi.fn(),
    saveLists: vi.fn(),
    deleteList: vi.fn()
  },
  OfflineCommentOperations: {
    getComment: vi.fn(),
    getCommentsByTask: vi.fn(),
    saveComment: vi.fn(),
    deleteComment: vi.fn()
  },
  OfflineUserOperations: {
    getUser: vi.fn(),
    saveUser: vi.fn()
  }
}))

// Mock cross-tab-sync
vi.mock('@/lib/cross-tab-sync', () => ({
  CrossTabSync: {
    subscribe: vi.fn(() => vi.fn()),
    broadcastCacheUpdated: vi.fn(),
    broadcastEntityDeleted: vi.fn()
  }
}))

describe('CacheManager', () => {
  let CacheManager: any
  let OfflineTaskOperations: any
  let OfflineListOperations: any
  let OfflineCommentOperations: any

  beforeEach(async () => {
    vi.resetModules()

    const cacheModule = await import('@/lib/cache-manager')
    CacheManager = cacheModule.CacheManager

    const offlineModule = await import('@/lib/offline-db')
    OfflineTaskOperations = offlineModule.OfflineTaskOperations
    OfflineListOperations = offlineModule.OfflineListOperations
    OfflineCommentOperations = offlineModule.OfflineCommentOperations
  })

  afterEach(() => {
    vi.clearAllMocks()
    CacheManager.clearAll()
  })

  describe('Task Operations', () => {
    const mockTask = {
      id: 'task-1',
      title: 'Test Task',
      completed: false,
      lists: [{ id: 'list-1', name: 'Test List' }]
    }

    it('should get task from memory cache', async () => {
      // First set the task
      await CacheManager.setTask(mockTask, false)

      // Should get from memory
      const result = await CacheManager.getTask('task-1')

      expect(result).not.toBeNull()
      expect(result?.data.id).toBe('task-1')
      expect(result?.source).toBe('memory')
    })

    it('should get task from IndexedDB when not in memory', async () => {
      vi.mocked(OfflineTaskOperations.getTask).mockResolvedValue(mockTask)

      const result = await CacheManager.getTask('task-1')

      expect(result).not.toBeNull()
      expect(result?.data.id).toBe('task-1')
      expect(result?.source).toBe('indexeddb')
      expect(OfflineTaskOperations.getTask).toHaveBeenCalledWith('task-1')
    })

    it('should return null for non-existent task', async () => {
      vi.mocked(OfflineTaskOperations.getTask).mockResolvedValue(undefined)

      const result = await CacheManager.getTask('nonexistent')

      expect(result).toBeNull()
    })

    it('should set task in memory and IndexedDB', async () => {
      await CacheManager.setTask(mockTask, true)

      // Should be in memory
      const memResult = await CacheManager.getTask('task-1')
      expect(memResult?.source).toBe('memory')

      // Should have called IndexedDB save
      expect(OfflineTaskOperations.saveTask).toHaveBeenCalledWith(mockTask)
    })

    it('should remove task from cache', async () => {
      await CacheManager.setTask(mockTask, false)
      await CacheManager.removeTask('task-1', true)

      // Memory cache should be empty
      vi.mocked(OfflineTaskOperations.getTask).mockResolvedValue(undefined)
      const result = await CacheManager.getTask('task-1')
      expect(result).toBeNull()

      // Should have called IndexedDB delete
      expect(OfflineTaskOperations.deleteTask).toHaveBeenCalledWith('task-1')
    })

    it('should get all tasks', async () => {
      const mockTasks = [mockTask, { ...mockTask, id: 'task-2', title: 'Task 2' }]
      vi.mocked(OfflineTaskOperations.getTasks).mockResolvedValue(mockTasks)

      const result = await CacheManager.getAllTasks()

      expect(result.data).toHaveLength(2)
      expect(result.source).toBe('indexeddb')
    })

    it('should get tasks by list', async () => {
      const mockTasks = [mockTask]
      vi.mocked(OfflineTaskOperations.getTasksByList).mockResolvedValue(mockTasks)

      const result = await CacheManager.getTasksByList('list-1')

      expect(result.data).toHaveLength(1)
      expect(OfflineTaskOperations.getTasksByList).toHaveBeenCalledWith('list-1')
    })
  })

  describe('List Operations', () => {
    const mockList = {
      id: 'list-1',
      name: 'Test List',
      ownerId: 'user-1'
    }

    it('should get list from memory cache', async () => {
      await CacheManager.setList(mockList, false)

      const result = await CacheManager.getList('list-1')

      expect(result).not.toBeNull()
      expect(result?.data.id).toBe('list-1')
      expect(result?.source).toBe('memory')
    })

    it('should get list from IndexedDB when not in memory', async () => {
      vi.mocked(OfflineListOperations.getList).mockResolvedValue(mockList)

      const result = await CacheManager.getList('list-1')

      expect(result).not.toBeNull()
      expect(result?.source).toBe('indexeddb')
    })

    it('should set list in cache', async () => {
      await CacheManager.setList(mockList, true)

      expect(OfflineListOperations.saveList).toHaveBeenCalledWith(mockList)
    })

    it('should remove list from cache', async () => {
      await CacheManager.setList(mockList, false)
      await CacheManager.removeList('list-1', true)

      expect(OfflineListOperations.deleteList).toHaveBeenCalledWith('list-1')
    })

    it('should get all lists', async () => {
      const mockLists = [mockList]
      vi.mocked(OfflineListOperations.getLists).mockResolvedValue(mockLists)

      const result = await CacheManager.getAllLists()

      expect(result.data).toHaveLength(1)
    })
  })

  describe('Comment Operations', () => {
    const mockComment = {
      id: 'comment-1',
      taskId: 'task-1',
      content: 'Test comment',
      authorId: 'user-1'
    }

    it('should get comments by task', async () => {
      vi.mocked(OfflineCommentOperations.getCommentsByTask).mockResolvedValue([mockComment])

      const result = await CacheManager.getCommentsByTask('task-1')

      expect(result.data).toHaveLength(1)
      expect(result.data[0].id).toBe('comment-1')
    })

    it('should set comment in cache', async () => {
      await CacheManager.setComment(mockComment, true)

      expect(OfflineCommentOperations.saveComment).toHaveBeenCalledWith(mockComment)
    })

    it('should remove comment from cache', async () => {
      await CacheManager.removeComment('comment-1', 'task-1', true)

      expect(OfflineCommentOperations.deleteComment).toHaveBeenCalledWith('comment-1')
    })
  })

  describe('Cache Invalidation', () => {
    it('should invalidate specific entity', async () => {
      const mockTask = { id: 'task-1', title: 'Test' }
      await CacheManager.setTask(mockTask as any, false)

      CacheManager.invalidateEntity('task', 'task-1')

      // After invalidation, should fetch from IndexedDB
      vi.mocked(OfflineTaskOperations.getTask).mockResolvedValue(mockTask)
      const result = await CacheManager.getTask('task-1')
      expect(result?.source).toBe('indexeddb')
    })

    it('should clear all caches', () => {
      CacheManager.clearAll()

      const stats = CacheManager.getStats()
      expect(stats.tasks.totalSize).toBe(0)
      expect(stats.lists.totalSize).toBe(0)
    })
  })

  describe('Cache Stats', () => {
    it('should return cache statistics', async () => {
      const mockTask = { id: 'task-1', title: 'Test', lists: [] }
      await CacheManager.setTask(mockTask as any, false)

      const stats = CacheManager.getStats()

      expect(stats.tasks).toBeDefined()
      expect(stats.lists).toBeDefined()
      expect(stats.comments).toBeDefined()
      expect(stats.collections).toBeDefined()
    })
  })

  describe('Subscription', () => {
    it('should notify subscribers on updates', async () => {
      const callback = vi.fn()
      const unsubscribe = CacheManager.subscribe('task:task-1', callback)

      const mockTask = { id: 'task-1', title: 'Test', lists: [] }
      await CacheManager.setTask(mockTask as any, false)

      expect(callback).toHaveBeenCalled()

      unsubscribe()
    })

    it('should unsubscribe correctly', async () => {
      const callback = vi.fn()
      const unsubscribe = CacheManager.subscribe('task:task-1', callback)

      unsubscribe()

      const mockTask = { id: 'task-1', title: 'Test', lists: [] }
      await CacheManager.setTask(mockTask as any, false)

      // Callback should have been called once during setTask,
      // but not after unsubscribe if we set again
      callback.mockClear()
      await CacheManager.setTask({ ...mockTask, title: 'Updated' } as any, false)

      // After unsubscribe, should not be called
      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('Last Sync Time', () => {
    it('should track last sync time per entity', () => {
      CacheManager.setLastSyncTime('task', 1234567890)

      expect(CacheManager.getLastSyncTime('task')).toBe(1234567890)
      expect(CacheManager.getLastSyncTime('list')).toBeUndefined()
    })
  })
})
