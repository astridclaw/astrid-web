import { NextResponse } from 'next/server'

export async function GET() {
  const listImageGenKey = process.env.LIST_IMAGE_GEN_API_KEY

  return NextResponse.json({
    hasListImageGenKey: !!listImageGenKey,
    keyStart: listImageGenKey ? listImageGenKey.substring(0, 10) + '...' : null,
    nodeEnv: process.env.NODE_ENV
  })
}