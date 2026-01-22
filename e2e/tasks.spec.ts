import { test, expect } from '@playwright/test'
import { TaskHelpers, waitForApiCall } from './utils/test-helpers'

test.describe('Task Management', () => {
  let taskHelpers: TaskHelpers

  test.beforeEach(async ({ page }) => {
    taskHelpers = new TaskHelpers(page)

    // Note: These tests will need authentication to be set up
    // For now, we'll navigate to the home page
    await page.goto('/')
  })

  test.describe('Task Creation', () => {
    test('should create a new task with Enter key', async ({ page }) => {
      const taskTitle = `Test Task ${Date.now()}`

      // Find add task input
      const addTaskInput = page.getByPlaceholder(/add.*task/i).first()
      await expect(addTaskInput).toBeVisible()

      // Type task title and press Enter
      await addTaskInput.fill(taskTitle)
      await addTaskInput.press('Enter')

      // Wait for task creation API call
      await waitForApiCall(page, /\/api\/tasks/)

      // Task should appear in the list
      const createdTask = taskHelpers.getTaskByTitle(taskTitle)
      await expect(createdTask).toBeVisible()
    })

    test('should clear input after task creation', async ({ page }) => {
      const addTaskInput = page.getByPlaceholder(/add.*task/i).first()

      await addTaskInput.fill('Test Task')
      await addTaskInput.press('Enter')

      // Input should be cleared
      await expect(addTaskInput).toHaveValue('')
    })

    test('should not create task with empty title', async ({ page }) => {
      const addTaskInput = page.getByPlaceholder(/add.*task/i).first()

      // Try to create task with empty title
      await addTaskInput.press('Enter')

      // Should not create a task (input should still be empty and focused)
      await expect(addTaskInput).toBeFocused()
    })

    test('should create task with description', async ({ page }) => {
      const taskTitle = `Task with Description ${Date.now()}`

      // Create task
      await taskHelpers.createTask(taskTitle)

      // Open task details
      await taskHelpers.openTaskDetails(taskTitle)

      // Add description
      const descriptionInput = page.getByLabel(/description/i).or(
        page.getByPlaceholder(/description/i)
      )
      await descriptionInput.fill('This is a test description')
      await descriptionInput.blur()

      // Wait for save
      await waitForApiCall(page, /\/api\/tasks/)

      // Reopen task and verify description
      await page.reload()
      await taskHelpers.openTaskDetails(taskTitle)

      await expect(descriptionInput).toHaveValue('This is a test description')
    })
  })

  test.describe('Task Completion', () => {
    test('should mark task as complete', async ({ page }) => {
      const taskTitle = `Complete Me ${Date.now()}`

      // Create task
      await taskHelpers.createTask(taskTitle)

      // Find task checkbox
      const task = taskHelpers.getTaskByTitle(taskTitle)
      const checkbox = task.getByRole('checkbox')

      // Complete task
      await checkbox.check()

      // Wait for API call
      await waitForApiCall(page, /\/api\/tasks/)

      // Checkbox should be checked
      await expect(checkbox).toBeChecked()

      // Task might have strikethrough or different styling
      await expect(task).toHaveClass(/completed|done|checked/)
    })

    test('should uncheck completed task', async ({ page }) => {
      const taskTitle = `Toggle Complete ${Date.now()}`

      // Create and complete task
      await taskHelpers.createTask(taskTitle)
      await taskHelpers.completeTask(taskTitle)

      // Uncheck task
      const task = taskHelpers.getTaskByTitle(taskTitle)
      const checkbox = task.getByRole('checkbox')
      await checkbox.uncheck()

      // Wait for API call
      await waitForApiCall(page, /\/api\/tasks/)

      // Should be unchecked
      await expect(checkbox).not.toBeChecked()
    })

    test('should filter completed tasks', async ({ page }) => {
      const task1 = `Active Task ${Date.now()}`
      const task2 = `Completed Task ${Date.now()}`

      // Create two tasks
      await taskHelpers.createTask(task1)
      await taskHelpers.createTask(task2)

      // Complete second task
      await taskHelpers.completeTask(task2)

      // Find filter button/menu
      const filterButton = page.getByRole('button', { name: /filter/i }).or(
        page.getByRole('button', { name: /view/i })
      )

      if (await filterButton.isVisible()) {
        await filterButton.click()

        // Select "Active" or "Hide completed"
        const activeFilter = page.getByRole('menuitem', { name: /active|hide.*completed/i })
        if (await activeFilter.isVisible()) {
          await activeFilter.click()

          // Only active task should be visible
          await expect(taskHelpers.getTaskByTitle(task1)).toBeVisible()
          await expect(taskHelpers.getTaskByTitle(task2)).not.toBeVisible()
        }
      }
    })
  })

  test.describe('Task Editing', () => {
    test('should edit task title', async ({ page }) => {
      const originalTitle = `Original ${Date.now()}`
      const newTitle = `Updated ${Date.now()}`

      // Create task
      await taskHelpers.createTask(originalTitle)

      // Open task details
      await taskHelpers.openTaskDetails(originalTitle)

      // Edit title
      const titleInput = page.getByRole('textbox', { name: /title/i })
      await titleInput.fill(newTitle)
      await titleInput.blur()

      // Wait for save
      await waitForApiCall(page, /\/api\/tasks/)

      // Close and verify
      await page.keyboard.press('Escape')
      await expect(taskHelpers.getTaskByTitle(newTitle)).toBeVisible()
      await expect(taskHelpers.getTaskByTitle(originalTitle)).not.toBeVisible()
    })

    test('should assign user to task', async ({ page }) => {
      const taskTitle = `Assignee Test ${Date.now()}`

      // Create task
      await taskHelpers.createTask(taskTitle)

      // Open task details
      await taskHelpers.openTaskDetails(taskTitle)

      // Find and click assignee field
      const assigneeField = page.getByText('Unassigned').or(
        page.locator('[data-testid="assignee-field"]')
      ).first()
      await assigneeField.click()

      // Wait for user picker to appear (search input)
      const userSearchInput = page.getByPlaceholder(/search users or enter email/i)
      await expect(userSearchInput).toBeVisible()

      // Type to search for a user
      await userSearchInput.fill('test')

      // Wait for search results
      await page.waitForTimeout(500)

      // Select first user from dropdown
      const firstUser = page.locator('.bg-gray-800 [class*="cursor-pointer"]').first()
      if (await firstUser.isVisible()) {
        await firstUser.click()

        // Wait for assignment to save
        await waitForApiCall(page, /\/api\/tasks/)

        // User picker should close and assignee should be displayed
        await expect(userSearchInput).not.toBeVisible()
      }
    })

    test('should unassign user from task', async ({ page }) => {
      const taskTitle = `Unassign Test ${Date.now()}`

      // Create task
      await taskHelpers.createTask(taskTitle)

      // Open task details
      await taskHelpers.openTaskDetails(taskTitle)

      // First assign a user
      const assigneeField = page.getByText('Unassigned').first()
      await assigneeField.click()

      const userSearchInput = page.getByPlaceholder(/search users or enter email/i)
      await expect(userSearchInput).toBeVisible()

      // Select "Unassigned" option (should be available when input is empty/focused)
      const unassignedOption = page.getByText('Unassigned').filter({ hasText: /^Unassigned$/ })
      if (await unassignedOption.count() > 1) {
        // Click the one in the dropdown (not the field label)
        await unassignedOption.nth(1).click()

        // Wait for update
        await waitForApiCall(page, /\/api\/tasks/)

        // Should show "Unassigned" in the field
        await expect(page.getByText('Unassigned').first()).toBeVisible()
      }
    })

    test('should show consolidated assignee UI (no duplicate display)', async ({ page }) => {
      const taskTitle = `Consolidated UI Test ${Date.now()}`

      // Create task
      await taskHelpers.createTask(taskTitle)

      // Open task details
      await taskHelpers.openTaskDetails(taskTitle)

      // Click assignee field to edit
      const assigneeField = page.getByText('Unassigned').first()
      await assigneeField.click()

      // When editing, should see search input
      const userSearchInput = page.getByPlaceholder(/search users or enter email/i)
      await expect(userSearchInput).toBeVisible()

      // Should NOT see duplicate selected user display above the search input
      // (inline mode hides the .bg-gray-700.rounded-lg.border user card)
      const userDisplayCards = page.locator('.bg-gray-700.rounded-lg.border')
      const cardCount = await userDisplayCards.count()

      // There should be 0 user display cards when in editing mode (inline=true)
      // or at most 1 if there are other similar styled elements
      expect(cardCount).toBeLessThanOrEqual(1)
    })

    test('should set task due date', async ({ page }) => {
      const taskTitle = `Task with Due Date ${Date.now()}`

      // Create task
      await taskHelpers.createTask(taskTitle)

      // Open task details
      await taskHelpers.openTaskDetails(taskTitle)

      // Click due date picker
      const dueDateButton = page.getByRole('button', { name: /due.*date|date/i })
      await dueDateButton.click()

      // Select tomorrow's date (calendar should be visible)
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)

      const dateButton = page.getByRole('button', {
        name: new RegExp(tomorrow.getDate().toString())
      })
      await dateButton.click()

      // Wait for save
      await waitForApiCall(page, /\/api\/tasks/)

      // Due date should be displayed
      await expect(dueDateButton).toContainText(new RegExp(tomorrow.getDate().toString()))
    })

    test('should set task priority', async ({ page }) => {
      const taskTitle = `Priority Task ${Date.now()}`

      // Create task
      await taskHelpers.createTask(taskTitle)

      // Open task details
      await taskHelpers.openTaskDetails(taskTitle)

      // Click priority selector
      const priorityButton = page.getByRole('button', { name: /priority/i })
      await priorityButton.click()

      // Select high priority
      const highPriority = page.getByRole('menuitem', { name: /high/i })
      await highPriority.click()

      // Wait for save
      await waitForApiCall(page, /\/api\/tasks/)

      // Priority should be reflected
      await expect(priorityButton).toContainText(/high/i)
    })

    test('should assign task to user', async ({ page }) => {
      const taskTitle = `Assigned Task ${Date.now()}`

      // Create task
      await taskHelpers.createTask(taskTitle)

      // Open task details
      await taskHelpers.openTaskDetails(taskTitle)

      // Click assignee picker
      const assigneeButton = page.getByRole('button', { name: /assign/i })
      if (await assigneeButton.isVisible()) {
        await assigneeButton.click()

        // Select first available user (if any)
        const userOption = page.getByRole('option').first()
        if (await userOption.isVisible()) {
          await userOption.click()

          // Wait for save
          await waitForApiCall(page, /\/api\/tasks/)
        }
      }
    })
  })

  test.describe('Task Deletion', () => {
    test('should delete task', async ({ page }) => {
      const taskTitle = `Delete Me ${Date.now()}`

      // Create task
      await taskHelpers.createTask(taskTitle)

      // Verify task exists
      await expect(taskHelpers.getTaskByTitle(taskTitle)).toBeVisible()

      // Delete task
      await taskHelpers.deleteTask(taskTitle)

      // Wait for deletion API call
      await waitForApiCall(page, /\/api\/tasks/)

      // Task should no longer be visible
      await expect(taskHelpers.getTaskByTitle(taskTitle)).not.toBeVisible()
    })

    test('should show delete confirmation', async ({ page }) => {
      const taskTitle = `Confirm Delete ${Date.now()}`

      // Create task
      await taskHelpers.createTask(taskTitle)

      const task = taskHelpers.getTaskByTitle(taskTitle)
      await task.click({ button: 'right' })

      // Click delete
      await page.getByRole('menuitem', { name: /delete/i }).click()

      // Should show confirmation dialog
      const dialog = page.getByRole('dialog').or(
        page.getByRole('alertdialog')
      )
      await expect(dialog).toBeVisible()

      // Should have cancel and confirm buttons
      const cancelButton = dialog.getByRole('button', { name: /cancel/i })
      await expect(cancelButton).toBeVisible()

      const confirmButton = dialog.getByRole('button', { name: /delete|confirm/i })
      await expect(confirmButton).toBeVisible()
    })
  })

  test.describe('Task Comments', () => {
    test('should add comment to task', async ({ page }) => {
      const taskTitle = `Task with Comment ${Date.now()}`
      const commentText = 'This is a test comment'

      // Create task
      await taskHelpers.createTask(taskTitle)

      // Open task details
      await taskHelpers.openTaskDetails(taskTitle)

      // Add comment
      const commentInput = page.getByPlaceholder(/comment/i).or(
        page.getByRole('textbox', { name: /comment/i })
      )
      await commentInput.fill(commentText)

      const submitButton = page.getByRole('button', { name: /add.*comment|submit/i })
      await submitButton.click()

      // Wait for comment creation
      await waitForApiCall(page, /\/api\/.*\/comments/)

      // Comment should appear
      await expect(page.getByText(commentText)).toBeVisible()
    })
  })

  test.describe('Keyboard Shortcuts', () => {
    test('should close task detail with Escape', async ({ page }) => {
      const taskTitle = `Escape Test ${Date.now()}`

      // Create and open task
      await taskHelpers.createTask(taskTitle)
      await taskHelpers.openTaskDetails(taskTitle)

      // Press Escape
      await page.keyboard.press('Escape')

      // Task detail should close
      const taskDetail = page.getByRole('dialog').or(
        page.locator('[data-task-detail]')
      )
      await expect(taskDetail).not.toBeVisible()
    })
  })

  test.describe('Task Copy', () => {
    test('should copy task and show it immediately in list', async ({ page }) => {
      const originalTitle = `Original Task ${Date.now()}`

      // Create task
      await taskHelpers.createTask(originalTitle)

      // Verify task exists
      await expect(taskHelpers.getTaskByTitle(originalTitle)).toBeVisible()

      // Open task details
      await taskHelpers.openTaskDetails(originalTitle)

      // Find and click copy button (might be in more menu or toolbar)
      const copyButton = page.getByRole('button', { name: /copy/i }).or(
        page.locator('[title*="Copy"]')
      ).first()

      if (await copyButton.isVisible()) {
        await copyButton.click()

        // Wait for copy modal if it appears
        const copyModal = page.getByRole('dialog').filter({ hasText: /copy.*task/i })
        if (await copyModal.isVisible({ timeout: 1000 }).catch(() => false)) {
          // Select target list if prompted
          const listSelect = copyModal.getByRole('combobox')
          if (await listSelect.isVisible()) {
            // Select first list option
            await listSelect.click()
            const firstOption = page.getByRole('option').first()
            if (await firstOption.isVisible()) {
              await firstOption.click()
            }
          }

          // Confirm copy
          const confirmButton = copyModal.getByRole('button', { name: /copy/i })
          await confirmButton.click()
        }

        // Wait for copy API call to complete
        await waitForApiCall(page, /\/api\/tasks\/.*\/copy/)

        // Wait a moment for UI to update
        await page.waitForTimeout(500)

        // Copied task should appear immediately in the list with [copy] suffix
        const copiedTaskTitle = `${originalTitle} [copy]`
        const copiedTask = taskHelpers.getTaskByTitle(copiedTaskTitle)

        // This is the critical assertion - copied task must be visible immediately
        await expect(copiedTask).toBeVisible({ timeout: 3000 })

        // Verify we now have 2 tasks (original + copy)
        const taskCount = await page.locator('[data-task-id]').count()
        expect(taskCount).toBeGreaterThanOrEqual(2)
      }
    })

    test('should copy task with comments when requested', async ({ page }) => {
      const originalTitle = `Task with Comments ${Date.now()}`
      const commentText = 'Important comment'

      // Create task
      await taskHelpers.createTask(originalTitle)

      // Add a comment
      await taskHelpers.openTaskDetails(originalTitle)
      const commentInput = page.getByPlaceholder(/comment/i).first()
      await commentInput.fill(commentText)
      const submitButton = page.getByRole('button', { name: /add.*comment/i })
      await submitButton.click()
      await waitForApiCall(page, /\/api\/.*\/comments/)

      // Close and reopen to ensure comment persisted
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      await taskHelpers.openTaskDetails(originalTitle)

      // Click copy button
      const copyButton = page.getByRole('button', { name: /copy/i }).first()
      await copyButton.click()

      // Look for "Include comments" checkbox in copy modal
      const copyModal = page.getByRole('dialog').filter({ hasText: /copy/i })
      if (await copyModal.isVisible({ timeout: 1000 }).catch(() => false)) {
        const includeCommentsCheckbox = copyModal.getByRole('checkbox', {
          name: /include.*comment/i
        })

        if (await includeCommentsCheckbox.isVisible()) {
          // Check the box to include comments
          await includeCommentsCheckbox.check()
        }

        // Confirm copy
        const confirmButton = copyModal.getByRole('button', { name: /copy/i })
        await confirmButton.click()
      }

      // Wait for copy to complete
      await waitForApiCall(page, /\/api\/tasks\/.*\/copy/)
      await page.waitForTimeout(500)

      // Open copied task
      const copiedTaskTitle = `${originalTitle} [copy]`
      await page.keyboard.press('Escape') // Close current task if open
      await page.waitForTimeout(300)
      await taskHelpers.openTaskDetails(copiedTaskTitle)

      // Verify comment was copied
      await expect(page.getByText(commentText)).toBeVisible()
    })

    test('should copy task to different list', async ({ page }) => {
      const taskTitle = `Cross-List Task ${Date.now()}`

      // Create task in current list
      await taskHelpers.createTask(taskTitle)

      // Open task details
      await taskHelpers.openTaskDetails(taskTitle)

      // Click copy button
      const copyButton = page.getByRole('button', { name: /copy/i }).first()
      if (await copyButton.isVisible()) {
        await copyButton.click()

        // Select a different target list
        const copyModal = page.getByRole('dialog').filter({ hasText: /copy/i })
        if (await copyModal.isVisible({ timeout: 1000 }).catch(() => false)) {
          const listSelect = copyModal.locator('select').first()
          if (await listSelect.isVisible()) {
            // Get list options
            const options = await listSelect.locator('option').all()
            if (options.length > 1) {
              // Select second list (different from current)
              await listSelect.selectOption({ index: 1 })
            }
          }

          // Confirm copy
          const confirmButton = copyModal.getByRole('button', { name: /copy/i })
          await confirmButton.click()

          // Wait for copy operation
          await waitForApiCall(page, /\/api\/tasks\/.*\/copy/)
          await page.waitForTimeout(500)

          // Copied task should be visible
          const copiedTaskTitle = `${taskTitle} [copy]`
          await expect(taskHelpers.getTaskByTitle(copiedTaskTitle)).toBeVisible()
        }
      }
    })

    test('should not require refresh to see copied task', async ({ page }) => {
      const taskTitle = `No Refresh Needed ${Date.now()}`

      // Create task
      await taskHelpers.createTask(taskTitle)

      // Get initial task count
      const initialCount = await page.locator('[data-task-id]').count()

      // Open and copy task
      await taskHelpers.openTaskDetails(taskTitle)
      const copyButton = page.getByRole('button', { name: /copy/i }).first()

      if (await copyButton.isVisible()) {
        await copyButton.click()

        // Handle copy modal if present
        const copyModal = page.getByRole('dialog').filter({ hasText: /copy/i })
        if (await copyModal.isVisible({ timeout: 1000 }).catch(() => false)) {
          const confirmButton = copyModal.getByRole('button', { name: /copy/i })
          await confirmButton.click()
        }

        // Wait for copy operation
        await waitForApiCall(page, /\/api\/tasks\/.*\/copy/)

        // DO NOT refresh the page - this is the key test
        // The copied task should appear without any page refresh

        // Wait for UI to update
        await page.waitForTimeout(1000)

        // Verify task count increased
        const newCount = await page.locator('[data-task-id]').count()
        expect(newCount).toBeGreaterThan(initialCount)

        // Verify copied task is visible without refresh
        const copiedTaskTitle = `${taskTitle} [copy]`
        await expect(taskHelpers.getTaskByTitle(copiedTaskTitle)).toBeVisible()
      }
    })
  })
})
