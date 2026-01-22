#!/usr/bin/env tsx
/**
 * Database Safety Check Script
 * ALWAYS run this before any destructive database operations
 */

const DATABASE_URL = process.env.DATABASE_URL || ''

// List of production database patterns to protect
const PRODUCTION_PATTERNS = [
  'prod',
  'production',
  'amazonaws.com',
  'supabase.co',
  'neon.tech',
  'planetscale.com',
  'railway.app',
  'render.com',
  'vercel-storage.com',
  'upstash.com',
  'aiven.io',
  'digitalocean.com',
  'azure.com',
  'googleapis.com'
]

export function isProductionDatabase(url: string = DATABASE_URL): boolean {
  const lowerUrl = url.toLowerCase()
  return PRODUCTION_PATTERNS.some(pattern => lowerUrl.includes(pattern))
}

export function checkDatabaseSafety(operation: string): void {
  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set')
    process.exit(1)
  }

  if (isProductionDatabase()) {
    console.error(`
🚨🚨🚨 PRODUCTION DATABASE DETECTED 🚨🚨🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REFUSING TO EXECUTE: ${operation}
Database URL contains production patterns.

This operation could DESTROY PRODUCTION DATA!

If you REALLY need to run this on production:
1. Take a backup first
2. Set ALLOW_PRODUCTION_DESTRUCTIVE=true
3. Run the command again
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)

    if (process.env.ALLOW_PRODUCTION_DESTRUCTIVE !== 'true') {
      process.exit(1)
    } else {
      console.warn('⚠️  ALLOW_PRODUCTION_DESTRUCTIVE is set - proceeding with caution...')
    }
  } else {
    console.log('✅ Database safety check passed (development database detected)')
  }
}

// If run directly, check the current DATABASE_URL
if (require.main === module) {
  console.log('Checking DATABASE_URL safety...')
  console.log(`DATABASE_URL: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`) // Hide password

  if (isProductionDatabase()) {
    console.error('❌ This appears to be a PRODUCTION database!')
  } else {
    console.log('✅ This appears to be a development database')
  }
}