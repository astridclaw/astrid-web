"use client"

import { useEffect, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AuthenticatedApp } from "@/components/authenticated-app"
import { LoadingScreen } from "@/components/loading-screen"

function PageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [authConfigured, setAuthConfigured] = useState<boolean | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check for return URL after authentication
    const checkReturnTo = searchParams?.get('checkReturnTo')
    if (checkReturnTo) {
      const returnTo = sessionStorage.getItem('returnTo')
      if (returnTo) {
        sessionStorage.removeItem('returnTo')
        // Replace current URL to prevent back button issues
        router.replace(returnTo)
        return
      } else {
        // Remove the checkReturnTo parameter
        router.replace('/')
        return
      }
    }
  }, [searchParams, router])

  useEffect(() => {
    // Check if NextAuth is properly configured
    fetch("/api/auth/providers")
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`)
        }
        return res.json()
      })
      .then((providers) => {
        console.log("[Auth] NextAuth providers:", providers)
        if (!providers || Object.keys(providers).length === 0) {
          setAuthConfigured(false)
          setAuthError("No authentication providers configured")
        } else {
          setAuthConfigured(true)
        }
        setIsLoading(false)
      })
      .catch((error) => {
        console.error("[Auth] NextAuth configuration error:", error)
        setAuthConfigured(false)
        setAuthError(error.message)
        setIsLoading(false)
      })
  }, [])

  if (isLoading) {
    console.log("[Auth] Showing minimal loading while determining auth state")
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-400 text-sm">Starting Astrid...</p>
        </div>
      </div>
    )
  }

  if (!authConfigured) {
    console.log("[Auth] Showing auth not configured screen")
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Authentication Not Configured</h1>
          <p className="text-gray-600 mb-4">This app requires Google OAuth credentials to be configured.</p>
          <p className="text-sm text-gray-500 mb-6">
            Please check your environment variables and Google OAuth configuration.
          </p>
          <div className="bg-blue-50 p-4 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Error:</strong> {authError}
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // Use NextAuth for authentication
  console.log("[Auth] Using NextAuth for authentication")

  // Extract task ID from search params for My Tasks view
  const taskId = searchParams?.get('task')

  return <AuthenticatedApp initialSelectedTaskId={taskId || undefined} />
}

export default function Page() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-400 text-sm">Starting Astrid...</p>
        </div>
      </div>
    }>
      <PageContent />
    </Suspense>
  )
}
