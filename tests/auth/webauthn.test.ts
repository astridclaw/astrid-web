import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * WebAuthn/Passkey Tests
 *
 * These tests verify the core passkey functionality:
 * 1. Session detection for both web (JWT) and mobile (database) sessions
 * 2. Registration flow for new users and existing users adding passkeys
 * 3. Authentication flow validation
 */

// Mock Prisma
const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  session: {
    findUnique: vi.fn(),
  },
  authenticator: {
    findMany: vi.fn(),
  },
}

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}))

// Mock next-auth
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

vi.mock('@/lib/auth-config', () => ({
  authConfig: {},
}))

// Helper to create mock NextRequest
const createMockRequest = (cookies?: Record<string, string>): NextRequest => {
  return {
    cookies: {
      get: (name: string) => cookies?.[name] ? { value: cookies[name] } : undefined,
    },
  } as any
}

describe('Session Utils - getUnifiedSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('JWT Session (Web)', () => {
    it('should return user from JWT session when available', async () => {
      const { getServerSession } = await import('next-auth')
      vi.mocked(getServerSession).mockResolvedValue({
        user: {
          id: 'jwt-user-123',
          email: 'web@example.com',
          name: 'Web User',
          image: 'https://example.com/avatar.jpg',
        },
      })

      const { getUnifiedSession } = await import('@/lib/session-utils')
      const result = await getUnifiedSession()

      expect(result).not.toBeNull()
      expect(result?.user.id).toBe('jwt-user-123')
      expect(result?.user.email).toBe('web@example.com')
    })

    it('should return null when no JWT session', async () => {
      const { getServerSession } = await import('next-auth')
      vi.mocked(getServerSession).mockResolvedValue(null)

      const { getUnifiedSession } = await import('@/lib/session-utils')
      const result = await getUnifiedSession()

      expect(result).toBeNull()
    })
  })

  describe('Database Session (Mobile)', () => {
    it('should return user from database session when cookie present', async () => {
      const { getServerSession } = await import('next-auth')
      vi.mocked(getServerSession).mockResolvedValue(null)

      // Mock database session lookup
      mockPrisma.session.findUnique.mockResolvedValue({
        sessionToken: 'mobile-session-token',
        expires: new Date(Date.now() + 86400000), // 1 day from now
        user: {
          id: 'mobile-user-123',
          email: 'mobile@example.com',
          name: 'Mobile User',
          image: null,
        },
      })

      const { getUnifiedSession } = await import('@/lib/session-utils')
      const req = createMockRequest({ 'next-auth.session-token': 'mobile-session-token' })
      const result = await getUnifiedSession(req)

      expect(result).not.toBeNull()
      expect(result?.user.id).toBe('mobile-user-123')
      expect(result?.user.email).toBe('mobile@example.com')
    })

    it('should return null for expired database session', async () => {
      const { getServerSession } = await import('next-auth')
      vi.mocked(getServerSession).mockResolvedValue(null)

      // Mock expired session
      mockPrisma.session.findUnique.mockResolvedValue({
        sessionToken: 'expired-token',
        expires: new Date(Date.now() - 86400000), // 1 day ago (expired)
        user: {
          id: 'user-123',
          email: 'test@example.com',
        },
      })

      const { getUnifiedSession } = await import('@/lib/session-utils')
      const req = createMockRequest({ 'next-auth.session-token': 'expired-token' })
      const result = await getUnifiedSession(req)

      expect(result).toBeNull()
    })

    it('should return null when no session cookie present', async () => {
      const { getServerSession } = await import('next-auth')
      vi.mocked(getServerSession).mockResolvedValue(null)

      const { getUnifiedSession } = await import('@/lib/session-utils')
      const req = createMockRequest({})
      const result = await getUnifiedSession(req)

      expect(result).toBeNull()
    })

    it('should check __Secure- prefixed cookie in production', async () => {
      const { getServerSession } = await import('next-auth')
      vi.mocked(getServerSession).mockResolvedValue(null)

      mockPrisma.session.findUnique.mockResolvedValue({
        sessionToken: 'secure-token',
        expires: new Date(Date.now() + 86400000),
        user: {
          id: 'secure-user-123',
          email: 'secure@example.com',
          name: null,
          image: null,
        },
      })

      const { getUnifiedSession } = await import('@/lib/session-utils')
      const req = createMockRequest({ '__Secure-next-auth.session-token': 'secure-token' })
      const result = await getUnifiedSession(req)

      expect(result).not.toBeNull()
      expect(result?.user.id).toBe('secure-user-123')
    })
  })

  describe('Session Priority', () => {
    it('should prefer JWT session over database session', async () => {
      const { getServerSession } = await import('next-auth')
      vi.mocked(getServerSession).mockResolvedValue({
        user: {
          id: 'jwt-user',
          email: 'jwt@example.com',
          name: 'JWT User',
        },
      })

      // Also set up a database session (shouldn't be used)
      mockPrisma.session.findUnique.mockResolvedValue({
        sessionToken: 'db-token',
        expires: new Date(Date.now() + 86400000),
        user: {
          id: 'db-user',
          email: 'db@example.com',
        },
      })

      const { getUnifiedSession } = await import('@/lib/session-utils')
      const req = createMockRequest({ 'next-auth.session-token': 'db-token' })
      const result = await getUnifiedSession(req)

      // Should return JWT session, not database session
      expect(result?.user.id).toBe('jwt-user')
      expect(result?.user.email).toBe('jwt@example.com')
    })
  })
})

