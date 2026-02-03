import { type NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authConfig } from "@/lib/auth-config"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import crypto from "crypto"
import { testOpenClawConnection, type AuthMode } from "@/lib/ai/openclaw-rpc-client"

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is required')
  }
  return key
}

function encrypt(text: string): { encrypted: string; iv: string } {
  const algorithm = 'aes-256-cbc'
  const key = Buffer.from(getEncryptionKey(), 'hex')
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(algorithm, key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return { encrypted, iv: iv.toString('hex') }
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

const CreateWorkerSchema = z.object({
  name: z.string().min(1).max(100),
  gatewayUrl: z.string().url().refine(
    (url) => url.startsWith('ws://') || url.startsWith('wss://'),
    { message: 'Gateway URL must use ws:// or wss:// protocol' }
  ),
  authToken: z.string().optional(),
  authMode: z.enum(['token', 'tailscale', 'astrid-signed', 'none']).default('astrid-signed'),
})

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
 * GET /api/openclaw/workers
 * List all OpenClaw workers for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const workers = await prisma.openClawWorker.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        name: true,
        gatewayUrl: true,
        authMode: true,
        status: true,
        lastSeen: true,
        lastError: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        // Don't select authToken for security
      },
    })

    return NextResponse.json({ workers })
  } catch (error) {
    console.error("Error fetching OpenClaw workers:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * POST /api/openclaw/workers
 * Register a new OpenClaw worker
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()
    console.log("Worker registration request:", JSON.stringify(data, null, 2))
    const validatedData = CreateWorkerSchema.parse(data)

    // Test connection before saving
    const testResult = await testOpenClawConnection(
      validatedData.gatewayUrl,
      validatedData.authToken,
      10000,
      validatedData.authMode as AuthMode,
      session.user.id
    )

    // Encrypt auth token if provided
    let encryptedAuthToken: string | null = null
    if (validatedData.authToken) {
      const { encrypted, iv } = encrypt(validatedData.authToken)
      encryptedAuthToken = JSON.stringify({ encrypted, iv })
    }

    // Create the worker
    const worker = await prisma.openClawWorker.create({
      data: {
        userId: session.user.id,
        name: validatedData.name,
        gatewayUrl: validatedData.gatewayUrl,
        authToken: encryptedAuthToken,
        authMode: validatedData.authMode,
        status: testResult.success ? 'online' : 'error',
        lastSeen: testResult.success ? new Date() : null,
        lastError: testResult.error || null,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        gatewayUrl: true,
        authMode: true,
        status: true,
        lastSeen: true,
        lastError: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({
      worker,
      connectionTest: {
        success: testResult.success,
        latencyMs: testResult.latencyMs,
        version: testResult.version,
        error: testResult.error,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Validation errors:", JSON.stringify(error.errors, null, 2))
      const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return NextResponse.json(
        { error: `Validation failed: ${messages}`, details: error.errors },
        { status: 400 }
      )
    }

    console.error("Error creating OpenClaw worker:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
