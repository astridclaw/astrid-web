import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock the rate limiting
vi.mock('@/lib/rate-limiter', () => ({
  withRateLimitHandler: vi.fn((handler) => handler),
  signupRateLimiter: {
    checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 5, resetTime: Date.now() + 60000, total: 5 }))
  },
}))

// Mock Prisma
const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
}

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}))

// Mock bcrypt
const mockBcrypt = {
  hash: vi.fn().mockResolvedValue('hashed_password_123'),
  compare: vi.fn().mockResolvedValue(true),
}
vi.mock('bcryptjs', () => ({
  default: mockBcrypt,
  ...mockBcrypt
}))

// Mock email verification
vi.mock('@/lib/email-verification', () => ({
  sendEmailVerification: vi.fn().mockResolvedValue(true),
}))

// Mock placeholder user service
const mockPlaceholderUserService = {
  canUpgradePlaceholder: vi.fn(),
  upgradePlaceholderToFullUser: vi.fn(),
}
vi.mock('@/lib/placeholder-user-service', () => ({
  placeholderUserService: mockPlaceholderUserService,
}))

// Mock default lists
vi.mock('@/lib/default-lists', () => ({
  createDefaultListsForUser: vi.fn().mockResolvedValue(true),
}))

describe('Signup API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // Generate unique IPs to avoid rate limit state leakage between tests
  let testIpCounter = 200
  const getTestIP = () => `10.2.${Math.floor(testIpCounter / 256)}.${testIpCounter++ % 256}`

  const createMockRequest = (data: any): NextRequest => {
    return {
      json: vi.fn().mockResolvedValue(data),
      headers: new Headers({
        'x-forwarded-for': getTestIP(),
      }),
    } as any
  }

  describe('Input Validation', () => {
    it('should require email', async () => {
      // Import the actual handler function
      const { POST } = await import('@/app/api/auth/signup/route')
      const req = createMockRequest({})

      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Email is required')
    })

    it('should require email even with password', async () => {
      const { POST } = await import('@/app/api/auth/signup/route')
      const req = createMockRequest({ password: 'password123' })

      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Email is required')
    })

    it('should allow passwordless signup (email only)', async () => {
      const { POST } = await import('@/app/api/auth/signup/route')

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: null,
        emailVerified: null,
        createdAt: new Date(),
      }

      mockPlaceholderUserService.canUpgradePlaceholder.mockResolvedValue({
        canUpgrade: false,
        placeholderUser: null,
      })
      mockPrisma.user.findUnique.mockResolvedValue(null)
      mockPrisma.user.create.mockResolvedValue(mockUser)

      const req = createMockRequest({ email: 'test@example.com' })

      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.user.email).toBe('test@example.com')

      // Verify password was not hashed (null)
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'test@example.com',
          password: null,
        }),
        select: expect.any(Object)
      })
    })

    it('should validate password length', async () => {
      const { POST } = await import('@/app/api/auth/signup/route')
      const req = createMockRequest({ 
        email: 'test@example.com', 
        password: '123' 
      })

      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Password must be at least 6 characters long')
    })

    it('should validate email format', async () => {
      const { POST } = await import('@/app/api/auth/signup/route')
      const req = createMockRequest({ 
        email: 'invalid-email', 
        password: 'password123' 
      })

      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid email format')
    })
  })

  describe('User Creation', () => {
    it('should create user with valid data', async () => {
      const { POST } = await import('@/app/api/auth/signup/route')

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        emailVerified: new Date(),
        createdAt: new Date(),
      }

      mockPlaceholderUserService.canUpgradePlaceholder.mockResolvedValue({
        canUpgrade: false,
        placeholderUser: null,
      })
      mockPrisma.user.findUnique.mockResolvedValue(null)
      mockPrisma.user.create.mockResolvedValue(mockUser)
      mockBcrypt.hash.mockResolvedValue('hashed-password')

      const req = createMockRequest({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User'
      })

      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toBe('User created successfully')
      expect(data.user.email).toBe('test@example.com')
      expect(data.user.name).toBe('Test User')
      expect(data.user.emailVerified).toBeDefined()

      // Verify bcrypt was called
      expect(mockBcrypt.hash).toHaveBeenCalledWith('password123', 12)
      
      // Verify Prisma create was called with correct data
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'test@example.com',
          password: 'hashed-password',
          name: 'Test User',
        },
        select: {
          id: true,
          email: true,
          name: true,
          emailVerified: true,
          createdAt: true,
        }
      })
    })

    it('should create user without name', async () => {
      const { POST } = await import('@/app/api/auth/signup/route')
      
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: null,
        emailVerified: new Date(),
        createdAt: new Date(),
      }

      mockPlaceholderUserService.canUpgradePlaceholder.mockResolvedValue({
        canUpgrade: false,
        placeholderUser: null,
      })
      mockPrisma.user.findUnique.mockResolvedValue(null)
      mockPrisma.user.create.mockResolvedValue(mockUser)
      mockBcrypt.hash.mockResolvedValue('hashed-password')

      const req = createMockRequest({
        email: 'test@example.com',
        password: 'password123'
      })

      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.user.name).toBe(null)
    })

    it('should convert email to lowercase', async () => {
      const { POST } = await import('@/app/api/auth/signup/route')
      
      const mockUser = {
        id: 'user-123',
        email: 'TEST@EXAMPLE.COM',
        name: null,
        emailVerified: new Date(),
        createdAt: new Date(),
      }

      mockPlaceholderUserService.canUpgradePlaceholder.mockResolvedValue({
        canUpgrade: false,
        placeholderUser: null,
      })
      mockPrisma.user.findUnique.mockResolvedValue(null)
      mockPrisma.user.create.mockResolvedValue(mockUser)
      mockBcrypt.hash.mockResolvedValue('hashed-password')

      const req = createMockRequest({
        email: 'TEST@EXAMPLE.COM',
        password: 'password123'
      })

      await POST(req)

      // Verify email was converted to lowercase
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'test@example.com',
        }),
        select: expect.any(Object)
      })
    })
  })

  describe('Duplicate User Handling', () => {
    it('should prevent duplicate email signup', async () => {
      const { POST } = await import('@/app/api/auth/signup/route')
      
      const existingUser = {
        id: 'existing-user',
        email: 'test@example.com',
        name: 'Existing User',
        isPlaceholder: false,
      }

      // Mock canUpgradePlaceholder to return existing user but not upgradeable
      mockPlaceholderUserService.canUpgradePlaceholder.mockResolvedValue({
        canUpgrade: false,
        placeholderUser: existingUser,
      })

      const req = createMockRequest({
        email: 'test@example.com',
        password: 'password123',
        name: 'New User'
      })

      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.error).toBe('User with this email already exists')
      
      // Verify Prisma create was not called
      expect(mockPrisma.user.create).not.toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle Prisma errors gracefully', async () => {
      const { POST } = await import('@/app/api/auth/signup/route')

      mockPlaceholderUserService.canUpgradePlaceholder.mockRejectedValue(new Error('Database error'))

      const req = createMockRequest({
        email: 'test@example.com',
        password: 'password123'
      })

      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Internal server error')
    })

    it('should handle bcrypt errors gracefully', async () => {
      const { POST } = await import('@/app/api/auth/signup/route')

      mockPlaceholderUserService.canUpgradePlaceholder.mockResolvedValue({
        canUpgrade: false,
        placeholderUser: null,
      })
      mockBcrypt.hash.mockRejectedValue(new Error('Hashing error'))

      const req = createMockRequest({
        email: 'test@example.com',
        password: 'password123'
      })

      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Internal server error')
    })
  })
})
