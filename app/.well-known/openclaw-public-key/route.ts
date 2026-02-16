import { NextResponse } from "next/server"

// Stub: OpenClaw signing has been removed. Key verification now handled externally.
export async function GET() {
  return NextResponse.json(
    { error: "OpenClaw signing key endpoint deprecated — use external agent runtimes" },
    { status: 410 }
  )
}
