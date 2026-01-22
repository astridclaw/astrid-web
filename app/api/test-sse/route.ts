import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authConfig } from "@/lib/auth-config"
import { broadcastToUsers } from "@/lib/sse-utils"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { targetUserId, message } = await request.json()
    
    if (!targetUserId || !message) {
      return NextResponse.json({ error: "targetUserId and message are required" }, { status: 400 })
    }

    console.log(`[TEST SSE] Broadcasting test message from ${session.user.id} to ${targetUserId}`)

    // Broadcast test message
    broadcastToUsers([targetUserId], {
      type: 'test_message',
      timestamp: new Date().toISOString(),
      data: {
        message,
        from: session.user.name || session.user.email || "Someone"
      }
    })

    return NextResponse.json({ 
      success: true, 
      message: "Test broadcast sent",
      from: session.user.id,
      to: targetUserId
    })
  } catch (error) {
    console.error("Error sending test SSE:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}