# Task Date Handling Specification

**Status:** ✅ Implemented
**Last Updated:** 2025-11-30
**Google Calendar Alignment:** ✅ Complete

---

## Overview

Astrid uses **Google Calendar's approach** to handle all-day vs timed events, ensuring consistent behavior across iOS and Web platforms regardless of timezone.

## Key Principles

### 1. Two Types of Tasks

**All-Day Tasks** (`isAllDay: true`):
- Represent **calendar dates**, not moments in time
- Stored at **midnight UTC** (e.g., `2025-01-15T00:00:00.000Z`)
- **Timezone-independent** - "Jan 15" means "Jan 15" in every timezone
- Use **UTC date components** for comparisons
- Example: Task due "today" stays "today" when user changes timezone

**Timed Tasks** (`isAllDay: false`):
- Represent **specific moments** in time
- Stored as **full timestamps** (e.g., `2025-01-15T21:00:00.000Z` = 9 PM UTC)
- **Timezone-aware** - Display time adjusts to user's timezone
- Use **local timezone** for date comparisons
- Example: 9 PM UTC = 1 PM PST = 4 PM EST (same task, different display)

### 2. Google Calendar Specification Alignment

Per [Google Calendar API documentation](https://developers.google.com/calendar/api/concepts/events-calendars):

> **All-day events:** The timezone field has no significance for all-day events.

> **Timed events:** You can specify different timezones for start and end times.

> **Critical rule:** The start and end of the event must both be timed or both be all-day.

## Storage Format

### Database Schema

```sql
-- Single field for both all-day and timed tasks
dueDateTime DateTime?   -- ISO8601 timestamp
isAllDay    Boolean     -- Flag to distinguish types
```

### Examples

**All-Day Task:**
```json
{
  "dueDateTime": "2025-01-15T00:00:00.000Z",  // Midnight UTC
  "isAllDay": true
}
```

**Timed Task:**
```json
{
  "dueDateTime": "2025-01-15T21:00:00.000Z",  // 9 PM UTC (specific moment)
  "isAllDay": false
}
```

## Implementation Details

### Web (TypeScript)

**Filter Utilities:** [`lib/date-filter-utils.ts`](../lib/date-filter-utils.ts)

```typescript
// All-day task comparison (UTC)
if (task.isAllDay) {
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const dueUTC = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate())
  return todayUTC === dueUTC
}

// Timed task comparison (local)
else {
  return (
    dueDate.getFullYear() === now.getFullYear() &&
    dueDate.getMonth() === now.getMonth() &&
    dueDate.getDate() === now.getDate()
  )
}
```

**Available Functions:**
- `isTaskDueToday(task)` - Check if task is due today
- `isTaskOverdue(task)` - Check if task is overdue
- `isTaskDueTomorrow(task)` - Check if task is due tomorrow
- `isTaskDueThisWeek(task)` - Check if task is due within 7 days
- `isTaskDueThisMonth(task)` - Check if task is due within 30 days
- `isTaskDueThisCalendarWeek(task)` - Check if task is due before next Sunday
- `isTaskDueThisCalendarMonth(task)` - Check if task is due before next month
- `applyDateFilter(task, filterType)` - Generic filter function

### iOS (Swift)

**Date Picker:** [`ios-app/Astrid App/Views/Components/InlineDatePicker.swift:132-171`](../ios-app/Astrid App/Views/Components/InlineDatePicker.swift)

```swift
// All-day task comparison (UTC)
if isAllDay {
    var utcCalendar = Calendar.current
    utcCalendar.timeZone = TimeZone(identifier: "UTC")!

    let today = utcCalendar.startOfDay(for: Date())
    let compareDate = utcCalendar.startOfDay(for: date)

    return today == compareDate
}

// Timed task comparison (local)
else {
    let localCalendar = Calendar.current
    return localCalendar.isDateInToday(dueDate)
}
```

**Filter Logic:** [`ios-app/Astrid App/Views/Tasks/TaskListView.swift:769-806`](../ios-app/Astrid App/Views/Tasks/TaskListView.swift)

**Badge Manager:** [`ios-app/Astrid App/Core/Services/BadgeManager.swift:101-156`](../ios-app/Astrid App/Core/Services/BadgeManager.swift)

## Filter Behavior

### Overdue Inclusion in Time-Bound Filters

**Important:** Time-bound filters ("Today", "This Week", "This Month", calendar variants) **automatically include overdue incomplete tasks**. This ensures urgent tasks that slipped past their due date remain visible until completed.

**Example:** If today is Jan 15:
- "Today" filter shows: Tasks due Jan 15 + overdue incomplete tasks (due before Jan 15)
- "This Week" filter shows: Tasks due Jan 15-22 + overdue incomplete tasks
- Completed overdue tasks are excluded (they don't need attention)

### "Today" Filter

**Includes:**
- Tasks due today (all-day or timed)
- **Overdue incomplete tasks** (due before today, not completed)

**All-Day Tasks:**
- ✅ Task with `dueDateTime: "2025-01-15T00:00:00.000Z"` shows on Jan 15 in ANY timezone
- ✅ UTC comparison ensures consistency: extract date components from UTC timestamp

**Timed Tasks:**
- ✅ Task with `dueDateTime: "2025-01-15T21:00:00.000Z"` (9 PM UTC):
  - Shows as "Today" in PST (1 PM PST = Jan 15)
  - Shows as "Today" in EST (4 PM EST = Jan 15)
- ✅ Local timezone comparison respects user's timezone

### "Overdue" Filter

**Includes:** Only tasks where due date has passed (does NOT require incomplete status in the explicit "overdue" filter)

**All-Day Tasks:**
- ✅ Overdue if UTC date is before today's UTC date
- ✅ Task due "yesterday" (UTC) is overdue regardless of timezone

**Timed Tasks:**
- ✅ Overdue if timestamp has passed (full UTC comparison)
- ✅ Task due "1 hour ago" is overdue regardless of timezone

### "This Week" Filter (Next 7 Days)

**Includes:**
- Tasks due within 7 days from today
- **Overdue incomplete tasks**

**All-Day Tasks:**
- ✅ Includes tasks with UTC date within 7 days from today's UTC date

**Timed Tasks:**
- ✅ Includes tasks with local date within 7 days from today's local date

### "This Month" Filter (Next 30 Days)

**Includes:**
- Tasks due within 30 days from today
- **Overdue incomplete tasks**

### "This Calendar Week" Filter (Before Next Sunday)

**Includes:**
- Tasks due before next Sunday
- **Overdue incomplete tasks**

**All-Day Tasks:**
- ✅ Includes tasks before next Sunday (UTC)

**Timed Tasks:**
- ✅ Includes tasks before next Sunday (local)

### "This Calendar Month" Filter (Before Next Month)

**Includes:**
- Tasks due before the first day of next month
- **Overdue incomplete tasks**

## Timezone Change Behavior

### All-Day Tasks: Timezone-Independent ✅

```typescript
// User in PST creates all-day task due "Jan 15"
const task = {
  dueDateTime: "2025-01-15T00:00:00.000Z",
  isAllDay: true
}

// Shows as "Jan 15" in PST
// Shows as "Jan 15" in EST (same date!)
// Shows as "Jan 15" in JST (same date!)
// ✅ Date NEVER changes when timezone changes
```

### Timed Tasks: Timezone-Aware ✅

```typescript
// User creates timed task due "Jan 15 at 9 PM UTC"
const task = {
  dueDateTime: "2025-01-15T21:00:00.000Z",
  isAllDay: false
}

// PST: Shows as "Jan 15 at 1 PM"
// EST: Shows as "Jan 15 at 4 PM"
// JST: Shows as "Jan 16 at 6 AM" (next day!)
// ✅ Display time changes, but filters still work correctly
```

## Test Coverage

### Unit Tests (Vitest)

**Primary Test Suite:** [`tests/lib/date-filter-utils.test.ts`](../tests/lib/date-filter-utils.test.ts)
- 39 tests covering all filter functions
- All-day vs timed task scenarios
- Timezone-independent behavior
- Regression tests for iOS/Web sync bugs

**Existing Test Suites:**
- [`tests/lib/date-utils.test.ts`](../tests/lib/date-utils.test.ts) - 31 tests
- [`tests/lib/date-timezone-handling.test.ts`](../tests/lib/date-timezone-handling.test.ts) - 20 tests
- [`tests/api/date-sync-ios-web.test.ts`](../tests/api/date-sync-ios-web.test.ts) - 11 tests

**Total:** 101 tests ✅

### Critical Regression Tests

```typescript
it('REGRESSION: All-day task created for "Today" on iOS must show "Today" on web', () => {
  const now = new Date()
  const todayMidnightUTC = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  ))

  const task = createMockTask(todayMidnightUTC.toISOString(), true)

  expect(isTaskDueToday(task)).toBe(true)  // ✅ MUST BE TRUE
})
```

## Cross-Platform Consistency

### iOS → Web Sync ✅

| Scenario | iOS Storage | Web Display | Status |
|----------|-------------|-------------|--------|
| All-day task "Today" | `2025-01-15T00:00:00.000Z` | "Today" | ✅ Works |
| All-day task "Tomorrow" | `2025-01-16T00:00:00.000Z` | "Tomorrow" | ✅ Works |
| Timed task "Today 9 PM" | `2025-01-15T21:00:00.000Z` | "Today" (local TZ) | ✅ Works |
| Timezone change | No change | No change (all-day) | ✅ Works |

### Web → iOS Sync ✅

| Scenario | Web Storage | iOS Display | Status |
|----------|-------------|-------------|--------|
| All-day task "Today" | `2025-01-15T00:00:00.000Z` | "Today" | ✅ Works |
| All-day task "Tomorrow" | `2025-01-16T00:00:00.000Z` | "Tomorrow" | ✅ Works |
| Timed task "Today 9 PM" | `2025-01-15T21:00:00.000Z` | "Today" (local TZ) | ✅ Works |
| Timezone change | No change | No change (all-day) | ✅ Works |

## Common Pitfalls & Solutions

### ❌ DON'T: Use local timezone for all-day tasks

```typescript
// WRONG - Uses local timezone
const isToday = (
  taskDate.getFullYear() === today.getFullYear() &&
  taskDate.getMonth() === today.getMonth() &&
  taskDate.getDate() === today.getDate()
)
// ❌ Fails for all-day tasks in different timezones
```

### ✅ DO: Use UTC comparison for all-day tasks

```typescript
// CORRECT - Uses UTC timezone
if (task.isAllDay) {
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const dueUTC = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate())
  return todayUTC === dueUTC
}
// ✅ Works consistently across timezones
```

### ❌ DON'T: Ignore isAllDay flag

```typescript
// WRONG - Treats all tasks the same
const isToday = taskDate.toDateString() === today.toDateString()
// ❌ Fails for all-day tasks
```

### ✅ DO: Check isAllDay and use appropriate comparison

```typescript
// CORRECT - Different logic for all-day vs timed
if (task.isAllDay) {
  // UTC comparison
} else {
  // Local timezone comparison
}
// ✅ Works for both types
```

## Migration Checklist

If updating existing date handling code:

- [ ] Replace direct date comparisons with utility functions
- [ ] Check for `isAllDay` flag before comparing dates
- [ ] Use UTC comparison for all-day tasks
- [ ] Use local comparison for timed tasks
- [ ] Add regression tests for critical scenarios
- [ ] Validate cross-platform consistency
- [ ] Test timezone change behavior

## References

- [Google Calendar API - Events & Calendars](https://developers.google.com/calendar/api/concepts/events-calendars)
- [RFC 5545 - iCalendar](https://tools.ietf.org/html/rfc5545)
- [MDN - Date.UTC()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/UTC)
- Implementation: [`lib/date-filter-utils.ts`](../lib/date-filter-utils.ts)
- iOS Implementation: [`ios-app/Astrid App/Views/Components/InlineDatePicker.swift`](../ios-app/Astrid App/Views/Components/InlineDatePicker.swift)

---

**Questions or Issues?** See [ARCHITECTURE.md](./ARCHITECTURE.md) or create an issue.
