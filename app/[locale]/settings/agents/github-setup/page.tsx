"use client"

export const dynamic = 'force-dynamic'

import { useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { LoadingScreen } from "@/components/loading-screen"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle, AlertCircle, Github, ArrowRight, Heart } from "lucide-react"
import Image from "next/image"

function GitHubSetupCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()

  const installationId = searchParams?.get('installation_id')
  const setupAction = searchParams?.get('setup_action')
  const code = searchParams?.get('code')
  const error = searchParams?.get('error')

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/auth/signin")
      return
    }

    if (status === "authenticated" && (installationId || code)) {
      // Process the GitHub app installation
      const handleGitHubCallback = async () => {
        try {
          // Build the callback URL for the API handler
          const params = new URLSearchParams()
          if (installationId) params.set('installation_id', installationId)
          if (setupAction) params.set('setup_action', setupAction)
          if (code) params.set('code', code)

          // Redirect to the API handler which will process the installation
          window.location.href = `/api/github/setup?${params.toString()}`
        } catch (error) {
          console.error('Error processing GitHub callback:', error)
          router.push('/settings/coding-agents?github=error')
        }
      }

      handleGitHubCallback()
    }
  }, [status, installationId, code, setupAction, router])

  const handleContinue = () => {
    router.push('/settings/coding-agents')
  }

  if (status === "loading") {
    return <LoadingScreen message="Loading GitHub setup..." />
  }

  if (!session?.user) {
    return <LoadingScreen message="Authenticating..." />
  }

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen theme-bg-primary">
        {/* Header */}
        <div className="theme-header theme-border app-header">
          <div className="flex items-center space-x-4">
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
              <span className="text-sm theme-text-primary">GitHub Setup</span>
            </div>
          </div>
        </div>

        <div className="p-4">
          <div className="max-w-md mx-auto mt-16">
            <Card className="theme-bg-secondary theme-border border-red-200">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <AlertCircle className="w-8 h-8 text-red-500" />
                  <div>
                    <CardTitle className="theme-text-primary">Setup Failed</CardTitle>
                    <CardDescription className="theme-text-muted">
                      There was an error setting up GitHub integration
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm theme-text-muted mb-4">
                  Error: {error}
                </p>
                <Button onClick={handleContinue} className="w-full">
                  <ArrowRight className="w-4 h-4 mr-2" />
                  Return to Settings
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  // Show processing state while handling callback
  if (installationId || code) {
    return (
      <div className="min-h-screen theme-bg-primary">
        {/* Header */}
        <div className="theme-header theme-border app-header">
          <div className="flex items-center space-x-4">
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
              <span className="text-sm theme-text-primary">GitHub Setup</span>
            </div>
          </div>
        </div>

        <div className="p-4">
          <div className="max-w-md mx-auto mt-16">
            <Card className="theme-bg-secondary theme-border">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <Github className="w-8 h-8 text-gray-700" />
                  <div>
                    <CardTitle className="theme-text-primary">Processing GitHub Setup</CardTitle>
                    <CardDescription className="theme-text-muted">
                      Connecting your GitHub installation...
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                </div>
                <p className="text-sm theme-text-muted text-center">
                  Please wait while we configure your GitHub integration...
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  // Default success state (shouldn't normally reach here)
  return (
    <div className="min-h-screen theme-bg-primary">
      {/* Header */}
      <div className="theme-header theme-border app-header">
        <div className="flex items-center space-x-4">
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
            <span className="text-sm theme-text-primary">GitHub Setup</span>
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="max-w-md mx-auto mt-16">
          <Card className="theme-bg-secondary theme-border border-green-200">
            <CardHeader>
              <div className="flex items-center space-x-3">
                <CheckCircle className="w-8 h-8 text-green-500" />
                <div>
                  <CardTitle className="theme-text-primary">GitHub Connected!</CardTitle>
                  <CardDescription className="theme-text-muted">
                    Your GitHub integration is ready to use
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm theme-text-muted mb-4">
                You can now use the Astrid Agent to generate code and create pull requests.
              </p>
              <Button onClick={handleContinue} className="w-full">
                <ArrowRight className="w-4 h-4 mr-2" />
                Continue to Settings
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default function GitHubSetupCallbackPage() {
  return (
    <Suspense fallback={<LoadingScreen message="Loading GitHub setup..." />}>
      <GitHubSetupCallbackContent />
    </Suspense>
  )
}
