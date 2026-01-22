"use client"

export const dynamic = 'force-dynamic'

import { Suspense, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingScreen } from "@/components/loading-screen"
import { offlineDB } from "@/lib/offline-db"
import { useTranslations } from "@/lib/i18n/client"
import {
  User,
  Bell,
  Brain,
  Bug,
  Palette,
  ChevronRight,
  Network,
  Users,
  HelpCircle
} from "lucide-react"
import Image from "next/image"

function SettingsContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { t } = useTranslations()

  // Clear IndexedDB in background - don't block the UI
  useEffect(() => {
    // Use requestIdleCallback to avoid blocking initial render
    const clearCache = () => {
      offlineDB.forceRefresh().catch(error => {
        console.error("[IndexedDB] Error clearing cache:", error)
      })
    }

    if ('requestIdleCallback' in window) {
      (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(clearCache)
    } else {
      setTimeout(clearCache, 100)
    }
  }, [])

  // Redirect if unauthenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/auth/signin")
    }
  }, [status, router])

  // Only show loading on initial load, not on navigation
  if (status === "unauthenticated") {
    return <LoadingScreen message="Redirecting..." />
  }

  // Don't block render if session exists (even if status is still loading)
  if (status === "loading" && !session) {
    return <LoadingScreen message="Loading settings..." />
  }

  const settingsCategories = [
    {
      icon: User,
      title: t("settingsPages.accountAccess.title"),
      description: t("settingsPages.accountAccess.description"),
      path: "/settings/account",
      color: "text-blue-500"
    },
    {
      icon: Bell,
      title: t("settingsPages.remindersNotifications.title"),
      description: t("settingsPages.remindersNotifications.description"),
      path: "/settings/reminders",
      color: "text-orange-500"
    },
    {
      icon: Brain,
      title: t("settingsPages.aiAgents.title"),
      description: t("settingsPages.aiAgents.description"),
      path: "/settings/agents",
      color: "text-purple-500"
    },
    {
      icon: Network,
      title: t("settingsPages.apiAccess.title"),
      description: t("settingsPages.apiAccess.description"),
      path: "/settings/api-access",
      color: "text-blue-600"
    },
    {
      icon: Users,
      title: t("settingsPages.contacts.title"),
      description: t("settingsPages.contacts.description"),
      path: "/settings/contacts",
      color: "text-teal-500"
    },
    {
      icon: Palette,
      title: t("settingsPages.appearance.title"),
      description: t("settingsPages.appearance.description"),
      path: "/settings/appearance",
      color: "text-pink-500"
    },
    {
      icon: Bug,
      title: t("settingsPages.debug.title"),
      description: t("settingsPages.debug.description"),
      path: "/settings/debug",
      color: "text-green-500"
    },
    {
      icon: HelpCircle,
      title: "Help & Support",
      description: "Troubleshooting guides and contact support",
      path: "/help",
      color: "text-cyan-500"
    }
  ]

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
            <Image
              src="/icons/icon-96x96.png"
              alt="Astrid"
              width={24}
              height={24}
              className="rounded"
            />
            <span className="text-xl font-semibold theme-text-primary">astrid</span>
          </div>
          <div className="flex items-center space-x-1 theme-count-bg rounded-full px-3 py-1">
            <div className="w-2 h-2 theme-bg-tertiary rounded-full"></div>
            <span className="text-sm theme-text-primary">{t("settings.settings")}</span>
          </div>
        </div>
      </div>

      {/* Settings Content */}
      <div className="p-2 sm:p-4">
        <div className="max-w-sm sm:max-w-2xl mx-auto space-y-4 sm:space-y-6">
          {/* Settings Page Header */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <div className="w-4 h-4 bg-white rounded-sm"></div>
            </div>
            <div>
              <h1 className="text-2xl font-bold theme-text-primary">{t("settings.settings")}</h1>
              <p className="theme-text-muted">{t("settingsPages.manageAccount")}</p>
            </div>
          </div>

          {/* Settings Categories Grid */}
          <div className="grid gap-4">
            {settingsCategories.map((category) => {
              const IconComponent = category.icon
              return (
                <Card
                  key={category.path}
                  className="theme-bg-secondary theme-border cursor-pointer hover:scale-[1.02] transition-transform"
                  onClick={() => router.push(category.path)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="p-2 theme-bg-tertiary rounded-lg">
                          <IconComponent className={`w-6 h-6 ${category.color}`} />
                        </div>
                        <div>
                          <h3 className="font-semibold theme-text-primary">{category.title}</h3>
                          <p className="text-sm theme-text-muted">{category.description}</p>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 theme-text-muted" />
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  console.log("[Settings] 🎉 SETTINGS PAGE IS RENDERING!")
  return (
    <Suspense fallback={<LoadingScreen />}>
      <SettingsContent />
    </Suspense>
  )
}
