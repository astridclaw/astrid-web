#!/usr/bin/env npx tsx
/**
 * Setup script for Astrid AI agent configuration
 *
 * This script is run during npm install (postinstall) to set up
 * default configuration files without overwriting existing ones.
 *
 * Usage:
 *   npx tsx scripts/setup-astrid-config.ts [--force]
 *
 * Options:
 *   --force    Overwrite existing files (creates backups)
 */

import * as fs from 'fs/promises'
import * as path from 'path'

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates')
const PROJECT_ROOT = path.join(__dirname, '..')

interface SetupFile {
  template: string
  target: string
  description: string
}

const FILES_TO_SETUP: SetupFile[] = [
  {
    template: '.astrid.config.json',
    target: '.astrid.config.json',
    description: 'AI agent configuration (structure, platforms, timeouts)'
  },
  {
    template: 'ASTRID.template.md',
    target: 'ASTRID.md',
    description: 'Project context for AI agents'
  }
]

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function setupFile(file: SetupFile, force: boolean): Promise<void> {
  const templatePath = path.join(TEMPLATES_DIR, file.template)
  const targetPath = path.join(PROJECT_ROOT, file.target)

  const templateExists = await fileExists(templatePath)
  if (!templateExists) {
    console.log(`   ⚠️  Template not found: ${file.template}`)
    return
  }

  const targetExists = await fileExists(targetPath)

  if (targetExists && !force) {
    console.log(`   ✅ ${file.target} already exists (keeping existing file)`)
    return
  }

  if (targetExists && force) {
    // Create backup
    const backupPath = `${targetPath}.backup.${Date.now()}`
    await fs.copyFile(targetPath, backupPath)
    console.log(`   📦 Backed up existing ${file.target} to ${path.basename(backupPath)}`)
  }

  // Copy template
  const content = await fs.readFile(templatePath, 'utf-8')
  await fs.writeFile(targetPath, content, 'utf-8')

  if (targetExists) {
    console.log(`   🔄 Updated ${file.target}`)
  } else {
    console.log(`   ✨ Created ${file.target}`)
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const force = args.includes('--force')
  const quiet = args.includes('--quiet')

  if (!quiet) {
    console.log('')
    console.log('🤖 Astrid AI Agent Configuration Setup')
    console.log('=' .repeat(45))
    console.log('')
  }

  // Check if we're in the right directory (has package.json)
  const packageJsonPath = path.join(PROJECT_ROOT, 'package.json')
  if (!(await fileExists(packageJsonPath))) {
    console.log('   ⚠️  No package.json found - skipping setup')
    return
  }

  for (const file of FILES_TO_SETUP) {
    if (!quiet) {
      console.log(`📄 ${file.description}`)
    }
    await setupFile(file, force)
  }

  if (!quiet) {
    console.log('')
    console.log('✅ Setup complete!')
    console.log('')
    console.log('Next steps:')
    console.log('  1. Edit .astrid.config.json to match your project structure')
    console.log('  2. Update ASTRID.md with your project context')
    console.log('  3. Commit these files to your repository')
    console.log('')
    console.log('Tip: AI agents will read these files to understand your project.')
    console.log('     Better context = better code generation!')
    console.log('')
  }
}

main().catch(error => {
  console.error('Setup failed:', error)
  process.exit(1)
})
