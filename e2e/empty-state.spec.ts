import { test, expect } from '@playwright/test'

test.describe('Empty List State', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app (adjust URL based on your setup)
    await page.goto('http://localhost:3000')

    // Wait for authentication or use test account
    // This assumes you have a way to authenticate in tests
    await page.waitForSelector('[data-testid="task-manager"]', { timeout: 10000 })
  })

  test('should display Astrid empty state for empty personal list', async ({ page }) => {
    // Create a new empty list
    await page.click('button:has-text("New List")')
    await page.fill('input[placeholder*="List name"]', 'Test Empty List')
    await page.click('button:has-text("Create List")')

    // Wait for new list to be selected and empty state to appear
    await page.waitForSelector('text=/Ready to capture your thoughts/i', { timeout: 5000 })

    // Verify empty state content
    await expect(page.locator('text=/Ready to capture your thoughts/i')).toBeVisible()
    await expect(page.locator('text=/Tap below to create your first task/i')).toBeVisible()

    // Verify Astrid character (gradient circle) is visible
    const astridCharacter = page.locator('.bg-gradient-to-br.from-blue-500.to-purple-500')
    await expect(astridCharacter).toBeVisible()

    // Verify speech bubble is visible
    const speechBubble = page.locator('.rounded-2xl').first()
    await expect(speechBubble).toBeVisible()
  })

  test('should display "all caught up" message for empty My Tasks', async ({ page }) => {
    // Navigate to My Tasks
    await page.click('text=/My Tasks/i')

    // If there are tasks, complete or delete them first
    // This test assumes My Tasks can be empty

    // Wait for empty state
    await page.waitForSelector('text=/You\'re all caught up/i', { timeout: 5000 })

    // Verify content
    await expect(page.locator('text=/You\'re all caught up/i')).toBeVisible()
    await expect(page.locator('text=/No tasks assigned to you right now/i')).toBeVisible()
  })

  test('should display contextual message for Today view when empty', async ({ page }) => {
    // Navigate to Today
    await page.click('text=/Today/i')

    // Wait for empty state (assumes Today is empty)
    await page.waitForSelector('text=/Nothing scheduled for today/i', { timeout: 5000 })

    // Verify content
    await expect(page.locator('text=/Nothing scheduled for today/i')).toBeVisible()
    await expect(page.locator('text=/Enjoy the free time/i')).toBeVisible()
  })

  test('should show featured list message when viewing public list from featured', async ({ page }) => {
    // This test requires a featured/public list feature
    // Navigate to public lists browser
    await page.click('button:has-text("Browse Public Lists")')

    // Select an empty public list (this may require setup)
    // For now, this is a placeholder test structure
    // await page.click('text=/Some Empty Public List/i')

    // Wait for empty state
    // await page.waitForSelector('text=/This list is empty right now/i', { timeout: 5000 })

    // Verify featured list empty state
    // await expect(page.locator('text=/Copy it to make it your own/i')).toBeVisible()
  })

  test('should display empty state with animations', async ({ page }) => {
    // Create empty list
    await page.click('button:has-text("New List")')
    await page.fill('input[placeholder*="List name"]', 'Animation Test List')
    await page.click('button:has-text("Create List")')

    // Check for animation classes
    const animatedIcon = page.locator('.animate-in.fade-in.slide-in-from-bottom-4')
    await expect(animatedIcon).toBeVisible()

    const animatedBubble = page.locator('.animate-in.fade-in.slide-in-from-bottom-2')
    await expect(animatedBubble).toBeVisible()
  })

  test('should allow task creation from empty state', async ({ page }) => {
    // Create empty list
    await page.click('button:has-text("New List")')
    await page.fill('input[placeholder*="List name"]', 'Task Creation Test')
    await page.click('button:has-text("Create List")')

    // Wait for empty state
    await page.waitForSelector('text=/Ready to capture your thoughts/i', { timeout: 5000 })

    // Find and use task input (location varies by desktop/mobile)
    const taskInput = page.locator('input[placeholder*="Add a task"]').first()
    await taskInput.fill('My first task in empty list')
    await taskInput.press('Enter')

    // Verify task was created and empty state is gone
    await expect(page.locator('text=/My first task in empty list/i')).toBeVisible()
    await expect(page.locator('text=/Ready to capture your thoughts/i')).not.toBeVisible()
  })

  test('should show empty state again after deleting last task', async ({ page }) => {
    // Create list with one task
    await page.click('button:has-text("New List")')
    await page.fill('input[placeholder*="List name"]', 'Delete Test List')
    await page.click('button:has-text("Create List")')

    // Add a task
    const taskInput = page.locator('input[placeholder*="Add a task"]').first()
    await taskInput.fill('Temporary task')
    await taskInput.press('Enter')

    // Wait for task to appear
    await page.waitForSelector('text=/Temporary task/i')

    // Click on task to open detail panel
    await page.click('text=/Temporary task/i')

    // Delete the task (adjust selector based on your UI)
    await page.click('button[aria-label="Delete task"]', { timeout: 5000 })
    // Confirm deletion if there's a confirmation dialog
    await page.click('button:has-text("Delete")', { timeout: 2000 }).catch(() => {})

    // Verify empty state returns
    await page.waitForSelector('text=/Ready to capture your thoughts/i', { timeout: 5000 })
    await expect(page.locator('text=/Ready to capture your thoughts/i')).toBeVisible()
  })

  test.describe('Mobile View', () => {
    test.use({ viewport: { width: 375, height: 667 } })

    test('should show mobile hint arrow on empty state', async ({ page }) => {
      // Create empty list
      await page.click('button:has-text("New List")')
      await page.fill('input[placeholder*="List name"]', 'Mobile Test List')
      await page.click('button:has-text("Create List")')

      // Wait for empty state
      await page.waitForSelector('text=/Ready to capture your thoughts/i', { timeout: 5000 })

      // Verify mobile hint arrow is visible
      const hintArrow = page.locator('text=/Add task below/i')
      await expect(hintArrow).toBeVisible()

      // Verify arrow has animation
      const animatedArrow = page.locator('.animate-bounce')
      await expect(animatedArrow).toBeVisible()
    })
  })

  test.describe('Theme Support', () => {
    test('should render correctly in dark mode', async ({ page }) => {
      // Enable dark mode (adjust based on your theme implementation)
      await page.evaluate(() => {
        document.documentElement.classList.add('dark')
      })

      // Create empty list
      await page.click('button:has-text("New List")')
      await page.fill('input[placeholder*="List name"]', 'Dark Mode Test')
      await page.click('button:has-text("Create List")')

      // Verify empty state renders in dark mode
      await page.waitForSelector('text=/Ready to capture your thoughts/i', { timeout: 5000 })

      // Take screenshot for visual verification (optional)
      // await page.screenshot({ path: 'empty-state-dark-mode.png' })

      // Verify empty state is visible
      await expect(page.locator('text=/Ready to capture your thoughts/i')).toBeVisible()
    })
  })
})
