import type { Task, TaskList } from "@/types/task"

/**
 * Public List UI Utilities
 *
 * Helper functions to determine UI behavior for tasks in public lists.
 *
 * PUBLIC List Types:
 * - copy_only (default): Only admins can create/edit. Users can view and copy.
 * - collaborative: Anyone can add tasks. Task creator and admins can edit.
 */

/**
 * Check if a task belongs to any PUBLIC list
 */
export function isPublicListTask(task: Task): boolean {
  if (!task.lists || task.lists.length === 0) return false
  return task.lists.some(list => list.privacy === "PUBLIC")
}

/**
 * Get the public list type for a task (if it's in a public list)
 * Returns 'copy_only', 'collaborative', or null
 */
export function getTaskPublicListType(task: Task): "copy_only" | "collaborative" | null {
  if (!task.lists || task.lists.length === 0) return null

  const publicList = task.lists.find(list => list.privacy === "PUBLIC")
  if (!publicList) return null

  // Default to copy_only if not specified
  return (publicList.publicListType as "copy_only" | "collaborative") || "copy_only"
}

/**
 * Check if task priority should be hidden in UI
 * Public list tasks should not show priority
 */
export function shouldHideTaskPriority(task: Task): boolean {
  return isPublicListTask(task)
}

/**
 * Check if task "when" (due date) should be hidden in UI
 * Public list tasks should not show due dates
 */
export function shouldHideTaskWhen(task: Task): boolean {
  return isPublicListTask(task)
}

/**
 * Check if task comments should be hidden
 * - Copy-only public lists: NO comments
 * - Collaborative public lists: YES comments
 * - Private/shared lists: YES comments
 */
export function shouldHideTaskComments(task: Task): boolean {
  const publicListType = getTaskPublicListType(task)

  // Hide comments only for copy_only public lists
  return publicListType === "copy_only"
}

/**
 * Check if task should show copy button instead of checkbox
 * Public list tasks should show copy button
 */
export function shouldShowCopyButton(task: Task): boolean {
  return isPublicListTask(task)
}

/**
 * Check if a task belongs to a collaborative public list
 */
export function isCollaborativePublicTask(task: Task): boolean {
  return getTaskPublicListType(task) === "collaborative"
}

/**
 * Check if a task belongs to a copy-only public list
 */
export function isCopyOnlyPublicTask(task: Task): boolean {
  return getTaskPublicListType(task) === "copy_only"
}

/**
 * Get a list of all public lists a task belongs to
 */
export function getPublicLists(task: Task): TaskList[] {
  if (!task.lists || task.lists.length === 0) return []
  return task.lists.filter(list => list.privacy === "PUBLIC")
}
