import type { Task } from "@/types/task"
import {
  isSameDay,
  isBeforeDay,
  isWithinDayRange,
  getLocalDateAsUTCMidnight,
  getUTCDateMidnight
} from "./date-comparison"

/**
 * Date Filter Utilities - Google Calendar Specification
 *
 * These utilities implement Google Calendar's approach to date handling:
 * - All-day events: Use date-only comparison (timezone-independent)
 * - Timed events: Use full timestamp comparison (timezone-aware)
 *
 * Uses shared utilities from date-comparison.ts for core comparisons.
 *
 * References:
 * - https://developers.google.com/calendar/api/concepts/events-calendars
 * - RFC 5545 (iCalendar specification)
 */

/**
 * Check if a task is due today
 *
 * All-day tasks: Compares UTC date components (year/month/day)
 * Timed tasks: Compares local timezone date components
 *
 * @param task - The task to check
 * @returns true if task is due today, false otherwise
 */
export function isTaskDueToday(task: Task): boolean {
  if (!task.dueDateTime) return false

  const dueDate = new Date(task.dueDateTime)
  const now = new Date()

  return isSameDay(dueDate, now, task.isAllDay)
}

/**
 * Check if a task is overdue
 *
 * All-day tasks: Due date (UTC) is before today (local)
 * Timed tasks: Due time has passed
 *
 * @param task - The task to check
 * @returns true if task is overdue, false otherwise
 */
export function isTaskOverdue(task: Task): boolean {
  if (!task.dueDateTime) return false

  const dueDate = new Date(task.dueDateTime)
  const now = new Date()

  if (task.isAllDay) {
    return isBeforeDay(dueDate, now, true)
  } else {
    // Timed: Compare full timestamps
    return dueDate < now
  }
}

/**
 * Check if a task is due tomorrow
 *
 * @param task - The task to check
 * @returns true if task is due tomorrow, false otherwise
 */
export function isTaskDueTomorrow(task: Task): boolean {
  if (!task.dueDateTime) return false

  const dueDate = new Date(task.dueDateTime)
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)

  return isSameDay(dueDate, tomorrow, task.isAllDay)
}

/**
 * Check if a task is due this week (next 7 days from today)
 *
 * @param task - The task to check
 * @returns true if task is due within next 7 days, false otherwise
 */
export function isTaskDueThisWeek(task: Task): boolean {
  if (!task.dueDateTime) return false

  const dueDate = new Date(task.dueDateTime)
  const now = new Date()
  const weekFromNow = new Date(now)
  weekFromNow.setDate(now.getDate() + 7)

  return isWithinDayRange(dueDate, now, weekFromNow, task.isAllDay)
}

/**
 * Check if a task is due this month (next 30 days from today)
 *
 * @param task - The task to check
 * @returns true if task is due within next 30 days, false otherwise
 */
export function isTaskDueThisMonth(task: Task): boolean {
  if (!task.dueDateTime) return false

  const dueDate = new Date(task.dueDateTime)
  const now = new Date()
  const monthFromNow = new Date(now)
  monthFromNow.setDate(now.getDate() + 30)

  return isWithinDayRange(dueDate, now, monthFromNow, task.isAllDay)
}

/**
 * Check if a task is due this calendar week (before next Sunday)
 *
 * @param task - The task to check
 * @returns true if task is due before next Sunday, false otherwise
 */
export function isTaskDueThisCalendarWeek(task: Task): boolean {
  if (!task.dueDateTime) return false

  const dueDate = new Date(task.dueDateTime)
  const now = new Date()

  // Calculate next Sunday (end of calendar week, exclusive)
  const nextSunday = new Date(now)
  nextSunday.setDate(now.getDate() + (7 - now.getDay()))

  // Subtract 1 day for inclusive end boundary (Saturday end of week)
  const endOfWeek = new Date(nextSunday)
  endOfWeek.setDate(nextSunday.getDate() - 1)

  if (task.isAllDay) {
    const dueUTC = getUTCDateMidnight(dueDate)
    const todayUTC = getLocalDateAsUTCMidnight(now)
    const nextSundayUTC = getLocalDateAsUTCMidnight(nextSunday)
    return dueUTC >= todayUTC && dueUTC < nextSundayUTC
  } else {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const nextSundayLocal = new Date(today)
    nextSundayLocal.setDate(today.getDate() + (7 - today.getDay()))
    const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
    return dueDay >= today && dueDay < nextSundayLocal
  }
}

/**
 * Check if a task is due this calendar month (before first day of next month)
 *
 * @param task - The task to check
 * @returns true if task is due before next month, false otherwise
 */
export function isTaskDueThisCalendarMonth(task: Task): boolean {
  if (!task.dueDateTime) return false

  const dueDate = new Date(task.dueDateTime)
  const now = new Date()
  const firstDayOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  if (task.isAllDay) {
    const dueUTC = getUTCDateMidnight(dueDate)
    const todayUTC = getLocalDateAsUTCMidnight(now)
    const nextMonthUTC = getLocalDateAsUTCMidnight(firstDayOfNextMonth)
    return dueUTC >= todayUTC && dueUTC < nextMonthUTC
  } else {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
    return dueDay >= today && dueDay < firstDayOfNextMonth
  }
}

/**
 * Generic date filter function that applies the correct comparison logic
 * based on task type (all-day vs timed)
 *
 * @param task - The task to check
 * @param filterType - The filter type to apply
 * @returns true if task matches filter, false otherwise
 */
export function applyDateFilter(task: Task, filterType: string): boolean {
  // Helper: overdue incomplete tasks should appear in time-bound filters
  const isOverdueIncomplete = isTaskOverdue(task) && !task.completed

  switch (filterType) {
    case "today":
      return isTaskDueToday(task) || isOverdueIncomplete
    case "tomorrow":
      return isTaskDueTomorrow(task)
    case "this_week":
      return isTaskDueThisWeek(task) || isOverdueIncomplete
    case "this_month":
      return isTaskDueThisMonth(task) || isOverdueIncomplete
    case "this_calendar_week":
      return isTaskDueThisCalendarWeek(task) || isOverdueIncomplete
    case "this_calendar_month":
      return isTaskDueThisCalendarMonth(task) || isOverdueIncomplete
    case "overdue":
      return isTaskOverdue(task)
    case "no_date":
      return !task.dueDateTime
    case "all":
    default:
      return true
  }
}
