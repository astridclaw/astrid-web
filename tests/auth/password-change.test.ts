import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'

// Mock the rate limiting
vi.mock('@/lib/rate-limiter', () => ({
  withRateLimitHandler: vi.fn((handler) => handler),
  passwordChangeRateLimiter: {
    checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 5, resetTime: Date.now() + 60000, total: 5 }))
  },
}))

// Mock NextAuth
const mockGetServerSession = vi.fn()
vi.mock('next-auth', () => ({
  getServerSession: mockGetServerSession,
}))

// Mock Prisma
const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}))

// Mock bcrypt
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
  hash: vi.fn(),
  compare: vi.fn(),
}))

describe('Password Change API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  const createMockRequest = (data: any): NextRequest => {
    return {
      json: vi.fn().mockResolvedValue(data),
      cookies: {
        get: vi.fn().mockReturnValue(undefined),
      },
      headers: new Headers({
        'x-forwarded-for': '127.0.0.1',
      }),
    } as any
  }

  const mockSession = {
    user: {
      id: 'user-123',
      email: 'test@example.com',
    },
  }

  describe('Authentication', () => {
    it('should require authentication', async () => {
      const { POST } = await import('@/app/api/account/change-password/route')
      
      mockGetServerSession.mockResolvedValue(null)

      const req = createMockRequest({
        currentPassword: 'oldpass',
        newPassword: 'newpass123'
      })

      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should allow authenticated users', async () => {
      const { POST } = await import('@/app/api/account/change-password/route')
      
      mockGetServerSession.mockResolvedValue(mockSession)
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        password: 'hashed-old-password'
      })
      ;(bcrypt.compare as any).mockResolvedValue(true)
      ;(bcrypt.hash as any).mockResolvedValue('hashed-new-password')
      mockPrisma.user.update.mockResolvedValue({ id: 'user-123' })

      const req = createMockRequest({
        currentPassword: 'oldpass',
        newPassword: 'newpass123'
      })

      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('Input Validation', () => {
    it('should require current password', async () => {
      const { POST } = await import('@/app/api/account/change-password/route')
      
      mockGetServerSession.mockResolvedValue(mockSession)

      const req = createMockRequest({
        newPassword: 'newpass123'
      })

      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Current password and new password are required')
    })

    it('should require new password', async () => {
      const { POST } = await import('@/app/api/account/change-password/route')
      
      mockGetServerSession.mockResolvedValue(mockSession)

      const req = createMockRequest({
        currentPassword: 'oldpass'
      })

      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Current password and new password are required')
    })

    it('should validate new password length', async () => {
      const { POST } = await import('@/app/api/account/change-password/route')
      
      mockGetServerSession.mockResolvedValue(mockSession)

      const req = createMockRequest({
        currentPassword: 'oldpass',
        newPassword: '123'
      })

      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('New password must be at least 6 characters long')
    })

    it('should accept valid password length', async () => {
      const { POST } = await import('@/app/api/account/change-password/route')
      
      mockGetServerSession.mockResolvedValue(mockSession)
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        password: 'hashed-old-password'
      })
      ;(bcrypt.compare as any).mockResolvedValue(true)
      ;(bcrypt.hash as any).mockResolvedValue('hashed-new-password')
      mockPrisma.user.update.mockResolvedValue({ id: 'user-123' })

      const req = createMockRequest({
        currentPassword: 'oldpass',
        newPassword: 'newpass123'
      })

      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('Password Verification', () => {
    it('should verify current password before allowing change', async () => {
      const { POST } = await import('@/app/api/account/change-password/route')
      
      mockGetServerSession.mockResolvedValue(mockSession)
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        password: 'hashed-old-password'
      })
      ;(bcrypt.compare as any).mockResolvedValue(false) // Wrong current password

      const req = createMockRequest({
        currentPassword: 'wrongpass',
        newPassword: 'newpass123'
      })

      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Current password is incorrect')
      
      // Verify bcrypt.compare was called
      expect(bcrypt.compare).toHaveBeenCalledWith('wrongpass', 'hashed-old-password')
      
      // Verify update was not called
      expect(mockPrisma.user.update).not.toHaveBeenCalled()
    })

    it('should allow change with correct current password', async () => {
      const { POST } = await import('@/app/api/account/change-password/route')
      
      mockGetServerSession.mockResolvedValue(mockSession)
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        password: 'hashed-old-password'
      })
      ;(bcrypt.compare as any).mockResolvedValue(true) // Correct current password
      ;(bcrypt.hash as any).mockResolvedValue('hashed-new-password')
      mockPrisma.user.update.mockResolvedValue({ id: 'user-123' })

      const req = createMockRequest({
        currentPassword: 'oldpass',
        newPassword: 'newpass123'
      })

      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      
      // Verify bcrypt.compare was called
      expect(bcrypt.compare).toHaveBeenCalledWith('oldpass', 'hashed-old-password')
      
      // Verify bcrypt.hash was called for new password
      expect(bcrypt.hash).toHaveBeenCalledWith('newpass123', 12)
    })
  })

  describe('User Account Types', () => {
    it('should only allow password changes for users with passwords', async () => {
      const { POST } = await import('@/app/api/account/change-password/route')
      
      mockGetServerSession.mockResolvedValue(mockSession)
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        password: null // OAuth user without password
      })

      const req = createMockRequest({
        currentPassword: 'oldpass',
        newPassword: 'newpass123'
      })

      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Password authentication not available for this account')
    })

    it('should allow password changes for users with passwords', async () => {
      const { POST } = await import('@/app/api/account/change-password/route')
      
      mockGetServerSession.mockResolvedValue(mockSession)
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        password: 'hashed-old-password'
      })
      ;(bcrypt.compare as any).mockResolvedValue(true)
      ;(bcrypt.hash as any).mockResolvedValue('hashed-new-password')
      mockPrisma.user.update.mockResolvedValue({ id: 'user-123' })

      const req = createMockRequest({
        currentPassword: 'oldpass',
        newPassword: 'newpass123'
      })

      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })

  describe('Password Update', () => {
    it('should update password in database', async () => {
      const { POST } = await import('@/app/api/account/change-password/route')
      
      mockGetServerSession.mockResolvedValue(mockSession)
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        password: 'hashed-old-password'
      })
      ;(bcrypt.compare as any).mockResolvedValue(true)
      ;(bcrypt.hash as any).mockResolvedValue('hashed-new-password')
      mockPrisma.user.update.mockResolvedValue({ id: 'user-123' })

      const req = createMockRequest({
        currentPassword: 'oldpass',
        newPassword: 'newpass123'
      })

      await POST(req)

      // Verify Prisma update was called with new hashed password
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { password: 'hashed-new-password' }
      })
    })

    it('should hash new password with correct salt rounds', async () => {
      const { POST } = await import('@/app/api/account/change-password/route')
      
      mockGetServerSession.mockResolvedValue(mockSession)
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        password: 'hashed-old-password'
      })
      ;(bcrypt.compare as any).mockResolvedValue(true)
      ;(bcrypt.hash as any).mockResolvedValue('hashed-new-password')
      mockPrisma.user.update.mockResolvedValue({ id: 'user-123' })

      const req = createMockRequest({
        currentPassword: 'oldpass',
        newPassword: 'newpass123'
      })

      await POST(req)

      // Verify bcrypt.hash was called with correct parameters
      expect(bcrypt.hash).toHaveBeenCalledWith('newpass123', 12)
    })
  })

  describe('Error Handling', () => {
    it('should handle user not found', async () => {
      const { POST } = await import('@/app/api/account/change-password/route')
      
      mockGetServerSession.mockResolvedValue(mockSession)
      mockPrisma.user.findUnique.mockResolvedValue(null)

      const req = createMockRequest({
        currentPassword: 'oldpass',
        newPassword: 'newpass123'
      })

      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('User not found')
    })

    it('should handle Prisma errors gracefully', async () => {
      const { POST } = await import('@/app/api/account/change-password/route')
      
      mockGetServerSession.mockResolvedValue(mockSession)
      mockPrisma.user.findUnique.mockRejectedValue(new Error('Database error'))

      const req = createMockRequest({
        currentPassword: 'oldpass',
        newPassword: 'newpass123'
      })

      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Internal server error')
    })

    it('should handle bcrypt errors gracefully', async () => {
      const { POST } = await import('@/app/api/account/change-password/route')
      
      mockGetServerSession.mockResolvedValue(mockSession)
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        password: 'hashed-old-password'
      })
      ;(bcrypt.compare as any).mockRejectedValue(new Error('Hashing error'))

      const req = createMockRequest({
        currentPassword: 'oldpass',
        newPassword: 'newpass123'
      })

      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Internal server error')
    })
  })
})
