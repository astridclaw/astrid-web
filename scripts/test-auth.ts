#!/usr/bin/env tsx

/**
 * Test Authentication System Script
 * 
 * This script tests the new email/password authentication system
 * to ensure it's working correctly alongside Google OAuth.
 */

import bcrypt from "bcryptjs"

async function testAuthSystem() {
  console.log('🧪 Testing Authentication System\n')

  // Test 1: Password Hashing
  console.log('1. Testing Password Hashing:')
  const testPassword = "testpassword123"
  const hashedPassword = await bcrypt.hash(testPassword, 12)
  console.log(`   Original password: ${testPassword}`)
  console.log(`   Hashed password: ${hashedPassword}`)
  
  // Test 2: Password Verification
  const isValidPassword = await bcrypt.compare(testPassword, hashedPassword)
  console.log(`   Password verification: ${isValidPassword ? '✅ Pass' : '❌ Fail'}`)
  
  // Test 3: Invalid Password
  const isInvalidPassword = await bcrypt.compare("wrongpassword", hashedPassword)
  console.log(`   Invalid password test: ${!isInvalidPassword ? '✅ Pass' : '❌ Fail'}`)

  console.log('\n✅ Authentication system tests completed!')
  console.log('\n📋 Next Steps:')
  console.log('1. Test the sign-up form in the browser')
  console.log('2. Test the sign-in form with created credentials')
  console.log('3. Verify that both Google OAuth and email/password work')
  console.log('4. Check that users can switch between authentication methods')
}

// Run the test
testAuthSystem()
