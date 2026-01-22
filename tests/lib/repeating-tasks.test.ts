import { describe, it, expect } from 'vitest'
import {
  calculateSimpleRepeatingNextOccurrence,
  calculateNextOccurrence,
  checkSimplePatternEndCondition
} from '@/types/repeating'
import type { CustomRepeatingPattern } from '@/types/repeating'

describe('Repeating Tasks - Time Preservation', () => {
  describe('Simple Patterns - DUE_DATE mode', () => {
    it('should preserve time when repeating daily from due date', () => {
      const dueDate = new Date('2025-11-01T14:30:00.000Z')
      const completionDate = new Date('2025-11-15T18:00:00.000Z')

      const nextDate = calculateSimpleRepeatingNextOccurrence(
        'daily',
        dueDate,
        completionDate,
        'DUE_DATE'
      )

      // Use UTC methods to ensure timezone-independent testing
      expect(nextDate.getUTCHours()).toBe(dueDate.getUTCHours())
      expect(nextDate.getUTCMinutes()).toBe(dueDate.getUTCMinutes())
      expect(nextDate.getUTCSeconds()).toBe(dueDate.getUTCSeconds())
    })

    it('should preserve time when repeating weekly from due date', () => {
      const dueDate = new Date('2025-11-01T14:30:00.000Z')
      const completionDate = new Date('2025-11-15T17:00:00.000Z')

      const nextDate = calculateSimpleRepeatingNextOccurrence(
        'weekly',
        dueDate,
        completionDate,
        'DUE_DATE'
      )

      // Use UTC methods to ensure timezone-independent testing
      expect(nextDate.getUTCHours()).toBe(dueDate.getUTCHours())
      expect(nextDate.getUTCMinutes()).toBe(dueDate.getUTCMinutes())
      expect(nextDate.getUTCSeconds()).toBe(dueDate.getUTCSeconds())
    })

    it('should preserve time when repeating monthly from due date', () => {
      const dueDate = new Date('2025-11-15T10:30:00.000Z')
      const completionDate = new Date('2025-11-20T18:00:00.000Z')

      const nextDate = calculateSimpleRepeatingNextOccurrence(
        'monthly',
        dueDate,
        completionDate,
        'DUE_DATE'
      )

      // Use UTC methods to ensure timezone-independent testing
      expect(nextDate.getUTCHours()).toBe(dueDate.getUTCHours())
      expect(nextDate.getUTCMinutes()).toBe(dueDate.getUTCMinutes())
      expect(nextDate.getUTCMonth()).toBe((dueDate.getUTCMonth() + 1) % 12)
    })

    it('should preserve time when repeating yearly from due date', () => {
      const dueDate = new Date('2025-11-15T15:45:00.000Z')
      const completionDate = new Date('2025-11-20T18:00:00.000Z')

      const nextDate = calculateSimpleRepeatingNextOccurrence(
        'yearly',
        dueDate,
        completionDate,
        'DUE_DATE'
      )

      // Use UTC methods to ensure timezone-independent testing
      expect(nextDate.getUTCHours()).toBe(dueDate.getUTCHours())
      expect(nextDate.getUTCMinutes()).toBe(dueDate.getUTCMinutes())
      expect(nextDate.getUTCFullYear()).toBe(dueDate.getUTCFullYear() + 1)
    })
  })

  describe('Simple Patterns - COMPLETION_DATE mode', () => {
    it('should preserve time from due date but use completion date when repeating daily', () => {
      const dueDate = new Date('2025-11-01T09:00:00.000Z')
      const completionDate = new Date('2025-11-15T18:00:00.000Z')

      const nextDate = calculateSimpleRepeatingNextOccurrence(
        'daily',
        dueDate,
        completionDate,
        'COMPLETION_DATE'
      )

      // Time should match due date (9am UTC) - using UTC methods to avoid timezone issues
      expect(nextDate.getUTCHours()).toBe(dueDate.getUTCHours())
      expect(nextDate.getUTCMinutes()).toBe(dueDate.getUTCMinutes())

      // Date should be completion date + 1 day
      const expectedDate = new Date(completionDate)
      expectedDate.setUTCDate(expectedDate.getUTCDate() + 1)
      expect(nextDate.getUTCDate()).toBe(expectedDate.getUTCDate())
    })

    it('should preserve time from due date but use completion date when repeating weekly', () => {
      const dueDate = new Date('2025-11-01T14:30:00.000Z')
      const completionDate = new Date('2025-11-15T20:00:00.000Z')

      const nextDate = calculateSimpleRepeatingNextOccurrence(
        'weekly',
        dueDate,
        completionDate,
        'COMPLETION_DATE'
      )

      // Time should match due date (14:30 UTC) - using UTC methods to avoid timezone issues
      expect(nextDate.getUTCHours()).toBe(dueDate.getUTCHours())
      expect(nextDate.getUTCMinutes()).toBe(dueDate.getUTCMinutes())

      // Date should be completion date + 7 days
      const expectedDate = new Date(completionDate)
      expectedDate.setUTCDate(expectedDate.getUTCDate() + 7)
      expect(nextDate.getUTCDate()).toBe(expectedDate.getUTCDate())
    })
  })

  describe('Custom Patterns - Time Preservation', () => {
    it('should preserve time when repeating every 2 days from due date', () => {
      const pattern: CustomRepeatingPattern = {
        type: 'custom',
        unit: 'days',
        interval: 2,
        endCondition: 'never'
      }
      const dueDate = new Date('2025-11-10T14:30:00.000Z') // After DST transition
      const completionDate = new Date('2025-11-15T18:00:00.000Z')

      const result = calculateNextOccurrence(
        pattern,
        dueDate,
        completionDate,
        'DUE_DATE',
        0
      )

      expect(result.shouldTerminate).toBe(false)
      expect(result.nextDueDate).toBeDefined()
      expect(result.nextDueDate!.getHours()).toBe(dueDate.getHours())
      expect(result.nextDueDate!.getMinutes()).toBe(dueDate.getMinutes())
    })

    it('should handle end condition after occurrences', () => {
      const pattern: CustomRepeatingPattern = {
        type: 'custom',
        unit: 'days',
        interval: 1,
        endCondition: 'after_occurrences',
        endAfterOccurrences: 3
      }
      const dueDate = new Date('2025-11-01T10:00:00.000Z')
      const completionDate = new Date('2025-11-15T18:00:00.000Z')

      // Should roll forward for occurrence 1 and 2
      const result1 = calculateNextOccurrence(pattern, dueDate, completionDate, 'DUE_DATE', 0)
      expect(result1.shouldTerminate).toBe(false)

      const result2 = calculateNextOccurrence(pattern, dueDate, completionDate, 'DUE_DATE', 1)
      expect(result2.shouldTerminate).toBe(false)

      // Should terminate at occurrence 3
      const result3 = calculateNextOccurrence(pattern, dueDate, completionDate, 'DUE_DATE', 2)
      expect(result3.shouldTerminate).toBe(true)
    })

    it('should handle end condition until date', () => {
      const pattern: CustomRepeatingPattern = {
        type: 'custom',
        unit: 'days',
        interval: 1,
        endCondition: 'until_date',
        endUntilDate: new Date('2025-12-01T00:00:00.000Z')
      }
      const dueDate = new Date('2025-11-29T10:00:00.000Z')
      const completionDate = new Date('2025-11-29T18:00:00.000Z')

      // Next occurrence would be Nov 30 - should continue
      const result1 = calculateNextOccurrence(pattern, dueDate, completionDate, 'DUE_DATE', 0)
      expect(result1.shouldTerminate).toBe(false)

      // Next occurrence from Nov 30 would be Dec 1 (ON the end date) - should continue
      const dueDateNov30 = new Date('2025-11-30T10:00:00.000Z')
      const result2 = calculateNextOccurrence(pattern, dueDateNov30, new Date('2025-11-30T18:00:00.000Z'), 'DUE_DATE', 1)
      expect(result2.shouldTerminate).toBe(false)

      // Next occurrence from Dec 1 would be Dec 2 (AFTER the end date) - should terminate
      const dueDateDec1 = new Date('2025-12-01T10:00:00.000Z')
      const result3 = calculateNextOccurrence(pattern, dueDateDec1, new Date('2025-12-01T18:00:00.000Z'), 'DUE_DATE', 2)
      expect(result3.shouldTerminate).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('should handle month-end clamping (Jan 31 -> Feb 28)', () => {
      const dueDate = new Date('2025-01-31T10:00:00.000Z')
      const completionDate = new Date('2025-01-31T18:00:00.000Z')

      const nextDate = calculateSimpleRepeatingNextOccurrence(
        'monthly',
        dueDate,
        completionDate,
        'DUE_DATE'
      )

      // Should clamp to Feb 28 (2025 is not a leap year)
      expect(nextDate.getMonth()).toBe(1) // February
      expect(nextDate.getDate()).toBe(28)
      expect(nextDate.getHours()).toBe(dueDate.getHours())
    })

    it('should handle fallback when no currentDueDate provided', () => {
      const completionDate = new Date('2025-11-15T18:00:00.000Z')

      const nextDate = calculateSimpleRepeatingNextOccurrence(
        'daily',
        null,
        completionDate,
        'DUE_DATE'
      )

      // Should use completion date as fallback
      expect(nextDate.getDate()).toBe(completionDate.getDate() + 1)
    })

    it('should handle DST transitions correctly', () => {
      // Nov 1, 2025 at 2pm UTC (before DST ends Nov 3 in US)
      const dueDateBeforeDST = new Date('2025-11-01T14:00:00.000Z')
      const completionDate = new Date('2025-11-15T18:00:00.000Z')

      const nextDate = calculateSimpleRepeatingNextOccurrence(
        'daily',
        dueDateBeforeDST,
        completionDate,
        'DUE_DATE'
      )

      // UTC time should be preserved (timezone-independent)
      expect(nextDate.getUTCHours()).toBe(dueDateBeforeDST.getUTCHours())
      expect(nextDate.getUTCMinutes()).toBe(dueDateBeforeDST.getUTCMinutes())
    })
  })

  describe('Occurrence Count Tracking', () => {
    it('should increment occurrence count for simple patterns', () => {
      const pattern: CustomRepeatingPattern = {
        type: 'custom',
        unit: 'days',
        interval: 1,
        endCondition: 'never'
      }
      const dueDate = new Date('2025-11-01T10:00:00.000Z')
      const completionDate = new Date('2025-11-15T18:00:00.000Z')

      const result = calculateNextOccurrence(pattern, dueDate, completionDate, 'DUE_DATE', 5)

      expect(result.newOccurrenceCount).toBe(6)
    })
  })

  describe('BUG FIX: Repeat Until Date - End Condition', () => {
    it('should stop repeating when next occurrence would be after endUntilDate', () => {
      const pattern: CustomRepeatingPattern = {
        type: 'custom',
        unit: 'days',
        interval: 1,
        endCondition: 'until_date',
        endUntilDate: new Date('2025-12-01T00:00:00.000Z')
      }
      // Current due date is Dec 1 (ON the end date)
      const dueDate = new Date('2025-12-01T10:00:00.000Z')
      const completionDate = new Date('2025-12-01T18:00:00.000Z')

      // Next occurrence would be Dec 2, which is AFTER endUntilDate
      const result = calculateNextOccurrence(pattern, dueDate, completionDate, 'DUE_DATE', 30)

      // Should terminate because next occurrence (Dec 2) is after endUntilDate (Dec 1)
      expect(result.shouldTerminate).toBe(true)
      expect(result.nextDueDate).toBe(null)
    })

    it('should continue repeating when next occurrence is before endUntilDate', () => {
      const pattern: CustomRepeatingPattern = {
        type: 'custom',
        unit: 'days',
        interval: 1,
        endCondition: 'until_date',
        endUntilDate: new Date('2025-12-05T23:59:59.000Z')
      }
      // Current due date is Nov 30
      const dueDate = new Date('2025-11-30T10:00:00.000Z')
      const completionDate = new Date('2025-11-30T18:00:00.000Z')

      // Next occurrence would be Dec 1, which is before endUntilDate (Dec 5)
      const result = calculateNextOccurrence(pattern, dueDate, completionDate, 'DUE_DATE', 0)

      expect(result.shouldTerminate).toBe(false)
      expect(result.nextDueDate).toBeDefined()
      expect(result.nextDueDate!.getUTCDate()).toBe(1) // Dec 1
      expect(result.nextDueDate!.getUTCMonth()).toBe(11) // December (0-indexed)
    })

    it('should handle endUntilDate exactly on the end date', () => {
      const pattern: CustomRepeatingPattern = {
        type: 'custom',
        unit: 'days',
        interval: 1,
        endCondition: 'until_date',
        endUntilDate: new Date('2025-12-01T10:00:00.000Z')
      }
      // Current due date is Nov 30 at 10am
      const dueDate = new Date('2025-11-30T10:00:00.000Z')
      const completionDate = new Date('2025-11-30T18:00:00.000Z')

      // Next occurrence would be Dec 1 at 10am
      const result = calculateNextOccurrence(pattern, dueDate, completionDate, 'DUE_DATE', 0)

      // Should continue since next occurrence equals endUntilDate
      expect(result.shouldTerminate).toBe(false)
      expect(result.nextDueDate).toBeDefined()
    })

    it('should handle weekly pattern with endUntilDate', () => {
      const pattern: CustomRepeatingPattern = {
        type: 'custom',
        unit: 'weeks',
        interval: 1,
        weekdays: ['monday'],
        endCondition: 'until_date',
        endUntilDate: new Date('2025-12-15T00:00:00.000Z')
      }
      // Current due date is Monday, Dec 8
      const dueDate = new Date('2025-12-08T10:00:00.000Z')
      const completionDate = new Date('2025-12-08T18:00:00.000Z')

      // Next occurrence would be Monday, Dec 15 (ON the end date) - should continue
      const result = calculateNextOccurrence(pattern, dueDate, completionDate, 'DUE_DATE', 0)

      expect(result.shouldTerminate).toBe(false)
      expect(result.nextDueDate).toBeDefined()

      // Next occurrence from Dec 15 would be Dec 22 (AFTER end date) - should terminate
      const nextDueDate = new Date('2025-12-15T10:00:00.000Z')
      const nextCompletion = new Date('2025-12-15T18:00:00.000Z')
      const result2 = calculateNextOccurrence(pattern, nextDueDate, nextCompletion, 'DUE_DATE', 1)

      // Next would be Dec 22, which is AFTER endUntilDate
      expect(result2.shouldTerminate).toBe(true)
    })
  })

  describe('BUG FIX: Repeat X Times - Occurrence Limit', () => {
    it('should complete exactly X times before terminating (endAfterOccurrences=3)', () => {
      const pattern: CustomRepeatingPattern = {
        type: 'custom',
        unit: 'days',
        interval: 1,
        endCondition: 'after_occurrences',
        endAfterOccurrences: 3
      }
      const dueDate = new Date('2025-11-01T10:00:00.000Z')
      const completionDate = new Date('2025-11-01T18:00:00.000Z')

      // Occurrence 0 → 1 (first completion)
      const result1 = calculateNextOccurrence(pattern, dueDate, completionDate, 'DUE_DATE', 0)
      expect(result1.shouldTerminate).toBe(false)
      expect(result1.newOccurrenceCount).toBe(1)
      expect(result1.nextDueDate).toBeDefined()

      // Occurrence 1 → 2 (second completion)
      const result2 = calculateNextOccurrence(pattern, dueDate, completionDate, 'DUE_DATE', 1)
      expect(result2.shouldTerminate).toBe(false)
      expect(result2.newOccurrenceCount).toBe(2)
      expect(result2.nextDueDate).toBeDefined()

      // Occurrence 2 → 3 (third completion - should terminate)
      const result3 = calculateNextOccurrence(pattern, dueDate, completionDate, 'DUE_DATE', 2)
      expect(result3.shouldTerminate).toBe(true)
      expect(result3.newOccurrenceCount).toBe(3)
      expect(result3.nextDueDate).toBe(null)
    })

    it('should handle endAfterOccurrences=1 (single occurrence task)', () => {
      const pattern: CustomRepeatingPattern = {
        type: 'custom',
        unit: 'days',
        interval: 1,
        endCondition: 'after_occurrences',
        endAfterOccurrences: 1
      }
      const dueDate = new Date('2025-11-01T10:00:00.000Z')
      const completionDate = new Date('2025-11-01T18:00:00.000Z')

      // Occurrence 0 → 1 (first and only completion)
      const result = calculateNextOccurrence(pattern, dueDate, completionDate, 'DUE_DATE', 0)
      expect(result.shouldTerminate).toBe(true)
      expect(result.newOccurrenceCount).toBe(1)
      expect(result.nextDueDate).toBe(null)
    })

    it('should handle endAfterOccurrences=5 (five occurrences)', () => {
      const pattern: CustomRepeatingPattern = {
        type: 'custom',
        unit: 'days',
        interval: 1,
        endCondition: 'after_occurrences',
        endAfterOccurrences: 5
      }
      const dueDate = new Date('2025-11-01T10:00:00.000Z')
      const completionDate = new Date('2025-11-01T18:00:00.000Z')

      // Occurrences 0→1, 1→2, 2→3, 3→4 should continue
      for (let i = 0; i < 4; i++) {
        const result = calculateNextOccurrence(pattern, dueDate, completionDate, 'DUE_DATE', i)
        expect(result.shouldTerminate).toBe(false)
        expect(result.newOccurrenceCount).toBe(i + 1)
        expect(result.nextDueDate).toBeDefined()
      }

      // Occurrence 4 → 5 should terminate
      const finalResult = calculateNextOccurrence(pattern, dueDate, completionDate, 'DUE_DATE', 4)
      expect(finalResult.shouldTerminate).toBe(true)
      expect(finalResult.newOccurrenceCount).toBe(5)
      expect(finalResult.nextDueDate).toBe(null)
    })

    it('should handle weekly pattern with endAfterOccurrences', () => {
      const pattern: CustomRepeatingPattern = {
        type: 'custom',
        unit: 'weeks',
        interval: 1,
        weekdays: ['monday'],
        endCondition: 'after_occurrences',
        endAfterOccurrences: 2
      }
      const dueDate = new Date('2025-11-03T10:00:00.000Z') // Monday, Nov 3
      const completionDate = new Date('2025-11-03T18:00:00.000Z')

      // First completion: 0 → 1
      const result1 = calculateNextOccurrence(pattern, dueDate, completionDate, 'DUE_DATE', 0)
      expect(result1.shouldTerminate).toBe(false)
      expect(result1.newOccurrenceCount).toBe(1)

      // Second completion: 1 → 2 (should terminate)
      const result2 = calculateNextOccurrence(pattern, dueDate, completionDate, 'DUE_DATE', 1)
      expect(result2.shouldTerminate).toBe(true)
      expect(result2.newOccurrenceCount).toBe(2)
      expect(result2.nextDueDate).toBe(null)
    })

    it('should not confuse occurrence count with repetition count', () => {
      // If user wants task to repeat 3 times (meaning 3 total occurrences),
      // they should set endAfterOccurrences = 3
      // Occurrence count: 0 (initial), 1 (after 1st completion), 2 (after 2nd), 3 (after 3rd)
      const pattern: CustomRepeatingPattern = {
        type: 'custom',
        unit: 'days',
        interval: 1,
        endCondition: 'after_occurrences',
        endAfterOccurrences: 3
      }
      const dueDate = new Date('2025-11-01T10:00:00.000Z')
      const completionDate = new Date('2025-11-01T18:00:00.000Z')

      // After 3rd completion, count = 3, should terminate
      const result = calculateNextOccurrence(pattern, dueDate, completionDate, 'DUE_DATE', 2)
      expect(result.shouldTerminate).toBe(true)
      expect(result.newOccurrenceCount).toBe(3)
    })
  })

  describe('BUG FIX: Simple Patterns with End Conditions', () => {
    describe('Simple Daily Pattern with endAfterOccurrences', () => {
      it('should respect occurrence limit for daily tasks', () => {
        const nextDueDate = new Date('2025-11-02T10:00:00.000Z')

        // Simulate task completing 3 times (endAfterOccurrences = 3)
        const endData = { endCondition: 'after_occurrences' as const, endAfterOccurrences: 3 }

        // Occurrence 0 → 1: Should continue
        const result1 = checkSimplePatternEndCondition(nextDueDate, 1, endData)
        expect(result1.shouldTerminate).toBe(false)

        // Occurrence 1 → 2: Should continue
        const result2 = checkSimplePatternEndCondition(nextDueDate, 2, endData)
        expect(result2.shouldTerminate).toBe(false)

        // Occurrence 2 → 3: Should terminate
        const result3 = checkSimplePatternEndCondition(nextDueDate, 3, endData)
        expect(result3.shouldTerminate).toBe(true)
      })
    })

    describe('Simple Weekly Pattern with endUntilDate', () => {
      it('should respect end date for weekly tasks', () => {
        const endUntilDate = new Date('2025-12-15T00:00:00.000Z')
        const endData = { endCondition: 'until_date' as const, endUntilDate }

        // Next occurrence is Dec 10 (before end date): Should continue
        const nextDueDateBefore = new Date('2025-12-10T10:00:00.000Z')
        const result1 = checkSimplePatternEndCondition(nextDueDateBefore, 1, endData)
        expect(result1.shouldTerminate).toBe(false)

        // Next occurrence is Dec 15 (equals end date): Should continue
        const nextDueDateOn = new Date('2025-12-15T10:00:00.000Z')
        const result2 = checkSimplePatternEndCondition(nextDueDateOn, 2, endData)
        expect(result2.shouldTerminate).toBe(false)

        // Next occurrence is Dec 20 (after end date): Should terminate
        const nextDueDateAfter = new Date('2025-12-20T10:00:00.000Z')
        const result3 = checkSimplePatternEndCondition(nextDueDateAfter, 3, endData)
        expect(result3.shouldTerminate).toBe(true)
      })
    })

    describe('Simple Monthly Pattern with endAfterOccurrences', () => {
      it('should terminate monthly task after X occurrences', () => {
        const nextDueDate = new Date('2026-01-01T10:00:00.000Z')
        const endData = { endCondition: 'after_occurrences' as const, endAfterOccurrences: 5 }

        // Occurrences 1-4 should continue
        for (let i = 1; i <= 4; i++) {
          const result = checkSimplePatternEndCondition(nextDueDate, i, endData)
          expect(result.shouldTerminate).toBe(false)
          expect(result.newOccurrenceCount).toBe(i)
        }

        // Occurrence 5 should terminate
        const result5 = checkSimplePatternEndCondition(nextDueDate, 5, endData)
        expect(result5.shouldTerminate).toBe(true)
        expect(result5.newOccurrenceCount).toBe(5)
      })
    })

    describe('Simple Yearly Pattern with endUntilDate', () => {
      it('should terminate yearly task when next date exceeds until date', () => {
        const endUntilDate = new Date('2030-01-01T00:00:00.000Z')
        const endData = { endCondition: 'until_date' as const, endUntilDate }

        // Next occurrence is 2029: Should continue
        const nextDueDate2029 = new Date('2029-01-01T10:00:00.000Z')
        const result1 = checkSimplePatternEndCondition(nextDueDate2029, 1, endData)
        expect(result1.shouldTerminate).toBe(false)

        // Next occurrence is 2030 (equals end date): Should continue
        const nextDueDate2030 = new Date('2030-01-01T10:00:00.000Z')
        const result2 = checkSimplePatternEndCondition(nextDueDate2030, 2, endData)
        expect(result2.shouldTerminate).toBe(false)

        // Next occurrence is 2031 (after end date): Should terminate
        const nextDueDate2031 = new Date('2031-01-01T10:00:00.000Z')
        const result3 = checkSimplePatternEndCondition(nextDueDate2031, 3, endData)
        expect(result3.shouldTerminate).toBe(true)
      })
    })

    describe('Simple Pattern with no end condition', () => {
      it('should never terminate when endCondition is "never"', () => {
        const nextDueDate = new Date('2099-12-31T10:00:00.000Z')
        const endData = { endCondition: 'never' as const }

        const result = checkSimplePatternEndCondition(nextDueDate, 999, endData)
        expect(result.shouldTerminate).toBe(false)
        expect(result.newOccurrenceCount).toBe(999)
      })

      it('should never terminate when no end data provided', () => {
        const nextDueDate = new Date('2099-12-31T10:00:00.000Z')

        const result = checkSimplePatternEndCondition(nextDueDate, 999, null)
        expect(result.shouldTerminate).toBe(false)
        expect(result.newOccurrenceCount).toBe(999)
      })
    })
  })

  describe('BUG FIX: Evening Time Timezone Edge Case', () => {
    // Regression test for: "Completing a daily repeating task due at 7pm PT
    // creates next task day after tomorrow instead of tomorrow"
    // The bug was caused by using local date methods (getDate/setDate) when
    // the anchor date was set using UTC methods, causing incorrect date
    // calculation when the task time crosses UTC midnight.

    it('should correctly handle daily task due in evening (7pm PT = 3am UTC next day)', () => {
      // Task due: Jan 5, 7pm PT = Jan 6, 3am UTC
      const dueDate = new Date('2026-01-06T03:00:00.000Z')
      // Completed: Jan 5, 8pm PT = Jan 6, 4am UTC (same local day, but next UTC day)
      const completionDate = new Date('2026-01-06T04:00:00.000Z')

      const nextDate = calculateSimpleRepeatingNextOccurrence(
        'daily',
        dueDate,
        completionDate,
        'COMPLETION_DATE'
      )

      // Expected: Jan 6, 7pm PT = Jan 7, 3am UTC (tomorrow at same time)
      // NOT Jan 7, 7pm PT = Jan 8, 3am UTC (day after tomorrow)
      expect(nextDate.getUTCDate()).toBe(7) // Jan 7 UTC
      expect(nextDate.getUTCHours()).toBe(3) // 3am UTC = 7pm PT
      expect(nextDate.getUTCMonth()).toBe(0) // January
    })

    it('should correctly handle completion near UTC midnight', () => {
      // Task due: Jan 5, 11pm PT = Jan 6, 7am UTC
      const dueDate = new Date('2026-01-06T07:00:00.000Z')
      // Completed: Jan 5, 11:30pm PT = Jan 6, 7:30am UTC
      const completionDate = new Date('2026-01-06T07:30:00.000Z')

      const nextDate = calculateSimpleRepeatingNextOccurrence(
        'daily',
        dueDate,
        completionDate,
        'COMPLETION_DATE'
      )

      // Expected: Jan 6, 11pm PT = Jan 7, 7am UTC
      expect(nextDate.getUTCDate()).toBe(7)
      expect(nextDate.getUTCHours()).toBe(7)
    })

    it('should correctly handle weekly task due in evening', () => {
      // Task due: Jan 5, 7pm PT = Jan 6, 3am UTC
      const dueDate = new Date('2026-01-06T03:00:00.000Z')
      const completionDate = new Date('2026-01-06T04:00:00.000Z')

      const nextDate = calculateSimpleRepeatingNextOccurrence(
        'weekly',
        dueDate,
        completionDate,
        'COMPLETION_DATE'
      )

      // Expected: Jan 12, 7pm PT = Jan 13, 3am UTC (7 days later)
      expect(nextDate.getUTCDate()).toBe(13)
      expect(nextDate.getUTCHours()).toBe(3)
    })

    it('should correctly handle DUE_DATE mode for evening tasks', () => {
      // Task due: Jan 5, 7pm PT = Jan 6, 3am UTC
      const dueDate = new Date('2026-01-06T03:00:00.000Z')
      // Completed much later (doesn't matter for DUE_DATE mode)
      const completionDate = new Date('2026-01-08T04:00:00.000Z')

      const nextDate = calculateSimpleRepeatingNextOccurrence(
        'daily',
        dueDate,
        completionDate,
        'DUE_DATE'
      )

      // Expected: Jan 6, 7pm PT = Jan 7, 3am UTC (next day from due date)
      expect(nextDate.getUTCDate()).toBe(7)
      expect(nextDate.getUTCHours()).toBe(3)
    })

    it('should handle monthly task that crosses UTC day boundary', () => {
      // Task due: Jan 15, 10pm PT = Jan 16, 6am UTC
      const dueDate = new Date('2026-01-16T06:00:00.000Z')
      const completionDate = new Date('2026-01-16T07:00:00.000Z')

      const nextDate = calculateSimpleRepeatingNextOccurrence(
        'monthly',
        dueDate,
        completionDate,
        'COMPLETION_DATE'
      )

      // Expected: Feb 16, 6am UTC (preserving the time)
      expect(nextDate.getUTCMonth()).toBe(1) // February
      expect(nextDate.getUTCDate()).toBe(16)
      expect(nextDate.getUTCHours()).toBe(6)
    })
  })
})