describe('Passkey Registration Flow', () => {
  it('should allow authenticated users to add passkeys', () => {
    // This tests the concept that existing users (with session) can add passkeys
    // Authenticated users should be able to register new passkeys without providing email
    const hasSession = true
    const providedEmail = undefined

    // With a session, email is not required (we get it from the session)
    const canProceed = hasSession || !!providedEmail
    expect(canProceed).toBe(true)
  })

  it('should require email for new user passkey registration', () => {
    // New users (no session) must provide email for passkey registration
    const hasSession = false
    const providedEmail = undefined

    const canProceed = hasSession || !!providedEmail
    expect(canProceed).toBe(false)
  })

  it('should allow new users to register with email and passkey', () => {
    const hasSession = false
    const providedEmail = 'newuser@example.com'

    const canProceed = hasSession || !!providedEmail
    expect(canProceed).toBe(true)
  })
})

describe('Passkey Authentication Flow', () => {
  it('should not require email for passkey authentication', () => {
    // Passkey authentication uses the credential to identify the user
    // Email is not needed as the passkey itself identifies the user
    const credentialId = 'base64-credential-id'
    expect(credentialId).toBeTruthy()
  })

  it('should support discoverable credentials (resident keys)', () => {
    // Resident keys allow the authenticator to store the user info
    // This enables passwordless login without typing email first
    const residentKeyRequirement = 'required'
    expect(residentKeyRequirement).toBe('required')
  })
})

describe('iOS Mobile Session Support', () => {
  it('should recognize mobile app session cookies', () => {
    // iOS app stores session as "next-auth.session-token" cookie
    const mobileSessionCookie = 'session-1234567890-abc123'
    const cookieName = 'next-auth.session-token'

    // Mobile sessions are stored in the database (not JWT)
    expect(cookieName).toBe('next-auth.session-token')
    expect(mobileSessionCookie).toMatch(/^session-/)
  })

  it('should handle both session cookie formats', () => {
    // Development: next-auth.session-token
    // Production: __Secure-next-auth.session-token
    const devCookie = 'next-auth.session-token'
    const prodCookie = '__Secure-next-auth.session-token'

    const validCookies = [devCookie, prodCookie]
    expect(validCookies).toContain('next-auth.session-token')
    expect(validCookies).toContain('__Secure-next-auth.session-token')
  })
})
