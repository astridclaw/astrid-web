# Predeploy Testing & Quality Gates

Comprehensive guide to Astrid's testing and quality assurance workflow before deploying to production.

## 🎯 Overview

Astrid uses a multi-layered testing approach combining:
- ✅ **Vitest** - Unit and integration tests
- ✅ **Playwright** - End-to-end (E2E) tests
- ✅ **TypeScript** - Type checking
- ✅ **ESLint** - Code quality and linting

## 📋 Predeploy Scripts

### Quick Reference

```bash
# Full predeploy suite (includes E2E)
npm run predeploy

# Quick checks (TypeScript + ESLint)
npm run predeploy:quick

# Build verification
npm run predeploy:build

# Essential checks (quick + build)
npm run predeploy:essential

# With E2E tests (explicit)
npm run predeploy:with-e2e

# Without E2E tests (faster)
npm run predeploy:no-e2e
```

### Script Breakdown

#### `npm run predeploy` (Full Suite)
**What it does:**
1. Runs all Vitest unit/integration tests
2. Runs all Playwright E2E tests
3. TypeScript type checking
4. ESLint code quality checks

**When to use:**
- Before final production deployment
- After significant changes
- For major bug fixes
- CI/CD pipelines

**Time:** ~5-10 minutes (depending on test count)

#### `npm run predeploy:quick` (Fast Checks)
**What it does:**
1. TypeScript type checking
2. ESLint code quality checks

**When to use:**
- During active development
- Quick validation before commits
- Rapid iteration cycles

**Time:** ~30 seconds

#### `npm run predeploy:with-e2e` (Comprehensive)
**What it does:**
1. All Vitest tests
2. All Playwright E2E tests
3. TypeScript type checking
4. ESLint code quality checks
5. Production build test

**When to use:**
- Final verification before production
- Release candidates
- Major feature deployments

**Time:** ~10-15 minutes

#### `npm run predeploy:no-e2e` (Vitest Only)
**What it does:**
1. All Vitest tests
2. TypeScript type checking
3. ESLint code quality checks

**When to use:**
- Backend/API changes with no UI impact
- Quick predeploy checks
- When E2E tests are already verified

**Time:** ~2-3 minutes

## 🧪 Testing Strategy

### When to Create Vitest Tests

**Always create Vitest tests for:**
- ✅ API endpoints (`tests/api/`)
- ✅ Utility functions (`tests/lib/`)
- ✅ React hooks (`tests/hooks/`)
- ✅ Component logic (`tests/components/`)
- ✅ State management
- ✅ Data transformations
- ✅ Business logic

**Example:**
```typescript
// tests/lib/date-utils.test.ts
import { describe, it, expect } from 'vitest'
import { formatDate } from '@/lib/date-utils'

describe('formatDate', () => {
  it('should format date correctly', () => {
    const date = new Date('2024-01-15')
    expect(formatDate(date)).toBe('Jan 15, 2024')
  })
})
```

### When to Create Playwright E2E Tests

**Always create Playwright tests for:**
- ✅ User interactions (clicks, typing, form submissions)
- ✅ Multi-step workflows
- ✅ Navigation and routing
- ✅ Responsive layouts (mobile/tablet/desktop)
- ✅ Keyboard navigation
- ✅ Accessibility features
- ✅ Cross-browser compatibility
- ✅ Performance monitoring

**Example:**
```typescript
// e2e/tasks.spec.ts
import { test, expect } from '@playwright/test'

test('should create and complete a task', async ({ page }) => {
  await page.goto('/')

  // Create task
  await page.getByPlaceholder(/add.*task/i).fill('Test task')
  await page.keyboard.press('Enter')

  // Complete task
  const task = page.getByText('Test task')
  await task.getByRole('checkbox').check()

  expect(await task.getByRole('checkbox').isChecked()).toBe(true)
})
```

### When to Create BOTH

Create both Vitest and Playwright tests for:
- ✅ Complex UI with business logic
- ✅ Form validation (test logic + user flow)
- ✅ Authentication flows
- ✅ Real-time features (SSE, WebSockets)

**Example:**
```typescript
// Vitest: tests/api/tasks.test.ts
test('POST /api/tasks should create task', async () => {
  const response = await fetch('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({ title: 'Test' })
  })
  expect(response.status).toBe(201)
})

// Playwright: e2e/tasks.spec.ts
test('user can create task via UI', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder(/add.*task/i).fill('Test')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Test')).toBeVisible()
})
```

## 🚀 Development Workflow

### 1. Making Changes

```bash
# Make code changes
# ...

# Quick validation during development
npm run predeploy:quick
```

### 2. Creating Tests

**Not sure which test to create?** Use the suggestion tool:
```bash
npm run test:suggest
```

This interactive tool will:
- Ask questions about your change
- Recommend Vitest, Playwright, or both
- Suggest specific test file locations
- Provide example patterns

### 3. Running Tests

```bash
# Run Vitest tests
npm test                              # All tests
npm test tests/lib/my-fix.test.ts     # Specific test

# Run Playwright tests
npm run test:e2e:ui                   # UI mode (recommended)
npm run test:e2e:headed               # Watch tests run
npm run test:e2e -- e2e/tasks.spec.ts # Specific test
```

### 4. Pre-commit Validation

```bash
# Quick check
npm run predeploy:quick

# Or full check with E2E
npm run predeploy:with-e2e
```

### 5. Before Deployment

```bash
# Full predeploy suite
npm run predeploy

# If passing, deploy
git push origin main  # Triggers Vercel deployment
```

## 🤖 CI/CD Integration

