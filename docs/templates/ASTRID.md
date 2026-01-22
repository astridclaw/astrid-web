# Project Context for AI Agents

*AI development context for [YOUR PROJECT NAME]*

<!--
  INSTRUCTIONS:
  1. Replace [YOUR PROJECT NAME] with your project name
  2. Fill in sections marked with [CUSTOMIZE]
  3. Delete this instruction comment
  4. Add this file to your repository root as ASTRID.md
-->

---

## About This File

This file is read by AI agents (Claude, OpenAI, Gemini) when assigned tasks via Astrid.
Keep it updated with your project's patterns and conventions.

---

## Project Overview

**Project:** [CUSTOMIZE: Your project name]
**Description:** [CUSTOMIZE: Brief description of what your project does]

### Technology Stack

```
Frontend:   [CUSTOMIZE: e.g., Next.js 15, React 19, Vue 3]
Backend:    [CUSTOMIZE: e.g., Next.js API routes, Express, FastAPI]
Database:   [CUSTOMIZE: e.g., PostgreSQL with Prisma, MongoDB]
Styling:    [CUSTOMIZE: e.g., Tailwind CSS, Styled Components]
Testing:    [CUSTOMIZE: e.g., Vitest, Jest, Playwright]
Deployment: [CUSTOMIZE: e.g., Vercel, AWS, Railway]
```

### Project Structure

```
[CUSTOMIZE: Your folder structure]
/app/          # Next.js pages and API routes
/components/   # React components
/lib/          # Shared utilities
/hooks/        # Custom React hooks
/types/        # TypeScript types
/tests/        # Test files
```

---

## Development Workflow

### Agent Communication

All communication happens through **task comments**:
- Agent posts implementation plan before coding
- Agent asks clarifying questions if needed
- Agent posts PR link when implementation is ready
- User approves by commenting "approve", "ship it", or "merge"

### Quality Requirements

Before creating a PR, ensure:

```bash
# [CUSTOMIZE: Your quality check commands]
npm run typecheck    # TypeScript check
npm run lint         # Linting
npm test            # Tests
npm run build       # Build
```

---

## Coding Workflow (Required for All Changes)

**CRITICAL**: This workflow is MANDATORY for all AI agents making code changes.

### Step 1: Baseline Testing (Before Starting Work)

**ALWAYS run the full test suite before making ANY code changes:**

```bash
# [CUSTOMIZE: Your test commands]
npm run test        # Run tests
npm run typecheck   # TypeScript check
npm run lint        # Linting
```

This establishes:
- Current test pass rates
- Known failing tests (document these)
- Baseline to compare against after implementation

**Record the baseline in your task comment:**
```
📊 Test Baseline:
- Tests: X/Y passing
- Known failures: [list any pre-existing failures]
```

### Step 2: Analysis & Planning

1. Understand the task requirements
2. Explore relevant codebase areas
3. Post implementation plan as task comment
4. Wait for user feedback if needed

### Step 3: Implementation

Write code following established patterns in the codebase.

### Step 4: Post-Implementation Verification

**IMMEDIATELY after completing implementation, run tests:**

```bash
# [CUSTOMIZE: Your test commands]
npm run test
npm run typecheck
npm run lint
```

**If any tests fail that were passing in baseline:**

1. **DO NOT skip or ignore failures** - Fix them immediately
2. Analyze the failure to understand what broke
3. Fix the code (prefer fixing your new code over modifying tests)
4. Re-run tests until all baseline tests pass again

**Document in task comment:**
```
✅ Post-Implementation Verification:
- All baseline tests still passing
- [OR] Fixed regressions in: [list files/tests]
```

### Step 5: Regression Testing (Required)

**ALWAYS create regression tests for new functionality:**

```typescript
// [CUSTOMIZE: Your test file location and patterns]
describe('[Feature Name]', () => {
  it('should [expected behavior]', () => {
    // Arrange
    // Act
    // Assert
  })

  it('should handle edge case [X]', () => {
    // Test edge cases
  })
})
```

### Step 6: Final Quality Gate

Before marking task complete, ALL of these must pass:
- TypeScript: No errors
- Linting: No errors
- Tests: All passing (including new regression tests)

**Post final status in task comment:**
```
✅ Quality Gate Passed:
- TypeScript: No errors
- Linting: No errors
- Tests: X/Y passing (including N new tests)
- New regression tests added: [list test files]
```

---

## Code Conventions

### File Naming

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `UserProfile.tsx` |
| Utilities | kebab-case | `date-utils.ts` |
| Hooks | camelCase with use | `useAuth.ts` |
| API routes | kebab-case | `api/users/[id]/route.ts` |

### Import Order

```typescript
// 1. External libraries
import { useState } from "react"

// 2. Internal utilities
import { cn } from "@/lib/utils"

// 3. Components
import { Button } from "@/components/ui/button"

// 4. Types
import type { User } from "@/types"
```

---

## Common Patterns

### API Route Pattern

```typescript
// [CUSTOMIZE: Your typical API route structure]
export async function POST(request: Request) {
  try {
    // 1. Authentication
    const session = await getServerSession()
    if (!session) {
      return new Response("Unauthorized", { status: 401 })
    }

    // 2. Validate input
    const body = await request.json()

    // 3. Business logic
    const result = await createResource(body)

    // 4. Response
    return Response.json(result)
  } catch (error) {
    return new Response("Error", { status: 500 })
  }
}
```

### Component Pattern

```typescript
// [CUSTOMIZE: Your typical component structure]
interface Props {
  id: string
  className?: string
}

export function Component({ id, className }: Props) {
  const [state, setState] = useState()

  if (!id) return null

  return (
    <div className={cn("base-class", className)}>
      {/* content */}
    </div>
  )
}
```

---

## Testing Strategy

[CUSTOMIZE: Your testing strategy and requirements]

**Test Locations:**
- Unit tests: `[CUSTOMIZE: e.g., tests/, __tests__/]`
- E2E tests: `[CUSTOMIZE: e.g., e2e/, cypress/]`
- Integration tests: `[CUSTOMIZE: e.g., tests/integration/]`

**Coverage Requirements:**
- Critical paths: High coverage
- API endpoints: Test success and error cases
- Components: Test user interactions

See **Coding Workflow** section above for mandatory testing steps.

---

## Project-Specific Notes

[CUSTOMIZE: Add any project-specific information agents should know]

### Common Pitfalls

1. [CUSTOMIZE: Common issue in your project]
   - Solution: [How to avoid/fix]

2. [CUSTOMIZE: Another common issue]
   - Solution: [How to avoid/fix]

### Important Files

- `[CUSTOMIZE: Important config file]` - [What it does]
- `[CUSTOMIZE: Another important file]` - [What it does]

---

## Deployment

[CUSTOMIZE: Your deployment process]

### Pre-Deployment Checklist

- [ ] All tests pass
- [ ] TypeScript compiles
- [ ] Linting passes
- [ ] Build succeeds
- [ ] Manual testing on preview

### Environment Variables

[CUSTOMIZE: List key environment variables needed]

---

## Quick Commands

```bash
# Development
npm run dev              # Start dev server

# Quality
npm run typecheck       # TypeScript
npm run lint            # ESLint
npm test               # Tests
npm run build          # Build

# [CUSTOMIZE: Add your project-specific commands]
```

---

## Resources

- [README.md](./README.md) - Project overview
- [CUSTOMIZE: Link to your documentation]
- [CUSTOMIZE: Link to your API docs]

---

*Keep this file updated as your project evolves!*
