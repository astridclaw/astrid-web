import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { testOpenClawConnection } from "@/lib/ai/openclaw-rpc-client"
import { getOpenClawSession, encryptAuthToken } from "@/lib/openclaw-utils"

const CreateWorkerSchema = z.object({
  name: z.string().min(1).max(100),
  gatewayUrl: z.string().url().refine(
    (url) => url.startsWith('ws://') || url.startsWith('wss://'),
    { message: 'Gateway URL must use ws:// or wss:// protocol' }
  ),
  authToken: z.string().optional(),
  authMode: z.enum(['token', 'tailscale', 'none']).default('token'),
})

/**
 * GET /api/openclaw/workers
 * List all OpenClaw workers for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getOpenClawSession(request)

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
    const session = await getOpenClawSession(request)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()
    const validatedData = CreateWorkerSchema.parse(data)

    // Test connection before saving
    const testResult = await testOpenClawConnection(
      validatedData.gatewayUrl,
      validatedData.authToken,
      10000
    )

    // Encrypt auth token if provided
    let encryptedAuthToken: string | null = null
    if (validatedData.authToken) {
      encryptedAuthToken = encryptAuthToken(validatedData.authToken)
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
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      )
    }

    console.error("Error creating OpenClaw worker:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
