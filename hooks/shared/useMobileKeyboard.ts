import { useState, useEffect, useRef } from 'react'
import {
  shouldPreventAutoFocus,
  getKeyboardDetectionThreshold,
  needsAggressiveKeyboardProtection,
  shouldIgnoreTouchDuringKeyboard,
  getFocusProtectionThreshold,
  isMobileDevice,
  isIPadDevice
} from '@/lib/layout-detection'

/**
 * Mobile keyboard state
 */
export interface MobileKeyboardState {
  /**
   * Whether the mobile keyboard is currently visible
   */
  keyboardVisible: boolean

  /**
   * Current viewport height (changes when keyboard opens/closes)
   */
  viewportHeight: number

  /**
   * Whether auto-focus should be prevented on this device
   */
  shouldPreventFocus: boolean

  /**
   * Whether aggressive keyboard protection is needed (iPad)
   */
  needsProtection: boolean

  /**
   * Whether touch events should be ignored during keyboard interactions
   */
  shouldIgnoreTouch: boolean

  /**
   * Focus protection threshold in milliseconds
   */
  focusProtectionThreshold: number
}

/**
 * Hook for managing mobile keyboard state and behavior
 *
 * Handles the complexities of mobile keyboard detection across iOS and Android:
 * - Detects keyboard show/hide via viewport height changes
 * - Provides device-specific configuration flags
 * - Handles iPad-specific keyboard behavior
 *
 * @example
 * ```typescript
 * const {
 *   keyboardVisible,
 *   viewportHeight,
 *   shouldPreventFocus,
 *   needsProtection
 * } = useMobileKeyboard()
 *
 * // Conditionally adjust UI when keyboard is visible
 * <div style={{ paddingBottom: keyboardVisible ? 0 : 20 }}>
 *   {!shouldPreventFocus && <input autoFocus />}
 * </div>
 * ```
 */
export function useMobileKeyboard(): MobileKeyboardState {
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window !== 'undefined' ? window.visualViewport?.height || window.innerHeight : 0
  )

  // Track last height to detect changes
  const lastHeightRef = useRef(viewportHeight)

  // Track initial height to compare against
  const initialHeightRef = useRef(viewportHeight)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Only run on mobile devices
    if (!isMobileDevice() && !isIPadDevice()) return

    const threshold = getKeyboardDetectionThreshold()

    const handleResize = () => {
      const currentHeight = window.visualViewport?.height || window.innerHeight
      const heightDiff = initialHeightRef.current - currentHeight

      // Update viewport height
      setViewportHeight(currentHeight)

      // Detect keyboard state based on height change
      // Keyboard is visible if viewport shrunk by more than threshold
      if (heightDiff > threshold) {
        if (!keyboardVisible) {
          setKeyboardVisible(true)
        }
      } else if (Math.abs(heightDiff) < threshold / 2) {
        // Keyboard is hidden if height is close to initial
        if (keyboardVisible) {
          setKeyboardVisible(false)
        }
      }

      lastHeightRef.current = currentHeight
    }

    // Handle focus events to improve keyboard detection
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement
      // If an input/textarea is focused, assume keyboard will appear
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        // Small delay to allow keyboard to appear
        setTimeout(() => {
          const currentHeight = window.visualViewport?.height || window.innerHeight
          const heightDiff = initialHeightRef.current - currentHeight
          if (heightDiff > threshold / 2) {
            setKeyboardVisible(true)
          }
        }, 100)
      }
    }

    const handleFocusOut = () => {
      // Small delay to check if keyboard actually closed
      setTimeout(() => {
        const currentHeight = window.visualViewport?.height || window.innerHeight
        const heightDiff = initialHeightRef.current - currentHeight
        if (Math.abs(heightDiff) < threshold / 2) {
          setKeyboardVisible(false)
        }
      }, 100)
    }

    // Listen to visual viewport resize (better for keyboard detection)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize)
    }

    // Fallback to window resize
    window.addEventListener('resize', handleResize)

    // Focus events for improved detection
    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)

    // Initial check
    handleResize()

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize)
      }
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
    }
  }, [keyboardVisible]) // Re-run if keyboard state changes

  return {
    keyboardVisible,
    viewportHeight,
    shouldPreventFocus: shouldPreventAutoFocus(),
    needsProtection: needsAggressiveKeyboardProtection(),
    shouldIgnoreTouch: shouldIgnoreTouchDuringKeyboard(),
    focusProtectionThreshold: getFocusProtectionThreshold()
  }
}
