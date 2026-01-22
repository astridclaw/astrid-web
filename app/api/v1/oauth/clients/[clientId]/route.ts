/**
 * Individual OAuth Client Management
 *
 * GET /api/v1/oauth/clients/:clientId - Get client details
 * PUT /api/v1/oauth/clients/:clientId - Update client
 * DELETE /api/v1/oauth/clients/:clientId - Delete client
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth-config'
import {
  getOAuthClient,
  updateOAuthClient,
  deleteOAuthClient,
} from '@/lib/oauth/oauth-client-manager'

interface RouteContext {
  params: Promise<{
    clientId: string
  }>
}

/**
 * GET /api/v1/oauth/clients/:clientId
 */
export async function GET(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { clientId } = await context.params
    const client = await getOAuthClient(clientId)

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Check ownership
    if (client.userId !== session.user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    return NextResponse.json({
      client,
      meta: { apiVersion: 'v1' },
    })
  } catch (error) {
    console.error('[OAuth Client API] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/v1/oauth/clients/:clientId
 * Update client configuration
 */
export async function PUT(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { clientId } = await context.params
    const body = await req.json()

    const client = await updateOAuthClient(
      clientId,
      session.user.id,
      {
        name: body.name,
        description: body.description,
        redirectUris: body.redirectUris,
        scopes: body.scopes,
        isActive: body.isActive,
      }
    )

    return NextResponse.json({
      client,
      meta: { apiVersion: 'v1' },
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    console.error('[OAuth Client API] PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/v1/oauth/clients/:clientId
 * Delete OAuth client and all associated tokens
 */
export async function DELETE(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { clientId } = await context.params
    const deleted = await deleteOAuthClient(clientId, session.user.id)

    if (!deleted) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      message: 'OAuth client deleted successfully',
      meta: { apiVersion: 'v1' },
    })
  } catch (error) {
    console.error('[OAuth Client API] DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
