import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export type AuthFixtures = {
  authenticatedPage: Page
}

/**
 * Custom fixture that provides an authenticated page context.
 *
 * NOTE: This fixture is now deprecated in favor of the global auth setup.
 *
 * For authenticated tests, simply use the regular test import:
 *   import { test, expect } from '@playwright/test'
 *
 * Tests will automatically use the authenticated state from .auth/user.json
 * when running with chromium-authenticated, firefox-authenticated, etc. projects.
 *
 * See e2e/auth.setup.ts for the authentication setup.
 */
export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, applyFixture) => {
    // With the new setup, authentication is handled globally
    // Just use the page as-is
    await applyFixture(page)
  },
})

export { expect }
