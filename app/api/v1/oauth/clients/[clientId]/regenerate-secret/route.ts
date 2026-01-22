/**
 * Regenerate OAuth Client Secret
 *
 * POST /api/v1/oauth/clients/:clientId/regenerate-secret
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth-config'
import { regenerateClientSecret } from '@/lib/oauth/oauth-client-manager'

interface RouteContext {
  params: Promise<{
    clientId: string
  }>
}

/**
 * POST /api/v1/oauth/clients/:clientId/regenerate-secret
 * Regenerate client secret (invalidates old secret)
 */
export async function POST(
  req: NextRequest,
  context: RouteContext
) {
  try {
    const session = await getServerSession(authConfig)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { clientId } = await context.params

    const newSecret = await regenerateClientSecret(
      clientId,
      session.user.id
    )

    return NextResponse.json({
      clientSecret: newSecret,
      warning: 'Save the new client_secret now - it will not be shown again! Old secret is now invalid.',
      meta: { apiVersion: 'v1' },
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    console.error('[OAuth Client API] Regenerate secret error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
