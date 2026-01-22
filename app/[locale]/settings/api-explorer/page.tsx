"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { LoadingScreen } from "@/components/loading-screen"

/**
 * API Explorer - Redirects to API Testing
 */
export default function APIExplorerPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/settings/api-testing')
  }, [router])

  return (
    <LoadingScreen message="Redirecting to API Testing..." />
  )
}
