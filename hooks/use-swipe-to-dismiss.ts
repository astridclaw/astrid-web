import { useRef, useCallback } from 'react'

interface SwipeToDismissHandlers {
  onDismiss?: () => void
}

interface SwipeToDismissOptions {
  threshold?: number
  direction?: 'right' | 'left' | 'up' | 'down'
  preventScrollOnSwipe?: boolean
  trackTouch?: boolean
}

export function useSwipeToDismiss(handlers: SwipeToDismissHandlers, options: SwipeToDismissOptions = {}) {
  const {
    threshold = 50,
    direction = 'right',
    preventScrollOnSwipe = false,
    trackTouch = true,
  } = options

  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const touchEndRef = useRef<{ x: number; y: number } | null>(null)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!trackTouch) return
    const touch = e.touches[0]
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
    }
    touchEndRef.current = null
  }, [trackTouch])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!trackTouch) return
    if (preventScrollOnSwipe) {
      e.preventDefault()
    }
    const touch = e.touches[0]
    touchEndRef.current = {
      x: touch.clientX,
      y: touch.clientY,
    }
  }, [trackTouch, preventScrollOnSwipe])

  const onTouchEnd = useCallback(() => {
    if (!trackTouch || !touchStartRef.current || !touchEndRef.current) return

    const deltaX = touchEndRef.current.x - touchStartRef.current.x
    const deltaY = touchEndRef.current.y - touchStartRef.current.y
    const absDeltaX = Math.abs(deltaX)
    const absDeltaY = Math.abs(deltaY)

    let shouldDismiss = false

    // Check if the swipe is in the correct direction and meets threshold
    switch (direction) {
      case 'right':
        shouldDismiss = deltaX > threshold && absDeltaX > absDeltaY
        break
      case 'left':
        shouldDismiss = deltaX < -threshold && absDeltaX > absDeltaY
        break
      case 'down':
        shouldDismiss = deltaY > threshold && absDeltaY > absDeltaX
        break
      case 'up':
        shouldDismiss = deltaY < -threshold && absDeltaY > absDeltaX
        break
    }

    if (shouldDismiss) {
      handlers.onDismiss?.()
    }

    // Reset
    touchStartRef.current = null
    touchEndRef.current = null
  }, [trackTouch, threshold, direction, handlers])

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  }
}