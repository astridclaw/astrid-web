/**
 * Placeholder User Service Tests
 *
 * Tests for creating, finding, and upgrading placeholder users
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { placeholderUserService } from '@/lib/placeholder-user-service'
import { prisma } from '@/lib/prisma'

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    invitation: {
      create: vi.fn(),
    },
  },
}))

// Mock email service
vi.mock('@/lib/email', () => ({
  sendInvitationEmail: vi.fn(),
}))

describe('PlaceholderUserService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('findUserByEmail', () => {
    it('should find existing user by email', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'existing@example.com',
        name: 'Existing User',
        isPlaceholder: false,
      }

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)

      const result = await placeholderUserService.findUserByEmail('existing@example.com')

      expect(result).toEqual(mockUser)
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'existing@example.com' }
      })
    })

    it('should return null if user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

      const result = await placeholderUserService.findUserByEmail('nonexistent@example.com')

      expect(result).toBeNull()
    })

    it('should normalize email to lowercase', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

      await placeholderUserService.findUserByEmail('Test@EXAMPLE.COM')

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' }
      })
    })
  })

  describe('findOrCreatePlaceholderUser', () => {
    it('should return existing user if found', async () => {
      const existingUser = {
        id: 'user-1',
        email: 'existing@example.com',
        name: 'Existing User',
        isPlaceholder: false,
      }

      vi.mocked(prisma.user.findUnique).mockResolvedValue(existingUser as any)

      const result = await placeholderUserService.findOrCreatePlaceholderUser({
        email: 'existing@example.com',
        invitedBy: 'inviter-1',
      })

      expect(result).toEqual(existingUser)
      expect(prisma.user.create).not.toHaveBeenCalled()
    })

    it('should create placeholder user if not found', async () => {
      const newPlaceholderUser = {
        id: 'user-2',
        email: 'new@example.com',
        name: 'New',
        isPlaceholder: true,
        invitedBy: 'inviter-1',
      }

      // First call: findUserByEmail returns null (user doesn't exist)
      // Second call: findUnique for inviter
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce(null) // First call - user doesn't exist
        .mockResolvedValueOnce({ // Second call - get inviter
          id: 'inviter-1',
          name: 'Inviter',
          email: 'inviter@example.com',
        } as any)
      vi.mocked(prisma.user.create).mockResolvedValue(newPlaceholderUser as any)
      vi.mocked(prisma.invitation.create).mockResolvedValue({} as any)

      const result = await placeholderUserService.findOrCreatePlaceholderUser({
        email: 'new@example.com',
        invitedBy: 'inviter-1',
      })

      expect(result).toEqual(newPlaceholderUser)
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'new@example.com',
          name: 'New',
          isPlaceholder: true,
          invitedBy: 'inviter-1',
        })
      })
    })

    it('should extract name from email', async () => {
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce(null) // First call - user doesn't exist
        .mockResolvedValueOnce({ // Second call - get inviter
          id: 'inviter-1',
          name: 'Inviter',
          email: 'inviter@example.com',
        } as any)
      vi.mocked(prisma.user.create).mockResolvedValue({
        id: 'user-3',
        email: 'john.doe@example.com',
        name: 'John Doe',
        isPlaceholder: true,
      } as any)
      vi.mocked(prisma.invitation.create).mockResolvedValue({} as any)

      await placeholderUserService.findOrCreatePlaceholderUser({
        email: 'john.doe@example.com',
        invitedBy: 'inviter-1',
      })

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'John Doe',
        })
      })
    })

    it('should use provided name if given', async () => {
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce(null) // First call - user doesn't exist
        .mockResolvedValueOnce({ // Second call - get inviter
          id: 'inviter-1',
          name: 'Inviter',
          email: 'inviter@example.com',
        } as any)
      vi.mocked(prisma.user.create).mockResolvedValue({
        id: 'user-4',
        email: 'custom@example.com',
        name: 'Custom Name',
        isPlaceholder: true,
      } as any)
      vi.mocked(prisma.invitation.create).mockResolvedValue({} as any)

      await placeholderUserService.findOrCreatePlaceholderUser({
        email: 'custom@example.com',
        name: 'Custom Name',
        invitedBy: 'inviter-1',
      })

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Custom Name',
        })
      })
    })
  })

  describe('upgradePlaceholderToFullUser', () => {
    it('should upgrade placeholder user to full user', async () => {
      const upgradedUser = {
        id: 'user-1',
        email: 'placeholder@example.com',
        name: 'Full User',
        isPlaceholder: false,
        invitedBy: null,
        password: 'hashed-password',
        emailVerified: new Date(),
      }

      vi.mocked(prisma.user.update).mockResolvedValue(upgradedUser as any)

      const result = await placeholderUserService.upgradePlaceholderToFullUser('user-1', {
        name: 'Full User',
        password: 'hashed-password',
        emailVerified: new Date(),
      })

      expect(result.isPlaceholder).toBe(false)
      expect(result.invitedBy).toBeNull()
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          isPlaceholder: false,
          invitedBy: null,
        })
      })
    })
  })

  describe('canUpgradePlaceholder', () => {
    it('should return true if user is placeholder', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user-1',
        email: 'placeholder@example.com',
        isPlaceholder: true,
      } as any)

      const result = await placeholderUserService.canUpgradePlaceholder('placeholder@example.com')

      expect(result.canUpgrade).toBe(true)
      expect(result.placeholderUser).toBeTruthy()
    })

    it('should return false if user is not placeholder', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user-1',
        email: 'real@example.com',
        isPlaceholder: false,
      } as any)

      const result = await placeholderUserService.canUpgradePlaceholder('real@example.com')

      expect(result.canUpgrade).toBe(false)
      expect(result.placeholderUser).toBeNull()
    })

    it('should return false if user does not exist', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

      const result = await placeholderUserService.canUpgradePlaceholder('nonexistent@example.com')

      expect(result.canUpgrade).toBe(false)
      expect(result.placeholderUser).toBeNull()
    })
  })

  describe('findOrCreateMultiplePlaceholderUsers', () => {
    it('should create multiple placeholder users', async () => {
      const emails = ['user1@example.com', 'user2@example.com', 'user3@example.com']

      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce(null) // user1 not found
        .mockResolvedValueOnce(null) // user2 not found
        .mockResolvedValueOnce({     // user3 exists
          id: 'existing-3',
          email: 'user3@example.com',
          isPlaceholder: false,
        } as any)

      vi.mocked(prisma.user.create)
        .mockResolvedValueOnce({ id: 'user-1', email: 'user1@example.com', isPlaceholder: true } as any)
        .mockResolvedValueOnce({ id: 'user-2', email: 'user2@example.com', isPlaceholder: true } as any)

      vi.mocked(prisma.user.findUnique)
        .mockResolvedValue({ id: 'inviter-1', name: 'Inviter', email: 'inviter@example.com' } as any)
      vi.mocked(prisma.invitation.create).mockResolvedValue({} as any)

      const result = await placeholderUserService.findOrCreateMultiplePlaceholderUsers(
        emails,
        'inviter-1'
      )

      expect(result).toHaveLength(3)
      expect(prisma.user.create).toHaveBeenCalledTimes(2) // Only for user1 and user2
    })
  })
})
