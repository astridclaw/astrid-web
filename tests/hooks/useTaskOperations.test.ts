import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTaskOperations } from '@/hooks/useTaskOperations'

// Mock the toast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn()
  })
}))

// Mock the API functions
vi.mock('@/lib/api', () => ({
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn()
}))

// Mock offline sync
vi.mock('@/lib/offline-sync', () => ({
  isOfflineMode: vi.fn(() => false), // Default to online
  OfflineSyncManager: {
    queueMutation: vi.fn()
  }
}))

// Mock offline db
vi.mock('@/lib/offline-db', () => ({
  OfflineTaskOperations: {
    saveTask: vi.fn(),
    getTask: vi.fn(),
    deleteTask: vi.fn()
  }
}))

describe('useTaskOperations', () => {
  const mockOnTaskCreated = vi.fn()
  const mockOnTaskUpdated = vi.fn()
  const mockOnTaskDeleted = vi.fn()
  const mockOnError = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should provide task operation functions', () => {
    const { result } = renderHook(() => useTaskOperations({
      onTaskCreated: mockOnTaskCreated,
      onTaskUpdated: mockOnTaskUpdated,
      onTaskDeleted: mockOnTaskDeleted,
      onError: mockOnError
    }))

    expect(result.current.createTask).toBeDefined()
    expect(result.current.updateTask).toBeDefined()
    expect(result.current.deleteTask).toBeDefined()
    expect(result.current.toggleTaskCompletion).toBeDefined()
  })

  it('should handle task creation', async () => {
    const { apiPost } = await import('@/lib/api')
    vi.mocked(apiPost).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: '1', title: 'New Task', completed: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    )

    const { result } = renderHook(() => useTaskOperations({
      onTaskCreated: mockOnTaskCreated
    }))

    await act(async () => {
      const task = await result.current.createTask({
        title: 'New Task',
        description: 'Test description'
      })
      
      expect(task).toEqual({ id: '1', title: 'New Task', completed: false })
      expect(mockOnTaskCreated).toHaveBeenCalledWith({ id: '1', title: 'New Task', completed: false })
    })
  })

  it('should handle task updates', async () => {
    const { apiPut } = await import('@/lib/api')
    vi.mocked(apiPut).mockResolvedValueOnce(
      new Response(JSON.stringify({
        task: { id: '1', title: 'Updated Task', completed: false }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    )

    const { result } = renderHook(() => useTaskOperations({
      onTaskUpdated: mockOnTaskUpdated
    }))

    await act(async () => {
      await result.current.updateTask('1', { title: 'Updated Task' })
      
      expect(mockOnTaskUpdated).toHaveBeenCalledWith({ id: '1', title: 'Updated Task', completed: false })
    })
  })

  it('should handle errors gracefully', async () => {
    const { apiPost } = await import('@/lib/api')
    vi.mocked(apiPost).mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useTaskOperations({
      onError: mockOnError
    }))

    await act(async () => {
      const task = await result.current.createTask({
        title: 'New Task'
      })
      
      expect(task).toBeNull()
      expect(mockOnError).toHaveBeenCalledWith("Network error")
    })
  })
})