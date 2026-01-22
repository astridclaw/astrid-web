/**
 * Shortcodes API v1
 *
 * RESTful endpoint for shortcode operations
 * POST /api/v1/shortcodes - Create shortcode for sharing
 * GET /api/v1/shortcodes - Get shortcodes for a target
 */

import { type NextRequest, NextResponse } from 'next/server'
import { authenticateAPI, requireScopes, UnauthorizedError, ForbiddenError } from '@/lib/api-auth-middleware'
import { createShortcode, getShortcodesForTarget, buildShortcodeUrl } from '@/lib/shortcode'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/v1/shortcodes
 * Create a new shortcode for a task or list
 *
 * Body:
 * - targetType: "task" | "list"
 * - targetId: string (UUID)
 * - expiresAt?: string (ISO date, optional)
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateAPI(req)
    requireScopes(auth, ['tasks:read']) // Require at least tasks:read to create share links

    const body = await req.json()
    const { targetType, targetId, expiresAt } = body

    // Validate input
    if (!targetType || !targetId) {
      return NextResponse.json(
        {
          error: 'Validation error',
          message: 'targetType and targetId are required',
          meta: {
            apiVersion: 'v1',
            authSource: auth.source
          }
        },
        { status: 400 }
      )
    }

    if (targetType !== 'task' && targetType !== 'list') {
      return NextResponse.json(
        {
          error: 'Validation error',
          message: 'targetType must be "task" or "list"',
          meta: {
            apiVersion: 'v1',
            authSource: auth.source
          }
        },
        { status: 400 }
      )
    }

    // Verify access to target resource
    if (targetType === 'task') {
      // Find task with its lists
      const task = await prisma.task.findUnique({
        where: { id: targetId },
        include: {
          lists: true
        }
      })

      if (!task) {
        return NextResponse.json(
          {
            error: 'Not found',
            message: 'Task not found',
            meta: {
              apiVersion: 'v1',
              authSource: auth.source
            }
          },
          { status: 404 }
        )
      }

      // Check if user has access to this task
      // User has access if:
      // 1. They created the task
      // 2. They own any list containing the task
      // 3. They are a member of any list containing the task
      const isTaskCreator = task.creatorId === auth.userId

      if (!isTaskCreator) {
        const listIds = task.lists.map(list => list.id)

        const hasAccess = await prisma.taskList.findFirst({
          where: {
            id: { in: listIds },
            OR: [
              { ownerId: auth.userId },
              { listMembers: { some: { userId: auth.userId } } }
            ]
          }
        })

        if (!hasAccess) {
          return NextResponse.json(
            {
              error: 'Forbidden',
              message: "You don't have access to this task",
              meta: {
                apiVersion: 'v1',
                authSource: auth.source
              }
            },
            { status: 403 }
          )
        }
      }
    } else if (targetType === 'list') {
      const list = await prisma.taskList.findFirst({
        where: {
          id: targetId,
          OR: [
            { ownerId: auth.userId },
            { listMembers: { some: { userId: auth.userId } } }
          ]
        }
      })

      if (!list) {
        return NextResponse.json(
          {
            error: 'Not found',
            message: 'List not found or access denied',
            meta: {
              apiVersion: 'v1',
              authSource: auth.source
            }
          },
          { status: 404 }
        )
      }
    }

    // Create shortcode
    const shortcode = await createShortcode({
      targetType,
      targetId,
      userId: auth.userId,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined
    })

    return NextResponse.json({
      shortcode,
      url: buildShortcodeUrl(shortcode.code),
      meta: {
        apiVersion: 'v1',
        authSource: auth.source
      }
    })
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: error.message,
          meta: { apiVersion: 'v1' }
        },
        { status: 401 }
      )
    }

    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        {
          error: 'Forbidden',
          message: error.message,
          meta: { apiVersion: 'v1' }
        },
        { status: 403 }
      )
    }

    console.error('Error creating shortcode:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to create shortcode',
        meta: { apiVersion: 'v1' }
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/v1/shortcodes?targetType=task&targetId=xxx
 * Get all shortcodes for a target
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateAPI(req)
    requireScopes(auth, ['tasks:read'])

    const { searchParams } = new URL(req.url)
    const targetType = searchParams.get('targetType')
    const targetId = searchParams.get('targetId')

    if (!targetType || !targetId) {
      return NextResponse.json(
        {
          error: 'Validation error',
          message: 'targetType and targetId are required',
          meta: {
            apiVersion: 'v1',
            authSource: auth.source
          }
        },
        { status: 400 }
      )
    }

    if (targetType !== 'task' && targetType !== 'list') {
      return NextResponse.json(
        {
          error: 'Validation error',
          message: 'targetType must be "task" or "list"',
          meta: {
            apiVersion: 'v1',
            authSource: auth.source
          }
        },
        { status: 400 }
      )
    }

    // Verify access to target resource
    if (targetType === 'task') {
      const task = await prisma.task.findUnique({
        where: { id: targetId },
        include: { lists: true }
      })

      if (!task) {
        return NextResponse.json(
          {
            error: 'Not found',
            message: 'Task not found',
            meta: {
              apiVersion: 'v1',
              authSource: auth.source
            }
          },
          { status: 404 }
        )
      }

      const isTaskCreator = task.creatorId === auth.userId

      if (!isTaskCreator) {
        const listIds = task.lists.map(list => list.id)
        const hasAccess = await prisma.taskList.findFirst({
          where: {
            id: { in: listIds },
            OR: [
              { ownerId: auth.userId },
              { listMembers: { some: { userId: auth.userId } } }
            ]
          }
        })

        if (!hasAccess) {
          return NextResponse.json(
            {
              error: 'Forbidden',
              message: "You don't have access to this task",
              meta: {
                apiVersion: 'v1',
                authSource: auth.source
              }
            },
            { status: 403 }
          )
        }
      }
    } else if (targetType === 'list') {
      const list = await prisma.taskList.findFirst({
        where: {
          id: targetId,
          OR: [
            { ownerId: auth.userId },
            { listMembers: { some: { userId: auth.userId } } }
          ]
        }
      })

      if (!list) {
        return NextResponse.json(
          {
            error: 'Not found',
            message: 'List not found or access denied',
            meta: {
              apiVersion: 'v1',
              authSource: auth.source
            }
          },
          { status: 404 }
        )
      }
    }

    const shortcodes = await getShortcodesForTarget(
      targetType as 'task' | 'list',
      targetId
    )

    return NextResponse.json({
      shortcodes: shortcodes.map((sc) => ({
        ...sc,
        url: buildShortcodeUrl(sc.code)
      })),
      meta: {
        apiVersion: 'v1',
        authSource: auth.source,
        count: shortcodes.length
      }
    })
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: error.message,
          meta: { apiVersion: 'v1' }
        },
        { status: 401 }
      )
    }

    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        {
          error: 'Forbidden',
          message: error.message,
          meta: { apiVersion: 'v1' }
        },
        { status: 403 }
      )
    }

    console.error('Error fetching shortcodes:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to fetch shortcodes',
        meta: { apiVersion: 'v1' }
      },
      { status: 500 }
    )
  }
}
