"use client"

import { memo } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'

interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export const EmptyState = memo<EmptyStateProps>(({
  icon,
  title,
  description,
  action,
  className = ''
}) => (
  <div className={cn(
    'flex flex-col items-center justify-center py-12 px-4 text-center',
    className
  )}>
    <div className="theme-text-muted mb-4 opacity-50">
      {icon}
    </div>
    <h3 className="text-lg font-medium theme-text-primary mb-2">
      {title}
    </h3>
    <p className="theme-text-muted max-w-md mb-6">
      {description}
    </p>
    {action && (
      <Button onClick={action.onClick}>
        {action.label}
      </Button>
    )}
  </div>
))

EmptyState.displayName = 'EmptyState'