import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

// Files that are allowed to be downloaded
const ALLOWED_FILES: Record<string, { path: string; contentType: string }> = {
  'ASTRID_WORKFLOW.md': {
    path: 'public/ASTRID_WORKFLOW.md',
    contentType: 'text/markdown',
  },
  'get-project-tasks-oauth.ts': {
    path: 'public/get-project-tasks-oauth.ts',
    contentType: 'text/plain',
  },
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params

  const fileConfig = ALLOWED_FILES[filename]
  if (!fileConfig) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  try {
    const filePath = path.join(process.cwd(), fileConfig.path)
    const content = fs.readFileSync(filePath, 'utf-8')

    return new NextResponse(content, {
      headers: {
        'Content-Type': fileConfig.contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }
}
