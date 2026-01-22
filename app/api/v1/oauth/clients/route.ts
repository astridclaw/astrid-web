/**
 * OAuth Clients Management API
 *
 * GET /api/v1/oauth/clients - List user's OAuth clients
 * POST /api/v1/oauth/clients - Create new OAuth client
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth-config'
import {
  createOAuthClient,
  listUserOAuthClients,
} from '@/lib/oauth/oauth-client-manager'
import { type CreateOAuthClientParams } from '@/types/oauth'

/**
 * GET /api/v1/oauth/clients
 * List all OAuth clients for the authenticated user
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const clients = await listUserOAuthClients(session.user.id)

    return NextResponse.json({
      clients,
      meta: {
        total: clients.length,
        apiVersion: 'v1',
      },
    })
  } catch (error) {
    console.error('[OAuth Clients API] GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/v1/oauth/clients
 * Create a new OAuth client application
 *
 * Body:
 * {
 *   name: string (required) - Application name
 *   description?: string - Application description
 *   redirectUris?: string[] - Allowed redirect URIs
 *   grantTypes?: string[] - OAuth grant types to support
 *   scopes?: string[] - Allowed scopes
 * }
 *
 * Returns client credentials (clientSecret is only shown once!)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await req.json()

    // Validate required fields
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json(
        { error: 'name is required and must be a string' },
        { status: 400 }
      )
    }

    const params: CreateOAuthClientParams = {
      name: body.name,
      description: body.description,
      redirectUris: body.redirectUris,
      grantTypes: body.grantTypes,
      scopes: body.scopes,
    }

    const clientCredentials = await createOAuthClient({
      ...params,
      userId: session.user.id,
    })

    return NextResponse.json(
      {
        client: clientCredentials,
        warning: 'Save the client_secret now - it will not be shown again!',
        meta: {
          apiVersion: 'v1',
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[OAuth Clients API] POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
