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

// Mock offline sync - default to offline
vi.mock('@/lib/offline-sync', () => ({
  isOfflineMode: vi.fn(() => true),
  OfflineSyncManager: {
    queueMutation: vi.fn().mockResolvedValue(undefined)
  }
}))

// Mock offline db
vi.mock('@/lib/offline-db', () => ({
  OfflineTaskOperations: {
    saveTask: vi.fn().mockResolvedValue(undefined),
    getTask: vi.fn(),
    deleteTask: vi.fn()
  },
  OfflineListOperations: {
    getList: vi.fn().mockResolvedValue(null)
  }
}))

describe('useTaskOperations - Offline Bug Fixes', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      name: 'Test User',
      email: 'test@example.com',
      image: null
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Bug #2: Should set proper creator data from session', async () => {
    const { result } = renderHook(() => useTaskOperations({
      session: mockSession
    }))

    let createdTask: any
    await act(async () => {
      createdTask = await result.current.createTask({
        title: 'Test Task'
      })
    })

    expect(createdTask).toBeDefined()
    expect(createdTask.creator.id).toBe('user-123')
    expect(createdTask.creator.name).toBe('Test User')
    expect(createdTask.creator.email).toBe('test@example.com')
    expect(createdTask.creatorId).toBe('user-123')
  })

  it('Bug #3: Should use dueDateTime field in updates', async () => {
    const { OfflineTaskOperations } = await import('@/lib/offline-db')
    const existingTask = {
      id: 'task-123',
      title: 'Existing',
      dueDateTime: null,
      lists: [],
      completed: false,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    vi.mocked(OfflineTaskOperations.getTask).mockResolvedValue(existingTask as any)

    const { result } = renderHook(() => useTaskOperations({
      session: mockSession
    }))

    const newDueDate = new Date('2025-12-31')
    let updatedTask: any

    await act(async () => {
      updatedTask = await result.current.updateTask('task-123', {
        dueDate: newDueDate
      })
    })

    expect(updatedTask).toBeDefined()
    expect(updatedTask.dueDateTime).toEqual(newDueDate)
  })

  it('Should create complete offline task with all metadata', async () => {
    const { result } = renderHook(() => useTaskOperations({
      session: mockSession
    }))

    let createdTask: any
    await act(async () => {
      createdTask = await result.current.createTask({
        title: 'Complete Task',
        description: 'Full test',
        priority: 2,
        dueDate: new Date('2025-12-31')
      })
    })

    expect(createdTask).toBeDefined()
    expect(createdTask.id).toMatch(/^temp-/)
    expect(createdTask.title).toBe('Complete Task')
    expect(createdTask.description).toBe('Full test')
    expect(createdTask.priority).toBe(2)
    expect(createdTask.creator.id).toBe('user-123')
    expect(createdTask.creatorId).toBe('user-123')
    expect(createdTask.completed).toBe(false)
    expect(createdTask.dueDateTime).toBeInstanceOf(Date)
  })
})
