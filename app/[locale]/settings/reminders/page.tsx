"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect, Suspense } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingScreen } from "@/components/loading-screen"
import { ReminderSettingsComponent } from "@/components/reminder-settings"
import { CalendarIntegrationSettings } from "@/components/calendar-integration-settings"
import { UserDefaultDueTimeSettings } from "@/components/user-default-due-time-settings"
import { PushNotificationSettings } from "@/components/push-notification-settings"
import { useTranslations } from "@/lib/i18n/client"
import {
  Bell,
  Calendar,
  Heart,
  ArrowLeft
} from "lucide-react"
import Image from "next/image"

function RemindersSettingsContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { t } = useTranslations()

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/auth/signin")
      return
    }
  }, [status, router])

  if (status === "loading") {
    return <LoadingScreen message={t("messages.loading")} />
  }

  if (!session?.user) {
    return <LoadingScreen message={t("messages.loading")} />
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
            <span className="text-sm theme-text-primary">{t("settings.remindersNotifications")}</span>
          </div>
        </div>
      </div>

      {/* Settings Content */}
      <div className="p-2 sm:p-4">
        <div className="max-w-sm sm:max-w-2xl mx-auto space-y-4 sm:space-y-6">
          {/* Settings Page Header */}
          <div className="flex items-center space-x-3">
            <Bell className="w-8 h-8 text-orange-500" />
            <div>
              <h1 className="text-2xl font-bold theme-text-primary">{t("settingsPages.remindersNotifications.title")}</h1>
              <p className="theme-text-muted">{t("settingsPages.remindersNotifications.description")}</p>
            </div>
          </div>

          {/* Reminder Settings */}
          <ReminderSettingsComponent />

          {/* Push Notification Settings */}
          <PushNotificationSettings />

          {/* Calendar Integration Settings */}
          <CalendarIntegrationSettings />

          {/* User Default Due Time Settings */}
          <UserDefaultDueTimeSettings />
        </div>
      </div>
    </div>
  )
}

export default function RemindersSettingsPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <RemindersSettingsContent />
    </Suspense>
  )
}