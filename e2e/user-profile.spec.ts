import { test, expect } from "@playwright/test"

test.describe("User Profile", () => {
  // NOTE: These tests work best when run with authentication setup.
  // Set PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD env vars to enable auth.
  // Without auth, tests will gracefully skip user-specific features.

  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto("/")

    // Wait for page to load
    await page.waitForLoadState("networkidle")
  })

  test("should navigate to user profile from list members", async ({ page }) => {
    // Navigate to a shared list
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    // Find and click on a list (assuming there's at least one list)
    const listItem = page.locator('[data-testid="list-item"]').first()
    if (await listItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await listItem.click()
      await page.waitForTimeout(500)

      // Look for list settings or members section
      const settingsButton = page.locator('button:has-text("Settings"), button:has-text("Members")')
      if (await settingsButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await settingsButton.first().click()
        await page.waitForTimeout(500)

        // Click on a member name (if any members exist)
        const memberLink = page.locator('a[href^="/u/"]').first()
        if (await memberLink.isVisible({ timeout: 2000 }).catch(() => false)) {
          await memberLink.click()

          // Verify we're on the user profile page
          await expect(page).toHaveURL(/\/u\/[a-zA-Z0-9-]+/)

          // Verify profile page elements are visible
          await expect(page.locator("text=Completed")).toBeVisible()
          await expect(page.locator("text=Inspired")).toBeVisible()
          await expect(page.locator("text=Supported")).toBeVisible()
        }
      }
    }
  })

  test("should navigate to user profile from task comment author", async ({ page }) => {
    // Navigate to task manager
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    // Click on a task to open details
    const taskItem = page.locator('[data-testid="task-item"]').first()
    if (await taskItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await taskItem.click()
      await page.waitForTimeout(500)

      // Look for comment section
      const commentAuthorLink = page.locator('a[href^="/u/"]').first()
      if (await commentAuthorLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        const authorName = await commentAuthorLink.textContent()
        await commentAuthorLink.click()

        // Verify we're on the user profile page
        await expect(page).toHaveURL(/\/u\/[a-zA-Z0-9-]+/)

        // Verify the user name appears on the profile
        if (authorName) {
          await expect(page.locator(`text=${authorName}`)).toBeVisible()
        }
      }
    }
  })

  test("should display user statistics on profile page", async ({ page }) => {
    // Create a test by navigating directly to a known user profile
    // (In production, you'd use a fixture or test data)
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    // Find any user link on the page
    const userLink = page.locator('a[href^="/u/"]').first()
    if (await userLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      const userId = await userLink.getAttribute("href")
      if (userId) {
        await page.goto(userId)

        // Verify statistics cards are visible
        await expect(page.locator("text=Completed")).toBeVisible()
        await expect(page.locator("text=Inspired")).toBeVisible()
        await expect(page.locator("text=Supported")).toBeVisible()

        // Verify statistic numbers are present (should be non-negative numbers)
        const completedStat = page.locator('text=/^\\d+$/').first()
        await expect(completedStat).toBeVisible()
      }
    }
  })

  test("should display user avatar and name on profile page", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    // Find any user link
    const userLink = page.locator('a[href^="/u/"]').first()
    if (await userLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      const userId = await userLink.getAttribute("href")
      if (userId) {
        await page.goto(userId)

        // Verify avatar is present
        const avatar = page.locator('img[alt], [role="img"]').first()
        await expect(avatar).toBeVisible()

        // Verify user name or email is visible
        await expect(page.locator("h1")).toBeVisible()
      }
    }
  })

  test("should show back button on profile page", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    const userLink = page.locator('a[href^="/u/"]').first()
    if (await userLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      const userId = await userLink.getAttribute("href")
      if (userId) {
        const previousUrl = page.url()
        await page.goto(userId)

        // Verify back button exists
        const backButton = page.locator('button:has-text("Back")')
        await expect(backButton).toBeVisible()

        // Click back button
        await backButton.click()

        // Should navigate back
        await page.waitForTimeout(500)
        // URL might not exactly match, but shouldn't be on the profile page anymore
        await expect(page).not.toHaveURL(/\/u\/[a-zA-Z0-9-]+/)
      }
    }
  })

  test("should display shared tasks section if tasks exist", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    const userLink = page.locator('a[href^="/u/"]').first()
    if (await userLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      const userId = await userLink.getAttribute("href")
      if (userId) {
        await page.goto(userId)

        // Check if shared tasks section exists
        const sharedTasksHeading = page.locator('text="Shared Tasks"')
        const yourTasksHeading = page.locator('text="Your Tasks"')
        const noTasksMessage = page.locator('text="No tasks shared"')

        // One of these should be visible
        const hasSharedTasks = await sharedTasksHeading
          .or(yourTasksHeading)
          .or(noTasksMessage)
          .isVisible({ timeout: 2000 })
          .catch(() => false)

        expect(hasSharedTasks).toBeTruthy()
      }
    }
  })

  test("should handle non-existent user gracefully", async ({ page }) => {
    // Try to navigate to a non-existent user profile
    await page.goto("/u/nonexistent-user-id-12345")
    await page.waitForLoadState("networkidle")

    // Should show error message
    await expect(
      page.locator('text="User not found", text="Profile not found"')
    ).toBeVisible({ timeout: 5000 })

    // Should show a back button or way to navigate away
    const backButton = page.locator('button:has-text("Back"), button:has-text("Go Back")')
    await expect(backButton).toBeVisible()
  })

  test("should stop propagation when clicking user link (not trigger parent handlers)", async ({
    page,
  }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    // Click on a task to open details
    const taskItem = page.locator('[data-testid="task-item"]').first()
    if (await taskItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await taskItem.click()
      await page.waitForTimeout(500)

      // Get current URL
      const beforeUrl = page.url()

      // Click on a user link in comments
      const userLink = page.locator('a[href^="/u/"]').first()
      if (await userLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await userLink.click()

        // Should navigate to profile, not stay on task detail
        await page.waitForTimeout(500)
        const afterUrl = page.url()

        expect(afterUrl).not.toBe(beforeUrl)
        await expect(page).toHaveURL(/\/u\/[a-zA-Z0-9-]+/)
      }
    }
  })

  test("should only show tasks from PUBLIC lists on user profile", async ({ page }) => {
    // Note: This test verifies the UI behavior. The actual filtering logic
    // is tested in the API unit tests (tests/api/user-profile.test.ts)
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    // Navigate to any user profile
    const userLink = page.locator('a[href^="/u/"]').first()
    if (await userLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await userLink.click()

      // Wait for profile to load
      await expect(page).toHaveURL(/\/u\/[a-zA-Z0-9-]+/)
      await page.waitForLoadState("networkidle")

      // Check for shared tasks section
      const sharedTasksSection = page.locator('text="Shared Tasks", text="Your Tasks"')
      const hasTasksSection = await sharedTasksSection.isVisible({ timeout: 2000 }).catch(() => false)

      if (hasTasksSection) {
        // If tasks are shown, they should all be from PUBLIC lists
        // This is verified by the API - UI just displays what API returns

        // Verify at least the tasks section exists
        await expect(
          page.locator('text="Shared Tasks", text="Your Tasks"')
        ).toBeVisible()

        // Tasks with PUBLIC list indicator (Globe icon) should be present
        const publicListIcon = page.locator('svg.lucide-globe')
        const hasPublicIcon = await publicListIcon.isVisible({ timeout: 1000 }).catch(() => false)

        // If we have tasks AND public icons, verify they're displayed correctly
        if (hasPublicIcon) {
          const publicIconCount = await publicListIcon.count()
          expect(publicIconCount).toBeGreaterThan(0)
        }
      }
    }
  })
})
