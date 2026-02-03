"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Eye,
  EyeOff,
  Save,
  TestTube,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Key,
  Shield,
  Zap,
  Info,
  Trash2,
  UserPlus,
  List
} from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import Link from "next/link"

interface AIServiceConfig {
  id: string
  name: string
  description: string
  icon: string
  baseUrl?: string
  testEndpoint?: string
  keyFormat: {
    prefix: string
    length?: number
    pattern?: RegExp
  }
  documentation: string
  isOpenClaw?: boolean  // Special handling for OpenClaw (Gateway URL instead of model)
  agentEmail?: string   // Agent email to add as member (e.g., openclaw@astrid.cc)
}

const AI_SERVICES: AIServiceConfig[] = [
  {
    id: 'claude',
    name: 'Claude',
    description: 'Claude AI assistant with advanced reasoning capabilities',
    icon: '\uD83E\uDDE0',  // Brain emoji
    baseUrl: 'https://api.anthropic.com',
    testEndpoint: '/v1/models',
    keyFormat: {
      prefix: 'sk-ant-',
      pattern: /^sk-ant-[a-zA-Z0-9_-]+$/
    },
    documentation: 'https://docs.anthropic.com/claude/reference/getting-started',
    agentEmail: 'claude@astrid.cc'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT models and OpenAI Assistant API integration',
    icon: '\uD83E\uDD16',  // Robot emoji
    baseUrl: 'https://api.openai.com',
    testEndpoint: '/v1/models',
    keyFormat: {
      prefix: 'sk-',
      pattern: /^sk-(proj-)?[a-zA-Z0-9_-]+$/
    },
    documentation: 'https://platform.openai.com/docs/api-reference',
    agentEmail: 'openai@astrid.cc'
  },
  {
    id: 'gemini',
    name: 'Gemini',
    description: 'Google Gemini AI with advanced multimodal capabilities',
    icon: '\u2728',  // Sparkles emoji
    baseUrl: 'https://generativelanguage.googleapis.com',
    testEndpoint: '/v1beta/models',
    keyFormat: {
      prefix: 'AI',
      pattern: /^AIza[a-zA-Z0-9_-]+$/
    },
    documentation: 'https://aistudio.google.com/apikey',
    agentEmail: 'gemini@astrid.cc'
  },
  {
    id: 'openclaw',
    name: 'OpenClaw',
    description: 'Self-hosted AI agent framework for coding tasks',
    icon: '\uD83E\uDD9E',  // Lobster emoji
    keyFormat: {
      prefix: '',  // No prefix requirement
      pattern: /^.{8,}$/  // At least 8 chars
    },
    documentation: 'https://github.com/anthropics/claude-code/tree/main/packages/openclaw',
    isOpenClaw: true,
    agentEmail: 'openclaw@astrid.cc'
  }
]

interface APIKeyData {
  [serviceId: string]: {
    hasKey: boolean
    keyPreview?: string
    isValid?: boolean
    lastTested?: string
    error?: string
    gatewayUrl?: string  // For OpenClaw
  }
}

interface ModelPreferences {
  [serviceId: string]: {
    model: string
    isDefault: boolean
  }
}

interface ModelData {
  preferences: ModelPreferences
  defaults: { [serviceId: string]: string }
  suggestions: { [serviceId: string]: string[] }
}

