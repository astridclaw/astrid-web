import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * Upload Complete Callback
 *
 * This endpoint is called by Vercel Blob after a successful direct upload.
 * It stores the file metadata in the database.
 *
 * The request contains:
 * - type: "blob.upload-completed"
 * - payload.blob: { url, pathname, contentType, contentDisposition }
 * - payload.tokenPayload: JSON string with our custom data
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    console.log('📦 [UploadComplete] Received callback:', JSON.stringify(body, null, 2))

    // Validate request type
    if (body.type !== 'blob.upload-completed') {
      console.error('❌ [UploadComplete] Invalid request type:', body.type)
      return NextResponse.json({ error: 'Invalid request type' }, { status: 400 })
    }

    const { blob, tokenPayload } = body.payload

    if (!blob || !tokenPayload) {
      console.error('❌ [UploadComplete] Missing blob or tokenPayload')
      return NextResponse.json({ error: 'Missing required data' }, { status: 400 })
    }

    // Parse the token payload we sent when generating the upload URL
    const payload = JSON.parse(tokenPayload)
    const { userId, fileId, fileName, fileType, fileSize, taskId, listId, commentId } = payload

    console.log('📦 [UploadComplete] Storing file metadata:', {
      fileId,
      fileName,
      userId,
      blobUrl: blob.url,
    })

    // Store metadata in database
    await prisma.secureFile.create({
      data: {
        id: fileId,
        blobUrl: blob.url,
        originalName: fileName,
        mimeType: fileType || blob.contentType || 'application/octet-stream',
        fileSize: fileSize || blob.size || 0,
        uploadedBy: userId,
        taskId: taskId || null,
        listId: listId || null,
        commentId: commentId || null,
      }
    })

    console.log('✅ [UploadComplete] File metadata stored successfully:', fileId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('❌ [UploadComplete] Error:', error)
    return NextResponse.json({
      error: 'Failed to process upload completion'
    }, { status: 500 })
  }
}
