"use client"

import { useEffect } from "react"
import { TaskManager } from "@/components/TaskManager"
import { LoadingScreen } from "@/components/loading-screen"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { offlineDB } from "@/lib/offline-db"

interface AuthenticatedAppProps {
  initialSelectedListId?: string
  initialSelectedTaskId?: string
  listMetadata?: any
  taskMetadata?: any
}

export function AuthenticatedApp({
  initialSelectedListId,
  initialSelectedTaskId,
  listMetadata,
  taskMetadata
}: AuthenticatedAppProps = {}) {
  const { data: session, status } = useSession()
  const router = useRouter()

  // Clear IndexedDB on page load to force fresh data fetch
  useEffect(() => {
    const clearIndexedDBOnLoad = async () => {
      try {
        await offlineDB.forceRefresh()
        if (process.env.NODE_ENV === "development") {
          console.log("[IndexedDB] Cache cleared on page load")
        }
      } catch (error) {
        console.error("[IndexedDB] Error clearing cache on load:", error)
      }
    }

    clearIndexedDBOnLoad()
  }, []) // Run once on mount

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/auth/signin")
    }
  }, [status, router])

  if (status === "loading") {
    // Show minimal loading instead of full screen
    return (
      <div className="min-h-screen flex items-center justify-center theme-bg-primary">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="theme-text-muted text-sm">Checking authentication...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    // Show minimal loading instead of full screen
    return (
      <div className="min-h-screen flex items-center justify-center theme-bg-primary">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="theme-text-muted text-sm">Loading session...</p>
        </div>
      </div>
    )
  }

  // Removed excessive logging - only log on mount, not every render
  return (
    <TaskManager
      initialSelectedListId={initialSelectedListId}
      initialSelectedTaskId={initialSelectedTaskId}
      listMetadata={listMetadata}
      taskMetadata={taskMetadata}
    />
  )
}
