"use client"

export const dynamic = 'force-dynamic'

import { useEffect, Suspense, useState, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingScreen } from "@/components/loading-screen"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  ArrowLeft,
  Cog,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ExternalLink,
  Info,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"

interface OpenClawWorker {
  id: string
  name: string
  gatewayUrl: string
  authMode: string
  status: 'online' | 'offline' | 'busy' | 'error' | 'unknown'
  lastSeen: string | null
  lastError: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'online':
      return <CheckCircle className="w-4 h-4 text-green-500" />
    case 'offline':
      return <XCircle className="w-4 h-4 text-gray-400" />
    case 'busy':
      return <Clock className="w-4 h-4 text-yellow-500" />
    case 'error':
      return <AlertTriangle className="w-4 h-4 text-red-500" />
    default:
      return <Clock className="w-4 h-4 text-gray-400" />
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'online':
      return <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Online</Badge>
    case 'offline':
      return <Badge variant="secondary">Offline</Badge>
    case 'busy':
      return <Badge variant="default" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">Busy</Badge>
    case 'error':
      return <Badge variant="destructive">Error</Badge>
    default:
      return <Badge variant="secondary">Unknown</Badge>
  }
}

function formatLastSeen(lastSeen: string | null): string {
  if (!lastSeen) return 'Never'

  const date = new Date(lastSeen)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString()
}

function OpenClawSettingsContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [workers, setWorkers] = useState<OpenClawWorker[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [addingWorker, setAddingWorker] = useState(false)
  const [checkingHealth, setCheckingHealth] = useState<string | null>(null)
  const [deletingWorker, setDeletingWorker] = useState<string | null>(null)

  // Add worker form state
  const [newWorkerName, setNewWorkerName] = useState('')
  const [newWorkerUrl, setNewWorkerUrl] = useState('')
  const [newWorkerToken, setNewWorkerToken] = useState('')
  const [newWorkerAuthMode, setNewWorkerAuthMode] = useState('token')
  const [addError, setAddError] = useState<string | null>(null)

  const fetchWorkers = useCallback(async () => {
    try {
      const response = await fetch('/api/openclaw/workers')
      if (response.ok) {
        const data = await response.json()
        setWorkers(data.workers || [])
      }
    } catch (error) {
      console.error('Failed to fetch workers:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/auth/signin")
      return
    }

    if (session?.user) {
      fetchWorkers()
    }
  }, [status, session, router, fetchWorkers])

  const handleAddWorker = async () => {
    setAddingWorker(true)
    setAddError(null)

    try {
      const response = await fetch('/api/openclaw/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newWorkerName,
          gatewayUrl: newWorkerUrl,
          authToken: newWorkerToken || undefined,
          authMode: newWorkerAuthMode,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setAddError(data.error || 'Failed to add worker')
        return
      }

      // Add the new worker to the list
      setWorkers(prev => [data.worker, ...prev])
      setShowAddDialog(false)

      // Reset form
      setNewWorkerName('')
      setNewWorkerUrl('')
      setNewWorkerToken('')
      setNewWorkerAuthMode('token')
    } catch (error) {
      setAddError('Failed to add worker')
    } finally {
      setAddingWorker(false)
    }
  }

  const handleCheckHealth = async (workerId: string) => {
    setCheckingHealth(workerId)

    try {
      const response = await fetch(`/api/openclaw/workers/${workerId}/health`)
      if (response.ok) {
        const data = await response.json()
        setWorkers(prev => prev.map(w =>
          w.id === workerId
            ? { ...w, status: data.status, lastSeen: data.lastSeen, lastError: data.health.error }
            : w
        ))
      }
    } catch (error) {
      console.error('Failed to check health:', error)
    } finally {
      setCheckingHealth(null)
    }
  }

  const handleDeleteWorker = async (workerId: string) => {
    setDeletingWorker(workerId)

    try {
      const response = await fetch(`/api/openclaw/workers/${workerId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setWorkers(prev => prev.filter(w => w.id !== workerId))
      }
    } catch (error) {
      console.error('Failed to delete worker:', error)
    } finally {
      setDeletingWorker(null)
    }
  }

  if (status === "loading" || loading) {
    return <LoadingScreen message="Loading OpenClaw settings..." />
  }

  if (!session?.user) {
    return <LoadingScreen message="Loading OpenClaw settings..." />
  }

  return (
    <div className="min-h-screen theme-bg-primary">
      {/* Header */}
      <div className="theme-header theme-border app-header">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <Button
            variant="ghost"
            onClick={() => router.push('/settings/agents')}
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
            <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
            <span className="text-sm theme-text-primary">OpenClaw Workers</span>
          </div>
        </div>
      </div>

      {/* Settings Content */}
      <div className="p-2 sm:p-4">
        <div className="max-w-sm sm:max-w-4xl mx-auto space-y-4 sm:space-y-6">
          {/* Settings Page Header */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-3xl">🦞</span>
            <div>
              <h1 className="text-2xl font-bold theme-text-primary">OpenClaw Workers</h1>
              <p className="theme-text-muted">Connect your self-hosted OpenClaw workers to Astrid</p>
            </div>
          </div>

          {/* Overview Card */}
          <Card className="theme-bg-secondary border-orange-500/30 border">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm theme-text-primary font-medium">
                    Connect your Astrid list to an AI coding agent
                  </p>
                  <p className="text-sm theme-text-muted mt-1">
                    OpenClaw connects your Astrid lists to Claude Code running on your own machine.
                    Assign tasks to
                    <span className="inline-flex items-center gap-1 mx-1 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded">
                      openclaw@astrid.cc
                    </span>
                    and they&apos;ll be picked up by your worker automatically.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Button variant="outline" size="sm" asChild>
                      <Link href="https://github.com/anthropics/claude-code" target="_blank" rel="noreferrer">
                        <ExternalLink className="w-4 h-4 mr-1" />
                        Claude Code
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Workers List */}
          <Card className="theme-bg-secondary theme-border">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="theme-text-primary flex items-center gap-2">
                    <Cog className="w-5 h-5 text-orange-500" />
                    Registered Workers
                  </CardTitle>
                  <CardDescription className="theme-text-muted">
                    Workers you&apos;ve connected to Astrid
                  </CardDescription>
                </div>
                <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="w-4 h-4 mr-1" />
                      Add Worker
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add OpenClaw Worker</DialogTitle>
                      <DialogDescription>
                        Connect a self-hosted OpenClaw Gateway to Astrid
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="worker-name">Name</Label>
                        <Input
                          id="worker-name"
                          placeholder="My MacBook Worker"
                          value={newWorkerName}
                          onChange={(e) => setNewWorkerName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="gateway-url">Gateway URL</Label>
                        <Input
                          id="gateway-url"
                          placeholder="ws://localhost:18789"
                          value={newWorkerUrl}
                          onChange={(e) => setNewWorkerUrl(e.target.value)}
                        />
                        <p className="text-xs theme-text-muted">
                          Use <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">ws://</code> for local or{' '}
                          <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">wss://</code> for Tailscale Funnel
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="auth-mode">Authentication Mode</Label>
                        <Select value={newWorkerAuthMode} onValueChange={setNewWorkerAuthMode}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="token">Token</SelectItem>
                            <SelectItem value="tailscale">Tailscale (no auth needed)</SelectItem>
                            <SelectItem value="none">None (local only)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {newWorkerAuthMode === 'token' && (
                        <div className="space-y-2">
                          <Label htmlFor="auth-token">Auth Token</Label>
                          <Input
                            id="auth-token"
                            type="password"
                            placeholder="Gateway authentication token"
                            value={newWorkerToken}
                            onChange={(e) => setNewWorkerToken(e.target.value)}
                          />
                        </div>
                      )}
                      {addError && (
                        <p className="text-sm text-red-500">{addError}</p>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={handleAddWorker}
                        disabled={addingWorker || !newWorkerName || !newWorkerUrl}
                      >
                        {addingWorker ? 'Adding...' : 'Add Worker'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {workers.length === 0 ? (
                <div className="text-center py-8 theme-text-muted">
                  <span className="text-4xl mb-4 block">🦞</span>
                  <p className="font-medium theme-text-primary mb-1">No workers registered</p>
                  <p className="text-sm">
                    Add an OpenClaw worker to start delegating tasks
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {workers.map((worker) => (
                    <div
                      key={worker.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(worker.status)}
                          <div>
                            <p className="font-medium theme-text-primary flex items-center gap-2">
                              {worker.name}
                              {getStatusBadge(worker.status)}
                            </p>
                            <p className="text-xs theme-text-muted">
                              {worker.gatewayUrl}
                            </p>
                            <p className="text-xs theme-text-muted">
                              Last seen: {formatLastSeen(worker.lastSeen)}
                              {worker.lastError && (
                                <span className="text-red-500 ml-2">
                                  Error: {worker.lastError}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCheckHealth(worker.id)}
                          disabled={checkingHealth === worker.id}
                        >
                          <RefreshCw className={`w-4 h-4 ${checkingHealth === worker.id ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteWorker(worker.id)}
                          disabled={deletingWorker === worker.id}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Start */}
          <Card className="theme-bg-secondary theme-border">
            <CardHeader>
              <CardTitle className="theme-text-primary">Quick Start</CardTitle>
              <CardDescription className="theme-text-muted">
                Connect in 3 steps - like adding a bot to Discord
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4 text-sm">
                <div className="flex gap-3">
                  <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</span>
                  <div>
                    <p className="font-medium theme-text-primary">Install the Astrid SDK</p>
                    <code className="block p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono mt-1">
                      npm install -g @gracefultools/astrid-sdk
                    </code>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</span>
                  <div>
                    <p className="font-medium theme-text-primary">Start the agent in your project</p>
                    <code className="block p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono mt-1">
                      cd /your/project && npx astrid-agent --terminal
                    </code>
                    <p className="text-xs theme-text-muted mt-1">
                      Or register a worker above with your gateway URL (default: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">ws://localhost:18789</code>)
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">3</span>
                  <div>
                    <p className="font-medium theme-text-primary">Assign tasks</p>
                    <p className="text-xs theme-text-muted">
                      Assign any task to{' '}
                      <span className="inline-flex items-center gap-1 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded">
                        openclaw@astrid.cc
                      </span>
                      {' '}and it&apos;ll be picked up automatically
                    </p>
                  </div>
                </div>
              </div>

              {/* Alternative: OAuth polling mode */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                <p className="text-sm font-medium theme-text-primary mb-2">Alternative: Pull mode</p>
                <p className="text-xs theme-text-muted mb-2">
                  Instead of registering a worker here, you can configure the Astrid SDK to poll for tasks using OAuth credentials from{' '}
                  <Link href="/settings/api-access" className="text-blue-500 hover:underline">
                    Settings → API Access
                  </Link>
                </p>
                <code className="block p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono whitespace-pre-wrap">
{`export ASTRID_OAUTH_CLIENT_ID="your-id"
export ASTRID_OAUTH_CLIENT_SECRET="your-secret"
npx astrid-agent --terminal`}
                </code>
              </div>

              {/* Security Notes */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <p className="text-sm font-medium theme-text-primary mb-2">Security</p>
                <ul className="text-sm theme-text-muted space-y-1 list-disc list-inside">
                  <li>Use <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">wss://</code> for remote workers (Tailscale Funnel recommended)</li>
                  <li>Auth tokens are encrypted at rest</li>
                  <li>Workers only execute tasks for your account</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default function OpenClawSettingsPage() {
  return (
    <Suspense fallback={<LoadingScreen message="Loading OpenClaw settings..." />}>
      <OpenClawSettingsContent />
    </Suspense>
  )
}
