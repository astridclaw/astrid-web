import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { testOpenClawConnection } from "@/lib/ai/openclaw-rpc-client"
import { getOpenClawSession, decryptAuthToken } from "@/lib/openclaw-utils"

/**
 * GET /api/openclaw/workers/[id]/health
 * Check the health status of an OpenClaw worker
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getOpenClawSession(request)

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
      const decrypted = decryptAuthToken(worker.authToken)
      if (decrypted) {
        authToken = decrypted
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
