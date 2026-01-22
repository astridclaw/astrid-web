import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authConfig } from "@/lib/auth-config"
import { copyListWithTasks } from "@/lib/copy-utils"
import type { RouteContextParams } from "@/types/next"

export async function POST(
  request: NextRequest,
  context: RouteContextParams<{ id: string }>
) {
  try {
    const session = await getServerSession(authConfig)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }

    const { id: listId } = await context.params
    const body = await request.json()

    const {
      includeTasks = true,
      preserveTaskAssignees = false,
      assignToUser = true, // Default to assigning to user for backward compatibility
      newName
    } = body

    console.log(`📋 Copying list ${listId} for user ${session.user.id}, assignToUser: ${assignToUser}`)

    const result = await copyListWithTasks(listId, {
      newOwnerId: session.user.id,
      includeTasks,
      preserveTaskAssignees,
      assignToUser,
      newName,
      newOwnerName: session.user.name || session.user.email || undefined
    })

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to copy list" },
        { status: 400 }
      )
    }

    console.log(`✅ List copied successfully: ${result.copiedList?.id}`)
    console.log(`📝 Copied ${result.copiedTasksCount} tasks`)

    return NextResponse.json({
      success: true,
      list: result.copiedList,
      copiedTasksCount: result.copiedTasksCount,
      message: `Successfully copied list${result.copiedTasksCount ? ` with ${result.copiedTasksCount} tasks` : ""}`
    })

  } catch (error) {
    console.error("Error in copy list API:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
