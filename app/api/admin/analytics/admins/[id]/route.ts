/**
 * Individual Admin Management API
 *
 * DELETE /api/admin/analytics/admins/:id - Remove an admin
 */

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authConfig } from '@/lib/auth-config'
import { isAdmin, removeAdmin, AdminAuthError } from '@/lib/admin-auth'

/**
 * DELETE /api/admin/analytics/admins/:id
 * Remove an admin user
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authConfig)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin access
    const admin = await isAdmin(session.user.id)
    if (!admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { id: userId } = await params

    await removeAdmin(userId, session.user.id)

    return NextResponse.json({
      success: true,
      message: 'Admin removed successfully',
    })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[Admin Management] DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
