"use client"

/**
 * Offline Provider Component
 * Wraps the app to provide offline-first capabilities:
 * - Cache sync with SSE
 * - Background sync registration
 * - Network status monitoring
 * - Initial data sync on mount
 */

import { useEffect, useState, createContext, useContext, type ReactNode } from 'react'
import { useCacheSync } from '@/hooks/use-cache-sync'
import { useNetworkSync, useBackgroundSync } from '@/hooks/use-background-sync'
import { DataSyncManager, type SyncResult } from '@/lib/data-sync'
import { CacheManager } from '@/lib/cache-manager'
import { OfflineSyncManager } from '@/lib/offline-sync'

interface OfflineContextValue {
  isOnline: boolean
  isSyncing: boolean
  isInitialized: boolean
  lastSyncResult: SyncResult | null
  pendingMutations: number
  forceSync: () => Promise<void>
  clearCache: () => Promise<void>
}

const OfflineContext = createContext<OfflineContextValue>({
  isOnline: true,
  isSyncing: false,
  isInitialized: false,
  lastSyncResult: null,
  pendingMutations: 0,
  forceSync: async () => {},
  clearCache: async () => {}
})

/**
 * Hook to access offline context
 */
export function useOffline() {
  return useContext(OfflineContext)
}

interface OfflineProviderProps {
  children: ReactNode
  /** Skip initial sync (useful for testing) */
  skipInitialSync?: boolean
  /** Disable background sync registration */
  disableBackgroundSync?: boolean
}

/**
 * Offline Provider Component
 * Add this to your root layout to enable offline-first capabilities
 *
 * @example
 * ```tsx
 * // In app/layout.tsx
 * import { OfflineProvider } from '@/components/offline-provider'
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <OfflineProvider>
 *           {children}
 *         </OfflineProvider>
 *       </body>
 *     </html>
 *   )
 * }
 * ```
 */
export function OfflineProvider({
  children,
  skipInitialSync = false,
  disableBackgroundSync = false
}: OfflineProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false)
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null)
  const [pendingMutations, setPendingMutations] = useState(0)

  // Initialize cache sync (SSE integration)
  useCacheSync()

  // Initialize network sync (auto-sync on reconnection)
  const { isOnline, isSyncing } = useNetworkSync()

  // Initialize background sync
  const { triggerMutationSync } = useBackgroundSync()

  // Initial sync on mount
  useEffect(() => {
    if (skipInitialSync) {
      setIsInitialized(true)
      return
    }

    const performInitialSync = async () => {
      try {
        // Perform initial sync
        const result = await DataSyncManager.performInitialSync()
        setLastSyncResult(result)

        // Get pending mutations count
        const stats = await OfflineSyncManager.getMutationStats()
        setPendingMutations(stats.pending)

        // Register background sync if supported
        if (!disableBackgroundSync && stats.pending > 0) {
          triggerMutationSync()
        }
      } catch (error) {
        console.error('Initial sync failed:', error)
      } finally {
        setIsInitialized(true)
      }
    }

    performInitialSync()
  }, [skipInitialSync, disableBackgroundSync, triggerMutationSync])

  // Subscribe to sync results
  useEffect(() => {
    const unsubscribe = DataSyncManager.onSyncComplete((result) => {
      setLastSyncResult(result)
    })

    return unsubscribe
  }, [])

  // Update pending mutations count periodically
  useEffect(() => {
    const updatePendingCount = async () => {
      const stats = await OfflineSyncManager.getMutationStats()
      setPendingMutations(stats.pending)
    }

    updatePendingCount()

    const interval = setInterval(updatePendingCount, 10000) // Every 10 seconds

    return () => clearInterval(interval)
  }, [])

  // Force sync function
  const forceSync = async () => {
    const result = await DataSyncManager.performFullSync({ forceFullSync: true })
    setLastSyncResult(result)

    const stats = await OfflineSyncManager.getMutationStats()
    setPendingMutations(stats.pending)
  }

  // Clear cache function
  const clearCache = async () => {
    await DataSyncManager.resetSyncCursors()
    CacheManager.clearAll()
    setLastSyncResult(null)
  }

  const contextValue: OfflineContextValue = {
    isOnline,
    isSyncing,
    isInitialized,
    lastSyncResult,
    pendingMutations,
    forceSync,
    clearCache
  }

  return (
    <OfflineContext.Provider value={contextValue}>
      {children}
    </OfflineContext.Provider>
  )
}

export default OfflineProvider
