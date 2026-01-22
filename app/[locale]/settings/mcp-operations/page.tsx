"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { LoadingScreen } from "@/components/loading-screen"

/**
 * Legacy MCP Operations Page - Redirects to API Testing
 */
export default function LegacyMCPOperationsPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/settings/api-testing')
  }, [router])

  return (
    <LoadingScreen message="Redirecting to API Testing..." />
  )
}
