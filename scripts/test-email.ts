#!/usr/bin/env tsx

/**
 * Email Testing Script
 * 
 * This script allows you to test email delivery in development.
 * Run with: npx tsx scripts/test-email.ts
 */

import { sendVerificationEmail } from '../lib/email'

async function testEmailDelivery() {
  console.log('🧪 Testing Email Delivery...\n')

  // Test data
  const testEmailData = {
    email: 'test@example.com',
    token: 'test-token-123',
    userName: 'Test User',
    isEmailChange: false
  }

  try {
    console.log('📤 Sending test verification email...')
    await sendVerificationEmail(testEmailData)
    console.log('✅ Email test completed successfully!')
    
    console.log('\n📝 Email Details:')
    console.log(`   To: ${testEmailData.email}`)
    console.log(`   Type: Email Verification`)
    console.log(`   Token: ${testEmailData.token}`)
    console.log(`   User: ${testEmailData.userName}`)
    
    if (process.env.NODE_ENV === 'development' || !process.env.RESEND_API_KEY) {
      console.log('\n💡 Note: Running in development mode - email was logged to console')
      console.log('   To test actual delivery, set RESEND_API_KEY and NODE_ENV=production')
    } else {
      console.log('\n📧 Email sent via Resend')
      console.log('   Check your Resend dashboard for delivery status')
    }

  } catch (error) {
    console.error('❌ Email test failed:', error)
    
    if (error instanceof Error) {
      console.error('Error details:', error.message)
    }
    
    console.log('\n🔧 Troubleshooting:')
    console.log('   1. Check your RESEND_API_KEY in .env.local')
    console.log('   2. Verify FROM_EMAIL domain is verified in Resend')
    console.log('   3. Check Resend dashboard for error details')
  }
}

// Environment check
function checkEnvironment() {
  console.log('🔍 Environment Check:')
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'not set'}`)
  console.log(`   RESEND_API_KEY: ${process.env.RESEND_API_KEY ? '✅ Set' : '❌ Not set'}`)
  console.log(`   FROM_EMAIL: ${process.env.FROM_EMAIL || 'not set (will use default)'}`)
  console.log(`   NEXTAUTH_URL: ${process.env.NEXTAUTH_URL || 'not set (will use default)'}`)
  console.log('')
}

// Main execution
async function main() {
  console.log('📬 Email Service Test\n')
  
  checkEnvironment()
  await testEmailDelivery()
  
  console.log('\n🎉 Test completed!')
}

// Run the test
main().catch(console.error)
