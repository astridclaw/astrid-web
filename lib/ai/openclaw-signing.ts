/**
 * OpenClaw Signing Utilities
 *
 * Cryptographic signing for verifying that OpenClaw connections
 * originate from astrid.cc. Uses Ed25519 for fast, secure signatures.
 *
 * Flow:
 * 1. Astrid signs connection requests with its private key
 * 2. OpenClaw Gateway fetches Astrid's public key from /.well-known/openclaw-public-key
 * 3. Gateway verifies signature - if valid, connection is from real astrid.cc
 */

import crypto from 'crypto'

// ============================================================================
// TYPES
// ============================================================================

export interface SignedConnectionRequest {
  /** ISO timestamp of when the request was signed */
  timestamp: string
  /** Random nonce to prevent replay attacks */
  nonce: string
  /** The gateway URL being connected to (prevents request reuse) */
  gatewayUrl: string
  /** User ID making the connection */
  userId: string
}

export interface ConnectionSignature {
  /** The signed payload */
  payload: SignedConnectionRequest
  /** Ed25519 signature in base64 */
  signature: string
  /** Key ID for key rotation support */
  keyId: string
}

export interface PublicKeyInfo {
  /** The public key in PEM format */
  publicKey: string
  /** Key ID */
  keyId: string
  /** Algorithm used */
  algorithm: string
  /** When this key was created */
  createdAt: string
  /** Issuer identifier */
  issuer: string
}

// ============================================================================
// KEY MANAGEMENT
// ============================================================================

/**
 * Get or generate the signing keypair.
 *
 * In production, the private key should be set via OPENCLAW_SIGNING_PRIVATE_KEY env var.
 * The public key is derived from the private key.
 */
export function getSigningKeyPair(): { privateKey: crypto.KeyObject; publicKey: crypto.KeyObject; keyId: string } {
  const privateKeyPem = process.env.OPENCLAW_SIGNING_PRIVATE_KEY

  if (!privateKeyPem) {
    throw new Error(
      'OPENCLAW_SIGNING_PRIVATE_KEY environment variable is required. ' +
      'Generate one with: npm run generate:openclaw-keys'
    )
  }

  try {
    const privateKey = crypto.createPrivateKey(privateKeyPem)
    const publicKey = crypto.createPublicKey(privateKey)

    // Generate a stable key ID from the public key
    const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' })
    const keyId = crypto.createHash('sha256').update(publicKeyDer).digest('hex').slice(0, 16)

    return { privateKey, publicKey, keyId }
  } catch (error) {
    throw new Error(
      `Invalid OPENCLAW_SIGNING_PRIVATE_KEY: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Get the public key info for the /.well-known endpoint
 */
export function getPublicKeyInfo(): PublicKeyInfo {
  const { publicKey, keyId } = getSigningKeyPair()

  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }) as string,
    keyId,
    algorithm: 'Ed25519',
    createdAt: new Date().toISOString(),
    issuer: 'astrid.cc',
  }
}

// ============================================================================
// SIGNING
// ============================================================================

/**
 * Sign a connection request to an OpenClaw Gateway.
 * This proves the request originated from astrid.cc.
 */
export function signConnectionRequest(
  gatewayUrl: string,
  userId: string
): ConnectionSignature {
  const { privateKey, keyId } = getSigningKeyPair()

  const payload: SignedConnectionRequest = {
    timestamp: new Date().toISOString(),
    nonce: crypto.randomBytes(16).toString('hex'),
    gatewayUrl,
    userId,
  }

  const payloadString = JSON.stringify(payload)
  const signature = crypto.sign(null, Buffer.from(payloadString), privateKey)

  return {
    payload,
    signature: signature.toString('base64'),
    keyId,
  }
}

// ============================================================================
// VERIFICATION (for OpenClaw Gateway)
// ============================================================================

/**
 * Verify a connection signature.
 * This is used by OpenClaw Gateway to verify requests from astrid.cc.
 *
 * @param signature - The signature object from the connection request
 * @param publicKeyPem - Astrid's public key (fetched from /.well-known/openclaw-public-key)
 * @param maxAgeMs - Maximum age of the signature (default: 5 minutes)
 */
export function verifyConnectionSignature(
  signature: ConnectionSignature,
  publicKeyPem: string,
  maxAgeMs: number = 5 * 60 * 1000
): { valid: boolean; error?: string } {
  try {
    // Check timestamp freshness
    const signedAt = new Date(signature.payload.timestamp)
    const now = new Date()
    const ageMs = now.getTime() - signedAt.getTime()

    if (ageMs < 0) {
      return { valid: false, error: 'Signature timestamp is in the future' }
    }

    if (ageMs > maxAgeMs) {
      return { valid: false, error: `Signature expired (age: ${Math.round(ageMs / 1000)}s, max: ${maxAgeMs / 1000}s)` }
    }

    // Verify the signature
    const publicKey = crypto.createPublicKey(publicKeyPem)
    const payloadString = JSON.stringify(signature.payload)
    const signatureBuffer = Buffer.from(signature.signature, 'base64')

    const isValid = crypto.verify(null, Buffer.from(payloadString), publicKey, signatureBuffer)

    if (!isValid) {
      return { valid: false, error: 'Invalid signature' }
    }

    return { valid: true }
  } catch (error) {
    return {
      valid: false,
      error: `Verification error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

// ============================================================================
// KEY GENERATION UTILITY
// ============================================================================

/**
 * Generate a new Ed25519 keypair for signing.
 * Run this once to create the keys, then set OPENCLAW_SIGNING_PRIVATE_KEY.
 */
export function generateSigningKeyPair(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')

  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
  }
}
