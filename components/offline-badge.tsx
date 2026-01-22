'use client'

import { Cloud, CloudOff } from 'lucide-react'
import { cn } from '@/lib/utils'

interface OfflineBadgeProps {
  showWhenOnline?: boolean
  className?: string
  variant?: 'inline' | 'floating'
}

/**
 * Badge component to indicate offline status
 * Shows cloud icon when online, cloud-off icon when offline
 */
export function OfflineBadge({
  showWhenOnline = false,
  className,
  variant = 'inline'
}: OfflineBadgeProps) {
  const isOnline = typeof window !== 'undefined' && navigator.onLine

  // Don't show badge when online unless explicitly requested
  if (isOnline && !showWhenOnline) {
    return null
  }

  const baseClasses = cn(
    'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
    variant === 'floating' && 'fixed bottom-4 right-4 z-50 shadow-lg',
    isOnline
      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800'
      : 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border border-orange-200 dark:border-orange-800',
    className
  )

  return (
    <div className={baseClasses}>
      {isOnline ? (
        <>
          <Cloud className="h-3 w-3" />
          <span>Online</span>
        </>
      ) : (
        <>
          <CloudOff className="h-3 w-3" />
          <span>Offline</span>
        </>
      )}
    </div>
  )
}
