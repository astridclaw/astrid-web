# Fix for Insecure Connection Warnings

## Problem Statement

When the application is deployed to production (HTTPS), but environment variables like `NEXTAUTH_URL`, `NEXT_PUBLIC_BASE_URL`, etc. are not properly set, the code was falling back to `http://localhost:3000`. This caused **mixed content warnings** in browsers because HTTPS pages were trying to load HTTP resources.

## Solution Overview

Centralized all URL generation to use the `getBaseUrl()` utility from `lib/base-url.ts`, which now:
1. **Never returns HTTP URLs in production** - always uses HTTPS
2. **Provides helpful warnings** when environment variables are missing
3. **Falls back safely** to `https://astrid.cc` in production instead of `http://localhost:3000`

## Files Changed

### 1. `lib/base-url.ts` (Core Fix)
**Changes:**
- Added production-safe fallbacks that use HTTPS instead of HTTP
- Added console warnings when environment variables are missing in production
- Updated both server-side and edge-case fallbacks to check `NODE_ENV`

**Key Improvements:**
```typescript
// Before (insecure):
return 'http://localhost:3000'

// After (secure):
const fallbackUrl = process.env.NODE_ENV === 'production'
  ? 'https://astrid.cc'  // Safe production fallback
  : 'http://localhost:3000'
```

### 2. `lib/email.ts`
**Changes:**
- Added import: `import { getBaseUrl } from './base-url'`
- Replaced 2 occurrences of `process.env.NEXTAUTH_URL || process.env.VERCEL_URL || 'http://localhost:3000'`
- Now uses: `getBaseUrl()`

**Functions Updated:**
- `sendInvitationEmail()` - Line 51
- `sendVerificationEmail()` - Line 103

### 3. `lib/auth-config.ts`
**Changes:**
- Updated fallback to use `getBaseUrl()` instead of hardcoded HTTP URL
- Added production warning when NEXTAUTH_URL is not set

**Impact:**
- Authentication URLs (callbacks, redirects) now always use correct protocol
- Prevents OAuth callback failures due to protocol mismatch

### 4. `lib/email-reminder-service.ts`
**Changes:**
- Added import: `import { getBaseUrl } from '@/lib/base-url'`
- Updated 3 private methods to use `getBaseUrl()`

**Methods Updated:**
- `getTaskUrl()` - Line 757
- `getSnoozeUrl()` - Line 762
- `getAppUrl()` - Line 767

### 5. `lib/ai-tools-agent.ts` (Deprecated File)
**Changes:**
- Added import: `import { getBaseUrl } from './base-url'`
- Updated 3 occurrences of HTTP fallbacks

**Functions Updated:**
- `fetchAstridMd()` - Line 228
- `runQualityGates()` - Line 301
- MCP operations call - Line 763

**Note:** This file is deprecated but fixed for completeness.

### 6. `lib/ai-agent-webhook-service.ts`
**Changes:**
- Replaced `process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'`
- Now uses: `getBaseUrl()` (already imported)

**Function Updated:**
- Tools workflow trigger - Line 539

### 7. `components/github-setup-guide.tsx`
**Changes:**
- Changed initial state from `"http://localhost:3000"` to `""`
- Added comments explaining the change
- Component already detects URL from `window.location` in useEffect

**Impact:**
- Prevents any temporary flash of insecure HTTP URLs
- Always shows correct protocol from browser

## New Files Created

### 1. `scripts/validate-production-env.ts`
**Purpose:** Validates environment variables before production deployment

**Features:**
- Checks all critical environment variables
- Validates URL formats (ensures HTTPS in production)
- Validates database connection strings
- Provides clear error messages and warnings

**Usage:**
```bash
npm run validate:env                    # Check current environment
npm run validate:env:production         # Check with NODE_ENV=production
```

### 2. `tests/lib/base-url.test.ts`
**Purpose:** Comprehensive test coverage for URL generation

