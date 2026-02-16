/**
 * Agent Task Detail API
 *
 * GET /api/v1/agent/tasks/:id — get task details
 * PATCH /api/v1/agent/tasks/:id — update task (complete, priority, etc)
 */

import { type NextRequest, NextResponse } from 'next/server'
import { authenticateAgentRequest, enrichTaskForAgent, agentTaskInclude } from '@/lib/agent-protocol'
import { prisma } from '@/lib/prisma'
import { UnauthorizedError, ForbiddenError } from '@/lib/api-auth-middleware'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const auth = await authenticateAgentRequest(req)
    const { id } = await context.params

    const task = await prisma.task.findFirst({
      where: { id, assigneeId: auth.userId },
      include: agentTaskInclude,
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    return NextResponse.json({ task: enrichTaskForAgent(task) })
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: (error as Error).message }, { status: 403 })
    }
    console.error('[Agent API] GET /agent/tasks/:id error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const auth = await authenticateAgentRequest(req, ['tasks:read', 'tasks:write'])
    const { id } = await context.params

    // Verify agent owns this task
    const existing = await prisma.task.findFirst({
      where: { id, assigneeId: auth.userId },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const body = await req.json()
    const data: any = {}

    if (body.completed !== undefined) data.completed = body.completed
    if (body.priority !== undefined) data.priority = body.priority
    if (body.title !== undefined) data.title = body.title
    if (body.description !== undefined) data.description = body.description

    const task = await prisma.task.update({
      where: { id },
      data,
      include: agentTaskInclude,
    })

    return NextResponse.json({ task: enrichTaskForAgent(task) })
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: (error as Error).message }, { status: 403 })
    }
    console.error('[Agent API] PATCH /agent/tasks/:id error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
