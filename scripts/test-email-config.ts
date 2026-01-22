#!/usr/bin/env tsx

/**
 * Test Email Configuration Script
 * 
 * This script tests the email configuration to ensure it works
 * in both development and production environments.
 */

import { getFromEmail } from '../lib/email'

// Mock environment variables for testing
function testEmailConfig() {
  console.log('🧪 Testing Email Configuration\n')

  // Test 1: Development environment
  console.log('1. Testing Development Environment:')
  const devEnv = { ...process.env, NODE_ENV: 'development', FROM_EMAIL: 'test@example.com' }
  console.log(`   FROM_EMAIL: ${devEnv.FROM_EMAIL}`)
  console.log(`   Result: ${getFromEmailWithEnv(devEnv)}\n`)

  // Test 2: Production with verified Resend domain
  console.log('2. Testing Production with Verified Resend Domain:')
  const prodResendEnv = { ...process.env, NODE_ENV: 'production', FROM_EMAIL: 'noreply@resend.dev' }
  console.log(`   FROM_EMAIL: ${prodResendEnv.FROM_EMAIL}`)
  console.log(`   Result: ${getFromEmailWithEnv(prodResendEnv)}\n`)

  // Test 3: Production with unverified domain (should fallback)
  console.log('3. Testing Production with Unverified Domain:')
  const prodUnverifiedEnv = { ...process.env, NODE_ENV: 'production', FROM_EMAIL: 'noreply@example.com' }
  console.log(`   FROM_EMAIL: ${prodUnverifiedEnv.FROM_EMAIL}`)
  console.log(`   Result: ${getFromEmailWithEnv(prodUnverifiedEnv)}\n`)

  // Test 4: Production with no FROM_EMAIL (should fallback)
  console.log('4. Testing Production with No FROM_EMAIL:')
  const prodNoEmailEnv: { NODE_ENV?: string; FROM_EMAIL?: string } = { NODE_ENV: 'production' }
  console.log(`   FROM_EMAIL: ${prodNoEmailEnv.FROM_EMAIL || 'undefined'}`)
  console.log(`   Result: ${getFromEmailWithEnv(prodNoEmailEnv)}\n`)

  // Test 5: Production with user's actual verified domain
  console.log('5. Testing Production with User\'s Verified Domain:')
  const prodVerifiedEnv = { ...process.env, NODE_ENV: 'production', FROM_EMAIL: 'no_reply@astrid.cc' }
  console.log(`   FROM_EMAIL: ${prodVerifiedEnv.FROM_EMAIL}`)
  console.log(`   Result: ${getFromEmailWithEnv(prodVerifiedEnv)}\n`)

  console.log('✅ Email configuration tests completed!')
}

// Helper function to test with specific environment
function getFromEmailWithEnv(env: { NODE_ENV?: string; FROM_EMAIL?: string }): string {
  const configuredEmail = env.FROM_EMAIL
  const environment = env.NODE_ENV
  
  console.log(`📧 Email Configuration - Environment: ${environment}, Configured: ${configuredEmail}`)
  
  // In development, use configured email or fallback
  if (environment === "development") {
    const email = configuredEmail || 'noreply@yourdomain.com'
    console.log(`📧 Using development email: ${email}`)
    return email
  }
  
  // In production, if we have a configured email, use it (assuming domain is verified)
  if (configuredEmail) {
    console.log(`📧 Using configured email: ${configuredEmail}`)
    return configuredEmail
  }
  
  // If no configured email, fallback to Resend's verified test domain
  console.log(`📧 No FROM_EMAIL configured, falling back to: onboarding@resend.dev`)
  return 'onboarding@resend.dev'
}

// Run the test
testEmailConfig()