### GitHub Actions

Both test suites run automatically in CI:

**Vitest Tests:**
- Runs on every push/PR
- Part of main CI workflow
- Must pass before merge

**Playwright E2E Tests:**
- Runs on push to `main`/`develop`
- Runs on PRs to `main`/`develop`
- Tests across Chromium, Firefox, WebKit
- Mobile viewport testing
- Artifacts: HTML reports (30 days), traces (7 days)

### Workflow File
`.github/workflows/e2e-tests.yml`

## 📊 Test Coverage

### Current Coverage

**Vitest (70+ test files):**
- API endpoints
- Authentication
- Task management
- List operations
- Real-time features (SSE)
- Utilities and hooks
- Components

**Playwright (7 test suites):**
- Authentication flows (`e2e/auth.spec.ts`)
- Task management (`e2e/tasks.spec.ts`)
- List management (`e2e/lists.spec.ts`)
- Responsive design (`e2e/responsive.spec.ts`)
- Performance (`e2e/performance.spec.ts`)
- Accessibility (`e2e/accessibility.spec.ts`)

### Coverage Goals

Maintain:
- ✅ 80%+ code coverage for critical paths
- ✅ 100% coverage for API endpoints
- ✅ E2E tests for all major user workflows

## 🐛 Testing Checklist for Bug Fixes

When fixing a bug, follow this checklist:

### 1. Identify Test Type Needed
- [ ] Run `npm run test:suggest` for guidance
- [ ] Determine if Vitest, Playwright, or both are needed

### 2. Create Regression Tests
- [ ] **Vitest**: Create test that would have caught the bug
- [ ] **Playwright**: Create E2E test for user-facing bugs
- [ ] Verify test fails before fix
- [ ] Verify test passes after fix

### 3. Run Related Tests
```bash
# Run tests related to your change
npm test tests/[area]/

# Run E2E tests for affected workflows
npm run test:e2e:ui e2e/[area].spec.ts
```

### 4. Validate Fix
- [ ] All new tests pass
- [ ] All existing tests still pass
- [ ] TypeScript compiles (`npm run predeploy:quick`)
- [ ] ESLint passes
- [ ] Manual smoke test in dev server

### 5. Pre-commit
```bash
# Full validation
npm run predeploy:with-e2e
```

## 🔧 Troubleshooting

### Vitest Issues

**Tests timing out:**
```typescript
// Increase timeout for slow tests
test('slow operation', async () => {
  // ...
}, { timeout: 10000 }) // 10 seconds
```

**Database tests failing:**
```bash
# Reset test database
npm run db:reset
npm run db:push
```

**Mock issues:**
```typescript
// Clear mocks between tests
import { vi, beforeEach } from 'vitest'

beforeEach(() => {
  vi.clearAllMocks()
})
```

### Playwright Issues

**Browser not installed:**
```bash
npm run playwright:install
```

**Tests flaky:**
```typescript
// Add proper waits
await page.waitForLoadState('networkidle')
await expect(element).toBeVisible()
```

**Authentication required:**
- Edit `e2e/fixtures/auth.ts`
- Implement test user provisioning

**Debug failing tests:**
```bash
# Debug mode
npm run test:e2e:debug

# UI mode
npm run test:e2e:ui

# View trace
npx playwright show-trace test-results/[test-name]/trace.zip
```

## 📚 Additional Resources

### Documentation
- [Vitest Testing Guide](../context/testing.md)
- [Playwright E2E Guide](../../e2e/README.md)
- [E2E Quick Start](../testing/E2E_QUICKSTART.md)
- [Development Guidelines](./development-guidelines.md)

### Quick Commands

```bash
# Test helpers
npm run test:suggest          # Get test type recommendation
npm test                      # Run Vitest
npm run test:e2e:ui           # Run Playwright UI mode
npm run predeploy             # Full predeploy suite

# Coverage
npm run test:coverage         # Vitest coverage report

# CI/CD
npm run predeploy:with-e2e    # Full CI-like validation
```

## ✅ Best Practices

### General
1. **Write tests first** - TDD when possible
2. **Test behavior, not implementation** - Focus on what users see
3. **Keep tests isolated** - Each test should be independent
4. **Use descriptive names** - Test names should explain what they test
5. **DRY principle** - Use helper functions and fixtures

### Vitest Specific
1. **Mock external dependencies** - Don't hit real APIs
2. **Test edge cases** - Null, undefined, empty arrays
3. **Use proper assertions** - `expect().toBe()` vs `expect().toEqual()`
4. **Group related tests** - Use `describe()` blocks

### Playwright Specific
1. **Use role selectors** - `getByRole()` over CSS selectors
2. **Wait for elements** - Don't assume instant rendering
3. **Test across viewports** - Mobile, tablet, desktop
4. **Check accessibility** - ARIA labels, keyboard navigation
5. **Use test helpers** - `TaskHelpers`, `ListHelpers`, etc.

## 🎯 Summary

**Before every deployment:**
1. Run `npm run predeploy` (or `predeploy:with-e2e`)
2. Ensure all tests pass
3. Fix any failures before deploying
4. Review test coverage for new code

**For bug fixes:**
1. Run `npm run test:suggest` to determine test type
2. Create regression test(s)
3. Fix the bug
4. Verify tests pass
5. Run full predeploy suite

**For new features:**
1. Write tests alongside implementation
2. Include both unit and E2E tests
3. Test happy path and error cases
4. Verify across browsers (Playwright)
5. Check accessibility

---

**Quality gates ensure reliability. Test comprehensively before deploying!** ✅
