import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authConfig } from "@/lib/auth-config"
import { prisma } from "@/lib/prisma"
import { getAllListMembers } from "@/lib/list-member-utils"
import type { RouteContextParams } from "@/types/next"

export async function PATCH(request: NextRequest, context: RouteContextParams<{ id: string }>) {
  try {
    const session = await getServerSession(authConfig)
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }

    const userId = session.user.id
    const { id: listId } = await context.params
    const body = await request.json()
    const { isFavorite } = body

    // Verify the user owns or has access to this list
    const list = await prisma.taskList.findFirst({
      where: {
        id: listId,
        OR: [
          { ownerId: userId },
          { listMembers: { some: { userId: userId } } }
        ]
      }
    })

    if (!list) {
      return NextResponse.json(
        { error: "List not found or access denied" },
        { status: 404 }
      )
    }

    if (isFavorite) {
      // Find the next saved filter order number for this user
      const maxOrder = await prisma.taskList.findFirst({
        where: {
          ownerId: userId,
          isFavorite: true
        },
        orderBy: {
          favoriteOrder: "desc"
        },
        select: {
          favoriteOrder: true
        }
      })

      const nextOrder = (maxOrder?.favoriteOrder || 0) + 1

      // Make it a saved filter
      await prisma.taskList.update({
        where: { id: listId },
        data: {
          isFavorite: true,
          favoriteOrder: nextOrder
        }
      })
    } else {
      // Remove from saved filters
      await prisma.taskList.update({
        where: { id: listId },
        data: {
          isFavorite: false,
          favoriteOrder: null
        }
      })
    }

    // Fetch the updated list with all needed relations for SSE
    const updatedList = await prisma.taskList.findUnique({
      where: { id: listId },
      include: {
        owner: true,
        listMembers: {
          include: {
            user: true
          }
        }
      }
    })

    if (!updatedList) {
      return NextResponse.json(
        { error: "Failed to fetch updated list" },
        { status: 500 }
      )
    }

    // Manually fetch defaultAssignee if it's a valid user ID (not "unassigned")
    let defaultAssignee = null
    if (updatedList.defaultAssigneeId && updatedList.defaultAssigneeId !== "unassigned") {
      defaultAssignee = await prisma.user.findUnique({
        where: { id: updatedList.defaultAssigneeId }
      })
    }

    const updatedListWithDefaultAssignee = {
      ...updatedList,
      defaultAssignee
    }

    // Broadcast SSE event for list update to all list members
    try {
      const allMembers = getAllListMembers(updatedListWithDefaultAssignee as any)
      const userIdsToNotify = [
        updatedListWithDefaultAssignee.ownerId, // Owner
        ...allMembers.map(member => member.id) // All members/admins
      ]

      // Remove the user who made the update (they already see it)
      const userIdsFiltered = userIdsToNotify.filter(id => id !== userId)

      if (userIdsFiltered.length > 0) {
        console.log(`[SSE] Broadcasting favorite toggle to ${userIdsFiltered.length} users`)
        const { broadcastToUsers } = await import("@/lib/sse-utils")
        broadcastToUsers(userIdsFiltered, {
          type: 'list_updated',
          timestamp: new Date().toISOString(),
          data: updatedListWithDefaultAssignee
        })
      }
    } catch (sseError) {
      console.error("Failed to send favorite toggle SSE notifications:", sseError)
      // Continue - list was still updated
    }

    return NextResponse.json({
      success: true,
      isFavorite,
      listId,
      list: updatedListWithDefaultAssignee
    })

  } catch (error) {
    console.error("Error toggling saved filter:", error)
    return NextResponse.json(
      { error: "Failed to toggle saved filter" },
      { status: 500 }
    )
  }
}
