"use client"

import { useState, useCallback, useEffect } from "react"
import { startRegistration, startAuthentication } from "@simplewebauthn/browser"
import { trackSignUp, trackLogin } from "@/lib/analytics"
import { safeResponseJson, hasRequiredFields } from "@/lib/safe-parse"

export function useWebAuthn() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSupported, setIsSupported] = useState(false)

  // Check WebAuthn support after hydration to avoid SSR mismatch
  useEffect(() => {
    setIsSupported(
      typeof window !== "undefined" &&
      window.PublicKeyCredential !== undefined
    )
  }, [])

  const registerPasskey = useCallback(async (email?: string, name?: string) => {
    if (!isSupported) {
      setError("Passkeys are not supported on this device")
      return { success: false }
    }

    setIsLoading(true)
    setError(null)

    try {
      // Get registration options from server
      const optionsRes = await fetch("/api/auth/webauthn/register/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      const optionsData = await safeResponseJson<{
        existingUser?: boolean
        email?: string
        options?: any
        sessionId?: string
        error?: string
      }>(optionsRes, { error: 'Failed to get registration options' })

      // If user already exists, automatically switch to login flow
      if (optionsData.existingUser) {
        // Get authentication options
        const authOptionsRes = await fetch("/api/auth/webauthn/authenticate/options", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: optionsData.email }),
        })

        if (!authOptionsRes.ok) {
          const authData = await safeResponseJson<{ error?: string }>(
            authOptionsRes,
            { error: "Failed to get authentication options" }
          )
          throw new Error(authData.error || "Failed to get authentication options")
        }

        const authData = await safeResponseJson<{
          options?: any
          sessionId?: string
        }>(authOptionsRes, {})

        if (!hasRequiredFields(authData, ['options', 'sessionId'])) {
          throw new Error("Invalid authentication options response")
        }

        const { options: authOptions, sessionId: authSessionId } = authData

        // Start WebAuthn authentication ceremony
        const credential = await startAuthentication(authOptions)

        // Verify with server
        const verifyRes = await fetch("/api/auth/webauthn/authenticate/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: authSessionId,
            response: credential,
          }),
        })

        if (!verifyRes.ok) {
          const verifyData = await safeResponseJson<{ error?: string }>(
            verifyRes,
            { error: "Authentication failed" }
          )
          throw new Error(verifyData.error || "Authentication failed")
        }

        // Success - track login and redirect to home
        trackLogin("passkey")
        window.location.href = "/"
        return { success: true, existingUser: true }
      }

      if (!optionsRes.ok) {
        throw new Error(optionsData.error || "Failed to get registration options")
      }

      const { options, sessionId } = optionsData

      // Start WebAuthn registration ceremony
      const credential = await startRegistration(options)

      // Verify with server
      const verifyRes = await fetch("/api/auth/webauthn/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          response: credential,
          name: name || "My Passkey",
        }),
      })

      if (!verifyRes.ok) {
        const data = await safeResponseJson<{ error?: string }>(
          verifyRes,
          { error: "Registration failed" }
        )
        throw new Error(data.error || "Registration failed")
      }

      const result = await safeResponseJson<{
        isNewUser?: boolean
        user?: any
      }>(verifyRes, {})

      // For new users, they're now logged in - redirect to home
      // Use window.location.href to ensure session cookie is picked up
      if (result.isNewUser) {
        trackSignUp("passkey")
        window.location.href = "/"
        return { success: true, isNewUser: true }
      }

      // For existing users adding a passkey, just return success
      return { success: true, user: result.user }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Registration failed"
      // Handle user cancellation gracefully
      if (message.includes("cancelled") || message.includes("canceled")) {
        setError(null)
        return { success: false, cancelled: true }
      }
      setError(message)
      return { success: false }
    } finally {
      setIsLoading(false)
    }
  }, [isSupported])

  const authenticateWithPasskey = useCallback(async (email?: string) => {
    if (!isSupported) {
      setError("Passkeys are not supported on this device")
      return { success: false }
    }

    setIsLoading(true)
    setError(null)

    try {
      // Get authentication options from server
      const optionsRes = await fetch("/api/auth/webauthn/authenticate/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      if (!optionsRes.ok) {
        const data = await safeResponseJson<{ error?: string }>(
          optionsRes,
          { error: "Failed to get authentication options" }
        )
        throw new Error(data.error || "Failed to get authentication options")
      }

      const optionsData = await safeResponseJson<{
        options?: any
        sessionId?: string
      }>(optionsRes, {})

      if (!hasRequiredFields(optionsData, ['options', 'sessionId'])) {
        throw new Error("Invalid authentication options response")
      }

      const { options, sessionId } = optionsData

      // Start WebAuthn authentication ceremony
      const credential = await startAuthentication(options)

      // Verify with server
      const verifyRes = await fetch("/api/auth/webauthn/authenticate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          response: credential,
        }),
      })

      if (!verifyRes.ok) {
        const data = await safeResponseJson<{ error?: string }>(
          verifyRes,
          { error: "Authentication failed" }
        )
        throw new Error(data.error || "Authentication failed")
      }

      const result = await safeResponseJson<{
        user?: any
      }>(verifyRes, {})

      // Track successful login
      trackLogin("passkey")

      // Full page redirect to ensure session cookie is picked up
      // router.refresh() + router.push() doesn't reliably pick up new cookies
      window.location.href = "/"

      return { success: true, user: result.user }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Authentication failed"
      // Handle user cancellation gracefully
      if (message.includes("cancelled") || message.includes("canceled")) {
        setError(null)
        return { success: false, cancelled: true }
      }
      setError(message)
      return { success: false }
    } finally {
      setIsLoading(false)
    }
  }, [isSupported])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    isSupported,
    isLoading,
    error,
    registerPasskey,
    authenticateWithPasskey,
    clearError,
  }
}
