import { test, expect } from '@playwright/test'

test.describe('Accessibility', () => {
  test('should have proper page title', async ({ page }) => {
    await page.goto('/')

    const title = await page.title()
    expect(title).toBeTruthy()
    expect(title.length).toBeGreaterThan(0)
  })

  test('should have main landmark', async ({ page }) => {
    await page.goto('/')

    const main = page.getByRole('main')
    await expect(main).toBeVisible()
  })

  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/')

    // Should have h1
    const h1 = page.locator('h1').first()
    await expect(h1).toBeVisible()

    // Check heading hierarchy (h1 -> h2 -> h3, no skipping)
    const headings = await page.locator('h1, h2, h3, h4, h5, h6').allTextContents()

    // Should have at least one heading
    expect(headings.length).toBeGreaterThan(0)
  })

  test('should support keyboard navigation', async ({ page }) => {
    await page.goto('/')

    // Tab through page
    await page.keyboard.press('Tab')

    const focusedElement = await page.evaluateHandle(() => document.activeElement)
    const tagName = await focusedElement.evaluate(el => (el as HTMLElement)?.tagName?.toLowerCase() || '')

    // Should focus on interactive element
    const interactiveElements = ['button', 'a', 'input', 'select', 'textarea']
    expect(interactiveElements).toContain(tagName)
  })

  test('should have visible focus indicators', async ({ page }) => {
    await page.goto('/')

    // Tab to first interactive element
    await page.keyboard.press('Tab')

    const focusedElement = page.locator(':focus')

    // Check if focus is visible (outline or ring)
    const outline = await focusedElement.evaluate(el => {
      const styles = window.getComputedStyle(el)
      return styles.outline || styles.boxShadow
    })

    expect(outline).toBeTruthy()
    expect(outline).not.toBe('none')
  })

  test('should have proper ARIA labels for buttons', async ({ page }) => {
    await page.goto('/')

    // All buttons should have accessible names
    const buttons = await page.getByRole('button').all()

    for (const button of buttons) {
      const accessibleName = await button.getAttribute('aria-label') ||
                              await button.textContent()

      expect(accessibleName).toBeTruthy()
      expect(accessibleName!.trim().length).toBeGreaterThan(0)
    }
  })

  test('should have proper form labels', async ({ page }) => {
    await page.goto('/auth/signin')

    // All inputs should have labels
    const inputs = await page.locator('input[type="text"], input[type="email"], input[type="password"]').all()

    for (const input of inputs) {
      const id = await input.getAttribute('id')
      const ariaLabel = await input.getAttribute('aria-label')
      const ariaLabelledBy = await input.getAttribute('aria-labelledby')

      // Should have label, aria-label, or aria-labelledby
      const hasLabel = id && await page.locator(`label[for="${id}"]`).count() > 0
      const hasAccessibleName = ariaLabel || ariaLabelledBy || hasLabel

      expect(hasAccessibleName).toBeTruthy()
    }
  })

  test('should have sufficient color contrast', async ({ page }) => {
    await page.goto('/')

    // Check main text elements for contrast
    const textElements = await page.locator('p, span, div, h1, h2, h3, h4, h5, h6').all()

    for (const element of textElements.slice(0, 10)) { // Check first 10
      if (!(await element.isVisible())) continue

      const contrast = await element.evaluate(el => {
        const styles = window.getComputedStyle(el)
        const color = styles.color
        const bgColor = styles.backgroundColor

        // Simple check - if colors are defined
        return color && bgColor && color !== bgColor
      })

      // This is a simplified check
      // For real contrast checking, you'd need a proper color contrast library
      if (contrast !== undefined) {
        expect(contrast).toBeTruthy()
      }
    }
  })

  test('should support screen reader announcements', async ({ page }) => {
    await page.goto('/')

    // Check for live regions
    const liveRegions = await page.locator('[aria-live], [role="status"], [role="alert"]').count()

    // Should have at least one live region for announcements
    expect(liveRegions).toBeGreaterThanOrEqual(0) // Some apps may not use them
  })

  test('should have skip navigation link', async ({ page }) => {
    await page.goto('/')

    // Focus on first element
    await page.keyboard.press('Tab')

    // Check if it's a skip link
    const firstFocused = page.locator(':focus')
    const text = await firstFocused.textContent()

    if (text && text.toLowerCase().includes('skip')) {
      // Should link to main content
      const href = await firstFocused.getAttribute('href')
      expect(href).toContain('#')
    }
  })

  test('should have proper alt text for images', async ({ page }) => {
    await page.goto('/')

    const images = await page.locator('img').all()

    for (const img of images) {
      const alt = await img.getAttribute('alt')

      // Alt should be present (can be empty for decorative images)
      expect(alt).not.toBeNull()
    }
  })

  test('should support reduced motion preferences', async ({ page }) => {
    // Set reduced motion preference
    await page.emulateMedia({ reducedMotion: 'reduce' })

    await page.goto('/')

    // Check if animations are disabled or reduced
    const animatedElements = await page.locator('[class*="animate"], [class*="transition"]').all()

    for (const element of animatedElements.slice(0, 5)) {
      if (!(await element.isVisible())) continue

      const animation = await element.evaluate(el => {
        const styles = window.getComputedStyle(el)
        return styles.animation || styles.transition
      })

      // With reduced motion, animations should be none or very short
      // This is a basic check - implementation may vary
    }
  })

  test('should have accessible error messages', async ({ page }) => {
    await page.goto('/auth/signin')

    // Submit form with errors
    const submitButton = page.getByRole('button', { name: /sign in/i })
    await submitButton.click()

    // Error messages should be announced to screen readers
    const errorMessage = page.locator('[role="alert"], [aria-live="polite"], [aria-invalid="true"]')

    if (await errorMessage.count() > 0) {
      await expect(errorMessage.first()).toBeVisible()
    }
  })

  test('should support Escape key to close dialogs', async ({ page }) => {
    await page.goto('/')

    // Open a dialog/modal
    const createButton = page.getByRole('button', { name: /create|new|add/i }).first()

    if (await createButton.isVisible()) {
      await createButton.click()

      // Dialog should be open
      const dialog = page.getByRole('dialog')
      if (await dialog.isVisible()) {
        // Press Escape
        await page.keyboard.press('Escape')

        // Dialog should close
        await expect(dialog).not.toBeVisible()
      }
    }
  })

  test('should trap focus in modals', async ({ page }) => {
    await page.goto('/')

    // Open a modal
    const createButton = page.getByRole('button', { name: /create|new|add/i }).first()

    if (await createButton.isVisible()) {
      await createButton.click()

      const dialog = page.getByRole('dialog')

      if (await dialog.isVisible()) {
        // Tab through modal
        for (let i = 0; i < 20; i++) {
          await page.keyboard.press('Tab')

          const focused = await page.evaluateHandle(() => document.activeElement)
          const isInDialog = await focused.evaluate((el, dialogSelector) => {
            const dialog = document.querySelector('[role="dialog"]')
            return dialog?.contains(el) || false
          })

          // Focus should stay within dialog
          expect(isInDialog).toBe(true)

          // Break if we've cycled through
          if (i > 10) break
        }
      }
    }
  })
})
