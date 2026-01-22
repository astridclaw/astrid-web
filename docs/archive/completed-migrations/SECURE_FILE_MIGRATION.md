# Secure File Upload Migration Guide - Vercel Blob

## Overview

This document outlines the migration from the current insecure file upload system to a secure, permission-based file storage system using private Vercel Blob storage and signed URLs.

## Security Improvements

### Current System Issues
- ❌ Files stored in `public/uploads/` (publicly accessible)
- ❌ No permission checks for file access
- ❌ Direct URL storage in database
- ❌ Files persist after deletion of associated records
- ❌ No cleanup mechanisms

### New Secure System
- ✅ Private Vercel Blob storage
- ✅ Server-side upload handling with client progress tracking
- ✅ Permission-based access control
- ✅ Short-lived signed URLs (5-minute expiry)
- ✅ Metadata stored in database, not blob metadata
- ✅ Automatic cleanup via Vercel Blob management

## Architecture

```
┌─────────────┐    1. File Upload       ┌─────────────┐
│   Client    │────────────────────────→│   API       │
│             │    (FormData)           │             │
│             │                         │             │
│             │    2. Upload Response   │             │
│             │←────────────────────────│             │
└─────────────┘                         └─────────────┘
                                               │
                                               │ Store in Blob + DB
                                               ↓
┌─────────────┐                         ┌─────────────┐
│ Vercel Blob │←───────────────────────→│  Database   │
│  (Private)  │                         │ SecureFile  │
└─────────────┘                         └─────────────┘
       ↑                                       │
       │ 4. Signed Download URL                │ 3. Permission Check
       └───────────────────────────────────────┘
```

## Setup Instructions

### 1. Environment Variables

Add these to your `.env.local`:

```bash
# Vercel Blob Configuration
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token_here

# The token is automatically generated when you deploy to Vercel
# For local development, get it from your Vercel dashboard
```

### 2. Vercel Blob Setup

1. **Automatic Setup on Vercel**: When you deploy to Vercel, Blob storage is automatically available.

2. **Get your Blob token**:
   - Go to your Vercel dashboard
   - Navigate to your project settings
   - Go to the "Storage" tab
   - Create a new Blob store or use an existing one
   - Copy the `BLOB_READ_WRITE_TOKEN`

3. **Local Development**:
   - Add the token to your `.env.local` file
   - Vercel Blob works seamlessly in development

### 3. Database Migration

Run the Prisma migration to add the SecureFile model:

```bash
npx prisma db push
# or
npx prisma migrate dev --name add-secure-file-storage
```

### 4. Vercel Deployment

1. **Deploy to Vercel**:
   ```bash
   vercel --prod
   ```

2. **Blob Token Automatically Set**: Vercel automatically provides the `BLOB_READ_WRITE_TOKEN` in production.

3. **Verify Setup**: Check that your Blob store appears in the Vercel dashboard under Storage.

## Migration Process

### Phase 1: Parallel System (Recommended)
1. Deploy new secure upload system alongside existing system
2. New uploads use secure system
3. Existing files continue to work via legacy endpoints
4. Gradually migrate existing files to secure storage

### Phase 2: Legacy File Migration
1. Create migration script to move existing files to Vercel Blob
2. Update database records to reference new SecureFile entries
3. Verify all files are accessible

### Phase 3: Cleanup
1. Remove legacy upload endpoints
2. Clean up `public/uploads/` directory
3. Remove legacy attachment fields from database

## API Endpoints

### New Secure Endpoints
- `POST /api/secure-upload/request-upload` - Upload file directly (FormData)
- `GET /api/secure-files/[fileId]` - Get signed download URL

### Frontend Usage

```typescript
import { useSecureFileUpload } from '@/hooks/useSecureFileUpload'

const { uploadFile, getFileInfo, uploads } = useSecureFileUpload()

// Upload a file to a task
const fileId = await uploadFile(file, { taskId: 'task-123' })

// Get file info with signed URL
const fileInfo = await getFileInfo(fileId)
```

### Permission Model

Files are accessible if the user has access to:
- The task the file is attached to
- The list the file is attached to
- The comment the file is attached to
- Or if they are the uploader

Access is determined by:
- Task: Creator, assignee, or list member
- List: Owner, admin, or member
- Comment: Author or task access

## Security Features

1. **Private Blob Storage**: No public access to any files
2. **Short-lived URLs**: Download URLs expire after 5 minutes
3. **Permission Checks**: Every file access is permission-checked
4. **Metadata Separation**: File metadata in database, not blob metadata
5. **Audit Trail**: Track who uploaded what and when
6. **Automatic Cleanup**: Vercel Blob management handles cleanup

## Monitoring & Maintenance

1. **Vercel Analytics**: Monitor Blob usage and costs in Vercel dashboard
2. **Cleanup Jobs**: Regular cleanup of orphaned database records
3. **Access Logs**: Vercel provides access logging for security auditing
4. **Cost Optimization**: Vercel Blob includes automatic optimization

## Rollback Plan

If issues arise:
1. Revert to legacy upload endpoints
2. Disable new secure endpoints
3. Files uploaded to Vercel Blob remain accessible via direct API calls
4. No data loss as both systems run in parallel during migration

## Testing

1. Unit tests for permission logic
2. Integration tests for upload flow
3. Security tests for unauthorized access attempts
4. Performance tests for large file uploads
5. Disaster recovery tests

## Cost Considerations

- **Vercel Blob Pricing**:
  - Pro Plan: $0.15 per GB stored per month
  - $0.30 per GB transferred
  - Free tier: 100GB bandwidth, 1GB storage
- **Included with Vercel Pro**: No additional setup costs
- **Automatic optimization**: Built into Vercel's infrastructure

## Advantages of Vercel Blob over S3

1. **Simplified Setup**: No AWS account or complex IAM setup required
2. **Integrated Dashboard**: Manage files directly from Vercel dashboard
3. **Automatic Scaling**: Built-in CDN and global distribution
4. **Zero Configuration**: Works out of the box with Vercel deployments
5. **Unified Billing**: Everything on one Vercel bill
6. **Better DX**: Simpler API than AWS SDK