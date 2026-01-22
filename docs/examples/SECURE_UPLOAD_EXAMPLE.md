# Secure File Upload Usage Examples

## Frontend Component Example

```tsx
import React, { useState } from 'react'
import { useSecureFileUpload } from '@/hooks/useSecureFileUpload'
import { SecureAttachmentViewer } from '@/components/secure-attachment-viewer'

export function TaskCommentWithAttachment({ taskId }: { taskId: string }) {
  const [comment, setComment] = useState('')
  const [attachedFileId, setAttachedFileId] = useState<string | null>(null)
  const { uploadFile, uploads } = useSecureFileUpload()

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const fileId = await uploadFile(file, { taskId })
      setAttachedFileId(fileId)
    } catch (error) {
      console.error('Upload failed:', error)
    }
  }

  const handleSubmitComment = async () => {
    // Submit comment with attached file ID
    await fetch(`/api/tasks/${taskId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: comment,
        attachedFileId, // Reference to secure file
      })
    })
  }

  return (
    <div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Add a comment..."
      />

      <input
        type="file"
        onChange={handleFileUpload}
        accept="image/*,.pdf,.doc,.docx"
      />

      {/* Show upload progress */}
      {uploads.map(upload => (
        <div key={upload.fileId}>
          {upload.fileName}: {upload.progress}%
          {upload.status === 'error' && <span>Error: {upload.error}</span>}
        </div>
      ))}

      {/* Show attached file */}
      {attachedFileId && (
        <SecureAttachmentViewer fileId={attachedFileId} />
      )}

      <button onClick={handleSubmitComment}>
        Submit Comment
      </button>
    </div>
  )
}
```

## API Integration Example

```tsx
// In your comment submission API
export async function POST(request: NextRequest) {
  const { content, attachedFileId, taskId } = await request.json()

  // Create comment with reference to secure file
  const comment = await prisma.comment.create({
    data: {
      content,
      taskId,
      authorId: session.user.id,
      // Link to secure file if attached
      secureFiles: attachedFileId ? {
        connect: { id: attachedFileId }
      } : undefined
    }
  })

  return NextResponse.json(comment)
}
```

## Permission Check Example

```tsx
// How the system checks permissions for file access
async function checkFileAccess(fileId: string, userId: string) {
  const file = await prisma.secureFile.findUnique({
    where: { id: fileId },
    include: {
      task: {
        include: {
          lists: {
            include: { listMembers: true }
          }
        }
      }
    }
  })

  if (!file) return false

  // User uploaded the file
  if (file.uploadedBy === userId) return true

  // User has access to the task
  if (file.task) {
    if (file.task.creatorId === userId) return true
    if (file.task.assigneeId === userId) return true

    // Check list membership
    for (const list of file.task.lists) {
      if (list.ownerId === userId) return true
      if (list.listMembers.some(m => m.userId === userId)) return true
    }
  }

  return false
}
```

## Migration Script Example

```tsx
// Script to migrate existing files to secure storage
import { uploadFileToBlob } from '@/lib/secure-storage'
import { readFile } from 'fs/promises'
import { join } from 'path'

async function migrateExistingFiles() {
  // Get all comments with attachments
  const comments = await prisma.comment.findMany({
    where: {
      attachmentUrl: { not: null }
    }
  })

  for (const comment of comments) {
    try {
      // Read existing file
      const filePath = join(process.cwd(), 'public', comment.attachmentUrl!)
      const fileBuffer = await readFile(filePath)

      // Upload to Vercel Blob
      const { blobUrl, fileId } = await uploadFileToBlob(fileBuffer, {
        fileName: comment.attachmentName!,
        fileType: comment.attachmentType!,
        fileSize: comment.attachmentSize!,
        uploadContext: {
          commentId: comment.id,
          userId: comment.authorId
        }
      })

      // Create SecureFile record
      await prisma.secureFile.create({
        data: {
          id: fileId,
          blobUrl,
          originalName: comment.attachmentName!,
          mimeType: comment.attachmentType!,
          fileSize: comment.attachmentSize!,
          uploadedBy: comment.authorId,
          commentId: comment.id
        }
      })

      console.log(`Migrated: ${comment.attachmentName}`)
    } catch (error) {
      console.error(`Failed to migrate ${comment.id}:`, error)
    }
  }
}
```

## Environment Setup

### Local Development
```bash
# Add to .env.local
BLOB_READ_WRITE_TOKEN=your_token_from_vercel_dashboard
```

### Production (Vercel)
- Token is automatically provided
- Files are stored in your Vercel Blob store
- Access via Vercel dashboard → Storage → Blob

## Security Benefits

1. **No direct file URLs** - Users can't guess file paths
2. **Permission enforcement** - Every file access is checked
3. **Audit trail** - Know who uploaded what and when
4. **Automatic expiry** - Download URLs expire after 5 minutes
5. **Private storage** - Files are never publicly accessible

## Testing

```tsx
// Test file upload and access
describe('Secure File Upload', () => {
  it('should upload file and create secure record', async () => {
    const file = new File(['test'], 'test.txt', { type: 'text/plain' })
    const fileId = await uploadFile(file, { taskId: 'test-task' })

    expect(fileId).toBeDefined()

    const fileInfo = await getFileInfo(fileId)
    expect(fileInfo.fileName).toBe('test.txt')
  })

  it('should deny access to unauthorized users', async () => {
    // Upload as user A
    const fileId = await uploadFileAsUser('userA', file, { taskId })

    // Try to access as user B (should fail)
    await expect(getFileInfoAsUser('userB', fileId))
      .rejects.toThrow('Access denied')
  })
})
```