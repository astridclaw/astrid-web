"use client"

export const dynamic = 'force-dynamic'

import { useEffect, Suspense } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingScreen } from "@/components/loading-screen"
import { AIAPIKeyManager } from "@/components/ai-api-key-manager"
import {
  Brain,
  ArrowLeft,
  Sparkles,
  ChevronRight,
  Server
} from "lucide-react"
import Image from "next/image"

function AgentsSettingsContent() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/auth/signin")
      return
    }
  }, [status, router])

  if (status === "loading") {
    return <LoadingScreen message="Loading AI settings..." />
  }

  if (!session?.user) {
    return <LoadingScreen message="Loading AI settings..." />
  }

  return (
    <div className="min-h-screen theme-bg-primary">
      {/* Header */}
      <div className="theme-header theme-border app-header">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <Button
            variant="ghost"
            onClick={() => router.push('/settings')}
            className="p-2 hover:bg-opacity-20"
          >
            <ArrowLeft className="w-5 h-5 theme-text-primary" />
          </Button>
          <div
            className="flex flex-wrap items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => router.push('/')}
            title="Go to Home"
          >
            <Image src="/icons/icon-96x96.png" alt="Astrid" width={24} height={24} className="rounded" />
            <span className="text-xl font-semibold theme-text-primary">astrid</span>
          </div>
          <div className="flex items-center space-x-1 theme-count-bg rounded-full px-3 py-1">
            <div className="w-2 h-2 theme-bg-tertiary rounded-full"></div>
            <span className="text-sm theme-text-primary">AI Agents</span>
          </div>
        </div>
      </div>

      {/* Settings Content */}
      <div className="p-2 sm:p-4">
        <div className="max-w-sm sm:max-w-2xl mx-auto space-y-4 sm:space-y-6">
          {/* Settings Page Header */}
          <div className="flex flex-wrap items-center gap-3">
            <Brain className="w-8 h-8 text-purple-500" />
            <div>
              <h1 className="text-2xl font-bold theme-text-primary">AI Agents</h1>
              <p className="theme-text-muted">Add your API keys to enable AI assistance on your tasks</p>
            </div>
          </div>

          {/* Basic AI Assistant Section - Main Content */}
          <Card className="theme-bg-secondary theme-border">
            <CardHeader>
              <CardTitle className="theme-text-primary flex flex-wrap items-center gap-2">
                <Sparkles className="w-6 h-6 text-yellow-500" />
                <span>AI Assistant</span>
              </CardTitle>
              <CardDescription className="theme-text-muted">
                Add your own API keys to enable intelligent AI responses on your tasks.
                Assign tasks to AI agents and get analysis, suggestions, and help.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* How to Use */}
              <div className="border-l-4 border-yellow-500 pl-4">
                <h3 className="font-semibold theme-text-primary mb-2">How to Use</h3>
                <div className="text-sm theme-text-muted space-y-2">
                  <p>Assign tasks to any of these AI agents:</p>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-1 font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                      claude@astrid.cc
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      openai@astrid.cc
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                      gemini@astrid.cc
                    </div>
                  </div>
                  <p className="text-xs theme-text-muted">
                    The agent will use your API key (configured below) to respond intelligently to your tasks.
                  </p>
                </div>
              </div>

              {/* API Key Configuration */}
              <AIAPIKeyManager />
            </CardContent>
          </Card>

          {/* Link to Coding Agents */}
          <Card
            className="theme-bg-secondary theme-border cursor-pointer hover:scale-[1.01] transition-transform"
            onClick={() => router.push('/settings/coding-agents')}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="p-2 theme-bg-tertiary rounded-lg">
                    <Server className="w-6 h-6 text-indigo-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold theme-text-primary flex items-center gap-2">
                      Coding Agents
                      <span className="text-xs font-normal bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded">
                        Advanced
                      </span>
                    </h3>
                    <p className="text-sm theme-text-muted">
                      Set up self-hosted coding agents with GitHub integration using the Astrid SDK
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 theme-text-muted" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default function AgentsSettingsPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AgentsSettingsContent />
    </Suspense>
  )
}
