import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma before importing the module
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}))

// Mock email sending
vi.mock('@/lib/email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}))

// Mock system tasks
vi.mock('@/lib/system-tasks', () => ({
  completeVerifyEmailTask: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from '@/lib/prisma'
import {
  verifyEmailToken,
  sendEmailVerification,
  resendVerificationEmail,
  cancelEmailChange,
  checkEmailVerificationStatus,
} from '@/lib/email-verification'
import { sendVerificationEmail as sendEmail } from '@/lib/email'

describe('Email Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('verifyEmailToken', () => {
    it('should return error for invalid token', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null)

      const result = await verifyEmailToken('invalid-token')

      expect(result.success).toBe(false)
      expect(result.message).toBe('Invalid or expired verification token')
    })

    it('should return error for expired token', async () => {
      // findFirst returns null when token is expired (gt: new Date() fails)
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null)

      const result = await verifyEmailToken('expired-token')

      expect(result.success).toBe(false)
      expect(result.message).toBe('Invalid or expired verification token')
    })

    it('should verify email successfully with valid token', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        pendingEmail: null,
        emailVerificationToken: 'valid-token',
        emailTokenExpiresAt: new Date(Date.now() + 3600000),
      }
      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser as any)
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser as any)

      const result = await verifyEmailToken('valid-token')

      expect(result.success).toBe(true)
      expect(result.message).toBe('Email verified successfully')
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: expect.objectContaining({
          emailVerificationToken: null,
          emailTokenExpiresAt: null,
          emailVerified: expect.any(Date),
        }),
      })
    })

    it('should update email when verifying email change', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'old@example.com',
        pendingEmail: 'new@example.com',
        emailVerificationToken: 'valid-token',
        emailTokenExpiresAt: new Date(Date.now() + 3600000),
      }
      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser as any)
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser as any)

      const result = await verifyEmailToken('valid-token')

      expect(result.success).toBe(true)
      expect(result.message).toBe('Email address updated and verified successfully')
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: expect.objectContaining({
          email: 'new@example.com',
          pendingEmail: null,
        }),
      })
    })

    it('should handle database errors gracefully', async () => {
      vi.mocked(prisma.user.findFirst).mockRejectedValue(new Error('DB error'))

      const result = await verifyEmailToken('some-token')

      expect(result.success).toBe(false)
      expect(result.message).toBe('Email verification failed')
    })
  })

  describe('sendEmailVerification', () => {
    it('should return error for non-existent user', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

      const result = await sendEmailVerification('non-existent-user')

      expect(result.success).toBe(false)
      expect(result.message).toBe('User not found')
    })

    it('should send verification email successfully', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        pendingEmail: null,
      }
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser as any)

      const result = await sendEmailVerification('user-123')

      expect(result.success).toBe(true)
      expect(result.message).toBe('Verification email sent')
      expect(result.requiresVerification).toBe(true)
      expect(sendEmail).toHaveBeenCalled()
    })

    it('should handle email change verification', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'old@example.com',
        name: 'Test User',
        pendingEmail: null,
      }
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser as any)

      const result = await sendEmailVerification('user-123', 'new@example.com', true)

      expect(result.success).toBe(true)
      expect(result.message).toBe('Verification email sent to new@example.com')
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: expect.objectContaining({
          pendingEmail: 'new@example.com',
        }),
      })
    })
  })

  describe('cancelEmailChange', () => {
    it('should cancel pending email change', async () => {
      vi.mocked(prisma.user.update).mockResolvedValue({} as any)

      const result = await cancelEmailChange('user-123')

      expect(result.success).toBe(true)
      expect(result.message).toBe('Email change cancelled')
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          pendingEmail: null,
          emailVerificationToken: null,
          emailTokenExpiresAt: null,
        },
      })
    })

    it('should handle errors gracefully', async () => {
      vi.mocked(prisma.user.update).mockRejectedValue(new Error('DB error'))

      const result = await cancelEmailChange('user-123')

      expect(result.success).toBe(false)
      expect(result.message).toBe('Failed to cancel email change')
    })
  })

  describe('checkEmailVerificationStatus', () => {
    it('should return unverified for non-existent user', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

      const result = await checkEmailVerificationStatus('non-existent')

      expect(result.verified).toBe(false)
      expect(result.hasPendingChange).toBe(false)
      expect(result.hasPendingVerification).toBe(false)
    })

    it('should return verified for OAuth users', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        emailVerified: null,
        pendingEmail: null,
        emailVerificationToken: null,
        emailTokenExpiresAt: null,
        accounts: [{ provider: 'google' }],
      } as any)

      const result = await checkEmailVerificationStatus('user-123')

      expect(result.verified).toBe(true)
      expect(result.verifiedViaOAuth).toBe(true)
    })

    it('should return verified for email-verified users', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        emailVerified: new Date(),
        pendingEmail: null,
        emailVerificationToken: null,
        emailTokenExpiresAt: null,
        accounts: [],
      } as any)

      const result = await checkEmailVerificationStatus('user-123')

      expect(result.verified).toBe(true)
    })

    it('should detect pending email change', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        emailVerified: new Date(),
        pendingEmail: 'new@example.com',
        emailVerificationToken: 'token',
        emailTokenExpiresAt: new Date(Date.now() + 3600000),
        accounts: [],
      } as any)

      const result = await checkEmailVerificationStatus('user-123')

      expect(result.hasPendingChange).toBe(true)
      expect(result.pendingEmail).toBe('new@example.com')
      expect(result.hasPendingVerification).toBe(true)
    })

    it('should detect expired verification token', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        emailVerified: null,
        pendingEmail: null,
        emailVerificationToken: 'token',
        emailTokenExpiresAt: new Date(Date.now() - 3600000), // Expired
        accounts: [],
      } as any)

      const result = await checkEmailVerificationStatus('user-123')

      expect(result.hasPendingVerification).toBe(false)
    })
  })

  describe('resendVerificationEmail', () => {
    it('should not resend if already verified with no pending change', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        emailVerified: new Date(),
        pendingEmail: null,
        emailVerificationToken: null,
        emailTokenExpiresAt: null,
        accounts: [],
      } as any)

      const result = await resendVerificationEmail('user-123')

      expect(result.success).toBe(false)
      expect(result.message).toBe('Email is already verified')
    })

    it('should resend for unverified users', async () => {
      // First call for checkEmailVerificationStatus
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce({
          emailVerified: null,
          pendingEmail: null,
          emailVerificationToken: null,
          emailTokenExpiresAt: null,
          accounts: [],
        } as any)
        // Second call for resendVerificationEmail's own findUnique
        .mockResolvedValueOnce({
          pendingEmail: null,
        } as any)
        // Third call for sendEmailVerification
        .mockResolvedValueOnce({
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test',
          pendingEmail: null,
        } as any)

      vi.mocked(prisma.user.update).mockResolvedValue({} as any)

      const result = await resendVerificationEmail('user-123')

      expect(result.success).toBe(true)
    })
  })
})
