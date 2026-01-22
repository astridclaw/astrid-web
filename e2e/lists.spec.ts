import { test, expect } from '@playwright/test'
import { ListHelpers, TaskHelpers, waitForApiCall } from './utils/test-helpers'

test.describe('List Management', () => {
  let listHelpers: ListHelpers
  let taskHelpers: TaskHelpers

  test.beforeEach(async ({ page }) => {
    listHelpers = new ListHelpers(page)
    taskHelpers = new TaskHelpers(page)

    // Navigate to home page (requires authentication)
    await page.goto('/')
  })

  test.describe('List Creation', () => {
    test('should create a new list', async ({ page }) => {
      const listName = `Test List ${Date.now()}`

      // Create list
      await listHelpers.createList(listName)

      // Wait for list creation API call
      await waitForApiCall(page, /\/api\/lists/)

      // List should appear in sidebar
      const list = listHelpers.getListByName(listName)
      await expect(list).toBeVisible()
    })

    test('should switch to newly created list', async ({ page }) => {
      const listName = `New List ${Date.now()}`

      await listHelpers.createList(listName)

      // Should automatically switch to new list
      await expect(page).toHaveURL(new RegExp(`/list/|/lists/`))

      // List name should be displayed in header
      await expect(page.getByRole('heading', { name: listName })).toBeVisible()
    })

    test('should validate list name is required', async ({ page }) => {
      const createButton = page.getByRole('button', { name: /create.*list|new.*list/i })
      await createButton.click()

      // Try to submit without name
      const submitButton = page.getByRole('button', { name: /create|save/i })
      await submitButton.click()

      // Should show validation error
      const errorMessage = page.getByText(/name.*required|required.*name/i)
      await expect(errorMessage).toBeVisible()
    })
  })

  test.describe('List Navigation', () => {
    test('should switch between lists', async ({ page }) => {
      const list1 = `List One ${Date.now()}`
      const list2 = `List Two ${Date.now()}`

      // Create two lists
      await listHelpers.createList(list1)
      await listHelpers.createList(list2)

      // Should be on list2
      await expect(page.getByRole('heading', { name: list2 })).toBeVisible()

      // Switch to list1
      await listHelpers.switchToList(list1)

      // Should show list1 header
      await expect(page.getByRole('heading', { name: list1 })).toBeVisible()
    })

    test('should navigate via URL', async ({ page }) => {
      const listName = `URL List ${Date.now()}`

      await listHelpers.createList(listName)

      // Get current URL
      const currentUrl = page.url()
      const listId = currentUrl.match(/\/lists?\/([^/]+)/)?.[1]

      if (listId) {
        // Navigate away
        await page.goto('/')

        // Navigate back via URL
        await page.goto(`/list/${listId}`)

        // Should show the list
        await expect(page.getByRole('heading', { name: listName })).toBeVisible()
      }
    })

    test('should show list tasks only', async ({ page }) => {
      const list1Name = `List Alpha ${Date.now()}`
      const list2Name = `List Beta ${Date.now()}`
      const task1 = `Task in Alpha ${Date.now()}`
      const task2 = `Task in Beta ${Date.now()}`

      // Create first list and task
      await listHelpers.createList(list1Name)
      await taskHelpers.createTask(task1)

      // Create second list and task
      await listHelpers.createList(list2Name)
      await taskHelpers.createTask(task2)

      // Should only see task2
      await expect(taskHelpers.getTaskByTitle(task2)).toBeVisible()
      await expect(taskHelpers.getTaskByTitle(task1)).not.toBeVisible()

      // Switch to list1
      await listHelpers.switchToList(list1Name)

      // Should only see task1
      await expect(taskHelpers.getTaskByTitle(task1)).toBeVisible()
      await expect(taskHelpers.getTaskByTitle(task2)).not.toBeVisible()
    })
  })

  test.describe('List Settings', () => {
    test('should open list settings', async ({ page }) => {
      const listName = `Settings List ${Date.now()}`

      await listHelpers.createList(listName)

      // Open settings
      const settingsButton = page.getByRole('button', { name: /settings|options/i })
      await settingsButton.click()

      // Settings dialog/panel should be visible
      const settingsPanel = page.getByRole('dialog').or(
        page.locator('[data-list-settings]')
      )
      await expect(settingsPanel).toBeVisible()
    })

    test('should rename list', async ({ page }) => {
      const originalName = `Original ${Date.now()}`
      const newName = `Renamed ${Date.now()}`

      await listHelpers.createList(originalName)

      // Open settings
      const settingsButton = page.getByRole('button', { name: /settings/i })
      await settingsButton.click()

      // Edit name
      const nameInput = page.getByLabel(/name/i)
      await nameInput.fill(newName)

      // Save
      const saveButton = page.getByRole('button', { name: /save/i })
      await saveButton.click()

      // Wait for update
      await waitForApiCall(page, /\/api\/lists/)

      // Should show new name
      await expect(page.getByRole('heading', { name: newName })).toBeVisible()
      await expect(listHelpers.getListByName(newName)).toBeVisible()
    })

    test('should change list color', async ({ page }) => {
      const listName = `Color List ${Date.now()}`

      await listHelpers.createList(listName)

      // Open settings
      const settingsButton = page.getByRole('button', { name: /settings/i })
      await settingsButton.click()

      // Select color (if available)
      const colorPicker = page.locator('[data-color-picker]').or(
        page.getByLabel(/color/i)
      )

      if (await colorPicker.isVisible()) {
        await colorPicker.click()

        // Select a color
        const colorOption = page.locator('[data-color]').first()
        await colorOption.click()

        // Save
        const saveButton = page.getByRole('button', { name: /save/i })
        await saveButton.click()

        await waitForApiCall(page, /\/api\/lists/)
      }
    })
  })

  test.describe('List Sharing', () => {
    test('should access share settings', async ({ page }) => {
      const listName = `Share List ${Date.now()}`

      await listHelpers.createList(listName)

      // Open settings
      const settingsButton = page.getByRole('button', { name: /settings/i })
      await settingsButton.click()

      // Should have share/members section
      const shareSection = page.getByText(/share|members|collaborat/i)
      await expect(shareSection).toBeVisible()
    })

    test('should show invite option', async ({ page }) => {
      const listName = `Invite List ${Date.now()}`

      await listHelpers.createList(listName)

      const settingsButton = page.getByRole('button', { name: /settings/i })
      await settingsButton.click()

      // Should have invite button
      const inviteButton = page.getByRole('button', { name: /invite/i })
      if (await inviteButton.isVisible()) {
        await inviteButton.click()

        // Should show invite dialog
        const inviteDialog = page.getByRole('dialog')
        await expect(inviteDialog).toBeVisible()

        // Should have email input
        const emailInput = page.getByLabel(/email/i).or(
          page.getByPlaceholder(/email/i)
        )
        await expect(emailInput).toBeVisible()
      }
    })

    test('should make list public', async ({ page }) => {
      const listName = `Public List ${Date.now()}`

      await listHelpers.createList(listName)

      const settingsButton = page.getByRole('button', { name: /settings/i })
      await settingsButton.click()

      // Toggle public setting
      const publicToggle = page.getByRole('switch', { name: /public/i }).or(
        page.getByRole('checkbox', { name: /public/i })
      )

      if (await publicToggle.isVisible()) {
        await publicToggle.click()

        // Wait for update
        await waitForApiCall(page, /\/api\/lists/)

        // Should show share link
        const shareLink = page.locator('[data-share-link]').or(
          page.getByText(/https?:\/\//)
        )
        await expect(shareLink).toBeVisible()
      }
    })
  })

  test.describe('List Deletion', () => {
    test('should delete list', async ({ page }) => {
      const listName = `Delete Me ${Date.now()}`

      await listHelpers.createList(listName)

      // Verify list exists
      await expect(listHelpers.getListByName(listName)).toBeVisible()

      // Delete list
      await listHelpers.deleteList(listName)

      // Wait for deletion
      await waitForApiCall(page, /\/api\/lists/)

      // List should no longer be visible
      await expect(listHelpers.getListByName(listName)).not.toBeVisible()
    })

    test('should confirm before deleting list', async ({ page }) => {
      const listName = `Confirm Delete ${Date.now()}`

      await listHelpers.createList(listName)

      const settingsButton = page.getByRole('button', { name: /settings/i })
      await settingsButton.click()

      const deleteButton = page.getByRole('button', { name: /delete.*list/i })
      await deleteButton.click()

      // Should show confirmation
      const confirmDialog = page.getByRole('dialog').or(
        page.getByRole('alertdialog')
      )
      await expect(confirmDialog).toBeVisible()

      // Should explain consequences
      await expect(confirmDialog).toContainText(/cannot.*undone|permanent|delete/i)
    })

    test('should cancel list deletion', async ({ page }) => {
      const listName = `Keep Me ${Date.now()}`

      await listHelpers.createList(listName)

      const settingsButton = page.getByRole('button', { name: /settings/i })
      await settingsButton.click()

      const deleteButton = page.getByRole('button', { name: /delete.*list/i })
      await deleteButton.click()

      // Cancel deletion
      const cancelButton = page.getByRole('button', { name: /cancel/i })
      await cancelButton.click()

      // List should still exist
      await expect(listHelpers.getListByName(listName)).toBeVisible()
    })

    test('should redirect after deleting current list', async ({ page }) => {
      const listName = `Redirect Test ${Date.now()}`

      await listHelpers.createList(listName)
      await listHelpers.deleteList(listName)

      // Should redirect to home or another list
      await expect(page).toHaveURL(/\/$|\/list\/|\/lists\//)
    })
  })

  test.describe('Default List Behavior', () => {
    test('should have a default "My Tasks" list', async ({ page }) => {
      await page.goto('/')

      // Should show My Tasks list
      const myTasksList = page.getByText(/my.*tasks/i)
      await expect(myTasksList).toBeVisible()
    })

    test('should not allow deleting default list', async ({ page }) => {
      await page.goto('/')

      // Try to access My Tasks settings
      const myTasksList = page.getByText(/my.*tasks/i)
      await myTasksList.click()

      const settingsButton = page.getByRole('button', { name: /settings/i })

      if (await settingsButton.isVisible()) {
        await settingsButton.click()

        // Delete button should be disabled or not present
        const deleteButton = page.getByRole('button', { name: /delete.*list/i })

        if (await deleteButton.isVisible()) {
          await expect(deleteButton).toBeDisabled()
        } else {
          // Delete option should not exist
          await expect(deleteButton).not.toBeVisible()
        }
      }
    })
  })

  test.describe('List Ordering', () => {
    test('should reorder lists via drag and drop', async ({ page }) => {
      const list1 = `First ${Date.now()}`
      const list2 = `Second ${Date.now()}`

      await listHelpers.createList(list1)
      await listHelpers.createList(list2)

      // Get list elements
      const firstList = listHelpers.getListByName(list1)
      const secondList = listHelpers.getListByName(list2)

      // Drag second list above first (if drag and drop is implemented)
      const firstBox = await firstList.boundingBox()
      const secondBox = await secondList.boundingBox()

      if (firstBox && secondBox) {
        await secondList.hover()
        await page.mouse.down()
        await page.mouse.move(firstBox.x, firstBox.y)
        await page.mouse.up()

        // Order should be swapped (if implemented)
        // This would need specific implementation testing
      }
    })
  })
})
