import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTaskManagerLayout } from '@/hooks/useTaskManagerLayout'

describe('useTaskManagerLayout', () => {
  beforeEach(() => {
    // Mock window dimensions for consistent testing
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Mobile Sidebar Click-Outside Behavior', () => {
    it('should provide setShowMobileSidebar function for closing sidebar', () => {
      const { result } = renderHook(() => useTaskManagerLayout({ onRefresh: undefined, onSearchClear: undefined }))

      // Initially closed
      expect(result.current.showMobileSidebar).toBe(false)

      // Can open sidebar
      act(() => {
        result.current.setShowMobileSidebar(true)
      })
      expect(result.current.showMobileSidebar).toBe(true)

      // Can close sidebar
      act(() => {
        result.current.setShowMobileSidebar(false)
      })
      expect(result.current.showMobileSidebar).toBe(false)
    })

    it('should toggle sidebar with toggleMobileSidebar', () => {
      const { result } = renderHook(() => useTaskManagerLayout({ onRefresh: undefined, onSearchClear: undefined }))

      expect(result.current.showMobileSidebar).toBe(false)

      act(() => {
        result.current.toggleMobileSidebar()
      })
      expect(result.current.showMobileSidebar).toBe(true)

      act(() => {
        result.current.toggleMobileSidebar()
      })
      expect(result.current.showMobileSidebar).toBe(false)
    })

    it('should expose sidebarRef for click-outside detection', () => {
      const { result } = renderHook(() => useTaskManagerLayout({ onRefresh: undefined, onSearchClear: undefined }))

      // Verify sidebarRef is available for components to use
      expect(result.current.sidebarRef).toBeDefined()
      expect(result.current.sidebarRef.current).toBe(null) // Initially null until attached
    })

  })

  describe('Mobile Search Handlers', () => {
    it('should call onSearchClear when handleMobileSearchClear is invoked', () => {
      const mockOnSearchClear = vi.fn()
      const { result } = renderHook(() =>
        useTaskManagerLayout({ onRefresh: undefined, onSearchClear: mockOnSearchClear })
      )

      act(() => {
        result.current.handleMobileSearchClear()
      })

      expect(mockOnSearchClear).toHaveBeenCalledTimes(1)
      expect(result.current.mobileSearchMode).toBe(false)
    })

    it('should call onSearchClear when Escape key is pressed in search', () => {
      const mockOnSearchClear = vi.fn()
      const { result } = renderHook(() =>
        useTaskManagerLayout({ onRefresh: undefined, onSearchClear: mockOnSearchClear })
      )

      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' }) as any

      act(() => {
        result.current.handleMobileSearchKeyDown(escapeEvent)
      })

      expect(mockOnSearchClear).toHaveBeenCalledTimes(1)
      expect(result.current.mobileSearchMode).toBe(false)
    })
  })
})
