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
  Server,
  Laptop,
  Cloud,
  Zap
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
              <p className="theme-text-muted">Assign tasks to AI agents and get intelligent help</p>
            </div>
          </div>

          {/* Agent Options Overview */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* OpenClaw - Third-party integration */}
            <Card
              className="theme-bg-secondary border-orange-500/50 border cursor-pointer hover:scale-[1.02] transition-transform relative overflow-hidden"
              onClick={() => router.push('/settings/openclaw')}
            >
              <div className="absolute top-2 right-2">
                <span className="text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-2 py-1 rounded-full flex items-center gap-1">
                  <Server className="w-3 h-3" />
                  Third-party
                </span>
              </div>
              <CardContent className="p-6 pt-10">
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-xl">
                    <Laptop className="w-8 h-8 text-orange-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold theme-text-primary text-lg flex items-center justify-center gap-2">
                      OpenClaw
                    </h3>
                    <p className="text-sm theme-text-muted mt-1">
                      Third-party self-hosted AI agent framework
                    </p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                    <span className="font-mono text-xs flex items-center gap-2">
                      <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                      openclaw@astrid.cc
                    </span>
                  </div>
                  <ul className="text-xs theme-text-muted space-y-1 text-left">
                    <li>✓ Runs on your infrastructure</li>
                    <li>✓ Uses your own API keys</li>
                    <li>✓ Supports various AI backends</li>
                  </ul>
                  <p className="text-xs text-orange-600 dark:text-orange-400">
                    Configure below or click for setup help
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Cloud Agents */}
            <Card
              className="theme-bg-secondary theme-border cursor-pointer hover:scale-[1.02] transition-transform"
              onClick={() => router.push('/settings/coding-agents')}
            >
              <CardContent className="p-6">
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
                    <Cloud className="w-8 h-8 text-indigo-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold theme-text-primary text-lg">
                      Cloud Agents
                    </h3>
                    <p className="text-sm theme-text-muted mt-1">
                      Self-hosted SDK agents with GitHub integration
                    </p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2 space-y-1">
                    <span className="font-mono text-xs flex items-center gap-2">
                      <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                      claude@astrid.cc
                    </span>
                    <span className="font-mono text-xs flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      openai@astrid.cc
                    </span>
                    <span className="font-mono text-xs flex items-center gap-2">
                      <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                      gemini@astrid.cc
                    </span>
                  </div>
                  <ul className="text-xs theme-text-muted space-y-1 text-left">
                    <li>✓ Astrid SDK (npm package)</li>
                    <li>✓ GitHub PR automation</li>
                    <li>✓ Vercel preview deployments</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Cloud Agent API Keys - includes OpenClaw */}
          <Card className="theme-bg-secondary theme-border">
            <CardHeader>
              <CardTitle className="theme-text-primary flex flex-wrap items-center gap-2">
                <Sparkles className="w-6 h-6 text-yellow-500" />
                <span>Cloud Agent API Keys</span>
              </CardTitle>
              <CardDescription className="theme-text-muted">
                Configure API keys for cloud agents or connect your self-hosted OpenClaw gateway.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* API Key Configuration */}
              <AIAPIKeyManager />
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
