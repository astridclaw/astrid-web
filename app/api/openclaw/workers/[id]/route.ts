import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { getOpenClawSession, encryptAuthToken } from "@/lib/openclaw-utils"

const UpdateWorkerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  gatewayUrl: z.string().url().refine(
    (url) => url.startsWith('ws://') || url.startsWith('wss://'),
    { message: 'Gateway URL must use ws:// or wss:// protocol' }
  ).optional(),
  authToken: z.string().optional(),
  authMode: z.enum(['token', 'tailscale', 'none']).optional(),
  isActive: z.boolean().optional(),
})

/**
 * GET /api/openclaw/workers/[id]
 * Get a specific OpenClaw worker
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

    const worker = await prisma.openClawWorker.findFirst({
      where: {
        id,
        userId: session.user.id,
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

    if (!worker) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 })
    }

    return NextResponse.json({ worker })
  } catch (error) {
    console.error("Error fetching OpenClaw worker:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * PATCH /api/openclaw/workers/[id]
 * Update an OpenClaw worker
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getOpenClawSession(request)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const data = await request.json()
    const validatedData = UpdateWorkerSchema.parse(data)

    // Verify ownership
    const existingWorker = await prisma.openClawWorker.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    })

    if (!existingWorker) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 })
    }

    // Build update data
    const updateData: Record<string, unknown> = {}

    if (validatedData.name !== undefined) {
      updateData.name = validatedData.name
    }
    if (validatedData.gatewayUrl !== undefined) {
      updateData.gatewayUrl = validatedData.gatewayUrl
      // Reset status when URL changes
      updateData.status = 'unknown'
      updateData.lastSeen = null
      updateData.lastError = null
    }
    if (validatedData.authToken !== undefined) {
      if (validatedData.authToken) {
        updateData.authToken = encryptAuthToken(validatedData.authToken)
      } else {
        updateData.authToken = null
      }
    }
    if (validatedData.authMode !== undefined) {
      updateData.authMode = validatedData.authMode
    }
    if (validatedData.isActive !== undefined) {
      updateData.isActive = validatedData.isActive
    }

    const worker = await prisma.openClawWorker.update({
      where: { id },
      data: updateData,
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

    return NextResponse.json({ worker })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      )
    }

    console.error("Error updating OpenClaw worker:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * DELETE /api/openclaw/workers/[id]
 * Delete an OpenClaw worker
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getOpenClawSession(request)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    // Verify ownership
    const existingWorker = await prisma.openClawWorker.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    })

    if (!existingWorker) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 })
    }

    await prisma.openClawWorker.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting OpenClaw worker:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
