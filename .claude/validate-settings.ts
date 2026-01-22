#!/usr/bin/env tsx
/**
 * Validates and auto-fixes .claude/settings.local.json
 *
 * This script:
 * 1. Checks if settings.local.json exists
 * 2. Validates JSON syntax
 * 3. Removes comments if present (JSON doesn't support comments)
 * 4. Validates structure (permissions.allow, permissions.deny, permissions.ask)
 * 5. Creates backup before fixing
 *
 * Usage:
 *   npx tsx .claude/validate-settings.ts          # Check only
 *   npx tsx .claude/validate-settings.ts --fix    # Auto-fix issues
 */

import * as fs from 'fs'
import * as path from 'path'

const SETTINGS_PATH = path.join(process.cwd(), '.claude/settings.local.json')
const SETTINGS_EXAMPLE_PATH = path.join(process.cwd(), '.claude/settings.json.example')
const BACKUP_PATH = path.join(process.cwd(), '.claude/settings.local.json.backup')

interface PermissionsConfig {
  permissions: {
    allow?: string[]
    deny?: string[]
    ask?: string[]
  }
}

function removeComments(jsonString: string): string {
  // Remove single-line comments (// ...)
  let cleaned = jsonString.replace(/\/\/.*$/gm, '')

  // Remove multi-line comments (/* ... */)
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '')

  // Remove trailing commas before ] or }
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1')

  return cleaned
}

function validateStructure(config: any): string[] {
  const errors: string[] = []

  if (!config.permissions) {
    errors.push('Missing "permissions" key')
    return errors
  }

  const { permissions } = config

  if (!permissions.allow && !permissions.deny && !permissions.ask) {
    errors.push('Permissions must have at least one of: allow, deny, ask')
  }

  if (permissions.allow && !Array.isArray(permissions.allow)) {
    errors.push('"permissions.allow" must be an array')
  }

  if (permissions.deny && !Array.isArray(permissions.deny)) {
    errors.push('"permissions.deny" must be an array')
  }

  if (permissions.ask && !Array.isArray(permissions.ask)) {
    errors.push('"permissions.ask" must be an array')
  }

  return errors
}

async function validateSettings(shouldFix: boolean = false): Promise<void> {
  console.log('🔍 Validating .claude/settings.local.json...\n')

  // Check if file exists
  if (!fs.existsSync(SETTINGS_PATH)) {
    console.error('❌ Error: .claude/settings.local.json not found')

    if (fs.existsSync(SETTINGS_EXAMPLE_PATH)) {
      console.log('💡 Found .claude/settings.json.example')
      if (shouldFix) {
        console.log('📋 Copying example to settings.local.json...')
        const example = fs.readFileSync(SETTINGS_EXAMPLE_PATH, 'utf-8')
        const cleaned = removeComments(example)
        fs.writeFileSync(SETTINGS_PATH, cleaned, 'utf-8')
        console.log('✅ Created settings.local.json from example')
      } else {
        console.log('Run with --fix to copy example file')
      }
    }

    process.exit(1)
  }

  // Read file
  const rawContent = fs.readFileSync(SETTINGS_PATH, 'utf-8')

  // Check for comments (but not // inside strings)
  // Remove all string content first to avoid false positives from paths like "//dev/**"
  const contentWithoutStrings = rawContent.replace(/"(?:[^"\\]|\\.)*"/g, '""')
  const hasComments = /\/\/|\/\*/.test(contentWithoutStrings)
  if (hasComments) {
    console.log('⚠️  Warning: File contains comments (JSON does not support comments)')

    if (shouldFix) {
      console.log('🔧 Removing comments...')
      const cleaned = removeComments(rawContent)

      // Create backup
      fs.writeFileSync(BACKUP_PATH, rawContent, 'utf-8')
      console.log(`💾 Backup saved to ${path.relative(process.cwd(), BACKUP_PATH)}`)

      // Write cleaned version
      fs.writeFileSync(SETTINGS_PATH, cleaned, 'utf-8')
      console.log('✅ Comments removed')

      // Re-read cleaned content
      const newContent = fs.readFileSync(SETTINGS_PATH, 'utf-8')
      validateJSON(newContent)
    } else {
      console.log('Run with --fix to remove comments automatically')
      process.exit(1)
    }
  } else {
    validateJSON(rawContent)
  }
}

function validateJSON(content: string): void {
  // Try to parse JSON
  let config: PermissionsConfig
  try {
    config = JSON.parse(content)
    console.log('✅ Valid JSON syntax')
  } catch (error) {
    console.error('❌ Invalid JSON syntax:')
    if (error instanceof Error) {
      console.error(`   ${error.message}`)
    }
    console.log('\n💡 Common issues:')
    console.log('   - Comments (// or /* */) are not allowed in JSON')
    console.log('   - Trailing commas before ] or }')
    console.log('   - Missing quotes around strings')
    console.log('   - Unescaped special characters')
    console.log('\nRun with --fix to attempt automatic fixes')
    process.exit(1)
  }

  // Validate structure
  const structureErrors = validateStructure(config)
  if (structureErrors.length > 0) {
    console.error('❌ Structure validation failed:')
    structureErrors.forEach(err => console.error(`   - ${err}`))
    process.exit(1)
  }

  console.log('✅ Valid structure')

  // Print summary
  const { allow = [], deny = [], ask = [] } = config.permissions
  console.log('\n📊 Permissions Summary:')
  console.log(`   Allow: ${allow.length} patterns`)
  console.log(`   Deny:  ${deny.length} patterns`)
  console.log(`   Ask:   ${ask.length} patterns`)

  console.log('\n✨ All validation checks passed!')
}

// Main execution
const shouldFix = process.argv.includes('--fix')

validateSettings(shouldFix).catch(error => {
  console.error('💥 Unexpected error:', error)
  process.exit(1)
})
