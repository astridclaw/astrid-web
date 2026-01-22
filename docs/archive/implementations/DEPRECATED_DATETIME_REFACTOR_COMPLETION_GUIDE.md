# DateTime Refactor - Completion Guide

**Status:** 60% Complete (Core infrastructure done, UI updates remaining)

**Commits:** `327eb23`, `920f920`

---

## ✅ Completed Work

### Database & Schema
- ✅ Added `isAllDay` field (boolean, default false)
- ✅ Data migration: Migrated existing `when` data to `dueDateTime` + `isAllDay`
- ✅ Keeps `when` field temporarily for backward compatibility

### API Layer
- ✅ POST/PUT endpoints accept `isAllDay` field
- ✅ GET responses include `isAllDay` field
- ✅ All-day tasks: `dueDateTime` at midnight UTC, `isAllDay=true`
- ✅ Timed tasks: `dueDateTime` at specific time, `isAllDay=false`
- ✅ Legacy `when` field still supported during transition

### iOS Models
- ✅ Task model: Added `dueDateTime` and `isAllDay` as primary fields
- ✅ Deprecated `when` (kept for backward compat)
- ✅ Added computed `whenTime` property for backward compat
- ✅ CreateTaskRequest: Added `isAllDay` field
- ✅ UpdateTaskRequest: Added `isAllDay` field

---

## ⏳ Remaining Work

### 1. iOS Service Layer Updates

**File:** `ios-app/Astrid App/Core/Services/TaskServiceMCP.swift`

**What to do:**
- Update `createTask()` to set `isAllDay` based on whether time is provided
- Update `updateTask()` calls to include `isAllDay`

**Example:**
```swift
// When creating task
let isAllDay = whenTime == nil
let task = try await apiClient.createTask(
    title: title,
    listIds: listIds,
    // ...
    when: nil,  // Don't use legacy field
    dueDateTime: whenDate,
    isAllDay: isAllDay  // NEW: Set based on whether time exists
)
```

### 2. iOS Display Logic Updates

**Files to update:**
- `ios-app/Astrid App/Views/Tasks/TaskRowView.swift`
- `ios-app/Astrid App/Views/Tasks/TaskDetailViewNew.swift`

**Current logic (WRONG):**
```swift
if let whenTime = task.whenTime {
    // Show time
} else if let when = task.when {
    // Show date only
}
```

**New logic (CORRECT):**
```swift
if let dueDateTime = task.dueDateTime {
    if task.isAllDay {
        // Show date only (use UTC calendar)
        Text(formatDateUTC(dueDateTime))
    } else {
        // Show date + time (use local timezone)
        Text(formatDateTime(dueDateTime))
    }
}
```

### 3. iOS Filter Updates

**File:** `ios-app/Astrid App/Views/Tasks/TaskListView.swift`

**Function:** `applyDueDateFilter()`

**Current logic:**
```swift
guard let dueDate = task.when else { return false }
```

**New logic:**
```swift
guard let dueDate = task.dueDateTime else { return false }

if task.isAllDay {
    // Use UTC calendar for all-day task comparison
    return utcCalendar.isDate(dueDate, inSameDayAs: todayUTC)
} else {
    // Use local calendar for timed task comparison
    return localCalendar.isDate(dueDate, inSameDayAs: todayLocal)
}
```

### 4. Web Component Updates

**Files:** Various React components displaying tasks

**Pattern to find:**
```typescript
// OLD
{task.when && <span>{formatDate(task.when)}</span>}
{task.dueDateTime && <span>{formatTime(task.dueDateTime)}</span>}
```

**Replace with:**
```typescript
// NEW
{task.dueDateTime && (
  task.isAllDay ? (
    <span>{formatDateUTC(task.dueDateTime)}</span>
  ) : (
    <span>{formatDateTime(task.dueDateTime)}</span>
  )
)}
```

### 5. Web Filter Updates

**File:** `hooks/useFilterState.ts`

**Already partially done!** The "Today" filter was updated to use UTC.

**Verify:** All filters check `isAllDay` to determine which calendar to use.

---

## 🧪 Testing Checklist

After completing the updates above, test:

### All-Day Tasks
- [ ] Create all-day task on web → Shows correctly on iOS
- [ ] Create all-day task on iOS → Shows correctly on web
- [ ] "Today" filter shows same results on web and iOS
- [ ] Changing date preserves all-day status

### Timed Tasks
- [ ] Create task with time on web → Shows correct time on iOS
- [ ] Create task with time on iOS → Shows correct time on web
- [ ] Changing date preserves the time
- [ ] Changing time updates correctly

### Timezone Consistency
- [ ] All-day task set on Nov 20 shows as Nov 20 in all timezones
- [ ] Timed task shows in user's local timezone
- [ ] Filters work consistently across timezones

---

## 🗑️ Final Cleanup (After Testing)

### Remove `when` Column

**Create migration:**
```bash
npx prisma migrate dev --name remove_when_column --create-only
```

**Migration SQL:**
```sql
-- Remove deprecated 'when' column
ALTER TABLE "public"."Task" DROP COLUMN "when";
```

**Update schema:**
```prisma
model Task {
  // Remove this line:
  when DateTime?
}
```

**Update iOS model:**
```swift
// Remove from Task struct:
var when: Date?

// Remove from CodingKeys:
case when
```

---

## 🔄 MCP → API Renaming (Bonus Cleanup)

**Files to rename:**
- `TaskServiceMCP.swift` → `TaskService.swift`
- `ListServiceMCP.swift` → `ListService.swift`

**References to update:**
```swift
// OLD
@StateObject private var taskService = TaskServiceMCP.shared

// NEW
@StateObject private var taskService = TaskService.shared
```

**Find all references:**
```bash
grep -r "TaskServiceMCP\|ListServiceMCP" ios-app/Astrid\ App/
```

---

## 📊 Estimated Remaining Time

- **iOS Service Updates:** 30 min
- **iOS Display Logic:** 45 min
- **iOS Filters:** 30 min
- **Web Components:** 1 hour
- **Web Filters:** 15 min
- **Testing:** 1 hour
- **Cleanup (remove when):** 15 min
- **MCP Renaming:** 30 min

**Total:** ~4-5 hours

---

## 🎯 Success Criteria

When complete, you should have:

1. ✅ Single `dueDateTime` field as source of truth
2. ✅ Explicit `isAllDay` boolean flag
3. ✅ Consistent datetime handling across web and iOS
4. ✅ No timezone bugs
5. ✅ Clean, maintainable codebase
6. ✅ All tests passing
7. ✅ `when` column removed from database

---

**Next Session:** Start with "iOS Service Layer Updates" above.
