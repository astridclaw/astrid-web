/**
 * DELETE /api/v1/openclaw/agents/:id
 *
 * Remove an OpenClaw agent. Deletes the user record (cascades to OAuth client + tokens).
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateAPI, UnauthorizedError } from '@/lib/api-auth-middleware'
import { prisma } from '@/lib/prisma'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const auth = await authenticateAPI(req)
    const { id } = await context.params

    const agent = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, aiAgentType: true, aiAgentConfig: true },
    })

    if (!agent || agent.aiAgentType !== 'openclaw_worker') {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Verify ownership
    let config: any = {}
    try {
      config = typeof agent.aiAgentConfig === 'string'
        ? JSON.parse(agent.aiAgentConfig as string)
        : agent.aiAgentConfig || {}
    } catch { /* ignore */ }

    if (config.registeredBy !== auth.userId) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Delete user — cascades to OAuthClient and OAuthToken
    await prisma.user.delete({ where: { id } })

    console.log(`[OpenClaw Agents] Deleted agent ${agent.email} (by ${auth.user.email})`)

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof UnauthorizedError || (error as any)?.name === 'UnauthorizedError') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[OpenClaw Agents] DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
