"use client"

/**
 * Background Sync Hook
 * Registers service worker background sync and handles sync events
 */

import { useEffect, useCallback, useState, useRef } from 'react'
import { OfflineSyncManager } from '@/lib/offline-sync'
import { DataSyncManager, type SyncResult } from '@/lib/data-sync'

interface BackgroundSyncStatus {
  isSupported: boolean
  isRegistered: boolean
  lastSyncResult: SyncResult | null
  pendingMutations: number
}

/**
 * Register background sync with service worker
 */
async function registerBackgroundSync(tag: string = 'sync-mutations'): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker not supported')
    return false
  }

  if (!('sync' in ServiceWorkerRegistration.prototype)) {
    console.warn('Background Sync not supported')
    return false
  }

  try {
    const registration = await navigator.serviceWorker.ready
    await (registration as any).sync.register(tag)
    console.log(`🔄 Registered background sync: ${tag}`)
    return true
  } catch (error) {
    console.error('Failed to register background sync:', error)
    return false
  }
}

/**
 * Hook for managing background sync
 */
export function useBackgroundSync() {
  const [status, setStatus] = useState<BackgroundSyncStatus>({
    isSupported: false,
    isRegistered: false,
    lastSyncResult: null,
    pendingMutations: 0
  })

  const messageHandlerRef = useRef<((event: MessageEvent) => void) | null>(null)

  // Check support and register
  useEffect(() => {
    const checkSupport = async () => {
      const isSupported =
        'serviceWorker' in navigator &&
        'sync' in ServiceWorkerRegistration.prototype

      setStatus(prev => ({ ...prev, isSupported }))

      // Get pending mutations count
      const stats = await OfflineSyncManager.getMutationStats()
      setStatus(prev => ({ ...prev, pendingMutations: stats.pending }))
    }

    checkSupport()
  }, [])

  // Listen for service worker messages
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const handleMessage = (event: MessageEvent) => {
      const { type, data } = event.data || {}

      if (type === 'SYNC_COMPLETE') {
        console.log('📬 Background sync completed:', data)
        setStatus(prev => ({
          ...prev,
          lastSyncResult: {
            status: 'success',
            tasksUpdated: 0,
            listsUpdated: 0,
            commentsUpdated: 0,
            deletedIds: [],
            duration: 0,
            ...data
          }
        }))

        // Refresh pending count
        OfflineSyncManager.getMutationStats().then(stats => {
          setStatus(prev => ({ ...prev, pendingMutations: stats.pending }))
        })
      } else if (type === 'DATA_SYNC_COMPLETE') {
        console.log('📬 Data sync completed:', data)
        // Invalidate caches to pick up new data
        import('@/lib/cache-manager').then(({ CacheManager }) => {
          CacheManager.invalidateEntity('task')
          CacheManager.invalidateEntity('list')
        })
      }
    }

    messageHandlerRef.current = handleMessage
    navigator.serviceWorker.addEventListener('message', handleMessage)

    return () => {
      if (messageHandlerRef.current) {
        navigator.serviceWorker.removeEventListener('message', messageHandlerRef.current)
      }
    }
  }, [])

  // Subscribe to sync results
  useEffect(() => {
    const unsubscribe = DataSyncManager.onSyncComplete((result) => {
      setStatus(prev => ({ ...prev, lastSyncResult: result }))
    })

    return unsubscribe
  }, [])

  /**
   * Trigger background sync for mutations
   */
  const triggerMutationSync = useCallback(async (): Promise<boolean> => {
    // First try foreground sync if online
    if (navigator.onLine) {
      await OfflineSyncManager.syncPendingMutations()
      const stats = await OfflineSyncManager.getMutationStats()
      setStatus(prev => ({ ...prev, pendingMutations: stats.pending }))
      return true
    }

    // Register background sync for when we're back online
    const registered = await registerBackgroundSync('sync-mutations')
    setStatus(prev => ({ ...prev, isRegistered: registered }))
    return registered
  }, [])

  /**
   * Trigger background sync for data (full sync)
   */
  const triggerDataSync = useCallback(async (): Promise<boolean> => {
    if (navigator.onLine) {
      // Foreground sync
      await DataSyncManager.performIncrementalSync()
      return true
    }

    // Register background sync
    return registerBackgroundSync('sync-data')
  }, [])

  /**
   * Force full sync
   */
  const forceFullSync = useCallback(async (): Promise<SyncResult> => {
    return DataSyncManager.performFullSync({ forceFullSync: true })
  }, [])

  /**
   * Get sync status
   */
  const getSyncStatus = useCallback(async () => {
    return DataSyncManager.getSyncStatus()
  }, [])

  return {
    ...status,
    triggerMutationSync,
    triggerDataSync,
    forceFullSync,
    getSyncStatus,
    isSyncing: DataSyncManager.isSyncing()
  }
}

/**
 * Hook for network status with automatic sync triggers
 */
export function useNetworkSync() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [isSyncing, setIsSyncing] = useState(false)
  const wasOfflineRef = useRef(false)

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true)

      // If we were offline, trigger sync
      if (wasOfflineRef.current) {
        console.log('📡 Back online - triggering sync')
        setIsSyncing(true)

        try {
          // Sync pending mutations first
          await OfflineSyncManager.syncPendingMutations()

          // Then do incremental data sync
          await DataSyncManager.performIncrementalSync()
        } catch (error) {
          console.error('Sync failed after coming online:', error)
        } finally {
          setIsSyncing(false)
        }
      }

      wasOfflineRef.current = false
    }

    const handleOffline = () => {
      setIsOnline(false)
      wasOfflineRef.current = true
      console.log('📴 Went offline')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Initialize wasOffline based on current state
    wasOfflineRef.current = !navigator.onLine

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return {
    isOnline,
    isSyncing
  }
}

export default useBackgroundSync
