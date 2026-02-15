/**
 * Shared utilities for OpenClaw API routes
 * - Session resolution with database fallback (for mobile apps)
 * - Auth token encryption using the standard field-encryption module
 */

import { type NextRequest } from "next/server"
import { getServerSession } from "next-auth"
import { authConfig } from "@/lib/auth-config"
import { prisma } from "@/lib/prisma"
import { encryptField, decryptField } from "@/lib/field-encryption"

/**
 * Get the authenticated session, with database session fallback for mobile apps.
 */
export async function getOpenClawSession(request: NextRequest) {
  let session = await getServerSession(authConfig)

  // If JWT session validation failed, try database session (for mobile apps)
  if (!session?.user) {
    const cookieHeader = request.headers.get('cookie')
    if (cookieHeader) {
      const sessionTokenMatch = cookieHeader.match(/next-auth\.session-token=([^;]+)/)
      if (sessionTokenMatch) {
        const sessionToken = sessionTokenMatch[1]
        const dbSession = await prisma.session.findUnique({
          where: { sessionToken },
          include: { user: true }
        })
        if (dbSession && dbSession.expires > new Date()) {
          session = {
            user: {
              id: dbSession.user.id,
              email: dbSession.user.email,
              name: dbSession.user.name,
              image: dbSession.user.image,
            },
            expires: dbSession.expires.toISOString()
          }
        }
      }
    }
  }

  return session
}

/**
 * Encrypt an OpenClaw auth token for storage.
 * Uses the standard field-encryption module (AES-256-GCM).
 */
export function encryptAuthToken(token: string): string {
  return encryptField(token)
}

/**
 * Decrypt an OpenClaw auth token from storage.
 * Handles both new format (enc:v1:...) and legacy JSON format ({encrypted, iv}).
 */
export function decryptAuthToken(storedValue: string): string | null {
  // Try standard format first
  if (storedValue.startsWith('enc:v1:')) {
    return decryptField(storedValue)
  }

  // Legacy JSON format fallback ({encrypted, iv} from old AES-256-CBC)
  try {
    const parsed = JSON.parse(storedValue)
    if (parsed.encrypted && parsed.iv) {
      // Legacy format - can't decrypt without the old code
      // Return null to indicate the token needs to be re-entered
      return null
    }
  } catch {
    // Not JSON, not encrypted prefix - return as-is (plain text)
  }

  return storedValue
}
