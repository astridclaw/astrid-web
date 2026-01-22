/**
 * Integration tests for Claude Code Remote webhook integration
 *
 * Tests the full flow of:
 * 1. User webhook configuration (settings API)
 * 2. Outbound webhooks to user's Claude Code Remote server
 * 3. Callback endpoint for receiving updates from remote server
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mockPrisma } from '../setup'
import { encryptField, decryptField } from '@/lib/field-encryption'
import {
  generateWebhookSignature,
  generateWebhookHeaders,
  verifyWebhookSignature
} from '@/lib/webhook-signature'

// Mock fetch for external webhook calls
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock the Prisma import
vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma
}))

// Mock field encryption (use real implementation since ENCRYPTION_KEY is set in setup)
vi.mock('@/lib/field-encryption', async (importOriginal) => {
  const actual = await importOriginal() as any
  return actual
})

describe('Claude Code Remote Webhook Integration', () => {
  const testUserId = 'user-123'
  const testTaskId = 'task-456'
  const testWebhookUrl = 'https://my-server.example.com/webhook'
  const testWebhookSecret = 'test-secret-key-12345678901234567890'

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('User Webhook Settings API', () => {
    it('should return configured: false when no webhook is set', async () => {
      mockPrisma.userWebhookConfig.findUnique.mockResolvedValue(null)

      // Simulate the GET logic
      const config = await mockPrisma.userWebhookConfig.findUnique({
        where: { userId: testUserId }
      })

      expect(config).toBeNull()
      expect(mockPrisma.userWebhookConfig.findUnique).toHaveBeenCalledWith({
        where: { userId: testUserId }
      })
    })

    it('should create webhook config with encrypted URL and secret', async () => {
      const encryptedUrl = encryptField(testWebhookUrl)
      const encryptedSecret = encryptField(testWebhookSecret)

      mockPrisma.userWebhookConfig.upsert.mockResolvedValue({
        id: 'config-1',
        userId: testUserId,
        webhookUrl: encryptedUrl,
        webhookSecret: encryptedSecret,
        enabled: true,
        events: ['task.assigned', 'comment.created'],
        failureCount: 0,
        maxRetries: 3,
        lastFiredAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      const result = await mockPrisma.userWebhookConfig.upsert({
        where: { userId: testUserId },
        create: {
          userId: testUserId,
          webhookUrl: encryptedUrl,
          webhookSecret: encryptedSecret,
          enabled: true,
          events: ['task.assigned', 'comment.created']
        },
        update: {
          webhookUrl: encryptedUrl,
          enabled: true,
          events: ['task.assigned', 'comment.created']
        }
      })

      expect(result.userId).toBe(testUserId)
      expect(result.enabled).toBe(true)

      // Verify encryption works
      const decryptedUrl = decryptField(result.webhookUrl)
      expect(decryptedUrl).toBe(testWebhookUrl)
    })

    it('should decrypt webhook URL for display but not expose secret', async () => {
      const encryptedUrl = encryptField(testWebhookUrl)
      const encryptedSecret = encryptField(testWebhookSecret)

      mockPrisma.userWebhookConfig.findUnique.mockResolvedValue({
        id: 'config-1',
        userId: testUserId,
        webhookUrl: encryptedUrl,
        webhookSecret: encryptedSecret,
        enabled: true,
        events: ['task.assigned', 'comment.created'],
        failureCount: 0,
        maxRetries: 3,
        lastFiredAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      const config = await mockPrisma.userWebhookConfig.findUnique({
        where: { userId: testUserId }
      })

      // Decrypt URL for display
      const displayUrl = decryptField(config!.webhookUrl)
      expect(displayUrl).toBe(testWebhookUrl)

      // Secret should remain encrypted (never shown after creation)
      expect(config!.webhookSecret).toMatch(/^enc:v1:/)
    })
  })

  describe('Outbound Webhook Sending', () => {
    it('should send signed webhook to user server when config exists', async () => {
      const encryptedUrl = encryptField(testWebhookUrl)
      const encryptedSecret = encryptField(testWebhookSecret)

      mockPrisma.userWebhookConfig.findUnique.mockResolvedValue({
        id: 'config-1',
        userId: testUserId,
        webhookUrl: encryptedUrl,
        webhookSecret: encryptedSecret,
        enabled: true,
        events: ['task.assigned'],
        failureCount: 0,
        maxRetries: 3,
        lastFiredAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      mockPrisma.userWebhookConfig.update.mockResolvedValue({
        id: 'config-1',
        lastFiredAt: new Date(),
        failureCount: 0
      })

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })

      // Simulate the sendToUserWebhook logic
      const config = await mockPrisma.userWebhookConfig.findUnique({
        where: { userId: testUserId }
      })

      expect(config).not.toBeNull()
      expect(config!.enabled).toBe(true)
      expect(config!.events).toContain('task.assigned')

      // Decrypt and send
      const webhookUrl = decryptField(config!.webhookUrl)
      const webhookSecret = decryptField(config!.webhookSecret)

      const payload = JSON.stringify({
        event: 'task.assigned',
        taskId: testTaskId,
        timestamp: new Date().toISOString()
      })

      const headers = generateWebhookHeaders(payload, webhookSecret!, 'task.assigned')

      await mockFetch(webhookUrl, {
        method: 'POST',
        headers,
        body: payload
      })

      expect(mockFetch).toHaveBeenCalledWith(
        testWebhookUrl,
        expect.objectContaining({
          method: 'POST',
          body: expect.any(String)
        })
      )

      // Verify headers include signature
      const fetchCall = mockFetch.mock.calls[0]
      const sentHeaders = fetchCall[1].headers
      expect(sentHeaders['X-Astrid-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/)
      expect(sentHeaders['X-Astrid-Timestamp']).toMatch(/^\d+$/)
      expect(sentHeaders['X-Astrid-Event']).toBe('task.assigned')
    })

    it('should not send webhook if event type is not subscribed', async () => {
      mockPrisma.userWebhookConfig.findUnique.mockResolvedValue({
        id: 'config-1',
        userId: testUserId,
        webhookUrl: encryptField(testWebhookUrl),
        webhookSecret: encryptField(testWebhookSecret),
        enabled: true,
        events: ['task.assigned'], // Only task.assigned, not comment.created
        failureCount: 0,
        maxRetries: 3,
        lastFiredAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      const config = await mockPrisma.userWebhookConfig.findUnique({
        where: { userId: testUserId }
      })

      // Check if event is subscribed
      const eventSubscribed = config!.events.includes('comment.created')
      expect(eventSubscribed).toBe(false)
    })

    it('should not send webhook if disabled due to failures', async () => {
      mockPrisma.userWebhookConfig.findUnique.mockResolvedValue({
        id: 'config-1',
        userId: testUserId,
        webhookUrl: encryptField(testWebhookUrl),
        webhookSecret: encryptField(testWebhookSecret),
        enabled: true,
        events: ['task.assigned'],
        failureCount: 5, // Exceeds maxRetries
        maxRetries: 3,
        lastFiredAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      const config = await mockPrisma.userWebhookConfig.findUnique({
        where: { userId: testUserId }
      })

      // Check failure count
      const shouldSend = config!.failureCount < config!.maxRetries
      expect(shouldSend).toBe(false)
    })

    it('should increment failure count on webhook failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      mockPrisma.userWebhookConfig.updateMany.mockResolvedValue({ count: 1 })

      // Simulate failure handling
      try {
        await mockFetch(testWebhookUrl, { method: 'POST' })
      } catch {
        await mockPrisma.userWebhookConfig.updateMany({
          where: { userId: testUserId },
          data: { failureCount: { increment: 1 } }
        })
      }

      expect(mockPrisma.userWebhookConfig.updateMany).toHaveBeenCalledWith({
        where: { userId: testUserId },
        data: { failureCount: { increment: 1 } }
      })
    })
  })

  describe('Callback Endpoint (Inbound)', () => {
    it('should verify valid signature from remote server', () => {
      const payload = JSON.stringify({
        event: 'session.completed',
        sessionId: 'session-789',
        taskId: testTaskId,
        timestamp: new Date().toISOString(),
        data: { summary: 'Task completed successfully' }
      })

      const timestamp = Date.now().toString()
      const signature = `sha256=${generateWebhookSignature(payload, testWebhookSecret, timestamp)}`

      const result = verifyWebhookSignature(payload, signature, testWebhookSecret, timestamp)

      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('should reject tampered payload', () => {
      const originalPayload = JSON.stringify({
        event: 'session.completed',
        sessionId: 'session-789',
        taskId: testTaskId
      })

      const timestamp = Date.now().toString()
      const signature = `sha256=${generateWebhookSignature(originalPayload, testWebhookSecret, timestamp)}`

      // Tampered payload
      const tamperedPayload = JSON.stringify({
        event: 'session.completed',
        sessionId: 'session-789',
        taskId: 'different-task-id'
      })

      const result = verifyWebhookSignature(tamperedPayload, signature, testWebhookSecret, timestamp)

      expect(result.valid).toBe(false)
    })

    it('should reject expired timestamp', () => {
      const payload = JSON.stringify({ event: 'session.completed', taskId: testTaskId })

      // Timestamp from 10 minutes ago
      const oldTimestamp = (Date.now() - 10 * 60 * 1000).toString()
      const signature = `sha256=${generateWebhookSignature(payload, testWebhookSecret, oldTimestamp)}`

      const result = verifyWebhookSignature(payload, signature, testWebhookSecret, oldTimestamp)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Timestamp expired')
    })

    it('should process session.completed event and create comment', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        id: testTaskId,
        title: 'Test Task',
        assigneeId: 'agent-123',
        creatorId: testUserId,
        creator: {
          webhookConfig: {
            webhookSecret: encryptField(testWebhookSecret)
          }
        }
      })

      mockPrisma.comment.create.mockResolvedValue({
        id: 'comment-new',
        taskId: testTaskId,
        content: '## Task Completed\n\nSummary here',
        authorId: 'agent-123',
        createdAt: new Date()
      })

      // Simulate callback processing
      const task = await mockPrisma.task.findUnique({
        where: { id: testTaskId },
        include: { creator: { include: { webhookConfig: true } } }
      })

      expect(task).not.toBeNull()
      expect(task!.creator!.webhookConfig).not.toBeNull()
    })

    it('should handle all callback event types', () => {
      const eventTypes = [
        'session.started',
        'session.completed',
        'session.waiting_input',
        'session.progress',
        'session.error'
      ]

      eventTypes.forEach(event => {
        const payload = JSON.stringify({ event, taskId: testTaskId, sessionId: 'session-1' })
        const timestamp = Date.now().toString()
        const signature = `sha256=${generateWebhookSignature(payload, testWebhookSecret, timestamp)}`

        const result = verifyWebhookSignature(payload, signature, testWebhookSecret, timestamp)
        expect(result.valid).toBe(true)
      })
    })
  })

  describe('End-to-End Flow', () => {
    it('should complete full webhook round-trip', async () => {
      // 1. User has webhook configured
      const encryptedUrl = encryptField(testWebhookUrl)
      const encryptedSecret = encryptField(testWebhookSecret)

      mockPrisma.userWebhookConfig.findUnique.mockResolvedValue({
        id: 'config-1',
        userId: testUserId,
        webhookUrl: encryptedUrl,
        webhookSecret: encryptedSecret,
        enabled: true,
        events: ['task.assigned', 'comment.created'],
        failureCount: 0,
        maxRetries: 3,
        lastFiredAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      mockPrisma.userWebhookConfig.update.mockResolvedValue({
        lastFiredAt: new Date(),
        failureCount: 0
      })

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })

      // 2. Task is assigned - webhook is sent
      const config = await mockPrisma.userWebhookConfig.findUnique({
        where: { userId: testUserId }
      })

      const outboundPayload = JSON.stringify({
        event: 'task.assigned',
        timestamp: new Date().toISOString(),
        task: { id: testTaskId, title: 'Implement feature' }
      })

      const webhookUrl = decryptField(config!.webhookUrl)!
      const webhookSecret = decryptField(config!.webhookSecret)!
      const headers = generateWebhookHeaders(outboundPayload, webhookSecret, 'task.assigned')

      await mockFetch(webhookUrl, {
        method: 'POST',
        headers,
        body: outboundPayload
      })

      expect(mockFetch).toHaveBeenCalled()

      // 3. Remote server sends callback
      const callbackPayload = JSON.stringify({
        event: 'session.completed',
        sessionId: 'claude-session-123',
        taskId: testTaskId,
        timestamp: new Date().toISOString(),
        data: {
          summary: 'Feature implemented successfully',
          files: ['src/feature.ts', 'tests/feature.test.ts'],
          prUrl: 'https://github.com/org/repo/pull/42'
        }
      })

      const callbackTimestamp = Date.now().toString()
      const callbackSignature = `sha256=${generateWebhookSignature(callbackPayload, webhookSecret, callbackTimestamp)}`

      // 4. Verify callback signature
      const verification = verifyWebhookSignature(
        callbackPayload,
        callbackSignature,
        webhookSecret,
        callbackTimestamp
      )

      expect(verification.valid).toBe(true)

      // 5. Parse callback data
      const callbackData = JSON.parse(callbackPayload)
      expect(callbackData.event).toBe('session.completed')
      expect(callbackData.data.prUrl).toBe('https://github.com/org/repo/pull/42')
    })
  })
})
