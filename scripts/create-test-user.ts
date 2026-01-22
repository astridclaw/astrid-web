#!/usr/bin/env tsx

/**
 * Create Test User for Playwright E2E Tests
 *
 * This script creates a test user in the database that can be used for
 * authenticated Playwright tests.
 *
 * Usage:
 *   npx tsx scripts/create-test-user.ts
 *
 * Environment variables:
 *   PLAYWRIGHT_TEST_EMAIL - Email for test user (default: test@example.com)
 *   PLAYWRIGHT_TEST_PASSWORD - Password for test user (default: TestPassword123!)
 */

// Load environment variables
import dotenv from 'dotenv'
import path from 'path'

// Load .env.local first (development)
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
// Then load .env (fallback)
dotenv.config()

import { prisma } from '../lib/prisma'
import bcrypt from 'bcryptjs'
import { getConsistentDefaultImage } from '../lib/default-images'

async function createTestUser() {
  const testEmail = process.env.PLAYWRIGHT_TEST_EMAIL || 'test@example.com'
  const testPassword = process.env.PLAYWRIGHT_TEST_PASSWORD || 'TestPassword123!'

  console.log('🔧 Creating test user for Playwright E2E tests...')
  console.log(`📧 Email: ${testEmail}`)

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: testEmail },
    })

    if (existingUser) {
      console.log('✅ Test user already exists')
      console.log(`   User ID: ${existingUser.id}`)
      console.log(`   Name: ${existingUser.name || 'Not set'}`)

      // Update password in case it changed
      const hashedPassword = await bcrypt.hash(testPassword, 10)
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { password: hashedPassword },
      })

      console.log('🔄 Password updated')
      return existingUser
    }

    // Create new test user
    const hashedPassword = await bcrypt.hash(testPassword, 10)
    const defaultImageData = getConsistentDefaultImage(testEmail)
    // User.image field expects a string (URL), not the full object
    const defaultImageUrl = defaultImageData?.filename || '/icons/default_list_1.png'

    const user = await prisma.user.create({
      data: {
        email: testEmail,
        name: 'Test User',
        password: hashedPassword,
        image: defaultImageUrl,
        emailVerified: new Date(), // Auto-verify for testing
      },
    })

    console.log('✅ Test user created successfully')
    console.log(`   User ID: ${user.id}`)
    console.log(`   Name: ${user.name}`)
    console.log(`   Email verified: Yes`)

    // Create default lists for the test user
    console.log('📋 Creating default lists...')

    const defaultList = await prisma.taskList.create({
      data: {
        name: 'Test Tasks',
        ownerId: user.id,
        listMembers: {
          create: {
            userId: user.id,
            role: 'OWNER',
          },
        },
      },
    })

    console.log(`   ✅ Default list created: "${defaultList.name}"`)

    return user
  } catch (error) {
    console.error('❌ Error creating test user:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run the script
createTestUser()
  .then((user) => {
    console.log('\n🎉 Test user setup complete!')
    console.log('\nYou can now run Playwright tests with authentication:')
    console.log('  npm run test:e2e')
    console.log('  npm run test:e2e:ui')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n💥 Failed to create test user')
    process.exit(1)
  })
