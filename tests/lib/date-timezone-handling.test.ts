import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { formatDateForDisplay, parseRelativeDate } from '@/lib/date-utils'

describe('Date and Timezone Handling', () => {
  // Store original timezone
  let originalTZ: string | undefined

  beforeEach(() => {
    // Save original timezone
    originalTZ = process.env.TZ
    // Set to a timezone that's behind UTC (like PST/PDT = UTC-8/-7)
    process.env.TZ = 'America/Los_Angeles'
  })

  afterEach(() => {
    // Restore original timezone
    if (originalTZ !== undefined) {
      process.env.TZ = originalTZ
    } else {
      delete process.env.TZ
    }
  })

  describe('formatDateForDisplay - All-Day Tasks (isAllDay=true)', () => {
    it('should show "Today" for all-day task at midnight UTC on current day', () => {
      // Create a date at midnight UTC for today's LOCAL calendar date
      // CRITICAL: Use getFullYear/getMonth/getDate (LOCAL), not getUTCFullYear/etc
      const now = new Date()
      const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))

      const result = formatDateForDisplay(todayUTC, true)
      expect(result).toBe('Today')
    })

    it('should show "Tomorrow" for all-day task at midnight UTC one day ahead', () => {
      // Create a date at midnight UTC for tomorrow's LOCAL calendar date
      const now = new Date()
      const tomorrowUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + 1))

      const result = formatDateForDisplay(tomorrowUTC, true)
      expect(result).toBe('Tomorrow')
    })

    it('should show "Yesterday" for all-day task at midnight UTC one day behind', () => {
      // Create a date at midnight UTC for yesterday's LOCAL calendar date
      const now = new Date()
      const yesterdayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 1))

      const result = formatDateForDisplay(yesterdayUTC, true)
      expect(result).toBe('Yesterday')
    })

    it('should NOT be affected by local timezone offset for all-day tasks', () => {
      // Create a date at midnight UTC for today's LOCAL calendar date
      const now = new Date()
      const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))

      // Even in PST (UTC-8), this should still say "Today" because we use LOCAL calendar date
      const result = formatDateForDisplay(todayUTC, true)
      expect(result).toBe('Today')
    })

    it('should format far future dates in UTC for all-day tasks', () => {
      // Date far in the future at midnight UTC
      const futureDate = new Date(Date.UTC(2030, 11, 25, 0, 0, 0, 0)) // Dec 25, 2030

      const result = formatDateForDisplay(futureDate, true)
      // Should return formatted date like "Dec 25, 2030"
      expect(result).toMatch(/Dec 25, 2030/)
    })
  })

  describe('formatDateForDisplay - Timed Tasks (isAllDay=false)', () => {
    it('should show "Today" for timed task on current day in local timezone', () => {
      // Create a date for today at 9 PM local time
      const today = new Date()
      today.setHours(21, 0, 0, 0)

      const result = formatDateForDisplay(today, false)
      expect(result).toBe('Today')
    })

    it('should show "Tomorrow" for timed task one day ahead in local timezone', () => {
      // Create a date for tomorrow at 9 AM local time
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(9, 0, 0, 0)

      const result = formatDateForDisplay(tomorrow, false)
      expect(result).toBe('Tomorrow')
    })

    it('should show "Yesterday" for timed task one day behind in local timezone', () => {
      // Create a date for yesterday at 2 PM local time
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      yesterday.setHours(14, 0, 0, 0)

      const result = formatDateForDisplay(yesterday, false)
      expect(result).toBe('Yesterday')
    })

    it('should be affected by local timezone for timed tasks', () => {
      // A date at 11 PM today should show as "Today" even though it might be tomorrow in UTC
      const lateTonight = new Date()
      lateTonight.setHours(23, 0, 0, 0)

      const result = formatDateForDisplay(lateTonight, false)
      expect(result).toBe('Today')
    })
  })

  describe('Cross-platform Date Sync (iOS ↔ Web)', () => {
    it('should handle all-day task created on iOS showing correctly on web', () => {
      // Simulate iOS creating an all-day task for "today" at midnight UTC
      // iOS uses LOCAL calendar date to create UTC midnight
      const now = new Date()
      const todayMidnightUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))

      // Web should display this as "Today" using UTC comparison
      const webDisplay = formatDateForDisplay(todayMidnightUTC, true)
      expect(webDisplay).toBe('Today')
    })

    it('should handle timed task created on iOS showing correctly on web', () => {
      // Simulate iOS creating a timed task for today at 9 PM local time
      // iOS stores this in UTC but with the time preserved
      const today = new Date()
      today.setHours(21, 0, 0, 0)

      // Web should display this as "Today" using local timezone comparison
      const webDisplay = formatDateForDisplay(today, false)
      expect(webDisplay).toBe('Today')
    })

    it('should not show timezone offset bug for all-day tasks', () => {
      // This tests the bug fix: all-day task created on iOS for "today"
      // was showing as "yesterday" on web in timezones behind UTC

      const now = new Date()
      // FIXED: Use LOCAL calendar date to create UTC midnight
      const todayMidnightUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))

      // In PST (UTC-8), local midnight is 8 hours ahead of UTC
      // Without the fix, this would show "Yesterday"
      // With the fix, it correctly shows "Today"
      const result = formatDateForDisplay(todayMidnightUTC, true)
      expect(result).toBe('Today')
    })
  })

  describe('parseRelativeDate - Returns dates preserving current time', () => {
    it('should return today preserving current time for "today"', () => {
      const result = parseRelativeDate('today')

      expect(result).not.toBeNull()
      // The function returns new Date() which preserves the current time
      // This matches the calendar picker behavior (task-form.tsx line 133)
      expect(result).toBeInstanceOf(Date)

      // Verify it's today's date
      const today = new Date()
      expect(result!.getDate()).toBe(today.getDate())
      expect(result!.getMonth()).toBe(today.getMonth())
      expect(result!.getFullYear()).toBe(today.getFullYear())
    })

    it('should return tomorrow preserving current time for "tomorrow"', () => {
      const result = parseRelativeDate('tomorrow')

      expect(result).not.toBeNull()
      // The function returns date + 1 day preserving current time
      // This matches the calendar picker behavior (task-form.tsx line 136-138)
      expect(result).toBeInstanceOf(Date)

      // Verify it's tomorrow's date
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      expect(result!.getDate()).toBe(tomorrow.getDate())
      expect(result!.getMonth()).toBe(tomorrow.getMonth())
      expect(result!.getFullYear()).toBe(tomorrow.getFullYear())
    })

    it('should return next week preserving current time for "next week"', () => {
      const result = parseRelativeDate('next week')

      expect(result).not.toBeNull()
      // The function returns date + 7 days preserving current time
      // This matches the calendar picker behavior (task-form.tsx line 141-143)
      expect(result).toBeInstanceOf(Date)

      // Verify it's 7 days from now
      const nextWeek = new Date()
      nextWeek.setDate(nextWeek.getDate() + 7)
      expect(result!.getDate()).toBe(nextWeek.getDate())
      expect(result!.getMonth()).toBe(nextWeek.getMonth())
      expect(result!.getFullYear()).toBe(nextWeek.getFullYear())
    })
  })

  describe('Edge Cases', () => {
    it('should handle null date', () => {
      const result = formatDateForDisplay(null, true)
      expect(result).toBe('No due date')
    })

    it('should handle null date for timed tasks', () => {
      const result = formatDateForDisplay(null, false)
      expect(result).toBe('No due date')
    })

    it('should default to timed task behavior when isAllDay not specified', () => {
      const today = new Date()
      today.setHours(15, 0, 0, 0)

      // When isAllDay defaults to false
      const result = formatDateForDisplay(today)
      expect(result).toBe('Today')
    })
  })

  describe('Date Display Consistency', () => {
    it('should display same day for all-day task across different timezones', () => {
      // Create date at midnight UTC for a specific day
      const specificDayUTC = new Date(Date.UTC(2025, 0, 15, 0, 0, 0, 0)) // Jan 15, 2025

      // Test in PST (UTC-8)
      process.env.TZ = 'America/Los_Angeles'
      const pstResult = formatDateForDisplay(specificDayUTC, true)

      // Test in EST (UTC-5)
      process.env.TZ = 'America/New_York'
      const estResult = formatDateForDisplay(specificDayUTC, true)

      // Test in JST (UTC+9)
      process.env.TZ = 'Asia/Tokyo'
      const jstResult = formatDateForDisplay(specificDayUTC, true)

      // All should show the same date (not Today/Tomorrow, but formatted date)
      expect(pstResult).toMatch(/Jan 15, 2025/)
      expect(estResult).toMatch(/Jan 15, 2025/)
      expect(jstResult).toMatch(/Jan 15, 2025/)
    })

    it('should show correct relative day (Today/Tomorrow) across timezone switches', () => {
      // Test that each timezone correctly shows "Today" for its LOCAL today
      const timezones = ['America/Los_Angeles', 'America/New_York', 'Europe/London', 'Asia/Tokyo']

      for (const tz of timezones) {
        process.env.TZ = tz

        // Get today's date in this timezone
        const now = new Date()
        // Create midnight UTC for today's LOCAL calendar date
        const todayMidnightUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))

        const result = formatDateForDisplay(todayMidnightUTC, true)
        expect(result).toBe('Today')
      }
    })
  })
})
