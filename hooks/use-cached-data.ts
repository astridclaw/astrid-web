"use client"

/**
 * React hooks for cached data access
 * Uses three-tier cache: Memory -> IndexedDB -> Network
 *
 * Features:
 * - Automatic cache subscription for real-time updates
 * - SSE integration for server-pushed updates
 * - Cross-tab sync for multi-tab consistency
 * - Stale-while-revalidate pattern
 *
 * Refactored to use factory functions to reduce code duplication.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Task, TaskList, Comment } from '@/types/task'
import { CacheManager, type CacheStatus } from '@/lib/cache-manager'
import { CrossTabSync, type CrossTabEvent } from '@/lib/cross-tab-sync'

// ============================================================================
// Types
// ============================================================================

interface UseCachedDataOptions {
  /** Skip initial fetch */
  skip?: boolean
  /** Callback when data changes */
  onDataChange?: (data: any) => void
  /** Enable SSE subscription for this entity */
  enableSSE?: boolean
}

interface UseCachedDataResult<T> {
  data: T | null
  isLoading: boolean
  error: Error | null
  status: CacheStatus
  source: 'memory' | 'indexeddb' | 'network' | null
  refetch: () => Promise<void>
  invalidate: () => void
}

type EntityType = 'task' | 'list' | 'comment'
type CacheSource = 'memory' | 'indexeddb' | 'network' | null

interface CacheResult<T> {
  data: T
  status: CacheStatus
  source: CacheSource
}

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Hook to keep callback ref stable (avoids stale closure issues)
 */
function useEventCallback<T extends (...args: any[]) => any>(callback: T | undefined): T {
  const callbackRef = useRef(callback)
  useEffect(() => {
    callbackRef.current = callback
  })
  return useCallback(((...args) => callbackRef.current?.(...args)) as T, [])
}

// ============================================================================
// Single Entity Hook Factory
// ============================================================================

interface SingleEntityConfig<T> {
  entityType: EntityType
  getCached: (id: string) => Promise<CacheResult<T> | null>
  getCacheKey: (id: string) => string
  invalidateEntity: (id: string) => void
  errorMessage: string
}

/**
 * Factory function for creating single-entity cached hooks
 * Used by: useCachedTask, useCachedList
 */
function createSingleEntityHook<T>(config: SingleEntityConfig<T>) {
  return function useCachedEntity(
    entityId: string | null | undefined,
    options: UseCachedDataOptions = {}
  ): UseCachedDataResult<T> {
    const { skip, onDataChange } = options
    const [data, setData] = useState<T | null>(null)
    const [isLoading, setIsLoading] = useState(!skip && !!entityId)
    const [error, setError] = useState<Error | null>(null)
    const [status, setStatus] = useState<CacheStatus>('loading')
    const [source, setSource] = useState<CacheSource>(null)

    const stableOnDataChange = useEventCallback(onDataChange)

    const fetchData = useCallback(async () => {
      if (!entityId || skip) return

      setIsLoading(true)
      setError(null)

      try {
        const cached = await config.getCached(entityId)

        if (cached) {
          setData(cached.data)
          setStatus(cached.status)
          setSource(cached.source)
          stableOnDataChange(cached.data)
        } else {
          setData(null)
          setStatus('error')
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error(config.errorMessage))
        setStatus('error')
      } finally {
        setIsLoading(false)
      }
    }, [entityId, skip, stableOnDataChange])

    // Initial fetch
    useEffect(() => {
      fetchData()
    }, [fetchData])

    // Subscribe to cache updates
    useEffect(() => {
      if (!entityId) return

      const unsubscribe = CacheManager.subscribe(config.getCacheKey(entityId), () => {
        fetchData()
      })

      return unsubscribe
    }, [entityId, fetchData])

    // Subscribe to cross-tab updates
    useEffect(() => {
      if (!entityId) return

      const unsubscribe = CrossTabSync.subscribeToEvents(
        ['cache_updated', 'entity_deleted'],
        (event: CrossTabEvent) => {
          if (event.entity === config.entityType && event.entityId === entityId) {
            if (event.type === 'entity_deleted') {
              setData(null)
            } else {
              fetchData()
            }
          }
        }
      )

      return unsubscribe
    }, [entityId, fetchData])

    const invalidate = useCallback(() => {
      if (entityId) {
        config.invalidateEntity(entityId)
      }
    }, [entityId])

    return {
      data,
      isLoading,
      error,
      status,
      source,
      refetch: fetchData,
      invalidate
    }
  }
}

