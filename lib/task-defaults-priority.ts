import { parseRelativeDate } from '@/lib/date-utils'
import type { TaskList } from '@/types/task'

/**
 * Convert My Tasks filter date values to actual dates
 * Maps filter values like "today", "this_week", "this_month" to dates
 */
function convertFilterDateToActualDate(filterDate: string): Date | null {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  switch (filterDate) {
    case 'today':
      return today

    case 'tomorrow':
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      return tomorrow

    case 'this_week':
      // Set to Friday of this week (end of work week)
      const daysUntilFriday = (5 - today.getDay() + 7) % 7
      const friday = new Date(today)
      friday.setDate(today.getDate() + (daysUntilFriday || 7)) // If today is Friday, use next Friday
      return friday

    case 'this_month':
    case 'this_calendar_month':
      // Set to last day of current month
      const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      lastDayOfMonth.setHours(0, 0, 0, 0)
      return lastDayOfMonth

    case 'this_calendar_week':
      // Set to Sunday of this week
      const daysUntilSunday = (7 - today.getDay()) % 7
      const sunday = new Date(today)
      sunday.setDate(today.getDate() + (daysUntilSunday || 7))
      return sunday

    default:
      return null
  }
}

/**
 * Task Defaults System - Single Source of Truth
 *
 * This module handles ALL task default value application with a clear priority hierarchy:
 *
 * Priority Order (Highest to Lowest):
 * 1. Explicit values from task title (e.g., "high priority", "assign to jon", "tomorrow")
 * 2. First hashtag list's customized defaults (user explicitly chose this list via #hashtag)
 * 3. Current list's customized defaults (just the viewing context)
 * 4. My Tasks filter preferences (when in My Tasks view with active filters)
 * 5. System defaults (hardcoded fallbacks)
 *
 * Key Concepts:
 * - "Customized" = User explicitly changed from system default
 * - "System Default" = Unchanged from original default value
 * - "unassigned" assigneeId is treated as CUSTOMIZED (user explicitly chose it)
 * - Filter-aware defaults apply ONLY in My Tasks view (no currentList, no hashtagLists)
 *
 * This is the ONLY place where default logic should live. The API trusts these values.
 */

/**
 * System-wide default values for new tasks
 * These are the "true defaults" - if a list has these exact values, it means the user hasn't customized them
 */
export const SYSTEM_DEFAULTS = {
  priority: 0,
  assigneeId: undefined, // Will be set to task creator
  isPrivate: true,
  repeating: 'never' as const,
  dueDate: undefined, // No due date
  dueTime: undefined, // No due time
} as const

/**
 * Check if a list's default value is still at system default (not customized)
 */
function isSystemDefault<K extends keyof typeof SYSTEM_DEFAULTS>(
  listValue: any,
  field: K
): boolean {
  const systemDefault = SYSTEM_DEFAULTS[field]

  // Special handling for assigneeId
  // NOTE: "unassigned" is treated as a CUSTOMIZED default because the user explicitly chose it
  // Only undefined/null (meaning "task creator") is the true system default
  if (field === 'assigneeId') {
    return listValue === systemDefault || listValue === undefined || listValue === null
  }

  // For dueDate, check for "none" or undefined
  if (field === 'dueDate') {
    return listValue === systemDefault || listValue === 'none' || listValue === undefined || listValue === null
  }

  return listValue === systemDefault
}

/**
 * Get non-default (customized) defaults from a list
 * Returns only the defaults that have been explicitly set (not system defaults)
 */
function getCustomizedDefaults(list: TaskList | null) {
  if (!list) return {}

  const customized: Record<string, any> = {}

  // Priority - check if customized (not 0)
  if (list.defaultPriority !== undefined && !isSystemDefault(list.defaultPriority, 'priority')) {
    customized.priority = list.defaultPriority
  }

  // Assignee - check if customized (not creator)
  // NOTE: "unassigned" IS a customized value (user explicitly chose it)
  if (list.defaultAssigneeId !== undefined && !isSystemDefault(list.defaultAssigneeId, 'assigneeId')) {
    customized.assigneeId = list.defaultAssigneeId
  }

  // Privacy - check if customized (not true)
  if (list.defaultIsPrivate !== undefined && !isSystemDefault(list.defaultIsPrivate, 'isPrivate')) {
    customized.isPrivate = list.defaultIsPrivate
  }

  // Repeating - check if customized (not "never")
  if (list.defaultRepeating !== undefined && !isSystemDefault(list.defaultRepeating, 'repeating')) {
    customized.repeating = list.defaultRepeating
  }

  // Due Date - check if customized (not undefined/none)
  if (list.defaultDueDate !== undefined && !isSystemDefault(list.defaultDueDate, 'dueDate')) {
    customized.dueDate = list.defaultDueDate
  }

  // Due Time - check if customized
  if (list.defaultDueTime !== undefined && !isSystemDefault(list.defaultDueTime, 'dueTime')) {
    customized.dueTime = list.defaultDueTime
  }

  return customized
}

