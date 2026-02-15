import { NextResponse } from "next/server"
import { getPublicKeyInfo } from "@/lib/ai/openclaw-signing"

export async function GET() {
  try {
    const keyInfo = getPublicKeyInfo()

    return NextResponse.json(keyInfo, {
      headers: {
        "Cache-Control": "public, max-age=3600",
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: "OpenClaw signing key not configured" },
      { status: 503 }
    )
  }
}
