import { NextResponse } from 'next/server'

// Stub: OpenClaw signing has been removed. Key verification now handled externally.
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(
    {
      error: 'Public key endpoint deprecated',
      message: 'OpenClaw signing removed — use external agent runtimes.',
    },
    { status: 410 }
  )
}
