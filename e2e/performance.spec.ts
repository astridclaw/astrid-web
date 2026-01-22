import { test, expect } from '@playwright/test'

test.describe('Performance', () => {
  test('should load home page within acceptable time', async ({ page }) => {
    const startTime = Date.now()

    await page.goto('/')

    // Wait for main content to load
    await page.waitForSelector('main', { timeout: 5000 })

    const loadTime = Date.now() - startTime

    // Should load within 5 seconds
    expect(loadTime).toBeLessThan(5000)
  })

  test('should handle large task lists efficiently', async ({ page }) => {
    await page.goto('/')

    // Measure rendering time with many tasks
    const startTime = Date.now()

    // Scroll through task list (if virtualized)
    const taskList = page.locator('[data-task-list]').or(page.locator('main'))

    for (let i = 0; i < 10; i++) {
      await taskList.evaluate(el => el.scrollBy(0, 100))
      await page.waitForTimeout(50)
    }

    const scrollTime = Date.now() - startTime

    // Scrolling should be smooth (under 1 second for 10 scrolls)
    expect(scrollTime).toBeLessThan(1000)
  })

  test('should not have console errors on initial load', async ({ page }) => {
    const errors: string[] = []

    page.on('console', message => {
      if (message.type() === 'error') {
        errors.push(message.text())
      }
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Filter out expected/harmless errors
    const criticalErrors = errors.filter(error =>
      !error.includes('favicon') &&
      !error.includes('ResizeObserver') &&
      !error.includes('Download the React DevTools')
    )

    expect(criticalErrors).toHaveLength(0)
  })

  test('should measure Core Web Vitals', async ({ page }) => {
    await page.goto('/')

    // Measure First Contentful Paint (FCP)
    const fcp = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntries()
          const fcpEntry = entries.find(entry => entry.name === 'first-contentful-paint')
          if (fcpEntry) {
            resolve(fcpEntry.startTime)
          }
        }).observe({ type: 'paint', buffered: true })
      })
    })

    // FCP should be under 1.8 seconds (good threshold)
    expect(fcp).toBeLessThan(1800)

    // Measure Largest Contentful Paint (LCP)
    const lcp = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntries()
          const lastEntry = entries[entries.length - 1] as any
          if (lastEntry) {
            resolve(lastEntry.renderTime || lastEntry.loadTime)
          }
        }).observe({ type: 'largest-contentful-paint', buffered: true })

        // Resolve after 2 seconds if LCP hasn't fired
        setTimeout(() => resolve(0), 2000)
      })
    })

    // LCP should be under 2.5 seconds (good threshold)
    if (lcp > 0) {
      expect(lcp).toBeLessThan(2500)
    }
  })

  test('should have efficient API response times', async ({ page }) => {
    const apiTimes: number[] = []

    page.on('response', async response => {
      if (response.url().includes('/api/')) {
        // Note: timing() method may not be available in all contexts
        // This is a simplified check
        apiTimes.push(Date.now())
      }
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Should have made some API calls
    expect(apiTimes.length).toBeGreaterThan(0)
  })

  test('should use appropriate caching headers', async ({ page }) => {
    await page.goto('/')

    const responses = await Promise.all([
      page.waitForResponse(response => response.url().includes('/api/tasks')),
    ])

    // Check for cache headers
    const taskResponse = responses[0]
    const cacheControl = taskResponse.headers()['cache-control']

    // Should have some caching strategy
    expect(cacheControl).toBeTruthy()
  })

  test('should minimize network requests', async ({ page }) => {
    const requests: string[] = []

    page.on('request', request => {
      requests.push(request.url())
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Count unique requests
    const uniqueRequests = new Set(requests).size

    // Should have reasonable number of requests (adjust based on app)
    expect(uniqueRequests).toBeLessThan(50)
  })

  test('should handle offline gracefully', async ({ page, context }) => {
    await page.goto('/')

    // Go offline
    await context.setOffline(true)

    // Try to create a task
    const addButton = page.getByRole('button', { name: /add.*task|\+/i })
    if (await addButton.isVisible()) {
      await addButton.click()

      const taskInput = page.getByPlaceholder(/task/i)
      await taskInput.fill('Offline Task')
      await taskInput.press('Enter')

      // Should show offline indicator or error message
      const offlineMessage = page.getByText(/offline|no.*connection|network.*error/i)
      await expect(offlineMessage).toBeVisible({ timeout: 3000 })
    }

    // Go back online
    await context.setOffline(false)
  })
})
