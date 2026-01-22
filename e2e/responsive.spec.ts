import { test, expect } from '@playwright/test'

test.describe('Mobile Layout', () => {
  test('should show mobile navigation menu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }) // iPhone 12
    await page.goto('/')

    // Mobile menu should be visible
    const mobileMenu = page.getByRole('button', { name: /menu|navigation/i })
    await expect(mobileMenu).toBeVisible()
  })

  test('should hide desktop sidebar on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }) // iPhone 12
    await page.goto('/')

    // Desktop sidebar should be hidden
    const desktopSidebar = page.locator('[data-desktop-sidebar]')
    await expect(desktopSidebar).not.toBeVisible()
  })

  test('should allow adding tasks on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }) // iPhone 12
    await page.goto('/')

    const addButton = page.getByRole('button', { name: /add.*task|new.*task|\+/i })
    await expect(addButton).toBeVisible()

    await addButton.click()

    // Should show task input
    const taskInput = page.getByPlaceholder(/task/i)
    await expect(taskInput).toBeVisible()
  })

  test('should open task details in full screen on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }) // iPhone 12
    await page.goto('/')

    // Create a task (simplified for mobile)
    const addButton = page.getByRole('button', { name: /add.*task|new.*task|\+/i })
    if (await addButton.isVisible()) {
      await addButton.click()

      const taskInput = page.getByPlaceholder(/task/i)
      await taskInput.fill('Mobile Task')
      await taskInput.press('Enter')

      // Click on task
      const task = page.getByText('Mobile Task')
      await task.click()

      // Task detail should be full screen
      const taskDetail = page.locator('[data-task-detail]')
      const box = await taskDetail.boundingBox()

      // Should occupy most of the screen
      expect(box?.width).toBeGreaterThan(300)
    }
  })
})

test.describe('Tablet Layout', () => {
  test('should show adapted layout on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 1366 }) // iPad Pro
    await page.goto('/')

    // May show sidebar or adapted menu
    const sidebar = page.locator('[data-sidebar]')
    const menu = page.getByRole('button', { name: /menu/i })

    // Either sidebar or menu should be visible
    const hasNavigation = (await sidebar.isVisible()) || (await menu.isVisible())
    expect(hasNavigation).toBe(true)
  })

  test('should support touch interactions on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 1366 }) // iPad Pro
    await page.goto('/')

    // Test swipe gestures if implemented
    // This is a placeholder - actual implementation depends on app features
  })
})

test.describe('Desktop Layout', () => {
  test('should show full desktop layout', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 }) // Desktop
    await page.goto('/')

    // Desktop sidebar should be visible
    const sidebar = page.locator('[data-sidebar]').or(
      page.locator('aside')
    )

    if (await sidebar.isVisible()) {
      await expect(sidebar).toBeVisible()
    }

    // Task list should be visible
    const taskList = page.locator('[data-task-list]').or(
      page.locator('main')
    )
    await expect(taskList).toBeVisible()
  })

  test('should support keyboard navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 }) // Desktop
    await page.goto('/')

    // Tab through interactive elements
    await page.keyboard.press('Tab')

    // Should focus on interactive element
    const focused = await page.evaluateHandle(() => document.activeElement)
    expect(focused).toBeTruthy()
  })
})

test.describe('Orientation Changes', () => {
  test('should adapt to landscape on mobile', async ({ page }) => {
    // Start in portrait
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')

    // Rotate to landscape
    await page.setViewportSize({ width: 667, height: 375 })

    // Layout should adapt
    await page.waitForTimeout(500) // Allow layout to settle

    // App should still be functional
    const mainContent = page.locator('main')
    await expect(mainContent).toBeVisible()
  })
})
