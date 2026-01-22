/**
 * User Settings API v1
 *
 * GET /api/v1/users/me/settings - Get current user's settings
 * PUT /api/v1/users/me/settings - Update current user's settings
 */

import { type NextRequest, NextResponse } from 'next/server'
import { authenticateAPI, requireScopes, getDeprecationWarning, UnauthorizedError, ForbiddenError } from '@/lib/api-auth-middleware'
import { prisma } from '@/lib/prisma'
import { trackEventFromRequest, AnalyticsEventType } from '@/lib/analytics-events'

/**
 * GET /api/v1/users/me/settings
 * Get current user's settings
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateAPI(req)
    requireScopes(auth, ['user:read'])

    // Fetch user with settings
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        email: true,
        name: true,
        reminderSettings: {
          select: {
            enablePushReminders: true,
            enableEmailReminders: true,
            defaultReminderTime: true,
            enableDailyDigest: true,
            dailyDigestTime: true,
            dailyDigestTimezone: true,
            quietHoursStart: true,
            quietHoursEnd: true,
          }
        }
      }
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    const headers: Record<string, string> = {}
    const deprecationWarning = getDeprecationWarning(auth)
    if (deprecationWarning) {
      headers['X-Deprecation-Warning'] = deprecationWarning
    }

    // Use reminderSettings if exists, otherwise use defaults
    const settings = user.reminderSettings || {
      enablePushReminders: false,
      enableEmailReminders: true,
      defaultReminderTime: 15,
      enableDailyDigest: false,
      dailyDigestTime: '09:00',
      dailyDigestTimezone: 'America/Los_Angeles',
      quietHoursStart: null,
      quietHoursEnd: null,
    }

    return NextResponse.json(
      {
        settings: {
          reminderSettings: {
            enablePushReminders: settings.enablePushReminders ?? false,
            enableEmailReminders: settings.enableEmailReminders ?? true,
            defaultReminderTime: settings.defaultReminderTime ?? 15,
            enableDailyDigest: settings.enableDailyDigest ?? false,
            dailyDigestTime: settings.dailyDigestTime ?? '09:00',
            dailyDigestTimezone: settings.dailyDigestTimezone ?? 'America/Los_Angeles',
            quietHoursStart: settings.quietHoursStart,
            quietHoursEnd: settings.quietHoursEnd,
          }
        },
        meta: {
          apiVersion: 'v1',
          authSource: auth.source,
        },
      },
      { headers }
    )
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      )
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { error: error.message },
        { status: 403 }
      )
    }
    console.error('[API v1] GET /users/me/settings error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/v1/users/me/settings
 * Update current user's settings
 *
 * Body:
 * {
 *   reminderSettings?: {
 *     enablePushReminders?: boolean
 *     enableEmailReminders?: boolean
 *     defaultReminderTime?: number
 *     enableDailyDigest?: boolean
 *     dailyDigestTime?: string
 *     dailyDigestTimezone?: string
 *     quietHoursStart?: string | null
 *     quietHoursEnd?: string | null
 *   }
 * }
 */
export async function PUT(req: NextRequest) {
  try {
    const auth = await authenticateAPI(req)
    requireScopes(auth, ['user:write'])

    const body = await req.json()

    // Validate and prepare update data
    const updateData: any = {}

    if (body.reminderSettings) {
      const { reminderSettings } = body

      if (typeof reminderSettings.enablePushReminders === 'boolean') {
        updateData.enablePushReminders = reminderSettings.enablePushReminders
      }
      if (typeof reminderSettings.enableEmailReminders === 'boolean') {
        updateData.enableEmailReminders = reminderSettings.enableEmailReminders
      }
      if (typeof reminderSettings.defaultReminderTime === 'number') {
        updateData.defaultReminderTime = reminderSettings.defaultReminderTime
      }
      if (typeof reminderSettings.enableDailyDigest === 'boolean') {
        updateData.enableDailyDigest = reminderSettings.enableDailyDigest
      }
      if (typeof reminderSettings.dailyDigestTime === 'string') {
        updateData.dailyDigestTime = reminderSettings.dailyDigestTime
      }
      if (typeof reminderSettings.dailyDigestTimezone === 'string') {
        updateData.dailyDigestTimezone = reminderSettings.dailyDigestTimezone
      }
      if (reminderSettings.quietHoursStart !== undefined) {
        updateData.quietHoursStart = reminderSettings.quietHoursStart
      }
      if (reminderSettings.quietHoursEnd !== undefined) {
        updateData.quietHoursEnd = reminderSettings.quietHoursEnd
      }
    }

    // Upsert reminder settings (create if doesn't exist, update if it does)
    await prisma.reminderSettings.upsert({
      where: { userId: auth.userId },
      create: {
        userId: auth.userId,
        ...updateData
      },
      update: updateData
    })

    // Track analytics
    trackEventFromRequest(req, auth.userId, AnalyticsEventType.SETTINGS_UPDATED, {
      settingsType: 'reminderSettings'
    })

    // Fetch updated user with settings
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        email: true,
        name: true,
        reminderSettings: {
          select: {
            enablePushReminders: true,
            enableEmailReminders: true,
            defaultReminderTime: true,
            enableDailyDigest: true,
            dailyDigestTime: true,
            dailyDigestTimezone: true,
            quietHoursStart: true,
            quietHoursEnd: true,
          }
        }
      }
    })

    const headers: Record<string, string> = {}
    const deprecationWarning = getDeprecationWarning(auth)
    if (deprecationWarning) {
      headers['X-Deprecation-Warning'] = deprecationWarning
    }

    // Use reminderSettings if exists, otherwise use defaults
    const settings = user?.reminderSettings || {
      enablePushReminders: false,
      enableEmailReminders: true,
      defaultReminderTime: 15,
      enableDailyDigest: false,
      dailyDigestTime: '09:00',
      dailyDigestTimezone: 'America/Los_Angeles',
      quietHoursStart: null,
      quietHoursEnd: null,
    }

    return NextResponse.json(
      {
        settings: {
          reminderSettings: {
            enablePushReminders: settings.enablePushReminders ?? false,
            enableEmailReminders: settings.enableEmailReminders ?? true,
            defaultReminderTime: settings.defaultReminderTime ?? 15,
            enableDailyDigest: settings.enableDailyDigest ?? false,
            dailyDigestTime: settings.dailyDigestTime ?? '09:00',
            dailyDigestTimezone: settings.dailyDigestTimezone ?? 'America/Los_Angeles',
            quietHoursStart: settings.quietHoursStart,
            quietHoursEnd: settings.quietHoursEnd,
          }
        },
        meta: {
          apiVersion: 'v1',
          authSource: auth.source,
        },
      },
      { headers }
    )
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      )
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { error: error.message },
        { status: 403 }
      )
    }
    console.error('[API v1] PUT /users/me/settings error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