**Test Coverage:**
- ✅ HTTPS enforcement in production
- ✅ HTTP allowed in development
- ✅ Environment variable priority (NEXTAUTH_URL > NEXT_PUBLIC_BASE_URL > VERCEL_URL)
- ✅ Vercel URL with HTTPS prefix
- ✅ Client-side window.location detection
- ✅ Mixed content prevention
- ✅ Production detection logic
- ✅ All URL helper functions (getTaskUrl, getAIAgentWebhookUrl, etc.)

**Run Tests:**
```bash
npm test tests/lib/base-url.test.ts
```

## Package.json Updates

Added new npm scripts:
```json
"validate:env": "tsx scripts/validate-production-env.ts",
"validate:env:production": "NODE_ENV=production tsx scripts/validate-production-env.ts"
```

## Testing Checklist

### Before Merging:
- [ ] Run TypeScript checks: `npm run predeploy:quick`
- [ ] Run new tests: `npm test tests/lib/base-url.test.ts`
- [ ] Run environment validation: `npm run validate:env:production`
- [ ] Verify no HTTP URLs in production code (excluding test files)

### After Deployment:
- [ ] Check browser console for mixed content warnings (should be none)
- [ ] Verify authentication redirects work correctly
- [ ] Test email invitation links use HTTPS
- [ ] Check AI agent webhook URLs use HTTPS

## Environment Variable Recommendations

### Required for Production:
```bash
NEXTAUTH_URL=https://astrid.cc
DATABASE_URL=postgresql://...?sslmode=require
NEXTAUTH_SECRET=<your-secret>
```

### Recommended:
```bash
NEXT_PUBLIC_BASE_URL=https://astrid.cc
FROM_EMAIL=noreply@astrid.cc
RESEND_API_KEY=<your-key>
```

### Vercel Deployments:
- `VERCEL_URL` is automatically set by Vercel
- Still recommended to set `NEXTAUTH_URL` explicitly for consistency

## Impact Analysis

### Positive Impacts:
✅ **No more mixed content warnings** - All URLs use correct protocol in production
✅ **Better developer experience** - Clear warnings when environment variables are missing
✅ **Improved security** - HTTPS enforced for all production URLs
✅ **Easier debugging** - Centralized URL generation logic
✅ **Better testing** - Comprehensive test coverage for URL generation

### Potential Concerns:
⚠️ **Fallback behavior change** - Production now falls back to `https://astrid.cc` instead of `http://localhost:3000`
   - This is intentional and prevents security issues
   - Proper environment variables should always be set in production

⚠️ **Console warnings in production** - New warnings when environment variables are missing
   - This is helpful for debugging deployment issues
   - Warnings can be silenced by setting proper environment variables

## Rollback Plan

If issues arise:
1. Revert the changes to `lib/base-url.ts` lines 37-64
2. Revert the changes to individual files (email.ts, auth-config.ts, etc.)
3. Deploy previous version

All changes are backward compatible - existing environment variables work as before.

## Documentation Updates Needed

- [ ] Update deployment guide with new environment variable requirements
- [ ] Add section about insecure connection warnings prevention
- [ ] Document new validation scripts in development workflow
- [ ] Add troubleshooting section for mixed content warnings

## Related Issues

This fix resolves:
- Mixed content warnings in production
- HTTP URLs in HTTPS pages
- Incorrect authentication callback URLs
- Email invitation links with wrong protocol
- AI agent webhook failures due to protocol mismatch

## Future Improvements

1. **Add runtime monitoring** - Detect and log any HTTP URLs generated in production
2. **ESLint rule** - Prevent hardcoded `http://localhost:3000` in new code
3. **Deployment checks** - Add pre-deployment validation to CI/CD pipeline
4. **Environment templates** - Provide `.env.production.template` file

## Summary

This comprehensive fix ensures that the application **never generates insecure HTTP URLs in production**, preventing browser mixed content warnings and improving security. All URL generation is now centralized, tested, and production-safe.