// ============================================================================
// Collection Hook Factory
// ============================================================================

interface CollectionConfig<T, TItem> {
  entityType: EntityType
  getCached: () => Promise<CacheResult<T>>
  cacheKey: string
  crossTabEvents: CrossTabEvent['type'][]
  invalidateEntity: () => void
  errorMessage: string
  // For mutations
  setItem?: (item: TItem) => Promise<void>
  removeItem?: (id: string) => Promise<void>
  getItemId: (item: TItem) => string
}

interface CollectionResult<T, TItem> extends UseCachedDataResult<T> {
  addItem: (item: TItem) => Promise<void>
  updateItem: (item: TItem) => Promise<void>
  removeItem: (id: string) => Promise<void>
}

/**
 * Factory function for creating collection cached hooks
 * Used by: useCachedTasks, useCachedLists
 */
function createCollectionHook<TItem extends { id: string }>(
  config: CollectionConfig<TItem[], TItem>
) {
  return function useCachedCollection(
    options: UseCachedDataOptions = {}
  ): CollectionResult<TItem[], TItem> {
    const { skip, onDataChange } = options
    const [data, setData] = useState<TItem[]>([])
    const [isLoading, setIsLoading] = useState(!skip)
    const [error, setError] = useState<Error | null>(null)
    const [status, setStatus] = useState<CacheStatus>('loading')
    const [source, setSource] = useState<CacheSource>(null)

    const stableOnDataChange = useEventCallback(onDataChange)

    const fetchData = useCallback(async () => {
      if (skip) return

      setIsLoading(true)
      setError(null)

      try {
        const cached = await config.getCached()

        setData(cached.data)
        setStatus(cached.status)
        setSource(cached.source)
        stableOnDataChange(cached.data)
      } catch (err) {
        setError(err instanceof Error ? err : new Error(config.errorMessage))
        setStatus('error')
      } finally {
        setIsLoading(false)
      }
    }, [skip, stableOnDataChange])

    // Initial fetch
    useEffect(() => {
      fetchData()
    }, [fetchData])

    // Subscribe to cache updates
    useEffect(() => {
      const unsubscribe = CacheManager.subscribe(config.cacheKey, () => {
        fetchData()
      })

      return unsubscribe
    }, [fetchData])

    // Subscribe to cross-tab updates
    useEffect(() => {
      const unsubscribe = CrossTabSync.subscribeToEvents(
        config.crossTabEvents,
        (event: CrossTabEvent) => {
          if (event.entity === config.entityType) {
            fetchData()
          }
        }
      )

      return unsubscribe
    }, [fetchData])

    const addItem = useCallback(async (item: TItem) => {
      if (config.setItem) {
        await config.setItem(item)
      }
      setData(prev => [item, ...prev])
    }, [])

    const updateItem = useCallback(async (item: TItem) => {
      if (config.setItem) {
        await config.setItem(item)
      }
      setData(prev => prev.map(i => config.getItemId(i) === config.getItemId(item) ? item : i))
    }, [])

    const removeItemFn = useCallback(async (id: string) => {
      if (config.removeItem) {
        await config.removeItem(id)
      }
      setData(prev => prev.filter(i => config.getItemId(i) !== id))
    }, [])

    const invalidate = useCallback(() => {
      config.invalidateEntity()
    }, [])

    return {
      data,
      isLoading,
      error,
      status,
      source,
      refetch: fetchData,
      invalidate,
      addItem,
      updateItem,
      removeItem: removeItemFn
    }
  }
}

