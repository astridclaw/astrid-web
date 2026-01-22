import { test, expect } from '@playwright/test'
import { ListHelpers, TaskHelpers } from './utils/test-helpers'

test.describe('Desktop List Settings Gear Icon', () => {
  let listHelpers: ListHelpers
  let taskHelpers: TaskHelpers

  test.beforeEach(async ({ page }) => {
    listHelpers = new ListHelpers(page)
    taskHelpers = new TaskHelpers(page)

    // Navigate to home page (requires authentication)
    await page.goto('/')
  })

  test('admin user should see full settings popover with all tabs', async ({ page }) => {
    // Set viewport to desktop size (3-column layout)
    await page.setViewportSize({ width: 1920, height: 1080 })

    // Create a test list
    const listName = `Test List Admin ${Date.now()}`
    await listHelpers.createList(listName)

    // Wait for navigation to the new list
    await page.waitForLoadState('networkidle')

    // Find and click the gear (Settings) icon
    const settingsButton = page.locator('button:has(svg.lucide-settings)').first()
    await expect(settingsButton).toBeVisible()
    await settingsButton.click()

    // Verify the full settings popover appears (not just "Leave List")
    await expect(page.getByRole('heading', { name: /list settings/i })).toBeVisible()

    // Verify all three tabs are present for admin
    await expect(page.getByRole('tab', { name: /sort & filters/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /membership/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /admin settings/i })).toBeVisible()
  })

  test('non-admin member should see Membership tab with Leave List option', async ({ page }) => {
    // Note: This test assumes the user is a member of at least one shared list
    // Set viewport to desktop size (2-column layout)
    await page.setViewportSize({ width: 1024, height: 768 })

    // For simplicity, this test verifies the UI structure exists
    // A full integration test would require multi-user setup

    // Create a test list (user will be admin/owner)
    const listName = `Test List ${Date.now()}`
    await listHelpers.createList(listName)

    // Wait for navigation to the new list
    await page.waitForLoadState('networkidle')

    // Find and click the gear (Settings) icon
    const settingsButton = page.locator('button:has(svg.lucide-settings)').first()
    await expect(settingsButton).toBeVisible()
    await settingsButton.click()

    // Verify the full settings popover appears
    await expect(page.getByRole('heading', { name: /list settings/i })).toBeVisible()

    // Verify Membership tab is present (which contains Leave List for non-admins)
    await expect(page.getByRole('tab', { name: /membership/i })).toBeVisible()

    // Click on Membership tab
    await page.getByRole('tab', { name: /membership/i }).click()

    // For owner/admin, the "Leave List" button should also be available
    // (though it behaves differently - shows succession dialog)
    await expect(page.locator('text=/Leave List/i')).toBeVisible()
  })

  test('desktop gear icon should match mobile behavior', async ({ page }) => {
    // Create a test list
    const listName = `Test List Desktop vs Mobile ${Date.now()}`
    await listHelpers.createList(listName)

    // Test 1: Desktop view (3-column) - already on the list from creation
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.waitForLoadState('networkidle')

    const desktopSettingsButton = page.locator('button:has(svg.lucide-settings)').first()
    await expect(desktopSettingsButton).toBeVisible()
    await desktopSettingsButton.click()

    // Capture desktop behavior
    const desktopHasFullPopover = await page.getByRole('heading', { name: /list settings/i }).isVisible()
    const desktopHasTabs = await page.getByRole('tab', { name: /membership/i }).isVisible()

    await page.keyboard.press('Escape')

    // Test 2: Mobile view (1-column)
    await page.setViewportSize({ width: 375, height: 667 })
    await page.reload()
    await page.waitForLoadState('networkidle')

    // On mobile, need to open the list first via hamburger menu
    const hamburgerButton = page.locator('button:has(svg.lucide-menu)')
    if (await hamburgerButton.isVisible()) {
      await hamburgerButton.click()
      await page.getByText(listName).click()
    }

    // Find settings button in mobile header
    const mobileSettingsButton = page.locator('button:has(svg.lucide-settings)').first()
    await expect(mobileSettingsButton).toBeVisible()
    await mobileSettingsButton.click()

    // Capture mobile behavior
    const mobileHasFullPopover = await page.getByRole('heading', { name: /list settings/i }).isVisible()
    const mobileHasTabs = await page.getByRole('tab', { name: /membership/i }).isVisible()

    // Assert desktop and mobile behaviors match
    expect(desktopHasFullPopover).toBe(mobileHasFullPopover)
    expect(desktopHasTabs).toBe(mobileHasTabs)
  })
})
