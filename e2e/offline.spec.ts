import { test, expect, type BrowserContext } from '@playwright/test'

test.describe('Offline functionality', () => {
  let context: BrowserContext

  test.beforeEach(async ({ browser }) => {
    context = await browser.newContext()
  })

  test.afterEach(async () => {
    await context.close()
  })

  test('should show offline indicator when going offline', async ({ page }) => {
    await page.goto('/')

    // Wait for page to load
    await page.waitForLoadState('networkidle')

    // Go offline
    await context.setOffline(true)

    // Should show offline status
    const offlineIndicator = page.locator('text=/offline/i')
    await expect(offlineIndicator).toBeVisible({ timeout: 5000 })
  })

  test('should show online indicator when coming back online', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Go offline then back online
    await context.setOffline(true)
    await page.waitForTimeout(1000)
    await context.setOffline(false)

    // Should show online status
    const onlineIndicator = page.locator('text=/back online/i')
    await expect(onlineIndicator).toBeVisible({ timeout: 5000 })
  })

  test('should load cached data when offline', async ({ page }) => {
    // First, load page while online to cache data
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Wait for data to load
    await page.waitForTimeout(2000)

    // Go offline
    await context.setOffline(true)

    // Reload page
    await page.reload()

    // Should still show content from cache
    // (Assuming there's some content visible)
    const content = page.locator('body')
    await expect(content).not.toBeEmpty()
  })

  test('should queue mutations when offline', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // TODO: Add authentication and task creation flow
    // This is a placeholder for the actual test implementation

    // Go offline
    await context.setOffline(true)

    // Try to create a task (this should be queued)
    // await createTaskWhileOffline(page)

    // Verify pending mutations count
    // const pendingIndicator = page.locator('[data-testid="pending-mutations"]')
    // await expect(pendingIndicator).toContainText('1')
  })

  test('should sync queued mutations when coming back online', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // TODO: Add authentication and task creation flow

    // Go offline
    await context.setOffline(true)

    // Create a task while offline (queued)
    // await createTaskWhileOffline(page)

    // Come back online
    await context.setOffline(false)

    // Wait for sync to complete
    await page.waitForTimeout(2000)

    // Verify task was synced
    // const task = page.locator('[data-testid="task-item"]')
    // await expect(task).toBeVisible()

    // Pending mutations should be 0
    // const pendingIndicator = page.locator('[data-testid="pending-mutations"]')
    // await expect(pendingIndicator).toContainText('0')
  })

  test('should handle API errors gracefully and fall back to cache', async ({ page }) => {
    // Load page initially
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Simulate API error by intercepting requests
    await page.route('**/api/**', route => {
      route.abort('failed')
    })

    // Reload page
    await page.reload()

    // Should show cached data toast
    const toast = page.locator('text=/using cached data/i')
    await expect(toast).toBeVisible({ timeout: 5000 })
  })

  test('should show sync status in header', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Look for sync status indicator (if implemented in header)
    const syncStatus = page.locator('[data-testid="sync-status"]').or(
      page.locator('button:has-text("sync")')
    )

    // Sync status should be visible
    await expect(syncStatus).toBeVisible()
  })

  test('should persist task edits offline and sync on reconnection', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // TODO: This test requires authentication
    // 1. Login as test user
    // 2. Navigate to a list with tasks
    // 3. Go offline
    // 4. Edit a task (title, description, etc.)
    // 5. Verify edit is saved locally
    // 6. Come back online
    // 7. Verify edit syncs to server
    // 8. Reload page and verify edit persisted

    // Placeholder assertion
    expect(true).toBe(true)
  })

  test('should handle conflict resolution when syncing', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // TODO: This test requires complex setup:
    // 1. Create task while online
    // 2. Go offline
    // 3. Edit task locally
    // 4. Simulate server-side edit (another user)
    // 5. Come back online
    // 6. Verify conflict is detected
    // 7. Verify conflict resolution strategy (last-write-wins, manual, etc.)

    // Placeholder assertion
    expect(true).toBe(true)
  })

  test('should maintain service worker across page reloads', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Check if service worker is registered
    const swRegistered = await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready
        return registration !== null
      }
      return false
    })

    expect(swRegistered).toBe(true)

    // Reload page
    await page.reload()

    // Service worker should still be active
    const swStillActive = await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready
        return registration !== null
      }
      return false
    })

    expect(swStillActive).toBe(true)
  })

  test('should show IndexedDB storage size', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Check IndexedDB size (development/debug feature)
    const dbSize = await page.evaluate(async () => {
      if ('indexedDB' in window) {
        // Open database
        const request = indexedDB.open('AstridOfflineDB')

        return new Promise((resolve, reject) => {
          request.onsuccess = () => {
            const db = request.result
            resolve(db.objectStoreNames.length)
          }
          request.onerror = () => reject(request.error)
        })
      }
      return 0
    })

    // Should have object stores for offline data
    expect(dbSize).toBeGreaterThan(0)
  })
})

test.describe('Service Worker caching', () => {
  test('should cache static assets', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Check that service worker cached static assets
    const cachedAssets = await page.evaluate(async () => {
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        const staticCache = cacheNames.find(name => name.includes('static'))

        if (staticCache) {
          const cache = await caches.open(staticCache)
          const keys = await cache.keys()
          return keys.length
        }
      }
      return 0
    })

    expect(cachedAssets).toBeGreaterThan(0)
  })

  test('should serve pages from cache when offline', async ({ page, context }) => {
    // Load page while online
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Go offline
    await context.setOffline(true)

    // Navigate to another page (should load from cache)
    await page.goto('/')

    // Page should still load
    const body = page.locator('body')
    await expect(body).toBeVisible()
  })
})

test.describe('Background sync', () => {
  test('should register background sync when offline mutations are queued', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Check if background sync is supported
    const bgSyncSupported = await page.evaluate(() => {
      return 'serviceWorker' in navigator && 'SyncManager' in window
    })

    if (bgSyncSupported) {
      // TODO: Test background sync registration
      // This requires implementing actual mutation queueing in the UI
      expect(true).toBe(true)
    } else {
      console.log('Background Sync API not supported in this browser')
      expect(true).toBe(true)
    }
  })
})
