import { test as setup, expect } from '@playwright/test'
import path from 'path'

const authFile = path.join(__dirname, '../.auth/user.json')

/**
 * Authentication Setup for Playwright Tests
 *
 * This runs once before all tests to create an authenticated session.
 * The session is saved and reused across all tests.
 */
setup('authenticate', async ({ page }) => {
  // Navigate to sign-in page
  await page.goto('/auth/signin')

  // Get test credentials from environment (required for legacy auth)
  const testEmail = process.env.PLAYWRIGHT_TEST_EMAIL
  const testPassword = process.env.PLAYWRIGHT_TEST_PASSWORD

  if (!testEmail || !testPassword) {
    throw new Error('PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD environment variables are required for authentication setup')
  }

  console.log(`[Auth Setup] Attempting to sign in as: ${testEmail}`)

  // Wait for page to load - default view shows modern auth options
  await page.waitForSelector('text=Sign in to get started!', { timeout: 10000 })

  // Click "Legacy email/password? Sign in" link to switch to legacy auth form
  const legacyLink = page.getByText(/legacy email\/password/i)
  await legacyLink.click()

  // Wait for legacy form to appear
  await page.waitForSelector('text=Welcome back', { timeout: 5000 })

  // Fill in credentials
  const emailInput = page.getByLabel(/^email$/i)
  const passwordInput = page.getByLabel(/^password$/i)

  await emailInput.fill(testEmail)
  await passwordInput.fill(testPassword)

  // Click sign in button (the submit button in the legacy form)
  const signInButton = page.getByRole('button', { name: /^sign in$/i }).first()
  await signInButton.click()

  // Wait for redirect to home page or dashboard
  await page.waitForURL(/\/$|\/list\/|\/lists\//, { timeout: 10000 })

  // Verify we're authenticated by checking for user session
  const isAuthenticated = await page.evaluate(() => {
    return document.cookie.includes('next-auth.session-token') ||
           document.cookie.includes('__Secure-next-auth.session-token')
  })

  if (!isAuthenticated) {
    throw new Error('Authentication failed - no session cookie found')
  }

  console.log('[Auth Setup] ✅ Authentication successful')

  // Save signed-in state to storage file
  await page.context().storageState({ path: authFile })

  console.log(`[Auth Setup] 📁 Session saved to: ${authFile}`)
})
