import { test, expect } from '@playwright/test'

/**
 * Authenticated Task Tests
 *
 * These tests run with an authenticated user session.
 * The session is set up once in e2e/auth.setup.ts and reused across all tests.
 */

test.describe('Authenticated Task Management', () => {
  test('should show user dashboard when authenticated', async ({ page }) => {
    await page.goto('/')

    // Should be on dashboard, not redirected to sign-in
    await expect(page).not.toHaveURL(/\/auth\/signin/)

    // Should show main content
    const main = page.getByRole('main')
    await expect(main).toBeVisible()
  })

  test('should create a task when logged in', async ({ page }) => {
    await page.goto('/')

    // Find add task input
    const addTaskInput = page.getByPlaceholder(/add.*task/i).first()
    await expect(addTaskInput).toBeVisible()

    // Create a task
    const taskTitle = `Test Task ${Date.now()}`
    await addTaskInput.fill(taskTitle)
    await addTaskInput.press('Enter')

    // Wait for task to appear
    await page.waitForTimeout(1000) // Allow time for API call

    // Task should be visible
    const task = page.getByText(taskTitle)
    await expect(task).toBeVisible()
  })

  test('should show user menu when authenticated', async ({ page }) => {
    await page.goto('/')

    // Look for user menu or avatar
    const userMenu = page.getByRole('button', { name: /user.*menu|account/i }).or(
      page.locator('[data-user-menu]')
    )

    // User menu should be visible
    const isVisible = await userMenu.isVisible().catch(() => false)
    expect(isVisible).toBe(true)
  })

  test('should access settings when authenticated', async ({ page }) => {
    await page.goto('/settings')

    // Should not redirect to sign-in
    await expect(page).toHaveURL(/\/settings/)

    // Should show settings content
    const settingsHeading = page.getByRole('heading', { name: /settings/i })
    await expect(settingsHeading).toBeVisible()
  })

  test('should complete a task', async ({ page }) => {
    await page.goto('/')

    // Create a task first
    const taskTitle = `Complete Me ${Date.now()}`
    const addTaskInput = page.getByPlaceholder(/add.*task/i).first()
    await addTaskInput.fill(taskTitle)
    await addTaskInput.press('Enter')

    await page.waitForTimeout(1000)

    // Find the task
    const task = page.getByText(taskTitle)
    await expect(task).toBeVisible()

    // Find checkbox (might be in same container)
    const taskContainer = task.locator('..')
    const checkbox = taskContainer.getByRole('checkbox').first()

    // Complete the task
    await checkbox.check()

    // Wait for update
    await page.waitForTimeout(500)

    // Checkbox should be checked
    await expect(checkbox).toBeChecked()
  })

  test('should edit a task', async ({ page }) => {
    await page.goto('/')

    // Create a task first
    const originalTitle = `Edit Me ${Date.now()}`
    const addTaskInput = page.getByPlaceholder(/add.*task/i).first()
    await addTaskInput.fill(originalTitle)
    await addTaskInput.press('Enter')

    await page.waitForTimeout(1000)

    // Click on the task to edit
    const task = page.getByText(originalTitle)
    await task.click()

    // Wait for edit view
    await page.waitForTimeout(500)

    // Edit the task title
    const titleInput = page.getByRole('textbox', { name: /title/i }).or(
      page.locator('input[value*="Edit Me"]')
    )

    if (await titleInput.isVisible()) {
      const newTitle = `Updated ${Date.now()}`
      await titleInput.fill(newTitle)
      await titleInput.press('Enter')

      // Wait for save
      await page.waitForTimeout(1000)

      // Close edit view
      await page.keyboard.press('Escape')

      // New title should be visible
      await expect(page.getByText(newTitle)).toBeVisible()
    }
  })

  test('should persist session across page reloads', async ({ page }) => {
    await page.goto('/')

    // Verify we're authenticated
    const isAuth1 = await page.evaluate(() =>
      document.cookie.includes('next-auth.session-token') ||
      document.cookie.includes('__Secure-next-auth.session-token')
    )
    expect(isAuth1).toBe(true)

    // Reload page
    await page.reload()

    // Should still be authenticated
    const isAuth2 = await page.evaluate(() =>
      document.cookie.includes('next-auth.session-token') ||
      document.cookie.includes('__Secure-next-auth.session-token')
    )
    expect(isAuth2).toBe(true)

    // Should not redirect to sign-in
    await expect(page).not.toHaveURL(/\/auth\/signin/)
  })
})
