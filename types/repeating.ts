// Types for custom repeating task patterns

export type RepeatingUnit = 'days' | 'weeks' | 'months' | 'years'

export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

export type MonthRepeatType = 'same_date' | 'same_weekday'

export type RepeatEndCondition = 'never' | 'after_occurrences' | 'until_date'

export interface BaseRepeatingPattern {
  type: 'custom'
  unit: RepeatingUnit
  interval: number // Every X days/weeks/months/years
  endCondition: RepeatEndCondition
  endAfterOccurrences?: number
  endUntilDate?: Date
}

export interface DailyRepeatingPattern extends BaseRepeatingPattern {
  unit: 'days'
}

export interface WeeklyRepeatingPattern extends BaseRepeatingPattern {
  unit: 'weeks'
  weekdays: Weekday[] // Which days of the week (e.g., ['monday', 'wednesday', 'friday'])
}

export interface MonthlyRepeatingPattern extends BaseRepeatingPattern {
  unit: 'months'
  monthRepeatType: MonthRepeatType
  // For same_date: use the day of month (1-31)
  // For same_weekday: use {weekday: 'monday', weekOfMonth: 3} for "3rd Monday"
  monthDay?: number // 1-31 for same_date
  monthWeekday?: {
    weekday: Weekday
    weekOfMonth: number // 1-5 (1st, 2nd, 3rd, 4th, 5th week of month)
  }
}

export interface YearlyRepeatingPattern extends BaseRepeatingPattern {
  unit: 'years'
  month: number // 1-12
  day: number // 1-31
}

export type CustomRepeatingPattern = 
  | DailyRepeatingPattern 
  | WeeklyRepeatingPattern 
  | MonthlyRepeatingPattern 
  | YearlyRepeatingPattern

// Helper function to check if a pattern is valid
export function isValidRepeatingPattern(pattern: CustomRepeatingPattern): boolean {
  if (pattern.interval < 1) return false
  
  switch (pattern.unit) {
    case 'days':
      return true
      
    case 'weeks':
      return !!(pattern as WeeklyRepeatingPattern).weekdays && (pattern as WeeklyRepeatingPattern).weekdays.length > 0
      
    case 'months':
      const monthPattern = pattern as MonthlyRepeatingPattern
      if (monthPattern.monthRepeatType === 'same_date') {
        return !!(monthPattern.monthDay && monthPattern.monthDay >= 1 && monthPattern.monthDay <= 31)
      } else {
        return !!(monthPattern.monthWeekday && 
               monthPattern.monthWeekday.weekOfMonth >= 1 && 
               monthPattern.monthWeekday.weekOfMonth <= 5)
      }
      
    case 'years':
      const yearPattern = pattern as YearlyRepeatingPattern
      return yearPattern.month >= 1 && yearPattern.month <= 12 && 
             yearPattern.day >= 1 && yearPattern.day <= 31
      
    default:
      return false
  }
}

// Helper function to get next occurrence date
export function getNextOccurrence(
  pattern: CustomRepeatingPattern, 
  fromDate: Date = new Date()
): Date | null {
  if (!isValidRepeatingPattern(pattern)) return null
  
  const baseDate = new Date(fromDate)
  
  switch (pattern.unit) {
    case 'days':
      return addDays(baseDate, pattern.interval)
      
    case 'weeks':
      return getNextWeekdayOccurrence(pattern, baseDate)
      
    case 'months':
      return getNextMonthOccurrence(pattern, baseDate)
      
    case 'years':
      return getNextYearOccurrence(pattern, baseDate)
      
    default:
      return null
  }
}

function addDays(date: Date, days: number): Date {
  // Add days in UTC to preserve exact UTC time (avoids DST issues)
  // Using milliseconds: days * 24 hours * 60 minutes * 60 seconds * 1000 ms
  return new Date(date.getTime() + (days * 24 * 60 * 60 * 1000))
}

function getNextWeekdayOccurrence(pattern: WeeklyRepeatingPattern, fromDate: Date, depth: number = 0): Date {
  const weekdays = pattern.weekdays

  // Safety: prevent infinite recursion if weekdays is empty or invalid
  if (!weekdays || weekdays.length === 0) {
    throw new Error('Weekly repeating pattern must have at least one weekday selected')
  }

  // Safety: prevent stack overflow (max 52 weeks = 1 year ahead)
  if (depth > 52) {
    throw new Error('Unable to find next occurrence for weekly pattern (searched 1 year ahead)')
  }

  let currentDate = new Date(fromDate)

  // Find the next occurrence of any of the selected weekdays
  // Start from i=1 to skip the current day (for repeating tasks, we want the NEXT occurrence)
  for (let i = 1; i <= 7; i++) {
    const testDate = new Date(currentDate)
    testDate.setDate(testDate.getDate() + i)

    const dayName = getDayName(testDate.getDay())
    if (weekdays.includes(dayName)) {
      return testDate
    }
  }

  // If no match found, move to next week
  currentDate.setDate(currentDate.getDate() + 7)
  return getNextWeekdayOccurrence(pattern, currentDate, depth + 1)
}

