import { chromium } from '@playwright/test'

/**
 * Global Setup for Playwright Tests
 *
 * This runs ONCE before all test projects start.
 * It warms up the dev server by making initial requests to key pages,
 * ensuring Next.js has compiled them before parallel tests begin.
 *
 * This fixes the race condition where the first browser to hit a cold
 * route times out while others (hitting the now-warm route) succeed.
 */
async function globalSetup() {
  const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000'

  console.log('[Global Setup] Warming up the server...')

  let browser
  try {
    // Launch a browser to warm up the server
    browser = await chromium.launch()
    const context = await browser.newContext()
    const page = await context.newPage()

    // Helper to warm up a page with retries
    async function warmupPage(url: string, retries = 3): Promise<void> {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
          if (response && response.status() < 500) {
            // Wait a bit for the page to fully hydrate
            await page.waitForTimeout(500)
            return
          }
          console.warn(`[Global Setup] ${url} returned ${response?.status()} on attempt ${attempt}`)
        } catch (error) {
          console.warn(`[Global Setup] ${url} failed on attempt ${attempt}: ${error}`)
        }
        // Wait before retry
        if (attempt < retries) {
          await page.waitForTimeout(1000)
        }
      }
    }

    try {
      // Warm up the root page first (triggers main bundle compilation)
      console.log('[Global Setup] Warming up root page...')
      await warmupPage(`${baseURL}/`)

      // Warm up all locale pages tested in locale-navigation.spec.ts
      console.log('[Global Setup] Warming up locale pages...')
      const localePages = ['/en', '/es', '/fr', '/de']
      for (const localePage of localePages) {
        await warmupPage(`${baseURL}${localePage}`)
      }

      // Warm up auth pages (both root and locale-prefixed)
      console.log('[Global Setup] Warming up auth pages...')
      const authPages = ['/auth/signin', '/es/auth/signin', '/fr/auth/signin']
      for (const authPage of authPages) {
        await warmupPage(`${baseURL}${authPage}`)
      }

      // Warm up invalid locale (tests graceful error handling)
      console.log('[Global Setup] Warming up invalid locale page...')
      await warmupPage(`${baseURL}/xx`)

      // Final wait to ensure all compilation is done
      await page.waitForTimeout(1000)

      console.log('[Global Setup] Server warmup complete!')
    } catch (error) {
      console.error('[Global Setup] Warning: Server warmup encountered an issue:', error)
      // Don't fail - the test might still work, warmup is best-effort
    } finally {
      await context.close()
    }
  } catch (error) {
    console.error('[Global Setup] Failed to launch browser:', error)
    // Don't fail setup - let individual tests fail with better error messages
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

export default globalSetup
