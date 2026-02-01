import { type NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authConfig } from "@/lib/auth-config"
import { prisma } from "@/lib/prisma"
import crypto from "crypto"
import { testOpenClawConnection } from "@/lib/ai/openclaw-rpc-client"

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is required')
  }
  return key
}

function decrypt(encryptedData: { encrypted: string; iv: string }): string {
  const algorithm = 'aes-256-cbc'
  const key = Buffer.from(getEncryptionKey(), 'hex')
  const iv = Buffer.from(encryptedData.iv, 'hex')
  const decipher = crypto.createDecipheriv(algorithm, key, iv)
  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

async function getSession(request: NextRequest) {
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
 * GET /api/openclaw/workers/[id]/health
 * Check the health status of an OpenClaw worker
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    // Get the worker with auth token
    const worker = await prisma.openClawWorker.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    })

    if (!worker) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 })
    }

    // Decrypt auth token if present
    let authToken: string | undefined
    if (worker.authToken) {
      try {
        const encryptedData = JSON.parse(worker.authToken)
        authToken = decrypt(encryptedData)
      } catch {
        // Failed to decrypt, continue without token
      }
    }

    // Test connection
    const testResult = await testOpenClawConnection(
      worker.gatewayUrl,
      authToken,
      10000
    )

    // Update worker status
    await prisma.openClawWorker.update({
      where: { id },
      data: {
        status: testResult.success ? 'online' : 'error',
        lastSeen: testResult.success ? new Date() : worker.lastSeen,
        lastError: testResult.error || null,
      },
    })

    return NextResponse.json({
      id: worker.id,
      name: worker.name,
      gatewayUrl: worker.gatewayUrl,
      status: testResult.success ? 'online' : 'error',
      lastSeen: testResult.success ? new Date().toISOString() : worker.lastSeen?.toISOString(),
      health: {
        success: testResult.success,
        latencyMs: testResult.latencyMs,
        version: testResult.version,
        error: testResult.error,
      },
    })
  } catch (error) {
    console.error("Error checking OpenClaw worker health:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * POST /api/openclaw/workers/[id]/health
 * Force a health check and update status
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Same as GET - runs the health check
  return GET(request, { params })
}
