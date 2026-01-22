import { describe, it, expect, beforeEach, vi } from "vitest"
import { calculateUserStats, updateUserStats, getUserStats } from "@/lib/user-stats"

// Mock the prisma singleton - must be inside factory function
vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      count: vi.fn(),
    },
    comment: {
      count: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

// Get reference to mocked prisma after mocking
import { prisma as mockPrisma } from "@/lib/prisma"

describe("User Statistics", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("calculateUserStats", () => {
    it("should calculate completed tasks count correctly", async () => {
      const userId = "user-123"

      vi.mocked(mockPrisma.task.count)
        .mockResolvedValueOnce(5) // completed tasks
        .mockResolvedValueOnce(3) // inspired tasks

      vi.mocked(mockPrisma.comment.count).mockResolvedValue(7) // supported tasks

      const stats = await calculateUserStats(userId)

      expect(stats.completedTasks).toBe(5)
      expect(stats.inspiredTasks).toBe(3)
      expect(stats.supportedTasks).toBe(7)
    })

    it("should calculate inspired tasks (completed by others)", async () => {
      const userId = "user-123"

      vi.mocked(mockPrisma.task.count)
        .mockResolvedValueOnce(0) // completed tasks
        .mockResolvedValueOnce(10) // inspired tasks (created by user, completed/copied by others)

      vi.mocked(mockPrisma.comment.count).mockResolvedValue(0)

      const stats = await calculateUserStats(userId)

      expect(stats.inspiredTasks).toBe(10)
    })

    it("should calculate supported tasks (comments on others' tasks)", async () => {
      const userId = "user-123"

      vi.mocked(mockPrisma.task.count)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)

      vi.mocked(mockPrisma.comment.count).mockResolvedValue(15)

      const stats = await calculateUserStats(userId)

      expect(stats.supportedTasks).toBe(15)
    })

    it("should return zero stats for new user with no activity", async () => {
      const userId = "new-user"

      vi.mocked(mockPrisma.task.count).mockResolvedValue(0)
      vi.mocked(mockPrisma.comment.count).mockResolvedValue(0)

      const stats = await calculateUserStats(userId)

      expect(stats.completedTasks).toBe(0)
      expect(stats.inspiredTasks).toBe(0)
      expect(stats.supportedTasks).toBe(0)
    })
  })

  describe("updateUserStats", () => {
    it("should calculate and save stats to database", async () => {
      const userId = "user-123"

      vi.mocked(mockPrisma.task.count)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(3)

      vi.mocked(mockPrisma.comment.count).mockResolvedValue(7)

      vi.mocked(mockPrisma.user.update).mockResolvedValue({
        id: userId,
        email: "test@example.com",
        statsCompletedTasks: 5,
        statsInspiredTasks: 3,
        statsSupportedTasks: 7,
        statsLastCalculated: new Date(),
      } as any)

      const stats = await updateUserStats(userId)

      expect(stats.completedTasks).toBe(5)
      expect(stats.inspiredTasks).toBe(3)
      expect(stats.supportedTasks).toBe(7)

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: expect.objectContaining({
          statsCompletedTasks: 5,
          statsInspiredTasks: 3,
          statsSupportedTasks: 7,
          statsLastCalculated: expect.any(Date),
        }),
      })
    })
  })

  describe("getUserStats", () => {
    it("should return cached stats if fresh (less than 24 hours old)", async () => {
      const userId = "user-123"
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)

      vi.mocked(mockPrisma.user.findUnique).mockResolvedValue({
        id: userId,
        statsCompletedTasks: 10,
        statsInspiredTasks: 5,
        statsSupportedTasks: 8,
        statsLastCalculated: twoHoursAgo,
      } as any)

      const stats = await getUserStats(userId)

      expect(stats.completedTasks).toBe(10)
      expect(stats.inspiredTasks).toBe(5)
      expect(stats.supportedTasks).toBe(8)

      // Should not trigger recalculation for fresh stats
      expect(mockPrisma.task.count).not.toHaveBeenCalled()
    })

    it("should trigger recalculation if stats are stale (older than 24 hours)", async () => {
      const userId = "user-123"
      const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000)

      vi.mocked(mockPrisma.user.findUnique).mockResolvedValue({
        id: userId,
        statsCompletedTasks: 10,
        statsInspiredTasks: 5,
        statsSupportedTasks: 8,
        statsLastCalculated: twoDaysAgo,
      } as any)

      // Mock recalculation
      vi.mocked(mockPrisma.task.count)
        .mockResolvedValueOnce(12)
        .mockResolvedValueOnce(6)

      vi.mocked(mockPrisma.comment.count).mockResolvedValue(9)

      vi.mocked(mockPrisma.user.update).mockResolvedValue({} as any)

      const stats = await getUserStats(userId)

      // Should return cached stats immediately
      expect(stats.completedTasks).toBe(10)
      expect(stats.inspiredTasks).toBe(5)
      expect(stats.supportedTasks).toBe(8)

      // Recalculation happens in background (don't wait for it)
      // Just verify it was triggered
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(mockPrisma.task.count).toHaveBeenCalled()
    })

    it("should trigger recalculation if stats were never calculated", async () => {
      const userId = "user-123"

      vi.mocked(mockPrisma.user.findUnique).mockResolvedValue({
        id: userId,
        statsCompletedTasks: 0,
        statsInspiredTasks: 0,
        statsSupportedTasks: 0,
        statsLastCalculated: null,
      } as any)

      vi.mocked(mockPrisma.task.count)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(2)

      vi.mocked(mockPrisma.comment.count).mockResolvedValue(4)

      vi.mocked(mockPrisma.user.update).mockResolvedValue({} as any)

      const stats = await getUserStats(userId)

      // Should return cached zeros initially
      expect(stats.completedTasks).toBe(0)
      expect(stats.inspiredTasks).toBe(0)
      expect(stats.supportedTasks).toBe(0)

      // Background recalculation should be triggered
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(mockPrisma.task.count).toHaveBeenCalled()
    })

    it("should throw error if user not found", async () => {
      const userId = "nonexistent-user"

      vi.mocked(mockPrisma.user.findUnique).mockResolvedValue(null)

      await expect(getUserStats(userId)).rejects.toThrow("User not found")
    })

    it("should force recalculation immediately when forceRefresh is true", async () => {
      const userId = "user-123"
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

      vi.mocked(mockPrisma.user.findUnique).mockResolvedValue({
        id: userId,
        statsCompletedTasks: 10,
        statsInspiredTasks: 5,
        statsSupportedTasks: 8,
        statsLastCalculated: oneHourAgo, // Fresh stats (less than 24 hours)
      } as any)

      // Mock recalculation with different values
      vi.mocked(mockPrisma.task.count)
        .mockResolvedValueOnce(15) // new completed tasks
        .mockResolvedValueOnce(7) // new inspired tasks

      vi.mocked(mockPrisma.comment.count).mockResolvedValue(12) // new supported tasks

      vi.mocked(mockPrisma.user.update).mockResolvedValue({} as any)

      const stats = await getUserStats(userId, true)

      // Should return freshly calculated stats, not cached ones
      expect(stats.completedTasks).toBe(15)
      expect(stats.inspiredTasks).toBe(7)
      expect(stats.supportedTasks).toBe(12)

      // Should have called update immediately
      expect(mockPrisma.task.count).toHaveBeenCalled()
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: expect.objectContaining({
          statsCompletedTasks: 15,
          statsInspiredTasks: 7,
          statsSupportedTasks: 12,
          statsLastCalculated: expect.any(Date),
        }),
      })
    })

    it("should use cached stats when forceRefresh is false (default)", async () => {
      const userId = "user-123"
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

      vi.mocked(mockPrisma.user.findUnique).mockResolvedValue({
        id: userId,
        statsCompletedTasks: 10,
        statsInspiredTasks: 5,
        statsSupportedTasks: 8,
        statsLastCalculated: oneHourAgo, // Fresh stats
      } as any)

      const stats = await getUserStats(userId, false)

      // Should return cached stats
      expect(stats.completedTasks).toBe(10)
      expect(stats.inspiredTasks).toBe(5)
      expect(stats.supportedTasks).toBe(8)

      // Should not trigger recalculation
      expect(mockPrisma.task.count).not.toHaveBeenCalled()
    })
  })
})
