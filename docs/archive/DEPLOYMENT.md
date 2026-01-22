# Deployment Guide

This guide covers deployment to Vercel and includes pre-deployment checks to prevent common build failures.

## Quick Deployment Checklist

Before deploying, run these commands:

```bash
# Quick pre-deployment check
npm run predeploy:quick

# Or comprehensive check (recommended)
npm run predeploy:check

# If issues found, run the fix script
npm run fix:deployment
```

## Pre-Deployment Scripts

### `npm run predeploy:check`
Comprehensive pre-deployment validation:
- ✅ Environment variables check
- ✅ TypeScript compilation
- ✅ ESLint validation
- ✅ Security audit
- ✅ Database schema validation
- ✅ Production build test
- ✅ Test suite execution
- ✅ File structure validation

## Authentication Setup

**Critical:** Before deploying, ensure authentication is properly configured:

1. **Set Environment Variables** in Vercel:
   - `NEXTAUTH_SECRET` (strong random string)
   - `NEXTAUTH_URL` (your production domain)
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

2. **Configure Google OAuth** redirect URIs to include your production domain

3. **Verify Database Connection** is accessible from Vercel

See `AUTH_SETUP.md` for detailed authentication configuration.

### `npm run predeploy:quick`
Fast pre-deployment check:
- ✅ Linting
- ✅ Test suite
- ✅ TypeScript compilation

### `npm run fix:deployment`
Automatically fixes common deployment issues:
- 🔧 Adds `dynamic = 'force-dynamic'` to API routes
- 🔧 Cleans build artifacts
- 🔧 Regenerates Prisma client
- 🔧 Checks environment variables
- 🔧 Validates Next.js configuration

## Common Deployment Issues & Fixes

### 1. Dynamic Server Usage Error
**Error:** `Route couldn't be rendered statically because it used headers`

**Fix:** API routes that use `getServerSession` need dynamic configuration:
```typescript
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
```

### 2. useSearchParams Suspense Error
**Error:** `useSearchParams() should be wrapped in a suspense boundary`

**Fix:** Wrap components using `useSearchParams` in `<Suspense>`:
```typescript
import { Suspense } from 'react'

function PageContent() {
  const searchParams = useSearchParams() // This needs Suspense
  // ... component code
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <PageContent />
    </Suspense>
  )
}
```

### 3. Database Connection Issues
**Error:** `Unable to open the database file` or `Error code 14`

**Cause:** SQLite database files cannot be used in Vercel's serverless environment.

**Fix:** 
1. Switch to PostgreSQL for production (see [DATABASE_SETUP.md](./DATABASE_SETUP.md))
2. Update `DATABASE_URL` in Vercel environment variables to PostgreSQL connection string
3. Run `npx prisma db push` to create tables in production database

### 4. Missing Environment Variables
**Error:** Build fails due to missing environment variables

**Required Variables:**
```bash
NEXTAUTH_SECRET="your-secret-here"
NEXTAUTH_URL="https://yourdomain.com"
DATABASE_URL="your-database-url"
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

**Optional Variables (for email features):**
```bash
RESEND_API_KEY="re_your-resend-key"
FROM_EMAIL="noreply@yourdomain.com"
```

## Vercel Deployment Steps

### 1. Connect Repository
1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your GitHub repository
4. Choose "Next.js" framework preset

### 2. Configure Environment Variables
In Vercel dashboard → Settings → Environment Variables:

```bash
# Authentication
NEXTAUTH_SECRET="generate-random-32-char-string"
NEXTAUTH_URL="https://your-app.vercel.app"

# Database (use Vercel Postgres or external provider)
DATABASE_URL="postgresql://user:password@host:port/database"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-oauth-client-id"
GOOGLE_CLIENT_SECRET="your-google-oauth-client-secret"

# Email (optional)
RESEND_API_KEY="re_your-resend-api-key"
FROM_EMAIL="noreply@yourdomain.com"
```

### 3. Database Setup

#### Option A: Vercel Postgres (Recommended)
```bash
# In Vercel dashboard
1. Go to Storage tab
2. Create Postgres database
3. Copy connection string to DATABASE_URL
```

#### Option B: External Database (PlanetScale, Supabase, etc.)
```bash
# Set DATABASE_URL to your external database
DATABASE_URL="postgresql://user:password@host:port/database"
```

### 4. Deploy
```bash
# Push to main branch
git add .
git commit -m "Ready for deployment"
git push origin main

# Vercel auto-deploys on push
```

## Database Migration on Vercel

### First Deployment
```bash
# Vercel will automatically run:
npx prisma generate
npx prisma db push  # Creates tables in production DB
```

### Subsequent Deployments
```bash
# For schema changes, run locally first:
npx prisma db push
git add prisma/
git commit -m "Database schema update"
git push
```

## Monitoring Deployment

### Build Logs
- Check Vercel dashboard → Deployments
- Look for build errors in the logs
- Common issues: missing env vars, TypeScript errors, build failures

### Runtime Monitoring
- Check Vercel dashboard → Functions
- Monitor API route performance
- Check error rates and logs

## Performance Optimization

### 1. Database Connection Pooling
```typescript
// Already configured in lib/prisma.ts
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
})
```

### 2. Image Optimization
```typescript
// Already using Next.js Image component
import Image from 'next/image'
```

### 3. Caching Strategy
```typescript
// API routes use appropriate caching headers
export const revalidate = 60 // Cache for 60 seconds
```

## Troubleshooting

### Build Fails
1. Run `npm run predeploy:check` locally
2. Fix all errors and warnings
3. Test build locally: `npm run build`
4. Push fixes and redeploy

### Runtime Errors
1. Check Vercel function logs
2. Verify environment variables
3. Check database connectivity
4. Monitor API route performance

### Email Not Working
1. Verify `RESEND_API_KEY` is set
2. Check domain verification in Resend
3. Monitor Resend dashboard for delivery issues

## Security Checklist

### Environment Variables
- ✅ Never commit secrets to git
- ✅ Use strong `NEXTAUTH_SECRET` (32+ characters)
- ✅ Use HTTPS URLs for `NEXTAUTH_URL`
- ✅ Rotate secrets periodically

### Database Security
- ✅ Use connection pooling
- ✅ Enable SSL connections
- ✅ Use environment-specific databases
- ✅ Regular backups

### API Security
- ✅ All routes require authentication
- ✅ Input validation on all endpoints
- ✅ Rate limiting (built into Vercel)
- ✅ CORS properly configured

## Production Checklist

Before going live:
- [ ] Run full pre-deployment check
- [ ] Test all major user flows
- [ ] Verify email delivery
- [ ] Check mobile responsiveness
- [ ] Test with real data
- [ ] Backup database
- [ ] Monitor initial deployment
- [ ] Test authentication flows
- [ ] Verify file uploads work
- [ ] Check all environment variables

## Support

If deployment issues persist:
1. Check Vercel documentation
2. Review build logs carefully
3. Test locally with production build
4. Check community forums
5. Contact Vercel support if needed

Remember: Most deployment issues are resolved by running the pre-deployment checks and fixing the identified issues before pushing to production.