function getNextMonthOccurrence(pattern: MonthlyRepeatingPattern, fromDate: Date): Date {
  const result = new Date(fromDate)
  
  if (pattern.monthRepeatType === 'same_date') {
    // Same date every month
    result.setMonth(result.getMonth() + pattern.interval)
    return result
  } else {
    // Same weekday and week of month
    const { weekday, weekOfMonth } = pattern.monthWeekday!
    const targetDay = getDayNumber(weekday)
    
    // Move to next month
    result.setMonth(result.getMonth() + pattern.interval)
    
    // Find the target weekday in the target week
    const firstDayOfMonth = new Date(result.getFullYear(), result.getMonth(), 1)
    const firstDayWeekday = firstDayOfMonth.getDay()
    
    let targetDate = new Date(firstDayOfMonth)
    const daysToAdd = (targetDay - firstDayWeekday + 7) % 7 + (weekOfMonth - 1) * 7
    targetDate.setDate(targetDate.getDate() + daysToAdd)
    
    return targetDate
  }
}

function getNextYearOccurrence(pattern: YearlyRepeatingPattern, fromDate: Date): Date {
  const result = new Date(fromDate)
  result.setFullYear(result.getFullYear() + pattern.interval)
  result.setMonth(pattern.month - 1) // Month is 0-indexed
  result.setDate(pattern.day)
  return result
}

function getDayName(dayNumber: number): Weekday {
  const days: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  return days[dayNumber]
}

function getDayNumber(dayName: Weekday): number {
  const days: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  return days.indexOf(dayName)
}

// Calculate next occurrence for a repeating task after completion
// Handles both DUE_DATE and COMPLETION_DATE repeat modes
export function calculateNextOccurrence(
  pattern: CustomRepeatingPattern,
  currentDueDate: Date | null,
  completionDate: Date,
  repeatFrom: "DUE_DATE" | "COMPLETION_DATE",
  currentOccurrenceCount: number
): { nextDueDate: Date | null; shouldTerminate: boolean; newOccurrenceCount: number } {
  // Increment occurrence count
  const newOccurrenceCount = currentOccurrenceCount + 1

  // Check if series should terminate based on end condition
  if (pattern.endCondition === 'after_occurrences' && pattern.endAfterOccurrences) {
    if (newOccurrenceCount >= pattern.endAfterOccurrences) {
      return { nextDueDate: null, shouldTerminate: true, newOccurrenceCount }
    }
  }

  // Determine anchor date based on repeat mode
  // Both modes preserve the original TIME from currentDueDate
  let anchorDate: Date

  if (currentDueDate) {
    // Determine which date to use based on mode
    const baseDate = repeatFrom === "DUE_DATE" ? currentDueDate : completionDate

    // Create anchor with base date, preserving time from currentDueDate
    // ✅ Use UTC methods to avoid timezone conversion issues between server and client
    anchorDate = new Date(baseDate)
    anchorDate.setUTCHours(currentDueDate.getUTCHours())
    anchorDate.setUTCMinutes(currentDueDate.getUTCMinutes())
    anchorDate.setUTCSeconds(currentDueDate.getUTCSeconds())
    anchorDate.setUTCMilliseconds(currentDueDate.getUTCMilliseconds())
  } else {
    // Fallback if no currentDueDate
    anchorDate = completionDate
  }

  // Calculate next occurrence from anchor
  const nextDueDate = getNextOccurrence(pattern, anchorDate)

  if (!nextDueDate) {
    return { nextDueDate: null, shouldTerminate: true, newOccurrenceCount }
  }

  // Check if next occurrence is past the until date
  if (pattern.endCondition === 'until_date' && pattern.endUntilDate) {
    // Compare dates only (not times) for "until date" condition
    // "Repeat until Dec 15" means tasks ON Dec 15 should still run
    // Use UTC methods to avoid timezone issues

    // Convert to Date if it's a string (from database JSON)
    const endDate = pattern.endUntilDate instanceof Date
      ? pattern.endUntilDate
      : new Date(pattern.endUntilDate)

    const nextDateOnly = Date.UTC(nextDueDate.getUTCFullYear(), nextDueDate.getUTCMonth(), nextDueDate.getUTCDate())
    const endDateOnly = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate())

    if (nextDateOnly > endDateOnly) {
      return { nextDueDate: null, shouldTerminate: true, newOccurrenceCount }
    }
  }

  return { nextDueDate, shouldTerminate: false, newOccurrenceCount }
}

