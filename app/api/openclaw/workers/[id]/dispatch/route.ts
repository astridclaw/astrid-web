import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getOpenClawSession, decryptAuthToken } from "@/lib/openclaw-utils"
import { testOpenClawConnection } from "@/lib/ai/openclaw-rpc-client"

/**
 * POST /api/openclaw/workers/[id]/dispatch
 * Dispatch a task to an OpenClaw worker.
 * Called internally by the webhook service when a task is assigned to openclaw@astrid.cc.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Allow internal calls (from webhook service) or authenticated users
    const session = await getOpenClawSession(request)
    const isInternalCall = request.headers.get('user-agent')?.includes('Astrid')
      || request.url.includes('localhost')
      || request.url.includes('127.0.0.1')

    if (!session?.user?.id && !isInternalCall) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { taskId, taskTitle, taskDescription, listName, githubRepositoryId } = body

    if (!taskId || !taskTitle) {
      return NextResponse.json({ error: "taskId and taskTitle are required" }, { status: 400 })
    }

    // Get the worker
    const worker = await prisma.openClawWorker.findFirst({
      where: { id, isActive: true },
    })

    if (!worker) {
      return NextResponse.json({ error: "Worker not found or inactive" }, { status: 404 })
    }

    // Decrypt auth token if present
    let authToken: string | undefined
    if (worker.authToken) {
      const decrypted = decryptAuthToken(worker.authToken)
      if (decrypted) {
        authToken = decrypted
      }
    }

    // Test connection first
    const testResult = await testOpenClawConnection(
      worker.gatewayUrl,
      authToken,
      10000
    )

    if (!testResult.success) {
      // Update worker status
      await prisma.openClawWorker.update({
        where: { id },
        data: { status: 'error', lastError: testResult.error || 'Connection failed' },
      })
      return NextResponse.json({
        error: "Worker is not reachable",
        details: testResult.error,
      }, { status: 503 })
    }

    // Update worker status to busy
    await prisma.openClawWorker.update({
      where: { id },
      data: { status: 'busy', lastSeen: new Date(), lastError: null },
    })

    // Return success - the actual task execution happens asynchronously
    // via the polling worker or webhook handler
    return NextResponse.json({
      success: true,
      worker: {
        id: worker.id,
        name: worker.name,
        gatewayUrl: worker.gatewayUrl,
        status: 'busy',
      },
      task: { taskId, taskTitle },
      connection: {
        latencyMs: testResult.latencyMs,
        version: testResult.version,
      },
    })
  } catch (error) {
    console.error("Error dispatching to OpenClaw worker:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
