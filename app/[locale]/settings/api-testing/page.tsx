"use client"

export const dynamic = 'force-dynamic'

import { Suspense, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { OAuthAPITester } from "@/components/oauth-api-tester"
import { LoadingScreen } from "@/components/loading-screen"
import { Heart, ArrowLeft } from "lucide-react"
import Image from "next/image"

function APITestingContent() {
  return <OAuthAPITester />
}

export default function APITestingPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/auth/signin")
    }
  }, [status, router])

  if (status === "loading") {
    return <LoadingScreen />
  }

  if (status === "unauthenticated") {
    return null
  }

  return (
    <div className="min-h-screen theme-bg-primary">
      {/* Header */}
      <div className="theme-header theme-border app-header">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            onClick={() => router.push('/settings/api-access')}
            className="p-2 hover:bg-opacity-20"
          >
            <ArrowLeft className="w-5 h-5 theme-text-primary" />
          </Button>
          <div
            className="flex items-center space-x-2 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => router.push('/')}
            title="Go to Home"
          >
            <Image src="/icons/icon-96x96.png" alt="Astrid" width={24} height={24} className="rounded" />
            <span className="text-xl font-semibold theme-text-primary">astrid</span>
          </div>
          <div className="flex items-center space-x-1 theme-count-bg rounded-full px-3 py-1">
            <div className="w-2 h-2 theme-bg-tertiary rounded-full"></div>
            <span className="text-sm theme-text-primary">API Testing</span>
          </div>
        </div>
      </div>

      <Suspense fallback={<div className="flex items-center justify-center h-64">Loading...</div>}>
        <APITestingContent />
      </Suspense>
    </div>
  )
}
