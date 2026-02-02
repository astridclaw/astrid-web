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
              <h1 className="text-2xl font-bold theme-text-primary">OpenClaw Integration</h1>
              <p className="theme-text-muted">Connect third-party OpenClaw workers to Astrid (advanced)</p>
            </div>
          </div>

          {/* Overview Card */}
          <Card className="theme-bg-secondary border-orange-500/30 border">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm theme-text-primary font-medium">
                    Third-party AI agent integration
                  </p>
                  <p className="text-sm theme-text-muted mt-1">
                    OpenClaw is a third-party open-source project that can run AI coding agents on your
                    own infrastructure. It may use Claude Code CLI, or other AI backends. Astrid supports
                    OpenClaw integration for tasks assigned to
                    <span className="inline-flex items-center gap-1 mx-1 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded">
                      openclaw@astrid.cc
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Button variant="outline" size="sm" asChild>
                      <Link href="https://github.com/openclaw/openclaw" target="_blank" rel="noreferrer">
                        <ExternalLink className="w-4 h-4 mr-1" />
                        OpenClaw GitHub
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Security Warning */}
          <Card className="theme-bg-secondary border-yellow-500/50 border">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm theme-text-primary font-medium">
                    Important: Understand the risks
                  </p>
                  <p className="text-sm theme-text-muted mt-1">
                    OpenClaw is not developed or maintained by Astrid or Anthropic. It is a community project
                    that executes code on your machines with broad system access. Before using OpenClaw:
                  </p>
                  <ul className="text-sm theme-text-muted mt-2 space-y-1 list-disc list-inside">
                    <li>Review the OpenClaw source code and understand what it does</li>
                    <li>Run it in isolated environments (containers, VMs) when possible</li>
                    <li>Never expose OpenClaw to the public internet without authentication</li>
                    <li>Understand that AI agents can make mistakes and execute unintended actions</li>
                  </ul>
                  <p className="text-xs theme-text-muted mt-2 italic">
                    Astrid provides this integration for advanced users. We do not endorse or guarantee
                    the security of third-party tools.
                  </p>
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

          {/* Setup Instructions - Two Options */}
          <Card className="theme-bg-secondary theme-border">
            <CardHeader>
              <CardTitle className="theme-text-primary">Setup Instructions</CardTitle>
              <CardDescription className="theme-text-muted">
                Connect your OpenClaw instance to receive tasks from Astrid.
                OpenClaw can use various AI backends (Claude Code CLI, other agents) - see OpenClaw docs for configuration.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Option A: Register worker in Astrid (Push mode) */}
              <div className="border-l-4 border-orange-500 pl-4">
                <h3 className="font-semibold theme-text-primary mb-3 flex items-center gap-2">
                  <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">A</span>
                  Register your OpenClaw worker (Push mode)
                </h3>
                <p className="text-xs theme-text-muted mb-3 italic">
                  Prerequisite: You already have OpenClaw installed and the gateway running.
                  See <Link href="https://docs.openclaw.ai/start/getting-started" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">OpenClaw docs</Link> for installation.
                </p>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="font-medium theme-text-primary">1. Find your Gateway URL</p>
                    <p className="text-xs theme-text-muted">
                      Check your OpenClaw config or run:
                    </p>
                    <code className="block p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono mt-1">
                      openclaw config get gateway.url
                    </code>
                    <p className="text-xs theme-text-muted mt-1">
                      Default: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">ws://localhost:18789</code>
                    </p>
                  </div>
                  <div>
                    <p className="font-medium theme-text-primary">2. Get your auth token (if using token auth)</p>
                    <code className="block p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono mt-1">
                      openclaw config get gateway.auth.token
                    </code>
                  </div>
                  <div>
                    <p className="font-medium theme-text-primary">3. Add worker using the &quot;Add Worker&quot; button above</p>
                    <p className="text-xs theme-text-muted">
                      Enter your Gateway URL and authentication credentials
                    </p>
                  </div>
                  <div>
                    <p className="font-medium theme-text-primary">4. Assign tasks</p>
                    <p className="text-xs theme-text-muted">
                      Assign tasks to{' '}
                      <span className="inline-flex items-center gap-1 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded">
                        openclaw@astrid.cc
                      </span>
                      {' '}and Astrid will push them to your worker
                    </p>
                  </div>
                </div>
              </div>

              {/* Option B: Configure Astrid channel in OpenClaw (Pull mode) */}
              <div className="border-l-4 border-blue-500 pl-4">
                <h3 className="font-semibold theme-text-primary mb-3 flex items-center gap-2">
                  <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">B</span>
                  Configure Astrid as an OpenClaw channel (Pull mode)
                </h3>
                <p className="text-xs theme-text-muted mb-3 italic">
                  Prerequisite: You already have OpenClaw installed.
                  See <Link href="https://docs.openclaw.ai/start/getting-started" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">OpenClaw docs</Link> for installation.
                </p>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="font-medium theme-text-primary">1. Create OAuth credentials in Astrid</p>
                    <p className="text-xs theme-text-muted">
                      Go to{' '}
                      <Link href="/settings/api-access" className="text-blue-500 hover:underline">
                        Settings → API Access
                      </Link>
                      {' '}and create an OAuth client. Copy the Client ID and Client Secret.
                    </p>
                  </div>
                  <div>
                    <p className="font-medium theme-text-primary">2. Add Astrid channel to your OpenClaw config</p>
                    <p className="text-xs theme-text-muted mb-1">
                      Add this to <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">~/.openclaw/openclaw.json</code>:
                    </p>
                    <code className="block p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono mt-1 whitespace-pre-wrap">
{`{
  "channels": {
    "astrid": {
      "type": "oauth",
      "baseUrl": "https://astrid.cc",
      "clientId": "your-client-id",
      "clientSecret": "your-client-secret",
      "agentEmail": "openclaw@astrid.cc",
      "pollIntervalMs": 30000
    }
  }
}`}
                    </code>
                  </div>
                  <div>
                    <p className="font-medium theme-text-primary">3. Restart OpenClaw</p>
                    <p className="text-xs theme-text-muted">
                      OpenClaw will poll Astrid every 30 seconds for tasks assigned to{' '}
                      <span className="inline-flex items-center gap-1 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded">
                        openclaw@astrid.cc
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Which to choose */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                <p className="text-sm font-medium theme-text-primary mb-2">Which should I use?</p>
                <ul className="text-xs theme-text-muted space-y-2">
                  <li>
                    <strong>Option A (Push):</strong> Astrid connects to your OpenClaw gateway and pushes tasks.
                    <br />
                    <span className="text-green-600 dark:text-green-400">Best for:</span> Always-on servers, OpenClaw accessible via public URL or Tailscale.
                  </li>
                  <li>
                    <strong>Option B (Pull):</strong> OpenClaw polls Astrid&apos;s API for new tasks.
                    <br />
                    <span className="text-green-600 dark:text-green-400">Best for:</span> Laptops, machines behind NAT/firewall, intermittent connections.
                  </li>
                </ul>
                <p className="text-xs theme-text-muted mt-3 italic">
                  OpenClaw handles code execution using its configured AI backend (Claude, GPT, etc.).
                  See the <Link href="https://docs.openclaw.ai/gateway/configuration" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">OpenClaw configuration docs</Link> for agent and model options.
                </p>
              </div>

              {/* Security Notes */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <p className="text-sm font-medium theme-text-primary mb-2">Connection Security</p>
                <ul className="text-sm theme-text-muted space-y-1 list-disc list-inside">
                  <li>Use <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">wss://</code> for remote workers (Tailscale Funnel recommended)</li>
                  <li>Auth tokens stored by Astrid are encrypted at rest</li>
                  <li>Workers only receive tasks assigned to your account</li>
                </ul>
                <p className="text-xs theme-text-muted mt-3 italic">
                  Note: OpenClaw is a separate project with its own security model. Refer to the{' '}
                  <Link href="https://github.com/openclaw/openclaw" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
                    OpenClaw documentation
                  </Link>
                  {' '}for security best practices.
                </p>
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
