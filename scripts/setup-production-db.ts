#!/usr/bin/env tsx

/**
 * Production Database Setup Script
 * 
 * This script helps set up the database for production deployment.
 * Run this after configuring your PostgreSQL database.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🚀 Setting up production database...\n')

  try {
    // Test database connection
    console.log('1. Testing database connection...')
    await prisma.$connect()
    console.log('   ✅ Database connected successfully')

    // Check if tables exist
    console.log('\n2. Checking database schema...')
    
    try {
      const userCount = await prisma.user.count()
      console.log(`   ✅ User table exists (${userCount} users)`)
    } catch (error) {
      console.log('   ⚠️  Tables not found - need to push schema')
      console.log('\n   Run this command to create tables:')
      console.log('   npx prisma db push\n')
      return
    }

    // Verify key tables exist
    const counts = await Promise.all([
      prisma.user.count(),
      prisma.taskList.count(),
      prisma.task.count(),
      prisma.account.count(),
      prisma.session.count(),
    ])

    console.log('\n3. Database health check:')
    console.log(`   👥 Users: ${counts[0]}`)
    console.log(`   📝 Lists: ${counts[1]}`)
    console.log(`   ✅ Tasks: ${counts[2]}`)
    console.log(`   🔐 Accounts: ${counts[3]}`)
    console.log(`   🎫 Sessions: ${counts[4]}`)

    // Test basic operations
    console.log('\n4. Testing database operations...')
    
    // Test user creation (if no users exist)
    if (counts[0] === 0) {
      console.log('   Creating test data...')
      const testUser = await prisma.user.create({
        data: {
          name: 'Test User',
          email: `test-${Date.now()}@example.com`,
        }
      })
      
      // Clean up test user
      await prisma.user.delete({
        where: { id: testUser.id }
      })
      
      console.log('   ✅ Database operations working')
    } else {
      console.log('   ✅ Database has existing data')
    }

    console.log('\n🎉 Production database setup complete!')
    console.log('\n📋 Next steps:')
    console.log('1. Ensure all environment variables are set in Vercel')
    console.log('2. Deploy your application')
    console.log('3. Test authentication and core features')

  } catch (error) {
    console.error('\n❌ Database setup failed:', error)
    
    if (error instanceof Error) {
      if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
        console.log('\n💡 Connection tips:')
        console.log('- Check your DATABASE_URL is correct')
        console.log('- Ensure the database server is running')
        console.log('- Verify network connectivity')
        console.log('- Check if SSL is required (add ?sslmode=require)')
      } else if (error.message.includes('authentication failed')) {
        console.log('\n💡 Authentication tips:')
        console.log('- Verify username and password in DATABASE_URL')
        console.log('- Check if user has necessary permissions')
        console.log('- Ensure database exists')
      }
    }
    
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Helper function to display environment info
function displayEnvironmentInfo() {
  console.log('🔧 Environment Information:')
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`)
  console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? '✅ Set' : '❌ Missing'}`)
  console.log(`   NEXTAUTH_SECRET: ${process.env.NEXTAUTH_SECRET ? '✅ Set' : '❌ Missing'}`)
  console.log(`   NEXTAUTH_URL: ${process.env.NEXTAUTH_URL || '❌ Missing'}`)
  console.log('')
}

// Display environment info before running
displayEnvironmentInfo()

main()
  .catch((error) => {
    console.error('Script failed:', error)
    process.exit(1)
  })