// Handle simple repeating patterns (daily, weekly, monthly, yearly)
export function calculateSimpleRepeatingNextOccurrence(
  repeatingType: "daily" | "weekly" | "monthly" | "yearly",
  currentDueDate: Date | null,
  completionDate: Date,
  repeatFrom: "DUE_DATE" | "COMPLETION_DATE"
): Date {
  // Determine anchor date based on repeat mode
  // Both modes preserve the original TIME from currentDueDate
  let anchorDate: Date

  if (currentDueDate) {
    // Determine which date to use based on mode
    const baseDate = repeatFrom === "DUE_DATE" ? currentDueDate : completionDate

    // Create anchor with base date, preserving time from currentDueDate
    // ✅ Use UTC methods to avoid timezone conversion issues between server and client
    anchorDate = new Date(baseDate)
    anchorDate.setUTCHours(currentDueDate.getUTCHours())
    anchorDate.setUTCMinutes(currentDueDate.getUTCMinutes())
    anchorDate.setUTCSeconds(currentDueDate.getUTCSeconds())
    anchorDate.setUTCMilliseconds(currentDueDate.getUTCMilliseconds())
  } else {
    // Fallback if no currentDueDate
    anchorDate = completionDate
  }

  const nextDate = new Date(anchorDate)

  // Use UTC methods consistently to avoid timezone-related bugs
  // Bug fix: Using local date methods (getDate/setDate) caused issues when
  // the server timezone differs from the user's timezone, especially for
  // evening times that cross the UTC midnight boundary
  switch (repeatingType) {
    case 'daily':
      // Add 1 day using UTC to preserve exact time across timezones
      nextDate.setUTCDate(nextDate.getUTCDate() + 1)
      break
    case 'weekly':
      // Add 7 days using UTC
      nextDate.setUTCDate(nextDate.getUTCDate() + 7)
      break
    case 'monthly':
      // Add 1 month using UTC
      const originalDay = anchorDate.getUTCDate()
      nextDate.setUTCMonth(nextDate.getUTCMonth() + 1)
      // Handle month-end clamping (e.g., Jan 31 → Feb 28/29)
      if (nextDate.getUTCDate() !== originalDay) {
        nextDate.setUTCDate(0) // Go to last day of previous month
      }
      break
    case 'yearly':
      // Add 1 year using UTC
      nextDate.setUTCFullYear(nextDate.getUTCFullYear() + 1)
      break
  }

  return nextDate
}

// Type for end condition data that can be stored in repeatingData for simple patterns
export interface SimplePatternEndCondition {
  endCondition: RepeatEndCondition
  endAfterOccurrences?: number
  endUntilDate?: Date
}

/**
 * Check if a simple repeating pattern (daily, weekly, monthly, yearly) should terminate
 * based on end conditions stored in repeatingData.
 *
 * This enables simple patterns to have end conditions just like custom patterns.
 *
 * @param nextDueDate - The calculated next due date
 * @param newOccurrenceCount - The new occurrence count after this completion
 * @param endData - End condition data from repeatingData (or null if no end conditions)
 * @returns Object indicating if pattern should terminate and the new occurrence count
 */
export function checkSimplePatternEndCondition(
  nextDueDate: Date,
  newOccurrenceCount: number,
  endData: SimplePatternEndCondition | null
): { shouldTerminate: boolean; newOccurrenceCount: number } {
  // If no end data provided, never terminate
  if (!endData || endData.endCondition === 'never') {
    return { shouldTerminate: false, newOccurrenceCount }
  }

  // Check "after X occurrences" condition
  if (endData.endCondition === 'after_occurrences' && endData.endAfterOccurrences) {
    if (newOccurrenceCount >= endData.endAfterOccurrences) {
      return { shouldTerminate: true, newOccurrenceCount }
    }
  }

  // Check "until date" condition
  if (endData.endCondition === 'until_date' && endData.endUntilDate) {
    const endDate = endData.endUntilDate instanceof Date
      ? endData.endUntilDate
      : new Date(endData.endUntilDate)

    // Compare dates only (not times) for "until date" condition
    // "Repeat until Dec 15" means tasks ON Dec 15 should still run
    // Use UTC methods to avoid timezone issues
    const nextDateOnly = Date.UTC(nextDueDate.getUTCFullYear(), nextDueDate.getUTCMonth(), nextDueDate.getUTCDate())
    const endDateOnly = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate())

    // Terminate if next occurrence is AFTER the end date (comparing dates only)
    if (nextDateOnly > endDateOnly) {
      return { shouldTerminate: true, newOccurrenceCount }
    }
  }

  // Continue repeating
  return { shouldTerminate: false, newOccurrenceCount }
}
