/**
 * Debug endpoint to inspect request headers
 * Helps diagnose OAuth header issues in production
 */

import { type NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const headers: Record<string, string> = {}

  req.headers.forEach((value, key) => {
    headers[key] = value
  })

  const authHeader = req.headers.get('authorization')
  const oauthHeader = req.headers.get('x-oauth-token')

  return NextResponse.json({
    message: 'Header inspection endpoint',
    headers,
    specific: {
      authorization: authHeader,
      'x-oauth-token': oauthHeader,
      authHeaderLower: authHeader?.toLowerCase(),
      authStartsWithBearer: authHeader?.toLowerCase().startsWith('bearer '),
      tokenAfterBearer: authHeader?.toLowerCase().startsWith('bearer ')
        ? authHeader.slice(7).trim()
        : null,
    },
  })
}

export async function POST(req: NextRequest) {
  return GET(req)
}
