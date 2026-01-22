import { describe, it, expect, vi } from 'vitest'
import {
  generateShortcode,
  buildShortcodeUrl
} from '@/lib/shortcode'

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    shortcode: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn()
    }
  }
}))

describe('Shortcode System', () => {

  describe('generateShortcode', () => {
    it('should generate a shortcode of correct length', () => {
      const code = generateShortcode()
      expect(code).toBeDefined()
      expect(code.length).toBe(8)
    })

    it('should generate unique codes', () => {
      const code1 = generateShortcode()
      const code2 = generateShortcode()
      expect(code1).not.toBe(code2)
    })

    it('should only contain URL-safe characters', () => {
      const code = generateShortcode()
      // Should only contain alphanumeric characters (0-9, A-Z, a-z)
      expect(code).toMatch(/^[0-9A-Za-z]+$/)
    })

    it('should generate many unique codes', () => {
      const codes = new Set()
      for (let i = 0; i < 100; i++) {
        codes.add(generateShortcode())
      }
      // All 100 codes should be unique
      expect(codes.size).toBe(100)
    })
  })

  describe('buildShortcodeUrl', () => {
    it('should build correct URL with default base', () => {
      const code = 'TEST123'
      const url = buildShortcodeUrl(code)
      expect(url).toContain('/s/TEST123')
    })

    it('should build correct URL with custom base', () => {
      const code = 'TEST456'
      const url = buildShortcodeUrl(code, 'https://example.com')
      expect(url).toBe('https://example.com/s/TEST456')
    })
  })
})
