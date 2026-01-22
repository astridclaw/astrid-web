#!/usr/bin/env tsx
/**
 * SAFE Database Reset Script
 * This script includes safety checks to prevent accidental production data loss
 */

import { checkDatabaseSafety } from './db-safety-check'
import { execSync } from 'child_process'
import * as readline from 'readline'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

async function askConfirmation(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(question + ' (yes/no): ', (answer) => {
      resolve(answer.toLowerCase() === 'yes')
    })
  })
}

async function resetDatabase() {
  console.log('🔍 Database Reset Script')
  console.log('========================')

  // Step 1: Safety check
  checkDatabaseSafety('DATABASE RESET')

  // Step 2: User confirmation
  console.log('\n⚠️  WARNING: This will DELETE ALL DATA in the database!')
  console.log('Database URL:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@'))

  const confirmed = await askConfirmation('\nAre you ABSOLUTELY SURE you want to reset the database?')

  if (!confirmed) {
    console.log('❌ Database reset cancelled')
    process.exit(0)
  }

  // Step 3: Double confirmation for extra safety
  const doubleConfirmed = await askConfirmation('This is your LAST CHANCE. Type "yes" to DELETE ALL DATA')

  if (!doubleConfirmed) {
    console.log('❌ Database reset cancelled')
    process.exit(0)
  }

  try {
    // Step 4: Create backup first (if possible)
    console.log('\n📦 Creating backup...')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupFile = `backup-${timestamp}.sql`

    try {
      execSync(`pg_dump $DATABASE_URL > backups/${backupFile}`, { stdio: 'inherit' })
      console.log(`✅ Backup saved to backups/${backupFile}`)
    } catch (error) {
      console.warn('⚠️  Could not create backup (pg_dump not available or database not accessible)')
    }

    // Step 5: Reset the database
    console.log('\n🔄 Resetting database...')
    execSync('npx prisma migrate reset --force', { stdio: 'inherit' })

    console.log('✅ Database reset complete')

    // Step 6: Offer to seed
    const shouldSeed = await askConfirmation('\nWould you like to seed the database with sample data?')

    if (shouldSeed) {
      console.log('🌱 Seeding database...')
      execSync('npm run db:seed', { stdio: 'inherit' })
      console.log('✅ Database seeded')
    }

  } catch (error) {
    console.error('❌ Error resetting database:', error)
    process.exit(1)
  } finally {
    rl.close()
  }
}

// Run the reset
resetDatabase()