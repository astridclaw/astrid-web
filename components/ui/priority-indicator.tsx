"use client"

import { memo } from 'react'
import { cn } from '@/lib/utils'
import { AlertTriangle, Circle, Minus } from 'lucide-react'

interface PriorityIndicatorProps {
  priority: number
  size?: 'sm' | 'md'
  className?: string
}

const priorityConfig = {
  3: { 
    icon: AlertTriangle, 
    color: 'text-red-500',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    label: 'High'
  },
  2: { 
    icon: Circle, 
    color: 'text-orange-500',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    label: 'Medium'
  },
  1: { 
    icon: Minus, 
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    label: 'Low'
  },
  0: { 
    icon: null, 
    color: 'theme-text-muted',
    bgColor: '',
    label: 'None'
  }
}

export const PriorityIndicator = memo<PriorityIndicatorProps>(({
  priority,
  size = 'sm',
  className = ''
}) => {
  const config = priorityConfig[priority as keyof typeof priorityConfig]
  
  if (!config || !config.icon) {
    return null
  }

  const Icon = config.icon
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'

  return (
    <div 
      className={cn(
        'inline-flex items-center justify-center rounded-full',
        size === 'sm' ? 'w-5 h-5' : 'w-6 h-6',
        config.bgColor,
        className
      )}
      title={`${config.label} Priority`}
    >
      <Icon className={cn(iconSize, config.color)} />
    </div>
  )
})

PriorityIndicator.displayName = 'PriorityIndicator'