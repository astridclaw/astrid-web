"use client"

/**
 * React hook for cached list member access
 * Supports offline viewing and modification of list members
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  OfflineListMemberOperations,
  type OfflineListMember,
  type OfflineUser
} from '@/lib/offline-db'
import { OfflineSyncManager, isOfflineMode } from '@/lib/offline-sync'
import { CrossTabSync, type CrossTabEvent } from '@/lib/cross-tab-sync'

interface UseCachedListMembersOptions {
  /** Skip initial fetch */
  skip?: boolean
  /** Callback when members change */
  onMembersChange?: (members: OfflineListMember[]) => void
}

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

interface UseCachedListMembersResult {
  members: OfflineListMember[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
  addMember: (userId: string, role?: 'admin' | 'member', user?: OfflineUser) => Promise<void>
  removeMember: (userId: string) => Promise<void>
  updateMemberRole: (userId: string, role: 'admin' | 'member') => Promise<void>
}

/**
 * Hook for cached list members with offline support
 */
export function useCachedListMembers(
  listId: string | null | undefined,
  options: UseCachedListMembersOptions = {}
): UseCachedListMembersResult {
  const { skip, onMembersChange } = options
  const [members, setMembers] = useState<OfflineListMember[]>([])
  const [isLoading, setIsLoading] = useState(!skip && !!listId)
  const [error, setError] = useState<Error | null>(null)

  const stableOnMembersChange = useEventCallback(onMembersChange)

  // Fetch members from IndexedDB
  const fetchMembers = useCallback(async () => {
    if (!listId || skip) return

    setIsLoading(true)
    setError(null)

    try {
      const cachedMembers = await OfflineListMemberOperations.getMembersByList(listId)
      setMembers(cachedMembers)
      stableOnMembersChange(cachedMembers)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch members'))
    } finally {
      setIsLoading(false)
    }
  }, [listId, skip, stableOnMembersChange])

  // Initial fetch
  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  // Subscribe to cross-tab updates
  useEffect(() => {
    if (!listId) return

    const unsubscribe = CrossTabSync.subscribeToEvents(
      ['cache_updated', 'entity_deleted', 'mutation_synced'],
      (event: CrossTabEvent) => {
        if (event.entity === 'member') {
          fetchMembers()
        }
      }
    )

    return unsubscribe
  }, [listId, fetchMembers])

  // Add member
  const addMember = useCallback(async (
    userId: string,
    role: 'admin' | 'member' = 'member',
    user?: OfflineUser
  ) => {
    if (!listId) return

    const memberId = `${listId}_${userId}`
    const newMember: OfflineListMember = {
      id: memberId,
      listId,
      userId,
      role,
      joinedAt: new Date().toISOString(),
      user,
      syncStatus: 'pending'
    }

    // Optimistic update
    setMembers(prev => [...prev, newMember])

    // Save to IndexedDB
    await OfflineListMemberOperations.saveMember(newMember)

    // Queue mutation if offline
    if (isOfflineMode()) {
      await OfflineSyncManager.queueMutation(
        'create',
        'member',
        memberId,
        `/api/lists/${listId}/members`,
        'POST',
        { userId, role },
        listId
      )
    }

    // Broadcast to other tabs
    CrossTabSync.broadcastCacheUpdated('member', memberId)
  }, [listId])

  // Remove member
  const removeMember = useCallback(async (userId: string) => {
    if (!listId) return

    const memberId = `${listId}_${userId}`

    // Optimistic update
    setMembers(prev => prev.filter(m => m.userId !== userId))

    // Delete from IndexedDB
    await OfflineListMemberOperations.deleteMember(memberId)

    // Queue mutation if offline
    if (isOfflineMode()) {
      await OfflineSyncManager.queueMutation(
        'delete',
        'member',
        memberId,
        `/api/lists/${listId}/members/${userId}`,
        'DELETE',
        undefined,
        listId
      )
    }

    // Broadcast to other tabs
    CrossTabSync.broadcastEntityDeleted('member', memberId)
  }, [listId])

  // Update member role
  const updateMemberRole = useCallback(async (
    userId: string,
    role: 'admin' | 'member'
  ) => {
    if (!listId) return

    const memberId = `${listId}_${userId}`

    // Optimistic update
    setMembers(prev => prev.map(m =>
      m.userId === userId ? { ...m, role, syncStatus: 'pending' as const } : m
    ))

    // Update in IndexedDB
    const existing = await OfflineListMemberOperations.getMember(memberId)
    if (existing) {
      await OfflineListMemberOperations.saveMember({
        ...existing,
        role,
        syncStatus: 'pending'
      })
    }

    // Queue mutation if offline
    if (isOfflineMode()) {
      await OfflineSyncManager.queueMutation(
        'update',
        'member',
        memberId,
        `/api/lists/${listId}/members/${userId}`,
        'PATCH',
        { role },
        listId
      )
    }

    // Broadcast to other tabs
    CrossTabSync.broadcastCacheUpdated('member', memberId)
  }, [listId])

  return {
    members,
    isLoading,
    error,
    refetch: fetchMembers,
    addMember,
    removeMember,
    updateMemberRole
  }
}

/**
 * Hook for syncing list members from server to cache
 */
export function useSyncListMembers(listId: string | null | undefined) {
  const syncMembers = useCallback(async (serverMembers: any[]) => {
    if (!listId) return

    // Convert server members to offline format
    const offlineMembers: OfflineListMember[] = serverMembers.map(m => ({
      id: `${listId}_${m.userId || m.user?.id}`,
      listId,
      userId: m.userId || m.user?.id,
      role: m.role || 'member',
      joinedAt: m.joinedAt || m.createdAt || new Date().toISOString(),
      user: m.user ? {
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image
      } : undefined,
      syncStatus: 'synced' as const
    }))

    // Save all to IndexedDB
    await OfflineListMemberOperations.saveMembers(offlineMembers)

    return offlineMembers
  }, [listId])

  return { syncMembers }
}

export default useCachedListMembers
