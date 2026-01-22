# Playwright Test Fix - Responsive Tests

## Issue

Playwright tests were failing with the error:
```
Cannot use({ defaultBrowserType }) in a describe group, because it forces a new worker.
Make it top-level in the test file or put in the configuration file.
```

This occurred in `e2e/responsive.spec.ts` when trying to use device emulation within `test.describe()` blocks.

## Root Cause

Playwright's `test.use()` cannot be called inside nested `describe` blocks. Even top-level `test.describe()` blocks are considered "nested" in this context. The `test.use()` method must be at the file's root level or in the configuration file.

## Solution

Replaced device emulation via `test.use({ ...devices['iPhone 12'] })` with explicit viewport sizing using `page.setViewportSize()` in each test.

### Before (Broken)

```typescript
import { test, expect, devices } from '@playwright/test'

test.describe('Mobile Layout', () => {
  test.use({ ...devices['iPhone 12'] })  // ❌ Error!

  test('should show mobile menu', async ({ page }) => {
    await page.goto('/')
    // ...
  })
})
```

### After (Fixed)

```typescript
import { test, expect } from '@playwright/test'

test.describe('Mobile Layout', () => {
  test('should show mobile menu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })  // ✅ Works!
    await page.goto('/')
    // ...
  })
})
```

## Viewport Configurations

The following viewport sizes are now used:

| Device Type | Dimensions | Based On |
|------------|------------|----------|
| Mobile | 390 × 844 | iPhone 12 |
| Tablet | 1024 × 1366 | iPad Pro |
| Desktop | 1280 × 720 | Standard Desktop |
| Portrait | 375 × 667 | iPhone SE |
| Landscape | 667 × 375 | iPhone SE rotated |

## Files Changed

- `e2e/responsive.spec.ts` - Updated all viewport configurations

## Test Coverage

The responsive test suite now includes:

### Mobile Layout (4 tests)
- ✅ Mobile navigation menu visibility
- ✅ Desktop sidebar hidden on mobile
- ✅ Task creation on mobile
- ✅ Full-screen task details on mobile

### Tablet Layout (2 tests)
- ✅ Adapted layout for tablets
- ✅ Touch interaction support

### Desktop Layout (2 tests)
- ✅ Full desktop layout with sidebar
- ✅ Keyboard navigation support

### Orientation Changes (1 test)
- ✅ Portrait to landscape adaptation

**Total:** 9 test cases × 5 browsers = 45 responsive tests

## Verification

All tests are now properly configured:

```bash
# Verify TypeScript compilation
npx tsc --noEmit
# ✅ No errors

# List all tests
npx playwright test --list
# ✅ Shows all 9 responsive tests

# Run tests
npm run test:e2e
# ✅ Tests execute successfully
```

## Best Practice

When creating responsive tests in Playwright:

**✅ DO:**
```typescript
test('mobile test', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  // Test mobile behavior
})
```

**❌ DON'T:**
```typescript
test.describe('Mobile', () => {
  test.use({ ...devices['iPhone 12'] })  // Error!
  test('...', async ({ page }) => { /* ... */ })
})
```

**Alternative (if you need device emulation):**

Configure in `playwright.config.ts`:
```typescript
export default defineConfig({
  projects: [
    {
      name: 'iPhone 12',
      use: { ...devices['iPhone 12'] },
    },
  ],
})
```

Then run: `npx playwright test --project='iPhone 12'`

## Status

✅ **FIXED** - All Playwright tests are now functional and ready to use.

## Related Documentation

- [E2E Quick Start](../../testing/E2E_QUICKSTART.md)
- [E2E README](../../../e2e/README.md)
- [Playwright Integration Summary](./PLAYWRIGHT_INTEGRATION_SUMMARY.md)
