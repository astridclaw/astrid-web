'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, CheckCircle2, AlertCircle, CloudOff, Cloud, Database } from 'lucide-react'
import { cn } from '@/lib/utils'
import { OfflineSyncManager } from '@/lib/offline-sync'
import { DataSyncManager, type SyncResult } from '@/lib/data-sync'
import { CacheManager } from '@/lib/cache-manager'
import { Button } from '@/components/ui/button'

interface SyncStatusProps {
  className?: string
  showDetails?: boolean
}

type SyncState = 'idle' | 'syncing' | 'success' | 'error'

/**
 * Component to display sync status and pending mutations
 * Shows sync state, pending count, and manual sync trigger
 */
export function SyncStatus({ className, showDetails = true }: SyncStatusProps) {
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [pendingCount, setPendingCount] = useState(0)
  const [failedCount, setFailedCount] = useState(0)
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
  const [isOnline, setIsOnline] = useState(true)

  // Update mutation stats
  const updateStats = useCallback(async () => {
    try {
      const stats = await OfflineSyncManager.getMutationStats()
      setPendingCount(stats.pending)
      setFailedCount(stats.failed)
    } catch (error) {
      console.error('Failed to get mutation stats:', error)
    }
  }, [])

  // Manual sync trigger
  const handleSync = useCallback(async () => {
    if (!navigator.onLine) {
      return
    }

    setSyncState('syncing')

    try {
      // First sync pending mutations
      const mutationResult = await OfflineSyncManager.syncPendingMutations()

      // Then do incremental data sync to get latest from server
      const dataResult = await DataSyncManager.performIncrementalSync({
        skipMutationSync: true // Already synced mutations above
      })

      if (mutationResult.failed > 0 || dataResult.status === 'error') {
        setSyncState('error')
      } else {
        setSyncState('success')
        setLastSyncTime(new Date())
      }

      await updateStats()

      // Reset to idle after 2 seconds
      setTimeout(() => setSyncState('idle'), 2000)
    } catch (error) {
      console.error('Sync failed:', error)
      setSyncState('error')
      setTimeout(() => setSyncState('idle'), 2000)
    }
  }, [updateStats])

  // Handle online/offline events
  useEffect(() => {
    setIsOnline(navigator.onLine)

    const handleOnline = () => {
      setIsOnline(true)
      handleSync() // Auto-sync on reconnection
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [handleSync])

  // Update stats periodically
  useEffect(() => {
    updateStats()

    const interval = setInterval(updateStats, 5000) // Every 5 seconds

    return () => clearInterval(interval)
  }, [updateStats])

  // Auto-sync when coming online with pending mutations
  useEffect(() => {
    if (isOnline && pendingCount > 0 && syncState === 'idle') {
      handleSync()
    }
  }, [isOnline, pendingCount, syncState, handleSync])

  // Get sync icon based on state
  const getSyncIcon = () => {
    switch (syncState) {
      case 'syncing':
        return <RefreshCw className="h-3.5 w-3.5 animate-spin" />
      case 'success':
        return <CheckCircle2 className="h-3.5 w-3.5" />
      case 'error':
        return <AlertCircle className="h-3.5 w-3.5" />
      default:
        return <RefreshCw className="h-3.5 w-3.5" />
    }
  }

  // Get tooltip content
  const getTooltipTitle = () => {
    if (!isOnline) {
      return 'Offline - Changes will sync when online'
    }

    if (syncState === 'syncing') {
      return 'Syncing changes...'
    }

    if (syncState === 'success') {
      return 'All changes synced'
    }

    if (syncState === 'error') {
      return `Sync failed - ${failedCount} errors`
    }

    if (pendingCount > 0) {
      return `${pendingCount} changes pending`
    }

    if (lastSyncTime) {
      return `Last synced: ${lastSyncTime.toLocaleTimeString()}`
    }

    return 'Click to sync'
  }

  // Show pending indicator
  const hasPending = pendingCount > 0 || failedCount > 0

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleSync}
      disabled={!isOnline || syncState === 'syncing'}
      title={getTooltipTitle()}
      className={cn(
        'relative gap-2',
        syncState === 'success' && 'text-green-600 dark:text-green-400',
        syncState === 'error' && 'text-red-600 dark:text-red-400',
        !isOnline && 'text-muted-foreground cursor-not-allowed',
        className
      )}
    >
      {getSyncIcon()}

      {showDetails && hasPending && (
        <span className="text-xs">
          {pendingCount > 0 && (
            <span className="font-medium">{pendingCount}</span>
          )}
          {failedCount > 0 && (
            <span className="text-red-600 dark:text-red-400 ml-1">
              ({failedCount} failed)
            </span>
          )}
        </span>
      )}

      {hasPending && (
        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-orange-500 dark:bg-orange-400" />
      )}
    </Button>
  )
}

/**
 * Compact sync status indicator for use in headers/toolbars
 */
export function SyncStatusCompact({ className }: { className?: string }) {
  return <SyncStatus className={className} showDetails={false} />
}

/**
 * Enhanced sync status with offline indicator
 * Shows network status + sync state
 */
export function SyncStatusEnhanced({ className }: { className?: string }) {
  const [isOnline, setIsOnline] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    setIsOnline(navigator.onLine)

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    const updateStats = async () => {
      const stats = await OfflineSyncManager.getMutationStats()
      setPendingCount(stats.pending)
    }

    updateStats()
    const interval = setInterval(updateStats, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const unsubscribe = DataSyncManager.onSyncComplete(() => {
      setIsSyncing(false)
    })
    return unsubscribe
  }, [])

  if (!isOnline) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400', className)}>
        <CloudOff className="h-4 w-4" />
        <span>Offline</span>
        {pendingCount > 0 && (
          <span className="text-xs bg-amber-100 dark:bg-amber-900 px-1.5 py-0.5 rounded">
            {pendingCount} pending
          </span>
        )}
      </div>
    )
  }

  if (isSyncing) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400', className)}>
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span>Syncing...</span>
      </div>
    )
  }

  if (pendingCount > 0) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400', className)}>
        <Database className="h-4 w-4" />
        <span>{pendingCount} pending</span>
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-2 text-sm text-green-600 dark:text-green-400', className)}>
      <Cloud className="h-4 w-4" />
      <span>Synced</span>
    </div>
  )
}
