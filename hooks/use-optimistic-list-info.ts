import { useMemo, useRef, useEffect, useCallback } from 'react'
import { useTranslations } from '@/lib/i18n/client'
import type { TaskList } from '@/types/task'

export interface OptimisticListInfo {
  name: string
  description: string
  color?: string
  image?: string
}

interface UseOptimisticListInfoProps {
  selectedListId: string
  lists: TaskList[]
  getListDisplayInfo: (list: TaskList | null) => OptimisticListInfo
}

export function useOptimisticListInfo({ selectedListId, lists, getListDisplayInfo }: UseOptimisticListInfoProps) {
  const { t } = useTranslations()

  // Cache for quick list lookups to avoid re-computations
  const listCacheRef = useRef<Map<string, OptimisticListInfo>>(new Map())

  // Build cache from sidebar lists for instant access
  const updateListCache = useCallback(() => {
    const newCache = new Map<string, OptimisticListInfo>()

    // Add virtual/system lists
    newCache.set('my-tasks', { name: t('listHeaders.myTasks'), description: t('listHeaders.myTasksDescription') })
    newCache.set('today', { name: t('listHeaders.today'), description: t('listHeaders.todayDescription') })
    newCache.set('not-in-list', { name: t('listHeaders.notInList'), description: t('listHeaders.notInListDescription') })
    newCache.set('public', { name: t('listHeaders.public'), description: t('listHeaders.publicDescription') })
    newCache.set('assigned', { name: t('listHeaders.assigned'), description: t('listHeaders.assignedDescription') })
    
    // Add real lists from sidebar
    lists.forEach(list => {
      if (!list.isVirtual) {
        const listInfo = getListDisplayInfo(list)
        newCache.set(list.id, {
          name: listInfo.name,
          description: listInfo.description,
          color: list.color,
          image: list.imageUrl || list.coverImageUrl || undefined
        })
      }
    })
    
    listCacheRef.current = newCache
  }, [lists, getListDisplayInfo, t])
  
  // Update cache when lists change
  useEffect(() => {
    updateListCache()
  }, [updateListCache])

  // Get optimistic list info with immediate fallback
  const getOptimisticListInfo = useCallback((listId: string): OptimisticListInfo => {
    // 1. INSTANT: Check cache first (from sidebar data)
    const cachedInfo = listCacheRef.current.get(listId)
    if (cachedInfo) {
      return cachedInfo
    }
    
    // 2. FALLBACK: If not in cache, compute from current lists
    if (listId === "my-tasks") {
      return { name: t('listHeaders.myTasks'), description: t('listHeaders.myTasksDescription') }
    } else if (listId === "today") {
      return { name: t('listHeaders.today'), description: t('listHeaders.todayDescription') }
    } else if (listId === "not-in-list") {
      return { name: t('listHeaders.notInList'), description: t('listHeaders.notInListDescription') }
    } else if (listId === "public") {
      return { name: t('listHeaders.public'), description: t('listHeaders.publicDescription') }
    } else if (listId === "assigned") {
      return { name: t('listHeaders.assigned'), description: t('listHeaders.assignedDescription') }
    } else {
      const list = lists.find(l => l.id === listId)
      if (list) {
        const listInfo = getListDisplayInfo(list)
        // Cache for next time
        listCacheRef.current.set(listId, {
          name: listInfo.name,
          description: listInfo.description,
          color: list.color,
          image: list.imageUrl || list.coverImageUrl || undefined
        })
        return {
          name: listInfo.name,
          description: listInfo.description,
          color: list.color,
          image: list.imageUrl || list.coverImageUrl || undefined
        }
      }
      
      // 3. ULTIMATE FALLBACK: Loading state or unknown
      return { name: t('messages.loading'), description: "" }
    }
  }, [lists, getListDisplayInfo, t])

  // Get current list info with optimistic loading
  const currentListInfo = useMemo(() => {
    return getOptimisticListInfo(selectedListId)
  }, [selectedListId, getOptimisticListInfo])

  return {
    currentListInfo,
    getOptimisticListInfo,
    isListCached: (listId: string) => listCacheRef.current.has(listId)
  }
}
