"use client"

/**
 * React hook for cached attachment access
 * Handles downloading, caching, and offline viewing of attachments
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { AttachmentCache } from '@/lib/attachment-cache'
import { CrossTabSync, type CrossTabEvent } from '@/lib/cross-tab-sync'

interface UseCachedAttachmentOptions {
  /** Auto-download if not cached (default: true) */
  autoDownload?: boolean
  /** Task ID for prefetching */
  taskId?: string
  /** Comment ID if comment attachment */
  commentId?: string
  /** Attachment name */
  name?: string
  /** MIME type */
  mimeType?: string
  /** File size in bytes */
  size?: number
}

interface UseCachedAttachmentResult {
  /** Blob URL for viewing (either cached blob or original URL) */
  url: string | null
  /** Whether the attachment is cached for offline viewing */
  isCached: boolean
  /** Whether the attachment is currently downloading */
  isDownloading: boolean
  /** Error message if any */
  error: string | null
  /** Manually trigger download/cache */
  download: () => Promise<void>
  /** Remove from cache */
  removeFromCache: () => Promise<void>
}

/**
 * Hook for accessing cached attachments
 */
export function useCachedAttachment(
  attachmentId: string | null | undefined,
  originalUrl: string | null | undefined,
  options: UseCachedAttachmentOptions = {}
): UseCachedAttachmentResult {
  const [url, setUrl] = useState<string | null>(null)
  const [isCached, setIsCached] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track blob URLs for cleanup
  const blobUrlRef = useRef<string | null>(null)

  // Cleanup blob URL on unmount or change
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
      }
    }
  }, [])

  // Load attachment
  const loadAttachment = useCallback(async () => {
    if (!attachmentId || !originalUrl) {
      setUrl(null)
      return
    }

    // Cleanup previous blob URL
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }

    setIsDownloading(true)
    setError(null)

    try {
      const result = await AttachmentCache.getAttachment(attachmentId, originalUrl, {
        download: options.autoDownload !== false,
        taskId: options.taskId,
        commentId: options.commentId,
        name: options.name,
        mimeType: options.mimeType,
        size: options.size
      })

      if (result.blob) {
        blobUrlRef.current = result.url
      }

      setUrl(result.url ?? null)
      setIsCached(result.isCached)
      setError(result.error ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load attachment')
      setUrl(originalUrl ?? null)
      setIsCached(false)
    } finally {
      setIsDownloading(false)
    }
  }, [attachmentId, originalUrl, options.autoDownload, options.taskId, options.commentId, options.name, options.mimeType, options.size])

  // Initial load
  useEffect(() => {
    loadAttachment()
  }, [loadAttachment])

  // Subscribe to cross-tab updates
  useEffect(() => {
    if (!attachmentId) return

    const unsubscribe = CrossTabSync.subscribeToEvents(
      ['cache_updated', 'entity_deleted'],
      (event: CrossTabEvent) => {
        if (event.entity === 'attachment' && event.entityId === attachmentId) {
          if (event.type === 'entity_deleted') {
            setIsCached(false)
            setUrl(originalUrl ?? null)
          } else {
            loadAttachment()
          }
        }
      }
    )

    return unsubscribe
  }, [attachmentId, originalUrl, loadAttachment])

  // Manual download
  const download = useCallback(async () => {
    if (!attachmentId || !originalUrl) return

    setIsDownloading(true)
    setError(null)

    try {
      const result = await AttachmentCache.getAttachment(attachmentId, originalUrl, {
        download: true,
        taskId: options.taskId,
        commentId: options.commentId,
        name: options.name,
        mimeType: options.mimeType,
        size: options.size
      })

      if (result.blob && blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
      }

      if (result.blob) {
        blobUrlRef.current = result.url
      }

      setUrl(result.url ?? null)
      setIsCached(result.isCached)
      setError(result.error ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download attachment')
    } finally {
      setIsDownloading(false)
    }
  }, [attachmentId, originalUrl, options.taskId, options.commentId, options.name, options.mimeType, options.size])

  // Remove from cache
  const removeFromCache = useCallback(async () => {
    if (!attachmentId) return

    await AttachmentCache.removeFromCache(attachmentId)

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }

    setIsCached(false)
    setUrl(originalUrl ?? null)
  }, [attachmentId, originalUrl])

  return {
    url,
    isCached,
    isDownloading,
    error,
    download,
    removeFromCache
  }
}

/**
 * Hook for prefetching task attachments
 */
export function usePrefetchAttachments(
  taskId: string | null | undefined,
  attachments: Array<{
    id: string
    url: string
    name?: string
    mimeType?: string
    size?: number
  }> = []
) {
  useEffect(() => {
    if (!taskId || attachments.length === 0) return

    // Prefetch in background
    AttachmentCache.prefetchForTask(taskId, attachments).catch(() => {
      // Ignore prefetch errors
    })
  }, [taskId, attachments])
}

/**
 * Hook for attachment cache stats
 */
export function useAttachmentCacheStats() {
  const [stats, setStats] = useState<{
    hits: number
    misses: number
    downloads: number
    errors: number
    cachedCount: number
    cacheSize: number
    cacheSizeMB: string
  } | null>(null)

  useEffect(() => {
    const loadStats = async () => {
      const s = await AttachmentCache.getCacheStats()
      setStats(s)
    }

    loadStats()

    // Refresh every 30 seconds
    const interval = setInterval(loadStats, 30000)

    return () => clearInterval(interval)
  }, [])

  return stats
}
