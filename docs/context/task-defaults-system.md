# Task Defaults System

## Overview

The task defaults system applies smart default values when creating tasks, respecting user preferences while allowing explicit overrides.

## Architecture

### Single Source of Truth (Client)

**File:** [lib/task-defaults-priority.ts](../../lib/task-defaults-priority.ts)

This is the primary defaults engine used by the web client. It implements a clear priority hierarchy:

1. **Explicit values from task title** (Highest Priority)
   - Example: "high priority", "assign to jon", "tomorrow"

2. **First hashtag list's customized defaults**
   - User explicitly chose this list via #hashtag in title

3. **Current list's customized defaults**
   - The list where the user is currently viewing/adding task

4. **System defaults** (Lowest Priority)
   - Hardcoded fallback values

### Server-Side Fallback (API)

**File:** [app/api/tasks/route.ts](../../app/api/tasks/route.ts)

The API route provides a fallback defaults system for:
- MCP (Model Context Protocol) requests
- Direct API calls from external clients
- Testing and debugging

The server trusts client-provided values but applies defaults when not provided.

## Key Concepts

### Customized vs System Defaults

- **System Default**: The original, unchanged default value (e.g., priority = 0, assignee = task creator)
- **Customized Default**: User explicitly changed the list's default from system default

**Important**: Only customized defaults are applied in the priority chain. System defaults are ignored unless there are no customizations.

### Special Assignee Values

The system supports three special assignee values in list defaults:

| Database Value | UI Label | Meaning | Result |
|---------------|----------|---------|--------|
| `undefined` | (not set) | No preference | Uses system default (task creator) |
| `null` | "Task Creator" | Explicitly assign to creator | `userId` |
| `"unassigned"` | "Unassigned" | Explicitly leave unassigned | `null` |
| `<user-id>` | User's name | Specific user | `<user-id>` |

**Example**:
```typescript
// Database: defaultAssigneeId = "unassigned"
// Result: task.assigneeId = null (unassigned)

// Database: defaultAssigneeId = null
// Result: task.assigneeId = userId (task creator)

// Database: defaultAssigneeId = undefined
// Result: task.assigneeId = userId (falls back to system default)
```

This ensures precise control over task assignment behavior.

## Data Flow

```
User Input
    ↓
parseTaskInput() - Extract hashtags, keywords, dates
    ↓
applyTaskDefaultsWithPriority() - Apply defaults with priority logic
    ↓
mapTaskDataForApi() - Simple mapping to API format
    ↓
POST /api/tasks - Server validates and stores
```

## Files Involved

| File | Purpose | Complexity |
|------|---------|------------|
| `lib/task-manager-utils.ts` | Parse task title for keywords | Simple |
| `lib/task-defaults-priority.ts` | **Main defaults engine** | Complex |
| `lib/task-creation-utils.ts` | Map to API format | Simple |
| `app/api/tasks/route.ts` | Server-side fallback defaults | Medium |

## Example Scenarios

### Scenario 1: Current List Priority

```typescript
// User in list "Bob" (priority=2) adds "Buy milk"
const currentList = { defaultPriority: 2 } // Customized
const result = applyTaskDefaultsWithPriority({
  parsedValues: {},
  currentList,
  hashtagLists: [],
  userId: 'user-123'
})
// result.priority = 2 (from current list)
```

### Scenario 2: Hashtag List Wins

```typescript
// User in "My Tasks" (priority=0) adds "Buy milk #bob"
const currentList = { defaultPriority: 0 } // System default
const hashtagList = { defaultPriority: 2 } // Customized
const result = applyTaskDefaultsWithPriority({
  parsedValues: {},
  currentList,
  hashtagLists: [hashtagList],
  userId: 'user-123'
})
// result.priority = 2 (hashtag list wins over system default)
```

### Scenario 3: Explicit Value Wins

```typescript
// User in "Bob" (priority=2) adds "Buy milk highest priority"
const currentList = { defaultPriority: 2 }
const result = applyTaskDefaultsWithPriority({
  parsedValues: { priority: 3 }, // Parsed from "highest priority"
  currentList,
  hashtagLists: [],
  userId: 'user-123'
})
// result.priority = 3 (explicit mention wins)
```

### Scenario 4: Unassigned Default

```typescript
// User in list with "unassigned" default adds "Buy milk"
const currentList = { defaultAssigneeId: 'unassigned' } // Customized!
const result = applyTaskDefaultsWithPriority({
  parsedValues: {},
  currentList,
  hashtagLists: [],
  userId: 'user-123'
})
// result.assigneeId = null (NOT 'user-123')
```

## Testing

Comprehensive tests in [tests/lib/task-defaults-priority.test.ts](../../tests/lib/task-defaults-priority.test.ts):

- ✅ 18 test cases covering all priority scenarios
- ✅ Tests for "unassigned" edge cases
- ✅ Tests for system vs customized defaults
- ✅ Integration tests with multiple fields

Run tests:
```bash
npm test tests/lib/task-defaults-priority.test.ts
```

## Common Pitfalls

### ❌ Don't: Apply defaults in multiple places

Bad:
```typescript
// In parseTaskInput
const assigneeId = assigneeId || listDefaults.assigneeId || userId

// In API route
if (!assigneeId) assigneeId = list.defaultAssigneeId
```

### ✅ Do: Apply defaults in one place (with server fallback)

Good:
```typescript
// Client: Full priority logic in applyTaskDefaultsWithPriority
// Server: Simple fallback for MCP/API clients
```

### ❌ Don't: Use || operator with null values

Bad:
```typescript
const assigneeId = parsedValue || listDefault || userId
// null is falsy! Will skip to userId even when explicitly unassigned
```

### ✅ Do: Check for undefined explicitly

Good:
```typescript
const assigneeId = parsedValue !== undefined ? parsedValue : listDefault
// Preserves null (unassigned) as intended
```

## Recent Changes

### 2024-10-17: Simplified and Fixed "Unassigned" Bug

**Problem**: Tasks created in lists with "unassigned" default assignee were being assigned to the current user.

**Root Cause**:
1. `parseTaskInput` was treating `null` as falsy and converting to `undefined`
2. `undefined` in `parsedValues` was being treated as "explicitly set" (highest priority)
3. This overrode the list's "unassigned" default

**Fix**:
1. `parseTaskInput` now returns only explicitly parsed values (no default fallbacks)
2. Removed debug logging clutter
3. Simplified `mapTaskDataForApi` to simple mapping
4. API route now handles MCP/direct API calls with fallback defaults
5. Added comprehensive tests for "unassigned" edge cases

**Files Changed**:
- [lib/task-manager-utils.ts](../../lib/task-manager-utils.ts) - Removed default application
- [lib/task-creation-utils.ts](../../lib/task-creation-utils.ts) - Simplified mapping
- [lib/task-defaults-priority.ts](../../lib/task-defaults-priority.ts) - Removed debug logs, added docs
- [app/api/tasks/route.ts](../../app/api/tasks/route.ts) - Added fallback defaults for MCP/API
- [tests/lib/task-defaults-priority.test.ts](../../tests/lib/task-defaults-priority.test.ts) - Added unassigned tests

## Future Improvements

- [ ] Consider extracting server-side defaults to shared utility
- [ ] Add E2E tests for MCP task creation with defaults
- [ ] Consider caching list defaults for performance