export function AIAPIKeyManager() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [savingModel, setSavingModel] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [showKey, setShowKey] = useState<{ [serviceId: string]: boolean }>({})
  const [apiKeys, setApiKeys] = useState<{ [serviceId: string]: string }>({})
  const [keyData, setKeyData] = useState<APIKeyData>({})
  const [selectedService, setSelectedService] = useState<string>(AI_SERVICES[0].id)
  const [modelData, setModelData] = useState<ModelData | null>(null)
  const [modelInputs, setModelInputs] = useState<{ [serviceId: string]: string }>({})
  const [gatewayUrls, setGatewayUrls] = useState<{ [serviceId: string]: string }>({})
  const [addingToLists, setAddingToLists] = useState<string | null>(null)
  const [userLists, setUserLists] = useState<Array<{ id: string; name: string }>>([])
  const [selectedLists, setSelectedLists] = useState<Set<string>>(new Set())

  const fetchAPIKeys = async () => {
    try {
      const response = await fetch('/api/user/ai-api-keys')
      if (!response.ok) throw new Error('Failed to fetch API keys')

      const data = await response.json()
      setKeyData(data.keys || {})
    } catch (error) {
      console.error('Error fetching API keys:', error)
      toast.error('Failed to load API keys')
    }
  }

  const fetchModelPreferences = async () => {
    try {
      const response = await fetch('/api/user/ai-model-preferences')
      if (!response.ok) throw new Error('Failed to fetch model preferences')

      const data = await response.json()
      setModelData(data)
      // Initialize model inputs with current preferences
      const inputs: { [serviceId: string]: string } = {}
      for (const [serviceId, pref] of Object.entries(data.preferences)) {
        inputs[serviceId] = (pref as { model: string }).model
      }
      setModelInputs(inputs)
    } catch (error) {
      console.error('Error fetching model preferences:', error)
    }
  }

  const fetchUserLists = async () => {
    try {
      const response = await fetch('/api/lists')
      if (!response.ok) return
      const data = await response.json()
      setUserLists(data.lists || [])
    } catch (error) {
      console.error('Error fetching user lists:', error)
    }
  }

  const handleAddAgentToLists = async (serviceId: string) => {
    const service = AI_SERVICES.find(s => s.id === serviceId)
    if (!service?.agentEmail || selectedLists.size === 0) return

    try {
      setAddingToLists(serviceId)
      let successCount = 0
      let errorCount = 0

      for (const listId of selectedLists) {
        try {
          const response = await fetch(`/api/lists/${listId}/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: service.agentEmail,
              role: 'member'
            })
          })

          if (response.ok || response.status === 409) {
            // 409 means already a member, which is fine
            successCount++
          } else {
            errorCount++
          }
        } catch {
          errorCount++
        }
      }

      if (successCount > 0) {
        toast.success(`Added ${service.agentEmail} to ${successCount} list${successCount > 1 ? 's' : ''}`)
      }
      if (errorCount > 0) {
        toast.error(`Failed to add to ${errorCount} list${errorCount > 1 ? 's' : ''}`)
      }

      setSelectedLists(new Set())
    } catch (error) {
      console.error('Error adding agent to lists:', error)
      toast.error('Failed to add agent to lists')
    } finally {
      setAddingToLists(null)
    }
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await Promise.all([fetchAPIKeys(), fetchModelPreferences(), fetchUserLists()])
      setLoading(false)
    }
    loadData()
  }, [])

  const validateKeyFormat = (serviceId: string, key: string): boolean => {
    const service = AI_SERVICES.find(s => s.id === serviceId)
    if (!service) return false

    // OpenClaw has no prefix requirement
    if (service.isOpenClaw) {
      return service.keyFormat.pattern ? service.keyFormat.pattern.test(key) : key.length >= 8
    }

    if (!key.startsWith(service.keyFormat.prefix)) {
      return false
    }

    if (service.keyFormat.length && key.length !== service.keyFormat.length) {
      return false
    }

    if (service.keyFormat.pattern && !service.keyFormat.pattern.test(key)) {
      return false
    }

    return true
  }

  const validateGatewayUrl = (url: string): boolean => {
    if (!url) return false
    return url.startsWith('ws://') || url.startsWith('wss://') || url.startsWith('https://')
  }

  const handleKeyChange = (serviceId: string, value: string) => {
    setApiKeys(prev => ({ ...prev, [serviceId]: value }))
  }

  const handleGatewayUrlChange = (serviceId: string, value: string) => {
    setGatewayUrls(prev => ({ ...prev, [serviceId]: value }))
  }

  const handleSaveKey = async (serviceId: string) => {
    const service = AI_SERVICES.find(s => s.id === serviceId)
    const key = apiKeys[serviceId]
    const gatewayUrl = gatewayUrls[serviceId]

    if (!key) return

    if (!validateKeyFormat(serviceId, key)) {
      toast.error(service?.isOpenClaw ? 'Auth token must be at least 8 characters' : 'Invalid API key format')
      return
    }

    // OpenClaw requires gateway URL
    if (service?.isOpenClaw) {
      if (!gatewayUrl) {
        toast.error('Gateway URL is required for OpenClaw')
        return
      }
      if (!validateGatewayUrl(gatewayUrl)) {
        toast.error('Gateway URL must start with ws://, wss://, or https://')
        return
      }
    }

    try {
      setSaving(serviceId)
      const response = await fetch('/api/user/ai-api-keys', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId,
          apiKey: key,
          ...(service?.isOpenClaw && gatewayUrl ? { gatewayUrl } : {})
        })
      })

      if (!response.ok) throw new Error('Failed to save API key')

      await fetchAPIKeys()
      setApiKeys(prev => ({ ...prev, [serviceId]: '' }))
      if (service?.isOpenClaw) {
        setGatewayUrls(prev => ({ ...prev, [serviceId]: '' }))
      }
      toast.success(`${service?.name} ${service?.isOpenClaw ? 'configuration' : 'API key'} saved`)
    } catch (error) {
      console.error('Error saving API key:', error)
      toast.error('Failed to save API key')
    } finally {
      setSaving(null)
    }
  }

  const handleTestKey = async (serviceId: string) => {
    try {
      setTesting(serviceId)
      const response = await fetch('/api/user/ai-api-keys/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId })
      })

      const result = await response.json()

      if (result.success) {
        toast.success(`${AI_SERVICES.find(s => s.id === serviceId)?.name} API key is valid`)
      } else {
        toast.error(`API key test failed: ${result.error}`)
      }

      await fetchAPIKeys()
    } catch (error) {
      console.error('Error testing API key:', error)
      toast.error('Failed to test API key')
    } finally {
      setTesting(null)
    }
  }

  const handleDeleteKey = async (serviceId: string) => {
    try {
      const response = await fetch('/api/user/ai-api-keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId })
      })

      if (!response.ok) throw new Error('Failed to delete API key')

      await fetchAPIKeys()
      toast.success(`${AI_SERVICES.find(s => s.id === serviceId)?.name} API key deleted`)
    } catch (error) {
      console.error('Error deleting API key:', error)
      toast.error('Failed to delete API key')
    }
  }

  const handleModelChange = (serviceId: string, value: string) => {
    setModelInputs(prev => ({ ...prev, [serviceId]: value }))
  }

  const handleSaveModel = async (serviceId: string) => {
    const model = modelInputs[serviceId]
    if (!model) return

    try {
      setSavingModel(serviceId)
      const response = await fetch('/api/user/ai-model-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId, model })
      })

      if (!response.ok) throw new Error('Failed to save model preference')

      await fetchModelPreferences()
      toast.success(`${AI_SERVICES.find(s => s.id === serviceId)?.name} model updated`)
    } catch (error) {
      console.error('Error saving model preference:', error)
      toast.error('Failed to save model preference')
    } finally {
      setSavingModel(null)
    }
  }

  const handleResetModel = async (serviceId: string) => {
    try {
      setSavingModel(serviceId)
      const response = await fetch('/api/user/ai-model-preferences', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId })
      })

      if (!response.ok) throw new Error('Failed to reset model preference')

      await fetchModelPreferences()
      toast.success(`${AI_SERVICES.find(s => s.id === serviceId)?.name} model reset to default`)
    } catch (error) {
      console.error('Error resetting model preference:', error)
      toast.error('Failed to reset model preference')
    } finally {
      setSavingModel(null)
    }
  }

  const toggleShowKey = (serviceId: string) => {
    setShowKey(prev => ({ ...prev, [serviceId]: !prev[serviceId] }))
  }

  const getStatusBadge = (serviceId: string) => {
    const data = keyData[serviceId]
    if (!data?.hasKey) {
      return <Badge variant="outline">Not configured</Badge>
    }
    if (data.isValid === true) {
      return <Badge variant="default" className="bg-green-600">✓ Valid</Badge>
    }
    if (data.isValid === false) {
      return <Badge variant="destructive">⚠ Invalid</Badge>
    }
    // If key exists but hasn't been tested, show "Configured" instead of "Unknown"
    return <Badge variant="default" className="bg-blue-600">✓ Configured</Badge>
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading API key settings...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          AI Service API Keys
        </CardTitle>
        <CardDescription>
          Add your API keys to enable the AI assistant to respond to your tasks.
          Your keys are encrypted and stored securely. You only need to configure one provider.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert className="mb-6">
          <Shield className="h-4 w-4" />
          <AlertDescription>
            <strong>Security:</strong> Your API keys are encrypted with AES-256 before storage.
            They are only used server-side to process your AI assistant requests.
          </AlertDescription>
        </Alert>

        <div className="space-y-6">
          {/* Service Selection Dropdown */}
          <div className="space-y-2">
            <Label className="font-medium">Select AI Service</Label>
            <Select value={selectedService} onValueChange={setSelectedService}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  <div className="flex items-center gap-2">
                    <span>{AI_SERVICES.find(s => s.id === selectedService)?.icon}</span>
                    <span>{AI_SERVICES.find(s => s.id === selectedService)?.name}</span>
                    {getStatusBadge(selectedService)}
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {AI_SERVICES.map(service => (
                  <SelectItem key={service.id} value={service.id}>
                    <div className="flex items-center gap-2">
                      <span>{service.icon}</span>
                      <span>{service.name}</span>
                      {getStatusBadge(service.id)}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Selected Service Configuration */}
          {(() => {
            const service = AI_SERVICES.find(s => s.id === selectedService)
            const data = keyData[selectedService]
            const currentKey = apiKeys[selectedService] || ''

            if (!service) return null

            return (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <span>{service.icon}</span>
                    {service.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">{service.description}</p>
                </div>

                {data?.hasKey ? (
                  <div className="space-y-4">
                    <div className="p-4 border rounded-lg bg-muted/50">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <Label className="font-medium">
                          {service.isOpenClaw ? 'Current Configuration' : 'Current API Key'}
                        </Label>
                        <div className="flex flex-wrap items-center gap-2">
                          {getStatusBadge(service.id)}
                          {data.lastTested && (
                            <span className="text-xs text-muted-foreground">
                              Tested {new Date(data.lastTested).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Show Gateway URL for OpenClaw */}
                      {service.isOpenClaw && data.gatewayUrl && (
                        <div className="mb-2">
                          <Label className="text-xs text-muted-foreground">Gateway URL</Label>
                          <Input
                            value={data.gatewayUrl}
                            readOnly
                            className="font-mono text-sm"
                          />
                        </div>
                      )}
                      <div>
                        {service.isOpenClaw && <Label className="text-xs text-muted-foreground">Auth Token</Label>}
                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                          <Input
                            type={showKey[service.id] ? 'text' : 'password'}
                            value={data.keyPreview || ''}
                            readOnly
                            className="font-mono text-sm flex-1 min-w-[150px]"
                          />
                          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => toggleShowKey(service.id)}
                              title={showKey[service.id] ? "Hide" : "Show"}
                            >
                              {showKey[service.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleTestKey(service.id)}
                              disabled={testing === service.id}
                              title="Test"
                            >
                              {testing === service.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <TestTube className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteKey(service.id)}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      {data.error && (
                        <Alert className="mt-2">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>{data.error}</AlertDescription>
                        </Alert>
                      )}
                    </div>
                  </div>
                ) : null}

                <div className="space-y-4">
                  {/* Gateway URL input for OpenClaw */}
                  {service.isOpenClaw && (
                    <div>
                      <Label htmlFor={`gateway-${service.id}`} className="font-medium">
                        {data?.hasKey ? 'Update Gateway URL' : 'Gateway URL'}
                      </Label>
                      <p className="text-sm text-muted-foreground mb-2">
                        Use <code className="bg-muted px-1 rounded">ws://</code> for local,{' '}
                        <code className="bg-muted px-1 rounded">wss://</code> or{' '}
                        <code className="bg-muted px-1 rounded">https://</code> for remote
                      </p>
                      <Input
                        id={`gateway-${service.id}`}
                        type="text"
                        placeholder="wss://your-gateway.example.com/"
                        value={gatewayUrls[service.id] || ''}
                        onChange={(e) => handleGatewayUrlChange(service.id, e.target.value)}
                        className="font-mono"
                      />
                    </div>
                  )}
                  <div>
                    <Label htmlFor={`key-${service.id}`} className="font-medium">
                      {service.isOpenClaw
                        ? (data?.hasKey ? 'Update Auth Token' : 'Auth Token')
                        : (data?.hasKey ? 'Update API Key' : 'Enter API Key')
                      }
                    </Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      {service.isOpenClaw
                        ? 'Find this in your OpenClaw config: openclaw config get gateway.auth.token'
                        : `Key should start with "${service.keyFormat.prefix}"${service.keyFormat.length ? ` and be ${service.keyFormat.length} characters long` : ''}.`
                      }
                    </p>
                    <div className="flex flex-wrap sm:flex-nowrap gap-2">
                      <Input
                        id={`key-${service.id}`}
                        type="password"
                        placeholder={service.isOpenClaw ? 'Your OpenClaw gateway token' : `${service.keyFormat.prefix}...`}
                        value={currentKey}
                        onChange={(e) => handleKeyChange(service.id, e.target.value)}
                        className="font-mono flex-1 min-w-[200px]"
                      />
                      <Button
                        onClick={() => handleSaveKey(service.id)}
                        disabled={!currentKey || (service.isOpenClaw && !gatewayUrls[service.id]) || saving === service.id}
                        className="w-full sm:w-auto"
                      >
                        {saving === service.id ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        Save
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Model Selection - Not shown for OpenClaw */}
                {modelData && !service.isOpenClaw && (
                  <div className="space-y-4 pt-4 border-t">
                    <div>
                      <Label htmlFor={`model-${service.id}`} className="font-medium flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        Model Selection
                        {modelData.preferences[service.id]?.isDefault && (
                          <Badge variant="outline" className="text-xs">Default</Badge>
                        )}
                      </Label>
                      <p className="text-sm text-muted-foreground mb-2">
                        Choose which model to use for {service.name} coding workflows.
                        You can enter any model name for future compatibility.
                      </p>
                      <div className="flex flex-wrap sm:flex-nowrap gap-2">
                        <div className="flex-1 min-w-[200px]">
                          <Input
                            id={`model-${service.id}`}
                            list={`model-suggestions-${service.id}`}
                            placeholder={modelData.defaults[service.id]}
                            value={modelInputs[service.id] || ''}
                            onChange={(e) => handleModelChange(service.id, e.target.value)}
                            className="font-mono text-sm"
                          />
                          <datalist id={`model-suggestions-${service.id}`}>
                            {modelData.suggestions[service.id]?.map((model) => (
                              <option key={model} value={model} />
                            ))}
                          </datalist>
                        </div>
                        <Button
                          onClick={() => handleSaveModel(service.id)}
                          disabled={!modelInputs[service.id] || modelInputs[service.id] === modelData.preferences[service.id]?.model || savingModel === service.id}
                          size="sm"
                          className="w-full sm:w-auto"
                        >
                          {savingModel === service.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Save className="h-4 w-4 mr-2" />
                          )}
                          Save Model
                        </Button>
                        {!modelData.preferences[service.id]?.isDefault && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleResetModel(service.id)}
                            disabled={savingModel === service.id}
                            title="Reset to default"
                            className="w-full sm:w-auto"
                          >
                            Reset to Default
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    {service.isOpenClaw ? (
                      <>
                        Need help setting up OpenClaw?{' '}
                        <Link
                          href="/settings/openclaw"
                          className="underline hover:no-underline"
                        >
                          View setup instructions
                        </Link>
                        {' '}or visit the{' '}
                        <a
                          href={service.documentation}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:no-underline"
                        >
                          OpenClaw documentation
                        </a>
                        .
                      </>
                    ) : (
                      <>
                        Get your API key from{' '}
                        <a
                          href={service.documentation}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:no-underline"
                        >
                          {service.name} documentation
                        </a>
                        . This key enables the AI assistant to respond to your tasks intelligently.
                      </>
                    )}
                  </AlertDescription>
                </Alert>

                {/* Add Agent to Lists - show when service has agentEmail and key is configured */}
                {service.agentEmail && data?.hasKey && userLists.length > 0 && (
                  <div className="space-y-4 pt-4 border-t">
                    <div>
                      <Label className="font-medium flex items-center gap-2">
                        <UserPlus className="h-4 w-4" />
                        Add {service.agentEmail} to Lists
                      </Label>
                      <p className="text-sm text-muted-foreground mb-3">
                        Select lists where you want to assign tasks to this agent.
                      </p>
                      <div className="space-y-2 max-h-40 overflow-y-auto border rounded-lg p-3">
                        {userLists.map(list => (
                          <div key={list.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`list-${service.id}-${list.id}`}
                              checked={selectedLists.has(list.id)}
                              onCheckedChange={(checked) => {
                                const newSelected = new Set(selectedLists)
                                if (checked) {
                                  newSelected.add(list.id)
                                } else {
                                  newSelected.delete(list.id)
                                }
                                setSelectedLists(newSelected)
                              }}
                            />
                            <Label
                              htmlFor={`list-${service.id}-${list.id}`}
                              className="text-sm font-normal cursor-pointer flex items-center gap-2"
                            >
                              <List className="h-3 w-3 text-muted-foreground" />
                              {list.name}
                            </Label>
                          </div>
                        ))}
                      </div>
                      <Button
                        onClick={() => handleAddAgentToLists(service.id)}
                        disabled={selectedLists.size === 0 || addingToLists === service.id}
                        size="sm"
                        className="mt-3"
                      >
                        {addingToLists === service.id ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <UserPlus className="h-4 w-4 mr-2" />
                        )}
                        Add to {selectedLists.size} List{selectedLists.size !== 1 ? 's' : ''}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      </CardContent>
    </Card>
  )
}