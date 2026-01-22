/**
 * Public route to serve ASTRID.md template
 * Accessible at /astrid-template for users to download
 */

import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  try {
    // Read the ASTRID.md template from docs/templates
    const templatePath = path.join(process.cwd(), 'docs', 'templates', 'ASTRID.md')
    const template = fs.readFileSync(templatePath, 'utf-8')

    // Return as downloadable text file
    return new NextResponse(template, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': 'attachment; filename="ASTRID.md"',
        'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
      }
    })
  } catch (error) {
    console.error('Error serving ASTRID.md template:', error)
    return new NextResponse('Template not found', { status: 404 })
  }
}
