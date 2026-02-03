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
import { useTranslations } from "@/lib/i18n/client"

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

function getStatusBadge(status: string, t: (key: string) => string) {
  switch (status) {
    case 'online':
      return <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">{t('settingsPages.openclaw.status.online')}</Badge>
    case 'offline':
      return <Badge variant="secondary">{t('settingsPages.openclaw.status.offline')}</Badge>
    case 'busy':
      return <Badge variant="default" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">{t('settingsPages.openclaw.status.busy')}</Badge>
    case 'error':
      return <Badge variant="destructive">{t('settingsPages.openclaw.status.error')}</Badge>
    default:
      return <Badge variant="secondary">{t('settingsPages.openclaw.status.unknown')}</Badge>
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
  const { t } = useTranslations()
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
  const [newWorkerAuthMode, setNewWorkerAuthMode] = useState('astrid-signed')
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
    return <LoadingScreen message={t('settingsPages.openclaw.loading')} />
  }

  if (!session?.user) {
    return <LoadingScreen message={t('settingsPages.openclaw.loading')} />
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
            <span className="text-sm theme-text-primary">{t('settingsPages.openclaw.breadcrumb')}</span>
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
              <h1 className="text-2xl font-bold theme-text-primary">{t('settingsPages.openclaw.title')}</h1>
              <p className="theme-text-muted">{t('settingsPages.openclaw.description')}</p>
            </div>
          </div>

          {/* Overview Card */}
          <Card className="theme-bg-secondary border-orange-500/30 border">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm theme-text-primary font-medium">
                    {t('settingsPages.openclaw.overview.title')}
                  </p>
                  <p className="text-sm theme-text-muted mt-1">
                    {t('settingsPages.openclaw.overview.description')}
                    <span className="inline-flex items-center gap-1 mx-1 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded">
                      {t('settingsPages.openclaw.overview.agentEmail')}
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
                    {t('settingsPages.openclaw.security.title')}
                  </p>
                  <p className="text-sm theme-text-muted mt-1">
                    {t('settingsPages.openclaw.security.description')}
                  </p>
                  <ul className="text-sm theme-text-muted mt-2 space-y-1 list-disc list-inside">
                    <li>{t('settingsPages.openclaw.security.risks.review')}</li>
                    <li>{t('settingsPages.openclaw.security.risks.isolate')}</li>
                    <li>{t('settingsPages.openclaw.security.risks.noPublic')}</li>
                    <li>{t('settingsPages.openclaw.security.risks.mistakes')}</li>
                  </ul>
                  <p className="text-xs theme-text-muted mt-2 italic">
                    {t('settingsPages.openclaw.security.disclaimer')}
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
                    {t('settingsPages.openclaw.workers.title')}
                  </CardTitle>
                  <CardDescription className="theme-text-muted">
                    {t('settingsPages.openclaw.workers.description')}
                  </CardDescription>
                </div>
                <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="w-4 h-4 mr-1" />
                      {t('settingsPages.openclaw.workers.addWorker')}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t('settingsPages.openclaw.addDialog.title')}</DialogTitle>
                      <DialogDescription>
                        {t('settingsPages.openclaw.addDialog.description')}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="worker-name">{t('settingsPages.openclaw.addDialog.name')}</Label>
                        <Input
                          id="worker-name"
                          placeholder={t('settingsPages.openclaw.addDialog.namePlaceholder')}
                          value={newWorkerName}
                          onChange={(e) => setNewWorkerName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="gateway-url">{t('settingsPages.openclaw.addDialog.gatewayUrl')}</Label>
                        <Input
                          id="gateway-url"
                          placeholder={t('settingsPages.openclaw.addDialog.gatewayUrlPlaceholder')}
                          value={newWorkerUrl}
                          onChange={(e) => setNewWorkerUrl(e.target.value)}
                        />
                        <p className="text-xs theme-text-muted">
                          {t('settingsPages.openclaw.addDialog.gatewayUrlHint')}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="auth-mode">{t('settingsPages.openclaw.addDialog.authMode')}</Label>
                        <Select value={newWorkerAuthMode} onValueChange={setNewWorkerAuthMode}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="astrid-signed">{t('settingsPages.openclaw.authModes.astridSigned')}</SelectItem>
                            <SelectItem value="token">{t('settingsPages.openclaw.authModes.token')}</SelectItem>
                            <SelectItem value="tailscale">{t('settingsPages.openclaw.authModes.tailscale')}</SelectItem>
                            <SelectItem value="none">{t('settingsPages.openclaw.authModes.none')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs theme-text-muted">
                          {newWorkerAuthMode === 'astrid-signed' && t('settingsPages.openclaw.authModes.astridSignedDesc')}
                          {newWorkerAuthMode === 'token' && t('settingsPages.openclaw.authModes.tokenDesc')}
                          {newWorkerAuthMode === 'tailscale' && t('settingsPages.openclaw.authModes.tailscaleDesc')}
                          {newWorkerAuthMode === 'none' && t('settingsPages.openclaw.authModes.noneDesc')}
                        </p>
                      </div>
                      {newWorkerAuthMode === 'token' && (
                        <div className="space-y-2">
                          <Label htmlFor="auth-token">{t('settingsPages.openclaw.addDialog.authToken')}</Label>
                          <Input
                            id="auth-token"
                            type="password"
                            placeholder={t('settingsPages.openclaw.addDialog.authTokenPlaceholder')}
                            value={newWorkerToken}
                            onChange={(e) => setNewWorkerToken(e.target.value)}
                          />
                        </div>
                      )}
                      {newWorkerAuthMode === 'astrid-signed' && (
                        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-xs">
                          <p className="font-medium text-green-700 dark:text-green-300 mb-1">{t('settingsPages.openclaw.astridSignedInfo.title')}</p>
                          <p className="text-green-600 dark:text-green-400">
                            {t('settingsPages.openclaw.astridSignedInfo.description')}{' '}
                            <code className="bg-green-100 dark:bg-green-800 px-1 rounded">{t('settingsPages.openclaw.astridSignedInfo.publicKeyPath')}</code>{' '}
                            {t('settingsPages.openclaw.astridSignedInfo.suffix')}
                          </p>
                        </div>
                      )}
                      {addError && (
                        <p className="text-sm text-red-500">{addError}</p>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                        {t('actions.cancel')}
                      </Button>
                      <Button
                        onClick={handleAddWorker}
                        disabled={addingWorker || !newWorkerName || !newWorkerUrl}
                      >
                        {addingWorker ? t('settingsPages.openclaw.addDialog.adding') : t('settingsPages.openclaw.addDialog.add')}
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
                  <p className="font-medium theme-text-primary mb-1">{t('settingsPages.openclaw.workers.noWorkers')}</p>
                  <p className="text-sm">
                    {t('settingsPages.openclaw.workers.noWorkersHint')}
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
                              {getStatusBadge(worker.status, t)}
                            </p>
                            <p className="text-xs theme-text-muted">
                              {worker.gatewayUrl}
                            </p>
                            <p className="text-xs theme-text-muted">
                              {t('settingsPages.openclaw.workers.lastSeen')}: {formatLastSeen(worker.lastSeen)}
                              {worker.lastError && (
                                <span className="text-red-500 ml-2">
                                  {t('settingsPages.openclaw.workers.error')}: {worker.lastError}
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
              <CardTitle className="theme-text-primary">{t('settingsPages.openclaw.setup.title')}</CardTitle>
              <CardDescription className="theme-text-muted">
                {t('settingsPages.openclaw.setup.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Option A: Register worker in Astrid (Push mode) */}
              <div className="border-l-4 border-orange-500 pl-4">
                <h3 className="font-semibold theme-text-primary mb-3 flex items-center gap-2">
                  <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">A</span>
                  {t('settingsPages.openclaw.setup.optionA.title')}
                </h3>
                <p className="text-xs theme-text-muted mb-3 italic">
                  {t('settingsPages.openclaw.setup.optionA.prerequisite')}{' '}
                  <Link href="https://docs.openclaw.ai/start/getting-started" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">{t('settingsPages.openclaw.setup.optionA.seeDocsLink')}</Link>
                </p>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="font-medium theme-text-primary">1. {t('settingsPages.openclaw.setup.optionA.step1.title')}</p>
                    <p className="text-xs theme-text-muted">
                      {t('settingsPages.openclaw.setup.optionA.step1.description')}
                    </p>
                    <code className="block p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono mt-1">
                      {t('settingsPages.openclaw.setup.optionA.step1.command')}
                    </code>
                    <p className="text-xs theme-text-muted mt-1">
                      {t('settingsPages.openclaw.setup.optionA.step1.default')} <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">ws://localhost:18789</code>
                    </p>
                  </div>
                  <div>
                    <p className="font-medium theme-text-primary">2. {t('settingsPages.openclaw.setup.optionA.step2.title')}</p>
                    <p className="text-xs theme-text-muted mb-2">
                      <strong>{t('settingsPages.openclaw.setup.optionA.step2.recommended')}</strong> {t('settingsPages.openclaw.setup.optionA.step2.astridSignedHint')}
                    </p>
                    <p className="text-xs theme-text-muted">
                      {t('settingsPages.openclaw.setup.optionA.step2.configureGateway')}
                    </p>
                    <code className="block p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono mt-1">
                      https://astrid.cc/.well-known/openclaw-public-key
                    </code>
                    <p className="text-xs theme-text-muted mt-2">
                      <strong>{t('settingsPages.openclaw.setup.optionA.step2.alternative')}</strong> {t('settingsPages.openclaw.setup.optionA.step2.tokenHint')}
                    </p>
                    <code className="block p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono mt-1">
                      {t('settingsPages.openclaw.setup.optionA.step2.tokenCommand')}
                    </code>
                  </div>
                  <div>
                    <p className="font-medium theme-text-primary">3. {t('settingsPages.openclaw.setup.optionA.step3.title')}</p>
                    <p className="text-xs theme-text-muted">
                      {t('settingsPages.openclaw.setup.optionA.step3.description')}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium theme-text-primary">4. {t('settingsPages.openclaw.setup.optionA.step4.title')}</p>
                    <p className="text-xs theme-text-muted">
                      {t('settingsPages.openclaw.setup.optionA.step4.description')}{' '}
                      <span className="inline-flex items-center gap-1 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded">
                        {t('settingsPages.openclaw.overview.agentEmail')}
                      </span>
                      {' '}{t('settingsPages.openclaw.setup.optionA.step4.suffix')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Option B: Configure Astrid channel in OpenClaw (Pull mode) */}
              <div className="border-l-4 border-blue-500 pl-4">
                <h3 className="font-semibold theme-text-primary mb-3 flex items-center gap-2">
                  <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">B</span>
                  {t('settingsPages.openclaw.setup.optionB.title')}
                </h3>
                <p className="text-xs theme-text-muted mb-3 italic">
                  {t('settingsPages.openclaw.setup.optionB.prerequisite')}{' '}
                  <Link href="https://docs.openclaw.ai/start/getting-started" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">{t('settingsPages.openclaw.setup.optionA.seeDocsLink')}</Link>
                </p>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="font-medium theme-text-primary">1. {t('settingsPages.openclaw.setup.optionB.step1.title')}</p>
                    <p className="text-xs theme-text-muted">
                      {t('settingsPages.openclaw.setup.optionB.step1.description')}{' '}
                      <Link href="/settings/api-access" className="text-blue-500 hover:underline">
                        {t('settingsPages.openclaw.setup.optionB.step1.linkText')}
                      </Link>
                      {' '}{t('settingsPages.openclaw.setup.optionB.step1.suffix')}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium theme-text-primary">2. {t('settingsPages.openclaw.setup.optionB.step2.title')}</p>
                    <p className="text-xs theme-text-muted mb-1">
                      {t('settingsPages.openclaw.setup.optionB.step2.description')} <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">~/.openclaw/openclaw.json</code>:
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
                    <p className="font-medium theme-text-primary">3. {t('settingsPages.openclaw.setup.optionB.step3.title')}</p>
                    <p className="text-xs theme-text-muted">
                      {t('settingsPages.openclaw.setup.optionB.step3.description')}{' '}
                      <span className="inline-flex items-center gap-1 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded">
                        {t('settingsPages.openclaw.overview.agentEmail')}
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Which to choose */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                <p className="text-sm font-medium theme-text-primary mb-2">{t('settingsPages.openclaw.setup.whichToUse.title')}</p>
                <ul className="text-xs theme-text-muted space-y-2">
                  <li>
                    <strong>{t('settingsPages.openclaw.setup.whichToUse.optionA.title')}</strong> {t('settingsPages.openclaw.setup.whichToUse.optionA.description')}
                    <br />
                    <span className="text-green-600 dark:text-green-400">Best for:</span> {t('settingsPages.openclaw.setup.whichToUse.optionA.bestFor')}
                  </li>
                  <li>
                    <strong>{t('settingsPages.openclaw.setup.whichToUse.optionB.title')}</strong> {t('settingsPages.openclaw.setup.whichToUse.optionB.description')}
                    <br />
                    <span className="text-green-600 dark:text-green-400">Best for:</span> {t('settingsPages.openclaw.setup.whichToUse.optionB.bestFor')}
                  </li>
                </ul>
                <p className="text-xs theme-text-muted mt-3 italic">
                  {t('settingsPages.openclaw.setup.whichToUse.note')} <Link href="https://docs.openclaw.ai/gateway/configuration" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">{t('settingsPages.openclaw.setup.whichToUse.configDocsLink')}</Link> {t('settingsPages.openclaw.setup.whichToUse.configDocsSuffix')}
                </p>
              </div>

              {/* Security Notes */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <p className="text-sm font-medium theme-text-primary mb-2">{t('settingsPages.openclaw.connectionSecurity.title')}</p>

                {/* Astrid-Signed explanation */}
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 mb-4">
                  <p className="text-sm font-medium text-green-700 dark:text-green-300 mb-2">
                    {t('settingsPages.openclaw.connectionSecurity.astridSigned.title')}
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400 mb-2">
                    {t('settingsPages.openclaw.connectionSecurity.astridSigned.description')}
                  </p>
                  <div className="text-xs text-green-600 dark:text-green-400 space-y-1">
                    <p><strong>{t('settingsPages.openclaw.connectionSecurity.astridSigned.howItWorks')}</strong></p>
                    <ol className="list-decimal list-inside space-y-1 ml-2">
                      <li>{t('settingsPages.openclaw.connectionSecurity.astridSigned.step1')}</li>
                      <li>{t('settingsPages.openclaw.connectionSecurity.astridSigned.step2')}<br/>
                        <code className="bg-green-100 dark:bg-green-800 px-1 rounded">https://astrid.cc/.well-known/openclaw-public-key</code>
                      </li>
                      <li>{t('settingsPages.openclaw.connectionSecurity.astridSigned.step3')}</li>
                      <li>{t('settingsPages.openclaw.connectionSecurity.astridSigned.step4')}</li>
                    </ol>
                  </div>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                    See the{' '}
                    <Link href="https://github.com/anthropics/astrid/blob/main/docs/OPENCLAW_GATEWAY.md" target="_blank" rel="noreferrer" className="underline">
                      {t('settingsPages.openclaw.connectionSecurity.astridSigned.devGuideLink')}
                    </Link>
                    {' '}for implementation details.
                  </p>
                </div>

                <ul className="text-sm theme-text-muted space-y-1 list-disc list-inside">
                  <li>{t('settingsPages.openclaw.connectionSecurity.tips.wss')}</li>
                  <li>{t('settingsPages.openclaw.connectionSecurity.tips.encrypted')}</li>
                  <li>{t('settingsPages.openclaw.connectionSecurity.tips.accountOnly')}</li>
                  <li>{t('settingsPages.openclaw.connectionSecurity.tips.replay')}</li>
                </ul>
                <p className="text-xs theme-text-muted mt-3 italic">
                  {t('settingsPages.openclaw.connectionSecurity.disclaimer')}{' '}
                  <Link href="https://github.com/openclaw/openclaw" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
                    {t('settingsPages.openclaw.connectionSecurity.openclawDocsLink')}
                  </Link>
                  {' '}{t('settingsPages.openclaw.connectionSecurity.disclaimerSuffix')}
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
