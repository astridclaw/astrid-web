import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authConfig } from "@/lib/auth-config"
import fs from 'fs/promises'
import path from 'path'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { imageUrl } = await request.json()
    
    if (!imageUrl) {
      return NextResponse.json({ error: "Image URL is required" }, { status: 400 })
    }

    // Download the image
    console.log('Downloading image from:', imageUrl)
    const imageResponse = await fetch(imageUrl)
    if (!imageResponse.ok) {
      console.error('Failed to download image:', imageResponse.statusText)
      return NextResponse.json({ error: "Failed to download image" }, { status: 500 })
    }

    const imageBuffer = await imageResponse.arrayBuffer()
    
    // Create a unique filename
    const timestamp = Date.now()
    const filename = `generated-${timestamp}.png`
    const uploadDir = path.join(process.cwd(), 'public', 'uploads')
    const filePath = path.join(uploadDir, filename)
    
    // Ensure upload directory exists
    await fs.mkdir(uploadDir, { recursive: true })
    
    // Write the file
    await fs.writeFile(filePath, Buffer.from(imageBuffer))
    
    const localUrl = `/uploads/${filename}`
    console.log('Image stored locally at:', localUrl)
    
    return NextResponse.json({ url: localUrl })
    
  } catch (error) {
    console.error("Error storing image:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}