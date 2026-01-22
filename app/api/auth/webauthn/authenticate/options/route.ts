import { NextRequest, NextResponse } from "next/server"
import { getAuthenticationOptions, storeChallenge } from "@/lib/webauthn"
import { v4 as uuid } from "uuid"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { email } = body

    // Get authentication options (optionally filtered by email)
    const options = await getAuthenticationOptions(email)

    // Store challenge for verification
    const sessionId = uuid()
    await storeChallenge(sessionId, {
      challenge: options.challenge,
      email: email?.toLowerCase(),
    })

    return NextResponse.json({
      options,
      sessionId,
    })
  } catch (error) {
    console.error("[WebAuthn] Authentication options error:", error)
    return NextResponse.json(
      { error: "Failed to generate authentication options" },
      { status: 500 }
    )
  }
}
