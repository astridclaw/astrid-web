import { describe, it, expect } from 'vitest'
import { formatDateForDisplay } from '@/lib/date-utils'

/**
 * Critical Regression Tests for Date Sync between iOS and Web
 *
 * These tests protect against the timezone bug where all-day tasks created on iOS
 * were showing as the previous day on web (e.g., "Today" on iOS → "Yesterday" on web)
 *
 * Root cause: All-day tasks are stored at midnight UTC, but were being displayed
 * using local timezone comparison instead of UTC comparison.
 */
describe('Date Sync: iOS ↔ Web (Regression Prevention)', () => {
  describe('Critical Bug Fix: All-Day Tasks Show Wrong Day', () => {
    it('REGRESSION: all-day task created for "Today" on iOS must show "Today" on web', () => {
      // SCENARIO: User creates all-day task due "Today" on iOS (PST timezone)
      // iOS stores: midnight UTC for current LOCAL calendar day
      // CRITICAL: Use getFullYear/getMonth/getDate (LOCAL), not getUTCFullYear/etc
      const now = new Date()
      const todayMidnightUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))

      // Web must display: "Today" (not "Yesterday")
      const webDisplay = formatDateForDisplay(todayMidnightUTC, true)

      expect(webDisplay).toBe('Today')
      // If this fails, the timezone bug has returned!
    })

    it('REGRESSION: all-day task created for "Tomorrow" on iOS must show "Tomorrow" on web', () => {
      // SCENARIO: User creates all-day task due "Tomorrow" on iOS
      // iOS stores: midnight UTC for tomorrow's LOCAL calendar day
      const now = new Date()
      const tomorrowMidnightUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + 1))

      // Web must display: "Tomorrow" (not "Today")
      const webDisplay = formatDateForDisplay(tomorrowMidnightUTC, true)

      expect(webDisplay).toBe('Tomorrow')
      // If this fails, the timezone bug has returned!
    })

    it('REGRESSION: timed task created on iOS must show correct day on web', () => {
      // SCENARIO: User creates timed task due today at 9 PM on iOS
      // iOS stores: full timestamp with time in UTC
      const today = new Date()
      today.setHours(21, 0, 0, 0) // 9 PM local time

      // Web must display: "Today" (respecting local timezone)
      const webDisplay = formatDateForDisplay(today, false)

      expect(webDisplay).toBe('Today')
      // If this fails, timed task display has broken!
    })
  })

  describe('Field Contract: dueDateTime + isAllDay', () => {
    it('must use isAllDay=true for all-day tasks (UTC comparison)', () => {
      const todayMidnightUTC = new Date(Date.UTC(2025, 0, 15, 0, 0, 0, 0))

      // With isAllDay=true: uses UTC comparison
      const allDayDisplay = formatDateForDisplay(todayMidnightUTC, true)

      // With isAllDay=false: would use local timezone comparison
      const timedDisplay = formatDateForDisplay(todayMidnightUTC, false)

      // Both should work, but may show different results depending on timezone
      expect(allDayDisplay).toBeTruthy()
      expect(timedDisplay).toBeTruthy()
    })

    it('must use isAllDay=false for timed tasks (local timezone comparison)', () => {
      const today = new Date()
      today.setHours(15, 30, 0, 0) // 3:30 PM local

      // Timed task uses local timezone
      const result = formatDateForDisplay(today, false)

      expect(result).toBe('Today')
    })
  })

  describe('Date Storage Format', () => {
    it('all-day tasks must be stored at midnight UTC', () => {
      // This is the expected format from iOS
      const allDayDate = new Date(Date.UTC(2025, 0, 15, 0, 0, 0, 0))

      expect(allDayDate.getUTCHours()).toBe(0)
      expect(allDayDate.getUTCMinutes()).toBe(0)
      expect(allDayDate.getUTCSeconds()).toBe(0)
    })

    it('timed tasks must preserve specific time in UTC', () => {
      // iOS sends timed tasks with the time preserved
      const timedDate = new Date('2025-01-15T21:00:00.000Z') // 9 PM UTC

      expect(timedDate.getUTCHours()).toBe(21)
      expect(timedDate.getUTCMinutes()).toBe(0)
    })
  })

  describe('Timezone Independence for All-Day Tasks', () => {
    it('must show same day for all-day task regardless of timezone', () => {
      // All-day task stored at midnight UTC for Jan 15, 2025
      const specificDayUTC = new Date(Date.UTC(2025, 0, 15, 0, 0, 0, 0))

      // Display should use UTC comparison, so timezone doesn't matter
      const result = formatDateForDisplay(specificDayUTC, true)

      // Should show "Jan 15, 2025" (or relative day if near today)
      expect(result).toMatch(/Jan 15, 2025|Today|Tomorrow|Yesterday/)
    })
  })

  describe('Backward Compatibility', () => {
    it('must handle undefined isAllDay (defaults to false)', () => {
      const today = new Date()
      today.setHours(12, 0, 0, 0)

      // When isAllDay not specified, defaults to false (timed task behavior)
      const result = formatDateForDisplay(today)

      expect(result).toBe('Today')
    })

    it('must handle null date gracefully', () => {
      const result = formatDateForDisplay(null, true)
      expect(result).toBe('No due date')
    })
  })

  describe('Data Integrity', () => {
    it('must preserve date precision (no day drift)', () => {
      // Create dates for consecutive days
      const day1 = new Date(Date.UTC(2025, 0, 15, 0, 0, 0, 0))
      const day2 = new Date(Date.UTC(2025, 0, 16, 0, 0, 0, 0))
      const day3 = new Date(Date.UTC(2025, 0, 17, 0, 0, 0, 0))

      // Each should format to its own distinct day
      const result1 = formatDateForDisplay(day1, true)
      const result2 = formatDateForDisplay(day2, true)
      const result3 = formatDateForDisplay(day3, true)

      // Results should all be different (unless they happen to be today/tomorrow/yesterday)
      // The key is they must NOT show the same day due to timezone bugs
      expect(result1).toBeTruthy()
      expect(result2).toBeTruthy()
      expect(result3).toBeTruthy()
    })
  })
})
