"use client"

import posthog from "posthog-js"
import { PostHogProvider as PHProvider } from "posthog-js/react"
import { useEffect, Suspense } from "react"
import { useSession } from "next-auth/react"
import { usePathname, useSearchParams } from "next/navigation"

// Initialize PostHog only on client side and not on localhost
if (typeof window !== "undefined") {
  const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST

  // Skip PostHog on localhost to avoid CSP errors
  if (!isLocalhost && posthogKey && posthogKey !== "your_posthog_project_api_key") {
    posthog.init(posthogKey, {
      api_host: posthogHost || "https://us.i.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: false, // We'll capture manually for more control
      capture_pageleave: true,
      persistence: "localStorage+cookie",
    })
  }
}

function PostHogPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (pathname && posthog.__loaded) {
      let url = window.origin + pathname
      if (searchParams?.toString()) {
        url = url + `?${searchParams.toString()}`
      }
      posthog.capture("$pageview", { $current_url: url })
    }
  }, [pathname, searchParams])

  return null
}

function PostHogUserIdentifier() {
  const { data: session, status } = useSession()

  useEffect(() => {
    if (status === "authenticated" && session?.user && posthog.__loaded) {
      // Identify the user
      posthog.identify(session.user.id, {
        email: session.user.email,
        name: session.user.name,
        // User properties for cohort analysis
        $set: {
          email: session.user.email,
          name: session.user.name,
        },
        $set_once: {
          // Set signup date only once (for cohort analysis)
          signup_date: new Date().toISOString().split("T")[0],
          initial_platform: "web",
        },
      })
    } else if (status === "unauthenticated" && posthog.__loaded) {
      // Reset on logout
      posthog.reset()
    }
  }, [session, status])

  return null
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      <PostHogUserIdentifier />
      {children}
    </PHProvider>
  )
}
