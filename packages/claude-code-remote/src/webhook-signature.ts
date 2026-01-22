/**
 * Webhook Signature Utilities
 *
 * HMAC-SHA256 signature verification for secure webhook communication
 * from Astrid to Claude Code Remote server.
 */

import crypto from 'crypto'

/**
 * Generate HMAC-SHA256 signature for a webhook payload
 */
export function generateWebhookSignature(
  payload: string,
  secret: string,
  timestamp: string
): string {
  const signedPayload = `${timestamp}.${payload}`
  return crypto
    .createHmac('sha256', secret)
    .update(signedPayload, 'utf8')
    .digest('hex')
}

/**
 * Generate all headers needed for a signed callback request to Astrid
 */
export function generateCallbackHeaders(
  payload: string,
  secret: string,
  event: string
): Record<string, string> {
  const timestamp = Date.now().toString()
  const signature = generateWebhookSignature(payload, secret, timestamp)

  return {
    'Content-Type': 'application/json',
    'X-Astrid-Signature': `sha256=${signature}`,
    'X-Astrid-Timestamp': timestamp,
    'X-Astrid-Event': event,
    'User-Agent': 'Claude-Code-Remote/1.0'
  }
}

export interface WebhookVerificationResult {
  valid: boolean
  error?: string
}

/**
 * Verify a webhook signature from Astrid
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  timestamp: string,
  maxAge: number = 300000 // 5 minutes
): WebhookVerificationResult {
  if (!payload || !signature || !secret || !timestamp) {
    return { valid: false, error: 'Missing required parameters' }
  }

  const now = Date.now()
  const ts = parseInt(timestamp, 10)

  if (isNaN(ts)) {
    return { valid: false, error: 'Invalid timestamp format' }
  }

  if (now - ts > maxAge) {
    return { valid: false, error: 'Timestamp expired' }
  }

  if (ts - now > 60000) {
    return { valid: false, error: 'Timestamp too far in future' }
  }

  const expected = generateWebhookSignature(payload, secret, timestamp)
  const actual = signature.replace(/^sha256=/, '')

  try {
    const expectedBuffer = Buffer.from(expected, 'hex')
    const actualBuffer = Buffer.from(actual, 'hex')

    if (expectedBuffer.length !== actualBuffer.length) {
      return { valid: false, error: 'Signature length mismatch' }
    }

    const valid = crypto.timingSafeEqual(expectedBuffer, actualBuffer)
    return { valid }
  } catch {
    return { valid: false, error: 'Signature mismatch' }
  }
}
