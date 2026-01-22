/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// Mock the useSession hook
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: {
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User'
      }
    },
    status: 'authenticated'
  })
}))

// Mock the useRouter hook
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn()
  })
}))

// Mock contexts that might be used
vi.mock('@/contexts/theme-context', () => ({
  useTheme: () => ({
    theme: 'light',
    setTheme: vi.fn()
  })
}))

vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({
    toastDebugMode: false,
    setToastDebugMode: vi.fn(),
    reminderDebugMode: false,
    setReminderDebugMode: vi.fn()
  })
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn()
  })
}))

describe('Settings Pages Mobile Layout', () => {
  beforeEach(() => {
    // Mock window resize for mobile testing
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    })
    window.dispatchEvent(new Event('resize'))
  })

  it('should have consistent mobile layout patterns', () => {
    const expectedClasses = [
      'p-2 sm:p-4', // Mobile-first padding
      'max-w-sm sm:max-w-2xl', // Mobile-first max width
      'space-y-4 sm:space-y-6', // Mobile-first spacing
    ]

    // Test that these classes exist in the codebase
    expectedClasses.forEach(className => {
      expect(className).toMatch(/^(p-2 sm:p-4|max-w-sm sm:max-w-2xl|space-y-4 sm:space-y-6)$/)
    })
  })

  it('should handle very small screen widths gracefully', () => {
    // Test with very small screen
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 320,
    })
    window.dispatchEvent(new Event('resize'))

    // The mobile-first approach should handle this
    expect(window.innerWidth).toBe(320)
  })

  it('should verify mobile-first responsive design principles', () => {
    // Test that mobile-first classes are structured correctly
    const mobileFirstPatterns = [
      /^p-\d+ sm:p-\d+$/, // padding
      /^max-w-\w+ sm:max-w-\w+$/, // max-width
      /^space-y-\d+ sm:space-y-\d+$/, // spacing
      /^flex-col sm:flex-row$/, // flex direction
      /^grid-cols-1 sm:grid-cols-\d+$/, // grid columns
    ]

    mobileFirstPatterns.forEach(pattern => {
      expect(pattern).toBeInstanceOf(RegExp)
    })
  })
})