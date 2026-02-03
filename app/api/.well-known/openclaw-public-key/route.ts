/**
 * GET /.well-known/openclaw-public-key
 *
 * Serves Astrid's public key for OpenClaw signature verification.
 * OpenClaw Gateways fetch this key to verify that incoming connections
 * are actually from astrid.cc.
 *
 * This endpoint is public and does not require authentication.
 * The response is cached for 1 hour to reduce load.
 */

import { NextResponse } from 'next/server'
import { getPublicKeyInfo } from '@/lib/ai/openclaw-signing'

export const dynamic = 'force-dynamic'
export const revalidate = 3600 // Cache for 1 hour

export async function GET() {
  try {
    const keyInfo = getPublicKeyInfo()

    return NextResponse.json(keyInfo, {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    // Don't expose internal errors, but log them
    console.error('Failed to get OpenClaw public key:', error)

    return NextResponse.json(
      {
        error: 'Public key not configured',
        message: 'The OpenClaw signing key has not been configured on this server.',
      },
      { status: 503 }
    )
  }
}
