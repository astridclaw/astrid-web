/**
 * Regression test for task counting utilities
 * Ensures that task counts correctly exclude completed tasks when requested
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getMultipleListTaskCounts, getListTaskCount } from '@/lib/task-count-utils'
import { prisma } from '@/lib/prisma'

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    task: {
      findMany: vi.fn(),
      count: vi.fn()
    }
  }
}))

describe('Task Count Utils - Incomplete Task Counting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getMultipleListTaskCounts', () => {
    it('should only count incomplete tasks when includeCompleted is false', async () => {
      // Setup: List with both completed and incomplete tasks
      const mockTasks = [
        {
          id: 'task1',
          completed: false,
          isPrivate: false,
          lists: [{ id: 'list1' }]
        },
        {
          id: 'task2',
          completed: false,
          isPrivate: false,
          lists: [{ id: 'list1' }]
        },
        {
          id: 'task3',
          completed: true, // This should be excluded
          isPrivate: false,
          lists: [{ id: 'list1' }]
        },
        {
          id: 'task4',
          completed: true, // This should be excluded
          isPrivate: false,
          lists: [{ id: 'list1' }]
        }
      ]

      // Mock to return only incomplete tasks (simulating the where clause)
      const incompleteTasks = mockTasks.filter(t => !t.completed)
      vi.mocked(prisma.task.findMany).mockResolvedValue(incompleteTasks as any)

      const counts = await getMultipleListTaskCounts(['list1'], {
        includeCompleted: false,
        includePrivate: true,
        isPublicContext: false
      })

      // Verify: Should only count 2 incomplete tasks, not all 4
      expect(counts['list1']).toBe(2)

      // Verify the correct where clause was used
      expect(prisma.task.findMany).toHaveBeenCalledWith({
        where: {
          completed: false,
          lists: {
            some: {
              id: {
                in: ['list1']
              }
            }
          }
        },
        select: {
          id: true,
          lists: {
            select: {
              id: true
            },
            where: {
              id: {
                in: ['list1']
              }
            }
          }
        }
      })
    })

    it('should count all tasks when includeCompleted is true', async () => {
      const mockTasks = [
        {
          id: 'task1',
          completed: false,
          isPrivate: false,
          lists: [{ id: 'list1' }]
        },
        {
          id: 'task2',
          completed: true,
          isPrivate: false,
          lists: [{ id: 'list1' }]
        }
      ]

      vi.mocked(prisma.task.findMany).mockResolvedValue(mockTasks as any)

      const counts = await getMultipleListTaskCounts(['list1'], {
        includeCompleted: true,
        includePrivate: true,
        isPublicContext: false
      })

      // Should count both completed and incomplete tasks
      expect(counts['list1']).toBe(2)
    })

    it('should handle multiple lists with mixed completed/incomplete tasks', async () => {
      const mockTasks = [
        {
          id: 'task1',
          completed: false,
          lists: [{ id: 'list1' }]
        },
        {
          id: 'task2',
          completed: false,
          lists: [{ id: 'list2' }]
        },
        {
          id: 'task3',
          completed: false,
          lists: [{ id: 'list2' }]
        },
        {
          id: 'task4',
          completed: false,
          lists: [{ id: 'list3' }]
        }
      ]

      vi.mocked(prisma.task.findMany).mockResolvedValue(mockTasks as any)

      const counts = await getMultipleListTaskCounts(['list1', 'list2', 'list3'], {
        includeCompleted: false,
        includePrivate: true,
        isPublicContext: false
      })

      expect(counts['list1']).toBe(1)
      expect(counts['list2']).toBe(2)
      expect(counts['list3']).toBe(1)
    })

    it('should handle public context with incomplete tasks only', async () => {
      const mockTasks = [
        {
          id: 'task1',
          completed: false,
          isPrivate: false,
          lists: [{ id: 'public-list-1' }]
        },
        {
          id: 'task2',
          completed: false,
          isPrivate: false,
          lists: [{ id: 'public-list-1' }]
        }
      ]

      vi.mocked(prisma.task.findMany).mockResolvedValue(mockTasks as any)

      const counts = await getMultipleListTaskCounts(['public-list-1'], {
        includeCompleted: false,
        includePrivate: true,
        isPublicContext: true
      })

      expect(counts['public-list-1']).toBe(2)

      // Verify that both isPrivate and completed filters were applied
      expect(prisma.task.findMany).toHaveBeenCalledWith({
        where: {
          isPrivate: false,
          completed: false,
          lists: {
            some: {
              id: {
                in: ['public-list-1']
              }
            }
          }
        },
        select: expect.any(Object)
      })
    })
  })

  describe('getListTaskCount', () => {
    it('should only count incomplete tasks when includeCompleted is false', async () => {
      vi.mocked(prisma.task.count).mockResolvedValue(3)

      const count = await getListTaskCount('list1', {
        includeCompleted: false,
        includePrivate: true,
        isPublicContext: false
      })

      expect(count).toBe(3)
      expect(prisma.task.count).toHaveBeenCalledWith({
        where: {
          lists: {
            some: {
              id: 'list1'
            }
          },
          completed: false
        }
      })
    })

    it('should count all tasks when includeCompleted is true', async () => {
      vi.mocked(prisma.task.count).mockResolvedValue(5)

      const count = await getListTaskCount('list1', {
        includeCompleted: true,
        includePrivate: true,
        isPublicContext: false
      })

      expect(count).toBe(5)
      expect(prisma.task.count).toHaveBeenCalledWith({
        where: {
          lists: {
            some: {
              id: 'list1'
            }
          }
        }
      })
    })

    it('should handle public context correctly', async () => {
      vi.mocked(prisma.task.count).mockResolvedValue(2)

      const count = await getListTaskCount('public-list-1', {
        includeCompleted: false,
        isPublicContext: true
      })

      expect(count).toBe(2)
      expect(prisma.task.count).toHaveBeenCalledWith({
        where: {
          lists: {
            some: {
              id: 'public-list-1'
            }
          },
          isPrivate: false,
          completed: false
        }
      })
    })

    it('should return 0 on error', async () => {
      vi.mocked(prisma.task.count).mockRejectedValue(new Error('Database error'))

      const count = await getListTaskCount('list1', {
        includeCompleted: false
      })

      expect(count).toBe(0)
    })
  })
})
