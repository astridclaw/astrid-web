#!/usr/bin/env node

/**
 * Documentation Review Helper
 *
 * This script helps developers identify which documentation files
 * might need updates after making code changes.
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

interface DocMapping {
  patterns: string[]
  docFile: string
  description: string
}

const DOC_MAPPINGS: DocMapping[] = [
  {
    patterns: ['components/', 'layouts/', 'isMobile', 'layoutType', 'column'],
    docFile: 'docs/LAYOUT_SYSTEM.md',
    description: 'UI layout patterns, mobile vs column layouts, responsive design'
  },
  {
    patterns: ['api/', 'route.ts', '/api/', 'endpoints'],
    docFile: 'docs/context/api_contracts.md',
    description: 'API endpoints, request/response formats'
  },
  {
    patterns: ['architecture', 'system', 'components', 'hooks/', 'lib/'],
    docFile: 'docs/ARCHITECTURE.md',
    description: 'System architecture, component organization'
  },
  {
    patterns: ['test', 'vitest', '.test.', '.spec.'],
    docFile: 'docs/context/testing.md',
    description: 'Testing strategies and approaches'
  },
  {
    patterns: ['auth', 'session', 'login', 'NextAuth'],
    docFile: 'docs/AUTHENTICATION.md',
    description: 'Authentication system and security'
  },
  {
    patterns: ['naming', 'convention', 'pattern', 'style'],
    docFile: 'docs/context/conventions.md',
    description: 'Code conventions and naming patterns'
  },
  {
    patterns: ['mcp', 'Model Context Protocol', 'agent'],
    docFile: 'docs/testing/MCP_TESTING_GUIDE.md',
    description: 'MCP and AI agent functionality'
  }
]

function getRecentChanges(): string[] {
  try {
    // Get changed files from last commit
    const output = execSync('git diff --name-only HEAD~1', { encoding: 'utf-8' })
    return output.trim().split('\n').filter(Boolean)
  } catch (error) {
    console.log('Could not get git changes, checking staged files...')
    try {
      const output = execSync('git diff --name-only --cached', { encoding: 'utf-8' })
      return output.trim().split('\n').filter(Boolean)
    } catch {
      return []
    }
  }
}

function analyzeChanges(changedFiles: string[]): DocMapping[] {
  const relevantDocs = new Set<DocMapping>()

  changedFiles.forEach(file => {
    DOC_MAPPINGS.forEach(mapping => {
      if (mapping.patterns.some(pattern => file.includes(pattern))) {
        relevantDocs.add(mapping)
      }
    })
  })

  return Array.from(relevantDocs)
}

function checkDocExists(docPath: string): boolean {
  return fs.existsSync(path.join(process.cwd(), docPath))
}

function main() {
  console.log('📚 Documentation Review Helper')
  console.log('=====================================\\n')

  const changedFiles = getRecentChanges()

  if (changedFiles.length === 0) {
    console.log('No recent changes detected.')
    return
  }

  console.log('📁 Recent Changes:')
  changedFiles.forEach(file => console.log(`  - ${file}`))
  console.log()

  const relevantDocs = analyzeChanges(changedFiles)

  if (relevantDocs.length === 0) {
    console.log('✅ No documentation updates appear to be needed.')
    return
  }

  console.log('📖 Documentation files that may need review:')
  console.log()

  relevantDocs.forEach(({ docFile, description }) => {
    const exists = checkDocExists(docFile)
    const status = exists ? '📄' : '❌'

    console.log(`${status} ${docFile}`)
    console.log(`   ${description}`)

    if (!exists) {
      console.log(`   ⚠️  File does not exist - may need creation`)
    }
    console.log()
  })

  console.log('💡 Quick Commands:')
  console.log('   code docs/                     # Open docs folder in VS Code')
  console.log('   git add docs/ && git commit    # Commit doc updates')
  console.log()

  console.log('📋 Documentation Checklist:')
  console.log('   [ ] Architecture changes documented')
  console.log('   [ ] New patterns/conventions added')
  console.log('   [ ] API changes reflected')
  console.log('   [ ] Layout/UI changes documented')
  console.log('   [ ] Testing approaches updated')
}

if (require.main === module) {
  main()
}