# Playwright Authentication Setup Guide

Complete guide to setting up and running authenticated E2E tests with Playwright in Astrid.

## 🎯 Overview

Astrid uses Playwright's **storage state** feature for authentication. This approach:
- ✅ Authenticates once before all tests
- ✅ Reuses the session across all tests
- ✅ Fast and efficient (no re-login for each test)
- ✅ Works across all browsers
- ✅ Supports parallel test execution

## 🚀 Quick Start

### 1. Create Test User

First, create a test user in your database:

```bash
npm run playwright:setup
```

**Note:** This command automatically loads your `.env.local` file for database connection.

This creates a test user with:
- **Email**: `test@example.com`
- **Password**: `TestPassword123!`
- **Email verified**: Yes (auto-verified for testing)
- **Default list**: "Test Tasks"

**Custom credentials** (optional):
```bash
PLAYWRIGHT_TEST_EMAIL="mytest@example.com" \
PLAYWRIGHT_TEST_PASSWORD="MyPassword123!" \
npm run playwright:setup
```

### 2. Run Tests

```bash
# Run all tests (includes auth setup)
npm run test:e2e

# Run in UI mode
npm run test:e2e:ui

# Run authenticated tests only
npx playwright test --project=chromium-authenticated
```

## 📁 File Structure

```
e2e/
├── auth.setup.ts              # Authentication setup (runs first)
├── tasks-authenticated.spec.ts # Example authenticated tests
├── auth.spec.ts               # Unauthenticated auth flow tests
└── fixtures/
    └── auth.ts                # (deprecated - use storage state instead)

.auth/
└── user.json                  # Saved authentication state (auto-generated)

scripts/
└── create-test-user.ts        # Test user provisioning script
```

## 🔧 How It Works

### Step 1: Authentication Setup (`e2e/auth.setup.ts`)

Before any tests run, Playwright executes the auth setup:

1. Navigate to `/auth/signin`
2. Fill in test credentials
3. Submit login form
4. Verify authentication success
5. Save session to `.auth/user.json`

```typescript
// e2e/auth.setup.ts
setup('authenticate', async ({ page }) => {
  await page.goto('/auth/signin')
  await page.getByLabel(/email/i).fill('test@example.com')
  await page.getByLabel(/password/i).fill('TestPassword123!')
  await page.getByRole('button', { name: /sign in/i }).click()

  // Wait for redirect
  await page.waitForURL(/\/$/)

  // Save authenticated state
  await page.context().storageState({ path: '.auth/user.json' })
})
```

### Step 2: Test Projects

Tests are split into two categories:

**Authenticated Tests** (most tests):
```typescript
{
  name: 'chromium-authenticated',
  use: {
    storageState: '.auth/user.json',  // ✅ Auto-authenticated
  },
  dependencies: ['setup'],            // ✅ Runs after auth setup
  testIgnore: /auth\.spec\.ts/,       // ✅ Skips auth flow tests
}
```

**Unauthenticated Tests** (auth flows only):
```typescript
{
  name: 'chromium',
  testMatch: /auth\.spec\.ts/,        // ✅ Only auth flow tests
}
```

### Step 3: Writing Tests

**Authenticated tests** (default - most tests):
```typescript
import { test, expect } from '@playwright/test'

test('should create a task', async ({ page }) => {
  await page.goto('/')  // Already authenticated!

  // Your test code...
})
```

**Unauthenticated tests** (auth flows):
```typescript
// File: e2e/auth.spec.ts
import { test, expect } from '@playwright/test'

test('should show sign-in page', async ({ page }) => {
  await page.goto('/auth/signin')
  // Test sign-in UI...
})
```

## 📊 Test Project Matrix

| Project | Browser | Authentication | Runs |
|---------|---------|---------------|------|
| `setup` | Chromium | N/A | Auth setup only |
| `chromium-authenticated` | Chrome | ✅ Yes | All tests except auth.spec.ts |
| `firefox-authenticated` | Firefox | ✅ Yes | All tests except auth.spec.ts |
| `webkit-authenticated` | Safari | ✅ Yes | All tests except auth.spec.ts |
| `chromium` | Chrome | ❌ No | Only auth.spec.ts |
| `firefox` | Firefox | ❌ No | Only auth.spec.ts |
| `webkit` | Safari | ❌ No | Only auth.spec.ts |
| `Mobile Chrome` | Chrome Mobile | ✅ Yes | All tests except auth.spec.ts |
| `Mobile Safari` | Safari Mobile | ✅ Yes | All tests except auth.spec.ts |

## 🔐 Environment Variables

Set these in `.env.local` or pass to commands:

| Variable | Default | Description |
|----------|---------|-------------|
| `PLAYWRIGHT_TEST_EMAIL` | `test@example.com` | Test user email |
| `PLAYWRIGHT_TEST_PASSWORD` | `TestPassword123!` | Test user password |
| `PLAYWRIGHT_TEST_BASE_URL` | `http://localhost:3000` | Test server URL |

