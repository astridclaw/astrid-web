"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect, Suspense } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LoadingScreen } from "@/components/loading-screen"
import {
  CheckSquare,
  Mail,
  Heart,
  ArrowLeft,
  Clock,
  AlertCircle
} from "lucide-react"
import Image from "next/image"
import { Alert, AlertDescription } from "@/components/ui/alert"

function TasksSettingsContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // Email-to-Task settings
  const [emailToTaskEnabled, setEmailToTaskEnabled] = useState(true)
  const [defaultTaskDueOffset, setDefaultTaskDueOffset] = useState("1_week")
  const [defaultDueTime, setDefaultDueTime] = useState("17:00")

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/auth/signin")
      return
    }

    // Load current settings
    if (session?.user) {
      loadSettings()
    }
  }, [status, router, session])

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/user/settings')
      if (response.ok) {
        const data = await response.json()
        setEmailToTaskEnabled(data.emailToTaskEnabled ?? true)
        setDefaultTaskDueOffset(data.defaultTaskDueOffset || "1_week")
        setDefaultDueTime(data.defaultDueTime || "17:00")
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    }
  }

  const saveSettings = async () => {
    setIsSaving(true)
    setSaveMessage(null)

    try {
      const response = await fetch('/api/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailToTaskEnabled,
          defaultTaskDueOffset,
          defaultDueTime,
        })
      })

      if (response.ok) {
        setSaveMessage('Settings saved successfully!')
        setTimeout(() => setSaveMessage(null), 3000)
      } else {
        setSaveMessage('Failed to save settings')
      }
    } catch (error) {
      console.error('Error saving settings:', error)
      setSaveMessage('Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  if (status === "loading") {
    return <LoadingScreen message="Loading task settings..." />
  }

  if (!session?.user) {
    return <LoadingScreen message="Loading task settings..." />
  }

  return (
    <div className="min-h-screen theme-bg-primary">
      {/* Header */}
      <div className="theme-header theme-border app-header">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            onClick={() => router.push('/settings')}
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
            <span className="text-sm theme-text-primary">Task Settings</span>
          </div>
        </div>
      </div>

      {/* Settings Content */}
      <div className="p-2 sm:p-4">
        <div className="max-w-sm sm:max-w-2xl mx-auto space-y-4 sm:space-y-6">
          {/* Settings Page Header */}
          <div className="flex items-center space-x-3">
            <CheckSquare className="w-8 h-8 text-blue-500" />
            <div>
              <h1 className="text-2xl font-bold theme-text-primary">Task Settings</h1>
              <p className="theme-text-muted">Configure default task behavior and email-to-task preferences</p>
            </div>
          </div>

          {/* Save Message */}
          {saveMessage && (
            <Alert className={saveMessage.includes('success') ? 'bg-green-900/20 border-green-600' : 'bg-red-900/20 border-red-600'}>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{saveMessage}</AlertDescription>
            </Alert>
          )}

          {/* Email-to-Task Settings */}
          <Card className="theme-bg-card theme-border">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Mail className="w-5 h-5 text-purple-500" />
                <CardTitle className="theme-text-primary">Email-to-Task</CardTitle>
              </div>
              <CardDescription className="theme-text-muted">
                Create tasks by sending emails to remindme@astrid.cc
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Enable/Disable */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="theme-text-primary">Enable Email-to-Task</Label>
                  <p className="text-sm theme-text-muted">
                    Allow creating tasks via email
                  </p>
                </div>
                <Switch
                  checked={emailToTaskEnabled}
                  onCheckedChange={setEmailToTaskEnabled}
                />
              </div>

              {/* Default Due Date Offset */}
              <div className="space-y-2">
                <Label className="theme-text-primary">Default Due Date</Label>
                <Select value={defaultTaskDueOffset} onValueChange={setDefaultTaskDueOffset}>
                  <SelectTrigger className="theme-bg-secondary theme-border theme-text-primary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="theme-bg-card theme-border">
                    <SelectItem value="none" className="theme-text-primary hover:theme-bg-hover">No due date</SelectItem>
                    <SelectItem value="1_day" className="theme-text-primary hover:theme-bg-hover">1 day</SelectItem>
                    <SelectItem value="3_days" className="theme-text-primary hover:theme-bg-hover">3 days</SelectItem>
                    <SelectItem value="1_week" className="theme-text-primary hover:theme-bg-hover">1 week (default)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm theme-text-muted">
                  Tasks created via email will be due this many days from the send date
                </p>
              </div>

              {/* Default Due Time */}
              <div className="space-y-2">
                <Label className="theme-text-primary flex items-center space-x-2">
                  <Clock className="w-4 h-4" />
                  <span>Default Due Time</span>
                </Label>
                <Select value={defaultDueTime} onValueChange={setDefaultDueTime}>
                  <SelectTrigger className="theme-bg-secondary theme-border theme-text-primary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="theme-bg-card theme-border">
                    <SelectItem value="09:00" className="theme-text-primary hover:theme-bg-hover">9:00 AM</SelectItem>
                    <SelectItem value="12:00" className="theme-text-primary hover:theme-bg-hover">12:00 PM (Noon)</SelectItem>
                    <SelectItem value="17:00" className="theme-text-primary hover:theme-bg-hover">5:00 PM (default)</SelectItem>
                    <SelectItem value="20:00" className="theme-text-primary hover:theme-bg-hover">8:00 PM</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm theme-text-muted">
                  Time of day for tasks created via email
                </p>
              </div>

              {/* Email-to-Task Instructions */}
              <div className="p-4 theme-bg-secondary rounded-lg border theme-border">
                <h4 className="font-medium theme-text-primary mb-2">How to use Email-to-Task:</h4>
                <ul className="space-y-2 text-sm theme-text-muted">
                  <li className="flex items-start space-x-2">
                    <span className="text-blue-500 mt-0.5">•</span>
                    <span><strong>Self-task:</strong> Send TO remindme@astrid.cc</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-blue-500 mt-0.5">•</span>
                    <span><strong>Assigned task:</strong> CC remindme@astrid.cc with one recipient in TO</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-blue-500 mt-0.5">•</span>
                    <span><strong>Group task:</strong> CC remindme@astrid.cc with multiple recipients</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-purple-500 mt-0.5">•</span>
                    <span><strong>Subject</strong> becomes task title</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-purple-500 mt-0.5">•</span>
                    <span><strong>Body</strong> becomes task description</span>
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              onClick={saveSettings}
              disabled={isSaving}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TasksSettingsPage() {
  return (
    <Suspense fallback={<LoadingScreen message="Loading task settings..." />}>
      <TasksSettingsContent />
    </Suspense>
  )
}
