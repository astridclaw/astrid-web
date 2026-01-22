import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMobileKeyboard } from '@/hooks/shared/useMobileKeyboard'

// Mock layout-detection utilities
vi.mock('@/lib/layout-detection', () => ({
  shouldPreventAutoFocus: vi.fn(() => true),
  getKeyboardDetectionThreshold: vi.fn(() => 150),
  needsAggressiveKeyboardProtection: vi.fn(() => false),
  shouldIgnoreTouchDuringKeyboard: vi.fn(() => false),
  getFocusProtectionThreshold: vi.fn(() => 300),
  isMobileDevice: vi.fn(() => true),
  isIPadDevice: vi.fn(() => false)
}))

describe('useMobileKeyboard', () => {
  it('should return device-specific configuration from layout detection', () => {
    const { result } = renderHook(() => useMobileKeyboard())

    // Should return values from mocked layout-detection functions
    expect(result.current.shouldPreventFocus).toBe(true)
    expect(result.current.needsProtection).toBe(false)
    expect(result.current.shouldIgnoreTouch).toBe(false)
    expect(result.current.focusProtectionThreshold).toBe(300)
  })

  it('should initialize with keyboard hidden state', () => {
    const { result } = renderHook(() => useMobileKeyboard())

    expect(result.current.keyboardVisible).toBe(false)
  })

  it('should initialize viewport height from window', () => {
    const { result } = renderHook(() => useMobileKeyboard())

    // Should have some viewport height (either from window.innerHeight or visualViewport)
    expect(typeof result.current.viewportHeight).toBe('number')
    expect(result.current.viewportHeight).toBeGreaterThan(0)
  })

  it('should expose all required keyboard state properties', () => {
    const { result } = renderHook(() => useMobileKeyboard())

    // Check all expected properties exist
    expect(result.current).toHaveProperty('keyboardVisible')
    expect(result.current).toHaveProperty('viewportHeight')
    expect(result.current).toHaveProperty('shouldPreventFocus')
    expect(result.current).toHaveProperty('needsProtection')
    expect(result.current).toHaveProperty('shouldIgnoreTouch')
    expect(result.current).toHaveProperty('focusProtectionThreshold')
  })

  it('should return boolean for keyboard visibility', () => {
    const { result } = renderHook(() => useMobileKeyboard())

    expect(typeof result.current.keyboardVisible).toBe('boolean')
  })

  it('should return number for viewport height', () => {
    const { result } = renderHook(() => useMobileKeyboard())

    expect(typeof result.current.viewportHeight).toBe('number')
  })

  it('should not crash when rendered', () => {
    // Should not throw
    expect(() => {
      renderHook(() => useMobileKeyboard())
    }).not.toThrow()
  })
})