// ============================================================================
// Exported Hooks - Single Entity
// ============================================================================

/**
 * Hook for cached task data
 */
export const useCachedTask = createSingleEntityHook<Task>({
  entityType: 'task',
  getCached: (id) => CacheManager.getTask(id),
  getCacheKey: (id) => `task:${id}`,
  invalidateEntity: (id) => CacheManager.invalidateEntity('task', id),
  errorMessage: 'Failed to fetch task'
})

/**
 * Hook for cached list data
 */
export const useCachedList = createSingleEntityHook<TaskList>({
  entityType: 'list',
  getCached: (id) => CacheManager.getList(id),
  getCacheKey: (id) => `list:${id}`,
  invalidateEntity: (id) => CacheManager.invalidateEntity('list', id),
  errorMessage: 'Failed to fetch list'
})

// ============================================================================
// Exported Hooks - Collections
// ============================================================================

/**
 * Hook for cached tasks list
 */
const baseCachedTasks = createCollectionHook<Task>({
  entityType: 'task',
  getCached: () => CacheManager.getAllTasks(),
  cacheKey: 'tasks',
  crossTabEvents: ['cache_updated', 'entity_deleted', 'mutation_synced'],
  invalidateEntity: () => CacheManager.invalidateEntity('task'),
  errorMessage: 'Failed to fetch tasks',
  setItem: (task) => CacheManager.setTask(task),
  removeItem: (id) => CacheManager.removeTask(id),
  getItemId: (task) => task.id
})

export function useCachedTasks(
  options: UseCachedDataOptions & { listId?: string } = {}
): UseCachedDataResult<Task[]> & {
  addTask: (task: Task) => Promise<void>
  updateTask: (task: Task) => Promise<void>
  removeTask: (taskId: string) => Promise<void>
} {
  const { listId, ...baseOptions } = options

  // For listId filtering, we need custom fetch logic
  const [data, setData] = useState<Task[]>([])
  const [isLoading, setIsLoading] = useState(!baseOptions.skip)
  const [error, setError] = useState<Error | null>(null)
  const [status, setStatus] = useState<CacheStatus>('loading')
  const [source, setSource] = useState<CacheSource>(null)

  const stableOnDataChange = useEventCallback(baseOptions.onDataChange)

  const fetchData = useCallback(async () => {
    if (baseOptions.skip) return

    setIsLoading(true)
    setError(null)

    try {
      const cached = listId
        ? await CacheManager.getTasksByList(listId)
        : await CacheManager.getAllTasks()

      setData(cached.data)
      setStatus(cached.status)
      setSource(cached.source)
      stableOnDataChange(cached.data)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch tasks'))
      setStatus('error')
    } finally {
      setIsLoading(false)
    }
  }, [baseOptions.skip, listId, stableOnDataChange])

  // Initial fetch
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Subscribe to cache updates
  useEffect(() => {
    const unsubscribe = CacheManager.subscribe('tasks', () => {
      fetchData()
    })
    return unsubscribe
  }, [fetchData])

  // Subscribe to cross-tab updates
  useEffect(() => {
    const unsubscribe = CrossTabSync.subscribeToEvents(
      ['cache_updated', 'entity_deleted', 'mutation_synced'],
      (event: CrossTabEvent) => {
        if (event.entity === 'task') {
          fetchData()
        }
      }
    )
    return unsubscribe
  }, [fetchData])

  const addTask = useCallback(async (task: Task) => {
    await CacheManager.setTask(task)
    setData(prev => [task, ...prev])
  }, [])

  const updateTask = useCallback(async (task: Task) => {
    await CacheManager.setTask(task)
    setData(prev => prev.map(t => t.id === task.id ? task : t))
  }, [])

  const removeTask = useCallback(async (taskId: string) => {
    await CacheManager.removeTask(taskId)
    setData(prev => prev.filter(t => t.id !== taskId))
  }, [])

  const invalidate = useCallback(() => {
    CacheManager.invalidateEntity('task')
  }, [])

  return {
    data,
    isLoading,
    error,
    status,
    source,
    refetch: fetchData,
    invalidate,
    addTask,
    updateTask,
    removeTask
  }
}

