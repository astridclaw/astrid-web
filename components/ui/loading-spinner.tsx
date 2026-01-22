"use client"

import { memo } from 'react'
import { cn } from '@/lib/utils'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  color?: 'primary' | 'secondary' | 'white'
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6', 
  lg: 'w-8 h-8',
  xl: 'w-12 h-12'
}

const colorClasses = {
  primary: 'border-blue-600',
  secondary: 'border-gray-600',
  white: 'border-white'
}

export const LoadingSpinner = memo<LoadingSpinnerProps>(({ 
  size = 'md',
  className = '',
  color = 'primary'
}) => (
  <div 
    className={cn(
      'animate-spin rounded-full border-2 border-transparent border-t-current',
      sizeClasses[size],
      colorClasses[color],
      className
    )}
    role="status"
    aria-label="Loading"
  />
))

LoadingSpinner.displayName = 'LoadingSpinner'