export interface TaskDefaultsInput {
  // Parsed values from task title (explicit mentions)
  parsedValues: {
    priority?: number
    assigneeId?: string | null
    dueDateTime?: Date
    repeating?: string
    isPrivate?: boolean
  }

  // Current list (where user is adding task from)
  currentList: TaskList | null

  // Hashtag lists (lists specified via #hashtag)
  hashtagLists: TaskList[]

  // User ID for fallback assignee
  userId: string

  // My Tasks filter preferences (for filter-aware defaults)
  myTasksFilters?: {
    priority: number[]
    dueDate: string
  }
}

export interface TaskDefaults {
  priority: number
  assigneeId: string | null | undefined
  isPrivate: boolean
  repeating: string
  dueDateTime?: Date
  isAllDay?: boolean
  dueTime?: string
}

/**
 * Apply defaults with proper priority logic:
 * 1. Explicit mentions in task title (highest priority)
 * 2. First hashtag list's non-default defaults (user explicitly chose this list)
 * 3. Current list's non-default defaults (just where user is viewing from)
 * 4. My Tasks filter preferences (when in My Tasks view with active filters)
 * 5. System defaults (lowest priority)
 */
export function applyTaskDefaultsWithPriority(input: TaskDefaultsInput): TaskDefaults {
  const { parsedValues, currentList, hashtagLists, userId, myTasksFilters } = input

  // Start with system defaults
  const result: TaskDefaults = {
    priority: SYSTEM_DEFAULTS.priority,
    assigneeId: userId, // Default to task creator
    isPrivate: SYSTEM_DEFAULTS.isPrivate,
    repeating: SYSTEM_DEFAULTS.repeating,
    dueDateTime: undefined,
    isAllDay: undefined,
    dueTime: undefined,
  }

  // Step 0: Apply My Tasks filter-aware defaults (when in My Tasks view with active filters)
  // Only apply if we're in My Tasks (no currentList and no hashtagLists)
  if (!currentList && hashtagLists.length === 0 && myTasksFilters) {
    // Apply priority filter default (only if exactly one priority is selected)
    if (myTasksFilters.priority.length === 1) {
      result.priority = myTasksFilters.priority[0]
    }

    // Apply date filter default (convert filter value to actual date)
    if (myTasksFilters.dueDate && myTasksFilters.dueDate !== 'all' && myTasksFilters.dueDate !== 'no_date' && myTasksFilters.dueDate !== 'overdue') {
      const filterDate = convertFilterDateToActualDate(myTasksFilters.dueDate)
      if (filterDate) {
        result.dueDateTime = filterDate
        result.isAllDay = true
      }
    }
  }

  // Step 1: Apply current list's CUSTOMIZED defaults (lower priority - just context)
  if (currentList) {
    const customizedDefaults = getCustomizedDefaults(currentList)

    if (customizedDefaults.priority !== undefined) {
      result.priority = customizedDefaults.priority
    }
    if (customizedDefaults.assigneeId !== undefined) {
      // Convert special values:
      // - "unassigned" → null (explicitly unassigned)
      // - null → userId (task creator)
      // - user ID → that user
      if (customizedDefaults.assigneeId === 'unassigned') {
        result.assigneeId = null
      } else if (customizedDefaults.assigneeId === null) {
        result.assigneeId = userId
      } else {
        result.assigneeId = customizedDefaults.assigneeId
      }
    }
    if (customizedDefaults.isPrivate !== undefined) {
      result.isPrivate = customizedDefaults.isPrivate
    }
    if (customizedDefaults.repeating !== undefined) {
      result.repeating = customizedDefaults.repeating
    }
    if (customizedDefaults.dueDate !== undefined) {
      const parsedDate = parseRelativeDate(customizedDefaults.dueDate)
      if (parsedDate) {
        result.dueDateTime = parsedDate
      }
    }
    if (customizedDefaults.dueTime !== undefined) {
      result.dueTime = customizedDefaults.dueTime

      // Apply the default time to the when date
      // null = "all day" (no specific time, keep at midnight)
      // string (HH:MM) = apply that specific time
      if (customizedDefaults.dueTime !== null && customizedDefaults.dueTime !== undefined) {
        const [hours, minutes] = customizedDefaults.dueTime.split(':').map(Number)
        if (!isNaN(hours) && !isNaN(minutes)) {
          // If no date set yet, default to today at midnight
          if (!result.dueDateTime) {
            result.dueDateTime = new Date()
            result.dueDateTime.setHours(0, 0, 0, 0)
          }
          // Apply the time to the date
          result.dueDateTime.setHours(hours, minutes, 0, 0)
          result.isAllDay = false
        }
      }
      // If dueTime is explicitly null (all day), ensure date is at midnight
      else if (customizedDefaults.dueTime === null && result.dueDateTime) {
        result.dueDateTime.setHours(0, 0, 0, 0)
        result.isAllDay = true
      }
    }
  }

  // Step 2: Apply first hashtag list's CUSTOMIZED defaults (higher priority - explicit choice)
  if (hashtagLists.length > 0) {
    const firstHashtagList = hashtagLists[0]
    const customizedDefaults = getCustomizedDefaults(firstHashtagList)

    if (customizedDefaults.priority !== undefined) {
      result.priority = customizedDefaults.priority
    }
    if (customizedDefaults.assigneeId !== undefined) {
      // Convert special values:
      // - "unassigned" → null (explicitly unassigned)
      // - null → userId (task creator)
      // - user ID → that user
      if (customizedDefaults.assigneeId === 'unassigned') {
        result.assigneeId = null
      } else if (customizedDefaults.assigneeId === null) {
        result.assigneeId = userId
      } else {
        result.assigneeId = customizedDefaults.assigneeId
      }
    }
    if (customizedDefaults.isPrivate !== undefined) {
      result.isPrivate = customizedDefaults.isPrivate
    }
    if (customizedDefaults.repeating !== undefined) {
      result.repeating = customizedDefaults.repeating
    }
    if (customizedDefaults.dueDate !== undefined) {
      const parsedDate = parseRelativeDate(customizedDefaults.dueDate)
      if (parsedDate) {
        result.dueDateTime = parsedDate
      }
    }
    if (customizedDefaults.dueTime !== undefined) {
      result.dueTime = customizedDefaults.dueTime

      // Apply the default time to the when date
      // null = "all day" (no specific time, keep at midnight)
      // string (HH:MM) = apply that specific time
      if (customizedDefaults.dueTime !== null && customizedDefaults.dueTime !== undefined) {
        const [hours, minutes] = customizedDefaults.dueTime.split(':').map(Number)
        if (!isNaN(hours) && !isNaN(minutes)) {
          // If no date set yet, default to today at midnight
          if (!result.dueDateTime) {
            result.dueDateTime = new Date()
            result.dueDateTime.setHours(0, 0, 0, 0)
          }
          // Apply the time to the date
          result.dueDateTime.setHours(hours, minutes, 0, 0)
          result.isAllDay = false
        }
      }
      // If dueTime is explicitly null (all day), ensure date is at midnight
      else if (customizedDefaults.dueTime === null && result.dueDateTime) {
        result.dueDateTime.setHours(0, 0, 0, 0)
        result.isAllDay = true
      }
    }
  }

  // Step 3: Apply explicit parsed values from task title (highest priority)
  if (parsedValues.priority !== undefined) {
    result.priority = parsedValues.priority
  }
  if (parsedValues.assigneeId !== undefined) {
    result.assigneeId = parsedValues.assigneeId
  }
  if (parsedValues.dueDateTime !== undefined) {
    result.dueDateTime = parsedValues.dueDateTime
  }
  if (parsedValues.repeating !== undefined) {
    result.repeating = parsedValues.repeating
  }
  if (parsedValues.isPrivate !== undefined) {
    result.isPrivate = parsedValues.isPrivate
  }

  return result
}

