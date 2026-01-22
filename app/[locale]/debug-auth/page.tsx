"use client"

export const dynamic = 'force-dynamic'

import { useSession, signOut } from "next-auth/react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function DebugAuth() {
  const { data: session, status } = useSession()
  const [testEmail, setTestEmail] = useState("")
  const [testPassword, setTestPassword] = useState("testpass123")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [clientInfo, setClientInfo] = useState<{origin?: string, userAgent?: string}>({})

  useEffect(() => {
    setClientInfo({
      origin: window?.location?.origin,
      userAgent: navigator?.userAgent
    })
  }, [])

  const testSignup = async () => {
    if (!testEmail) {
      setResult({ error: "Please enter an email" })
      return
    }

    setLoading(true)
    setResult(null)
    
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
          name: testEmail.split('@')[0]
        }),
      })

      const data = await response.json()
      setResult({
        status: response.status,
        ok: response.ok,
        data
      })
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : "Unknown error" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">Authentication Debug</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm text-gray-400">Session Status:</div>
              <div className="text-white font-mono">{status}</div>
            </div>
            
            {session && (
              <div>
                <div className="text-sm text-gray-400">Current User:</div>
                <div className="text-white font-mono">
                  {JSON.stringify({
                    id: session.user?.id,
                    email: session.user?.email,
                    name: session.user?.name,
                  }, null, 2)}
                </div>
                <Button onClick={() => signOut()} className="mt-2">
                  Sign Out
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">Test Signup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-gray-300">Email:</Label>
              <Input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="bg-gray-700 border-gray-600 text-white"
                placeholder="test@example.com"
              />
            </div>
            
            <div>
              <Label className="text-gray-300">Password:</Label>
              <Input
                type="password"
                value={testPassword}
                onChange={(e) => setTestPassword(e.target.value)}
                className="bg-gray-700 border-gray-600 text-white"
              />
            </div>
            
            <Button 
              onClick={testSignup}
              disabled={loading}
              className="w-full"
            >
              {loading ? "Testing..." : "Test Signup"}
            </Button>

            {result && (
              <div className="mt-4">
                <div className="text-sm text-gray-400">Result:</div>
                <pre className="bg-gray-900 p-3 rounded text-xs text-green-400 overflow-auto">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">Environment Info</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-400">URL:</span>
                <span className="text-white ml-2">{clientInfo.origin || 'Loading...'}</span>
              </div>
              <div>
                <span className="text-gray-400">User Agent:</span>
                <span className="text-white ml-2 break-all">{clientInfo.userAgent || 'Loading...'}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}