/**
 * Hook for cached lists
 */
const baseCachedLists = createCollectionHook<TaskList>({
  entityType: 'list',
  getCached: () => CacheManager.getAllLists(),
  cacheKey: 'lists',
  crossTabEvents: ['cache_updated', 'entity_deleted'],
  invalidateEntity: () => CacheManager.invalidateEntity('list'),
  errorMessage: 'Failed to fetch lists',
  setItem: (list) => CacheManager.setList(list),
  removeItem: (id) => CacheManager.removeList(id),
  getItemId: (list) => list.id
})

export function useCachedLists(
  options: UseCachedDataOptions = {}
): UseCachedDataResult<TaskList[]> & {
  addList: (list: TaskList) => Promise<void>
  updateList: (list: TaskList) => Promise<void>
  removeList: (listId: string) => Promise<void>
} {
  const result = baseCachedLists(options)
  return {
    ...result,
    addList: result.addItem,
    updateList: result.updateItem,
    removeList: result.removeItem
  }
}

/**
 * Hook for cached comments by task
 */
export function useCachedComments(
  taskId: string | null | undefined,
  options: UseCachedDataOptions = {}
): UseCachedDataResult<Comment[]> & {
  addComment: (comment: Comment) => Promise<void>
  removeComment: (commentId: string) => Promise<void>
} {
  const { skip, onDataChange } = options
  const [data, setData] = useState<Comment[]>([])
  const [isLoading, setIsLoading] = useState(!skip && !!taskId)
  const [error, setError] = useState<Error | null>(null)
  const [status, setStatus] = useState<CacheStatus>('loading')
  const [source, setSource] = useState<CacheSource>(null)

  const stableOnDataChange = useEventCallback(onDataChange)

  const fetchData = useCallback(async () => {
    if (!taskId || skip) return

    setIsLoading(true)
    setError(null)

    try {
      const cached = await CacheManager.getCommentsByTask(taskId)

      setData(cached.data)
      setStatus(cached.status)
      setSource(cached.source)
      stableOnDataChange(cached.data)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch comments'))
      setStatus('error')
    } finally {
      setIsLoading(false)
    }
  }, [taskId, skip, stableOnDataChange])

  // Initial fetch
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Subscribe to cache updates
  useEffect(() => {
    if (!taskId) return

    const unsubscribe = CacheManager.subscribe(`comments:${taskId}`, () => {
      fetchData()
    })

    return unsubscribe
  }, [taskId, fetchData])

  // Subscribe to cross-tab updates
  useEffect(() => {
    if (!taskId) return

    const unsubscribe = CrossTabSync.subscribeToEvents(
      ['cache_updated', 'entity_deleted'],
      (event: CrossTabEvent) => {
        if (event.entity === 'comment') {
          fetchData()
        }
      }
    )

    return unsubscribe
  }, [taskId, fetchData])

  const addComment = useCallback(async (comment: Comment) => {
    await CacheManager.setComment(comment)
    setData(prev => [...prev, comment])
  }, [])

  const removeComment = useCallback(async (commentId: string) => {
    if (!taskId) return
    await CacheManager.removeComment(commentId, taskId)
    setData(prev => prev.filter(c => c.id !== commentId))
  }, [taskId])

  const invalidate = useCallback(() => {
    CacheManager.invalidateEntity('comment')
  }, [])

  return {
    data,
    isLoading,
    error,
    status,
    source,
    refetch: fetchData,
    invalidate,
    addComment,
    removeComment
  }
}

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Hook for online/offline status
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}

/**
 * Hook for cache debugging info
 */
export function useCacheStats() {
  const [stats, setStats] = useState(() => CacheManager.getStats())

  useEffect(() => {
    // Update stats every 5 seconds
    const interval = setInterval(() => {
      setStats(CacheManager.getStats())
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  return stats
}