/**
 * Example scenarios:
 *
 * Scenario 1: User in list "bob" (priority=2) adds task "Buy milk"
 * - Current list has priority 2 (customized)
 * - No hashtags
 * - No explicit priority
 * Result: priority = 2 (from current list)
 *
 * Scenario 2: User in "My Tasks" (priority=0, default) adds "Buy milk #bob"
 * - Current list has priority 0 (system default, not customized)
 * - Hashtag list "bob" has priority 2 (customized)
 * - No explicit priority
 * Result: priority = 2 (from hashtag list)
 *
 * Scenario 3: User in "bob" (priority=2) adds "Buy milk highest priority"
 * - Current list has priority 2 (customized)
 * - No hashtags
 * - Explicit priority 3 in title
 * Result: priority = 3 (explicit mention wins)
 *
 * Scenario 4: User in "bob" (priority=2) adds "Buy milk #work"
 * - Current list "bob" has priority 2 (customized)
 * - Hashtag list "work" has priority 1 (customized)
 * - No explicit priority
 * Result: priority = 1 (hashtag list wins - user explicitly chose it!)
 *
 * Scenario 5: User in "My Tasks" (priority=0, default) adds "Buy milk"
 * - Current list has priority 0 (system default)
 * - No hashtags
 * - No explicit priority
 * Result: priority = 0 (system default)
 */