**Example `.env.local`:**
```bash
PLAYWRIGHT_TEST_EMAIL=playwright@test.local
PLAYWRIGHT_TEST_PASSWORD=SecureTestPassword123!
```

## 📝 Example Tests

### Creating a Task
```typescript
test('should create a task', async ({ page }) => {
  await page.goto('/')

  const addTaskInput = page.getByPlaceholder(/add.*task/i)
  await addTaskInput.fill('Buy groceries')
  await addTaskInput.press('Enter')

  await expect(page.getByText('Buy groceries')).toBeVisible()
})
```

### Completing a Task
```typescript
test('should complete a task', async ({ page }) => {
  await page.goto('/')

  // Create task first
  await page.getByPlaceholder(/add.*task/i).fill('Test task')
  await page.keyboard.press('Enter')

  // Complete it
  const task = page.getByText('Test task')
  const checkbox = task.locator('..').getByRole('checkbox')
  await checkbox.check()

  await expect(checkbox).toBeChecked()
})
```

### Accessing Protected Routes
```typescript
test('should access settings', async ({ page }) => {
  await page.goto('/settings')

  // Should NOT redirect to signin
  await expect(page).toHaveURL(/\/settings/)
  await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible()
})
```

## 🐛 Troubleshooting

### Authentication Fails

**Problem**: Tests fail with "not authenticated" errors

**Solutions**:
1. Create test user:
   ```bash
   npm run playwright:setup
   ```

2. Check credentials match:
   ```bash
   # In .env.local
   PLAYWRIGHT_TEST_EMAIL=test@example.com
   PLAYWRIGHT_TEST_PASSWORD=TestPassword123!
   ```

3. Delete stored state and retry:
   ```bash
   rm -rf .auth/
   npm run test:e2e
   ```

### Test User Not Found

**Problem**: "User does not exist" error

**Solution**: Run the setup script:
```bash
npm run playwright:setup
```

### Session Expires

**Problem**: Tests fail mid-run with auth errors

**Solution**: Increase session timeout in your auth config or re-run auth setup:
```bash
npx playwright test --project=setup
```

### Can't Access .auth/user.json

**Problem**: Permission denied or file not found

**Solution**:
```bash
# Create directory
mkdir -p .auth

# Run auth setup
npx playwright test --project=setup
```

### Different Environments

**Problem**: Need different users for different environments

**Solution**: Use environment-specific credentials:
```bash
# Development
PLAYWRIGHT_TEST_EMAIL=dev@test.com npm run test:e2e

# Staging
PLAYWRIGHT_TEST_EMAIL=staging@test.com npm run test:e2e
```

## 🔄 Updating Test User

To update the test user password or create a new one:

```bash
# Update existing user
npm run playwright:setup

# Create different user
PLAYWRIGHT_TEST_EMAIL=newuser@test.com \
PLAYWRIGHT_TEST_PASSWORD=NewPassword123! \
npm run playwright:setup
```

## 🧪 Running Specific Test Types

```bash
# Only authenticated tests
npx playwright test --project=chromium-authenticated

# Only unauthenticated auth flow tests
npx playwright test --project=chromium

# All tests
npm run test:e2e

# Specific file (authenticated)
npx playwright test e2e/tasks-authenticated.spec.ts --project=chromium-authenticated
```

## 📚 Best Practices

### ✅ DO

1. **Use storage state** for authenticated tests (already set up)
2. **One test user** for all tests (keeps it simple)
3. **Independent tests** (don't rely on test execution order)
4. **Clean up** created data in tests if needed
5. **Use specific selectors** (roles, labels, test IDs)

```typescript
// Good: Uses authenticated state automatically
test('my test', async ({ page }) => {
  await page.goto('/')
  // ... test code
})
```

### ❌ DON'T

1. **Don't** login in every test (use storage state)
2. **Don't** share state between tests
3. **Don't** hardcode URLs (use baseURL)
4. **Don't** use fragile selectors (CSS classes)

```typescript
// Bad: Logging in every test
test('my test', async ({ page }) => {
  await page.goto('/auth/signin')  // ❌ Slow and unnecessary
  await page.fill('email', '...')
  await page.fill('password', '...')
  await page.click('submit')
  // ... test code
})
```

## 🎯 CI/CD Integration

For GitHub Actions:

```yaml
- name: Create test user
  run: npm run playwright:setup

- name: Run E2E tests
  run: npm run test:e2e
  env:
    PLAYWRIGHT_TEST_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
    PLAYWRIGHT_TEST_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
```

## 📖 Additional Resources

- [Playwright Authentication Docs](https://playwright.dev/docs/auth)
- [Storage State Guide](https://playwright.dev/docs/auth#reuse-signed-in-state)
- [E2E README](../../e2e/README.md)
- [E2E Quick Start](./E2E_QUICKSTART.md)

---

## ✅ Summary

**Setup (one-time):**
```bash
npm run playwright:setup      # Create test user
npm run playwright:install    # Install browsers
```

**Run tests:**
```bash
npm run test:e2e             # All tests
npm run test:e2e:ui          # UI mode
```

**That's it!** All authenticated tests automatically use the saved session. 🎉
