import { useState, useCallback, useEffect, useRef } from "react"

/**
 * Status of the async data fetch
 */
export type AsyncStatus = "idle" | "loading" | "success" | "error"

/**
 * Result object returned by useAsyncData hook
 */
export interface AsyncDataResult<T> {
  /** The fetched data, null if not yet loaded or on error */
  data: T | null
  /** Whether data is currently being fetched */
  isLoading: boolean
  /** Error if fetch failed, null otherwise */
  error: Error | null
  /** Current status of the fetch operation */
  status: AsyncStatus
  /** Manually trigger a refetch */
  refetch: () => Promise<void>
  /** Reset state to initial values */
  reset: () => void
  /** Whether fetch has completed at least once (success or error) */
  isSettled: boolean
  /** Whether data was successfully fetched */
  isSuccess: boolean
  /** Whether fetch resulted in an error */
  isError: boolean
}

/**
 * Options for useAsyncData hook
 */
export interface AsyncDataOptions<T> {
  /** Skip fetching (useful for conditional fetches) */
  skip?: boolean
  /** Initial data value */
  initialData?: T | null
  /** Callback when data changes */
  onSuccess?: (data: T) => void
  /** Callback when error occurs */
  onError?: (error: Error) => void
  /** Dependencies that trigger refetch when changed */
  deps?: unknown[]
  /** Whether to fetch immediately on mount (default: true) */
  immediate?: boolean
}

/**
 * A reusable hook for handling async data fetching with loading and error states.
 *
 * Eliminates the common pattern of:
 * - useState for data, loading, error
 * - try/catch/finally boilerplate
 * - Manual loading state management
 *
 * @param fetcher - Async function that returns the data
 * @param options - Configuration options
 *
 * @example
 * // Basic usage
 * const { data, isLoading, error } = useAsyncData(
 *   () => fetch('/api/tasks').then(r => r.json())
 * )
 *
 * @example
 * // With skip condition
 * const { data, isLoading } = useAsyncData(
 *   () => fetchTask(taskId),
 *   { skip: !taskId }
 * )
 *
 * @example
 * // With refetch on dependency change
 * const { data, refetch } = useAsyncData(
 *   () => fetchTasks(listId),
 *   { deps: [listId] }
 * )
 *
 * @example
 * // With callbacks
 * const { data } = useAsyncData(
 *   () => saveSettings(settings),
 *   {
 *     onSuccess: (data) => toast.success('Saved!'),
 *     onError: (error) => toast.error(error.message)
 *   }
 * )
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  options: AsyncDataOptions<T> = {}
): AsyncDataResult<T> {
  const {
    skip = false,
    initialData = null,
    onSuccess,
    onError,
    deps = [],
    immediate = true
  } = options

  const [data, setData] = useState<T | null>(initialData)
  const [isLoading, setIsLoading] = useState(!skip && immediate)
  const [error, setError] = useState<Error | null>(null)
  const [status, setStatus] = useState<AsyncStatus>(
    skip ? "idle" : immediate ? "loading" : "idle"
  )

  // Track if component is mounted to prevent state updates after unmount
  const mountedRef = useRef(true)
  // Track the fetcher to handle stale closures
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const execute = useCallback(async () => {
    if (skip) {
      setStatus("idle")
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)
    setStatus("loading")

    try {
      const result = await fetcherRef.current()

      if (mountedRef.current) {
        setData(result)
        setStatus("success")
        onSuccess?.(result)
      }
    } catch (err) {
      if (mountedRef.current) {
        const error = err instanceof Error ? err : new Error(String(err))
        setError(error)
        setStatus("error")
        onError?.(error)
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [skip, onSuccess, onError])

  const reset = useCallback(() => {
    setData(initialData)
    setError(null)
    setStatus("idle")
    setIsLoading(false)
  }, [initialData])

  // Initial fetch and refetch on deps change
  useEffect(() => {
    if (immediate && !skip) {
      execute()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, immediate, ...deps])

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  return {
    data,
    isLoading,
    error,
    status,
    refetch: execute,
    reset,
    isSettled: status === "success" || status === "error",
    isSuccess: status === "success",
    isError: status === "error"
  }
}

/**
 * Hook for managing multiple async operations with individual loading states.
 *
 * Useful when you have multiple items that can be independently loading/erroring.
 *
 * @example
 * const { execute, isLoading, error, reset } = useAsyncAction<string>()
 *
 * const handleDelete = async (taskId: string) => {
 *   await execute(taskId, () => deleteTask(taskId))
 * }
 *
 * // In render:
 * {tasks.map(task => (
 *   <button
 *     disabled={isLoading(task.id)}
 *     onClick={() => handleDelete(task.id)}
 *   >
 *     {isLoading(task.id) ? 'Deleting...' : 'Delete'}
 *   </button>
 * ))}
 */
export function useAsyncAction<K extends string | number = string>() {
  const [loadingMap, setLoadingMap] = useState<Record<K, boolean>>({} as Record<K, boolean>)
  const [errorMap, setErrorMap] = useState<Record<K, Error | null>>({} as Record<K, Error | null>)

  const execute = useCallback(async <T>(
    key: K,
    action: () => Promise<T>,
    options?: { onSuccess?: (data: T) => void; onError?: (error: Error) => void }
  ): Promise<T | null> => {
    setLoadingMap(prev => ({ ...prev, [key]: true }))
    setErrorMap(prev => ({ ...prev, [key]: null }))

    try {
      const result = await action()
      options?.onSuccess?.(result)
      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      setErrorMap(prev => ({ ...prev, [key]: error }))
      options?.onError?.(error)
      return null
    } finally {
      setLoadingMap(prev => ({ ...prev, [key]: false }))
    }
  }, [])

  const isLoading = useCallback((key: K) => loadingMap[key] ?? false, [loadingMap])
  const getError = useCallback((key: K) => errorMap[key] ?? null, [errorMap])

  const reset = useCallback((key?: K) => {
    if (key !== undefined) {
      setLoadingMap(prev => ({ ...prev, [key]: false }))
      setErrorMap(prev => ({ ...prev, [key]: null }))
    } else {
      setLoadingMap({} as Record<K, boolean>)
      setErrorMap({} as Record<K, Error | null>)
    }
  }, [])

  return {
    execute,
    isLoading,
    getError,
    reset,
    anyLoading: Object.values(loadingMap).some(Boolean)
  }
}
