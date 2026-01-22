# Automated Migration System

This document explains the automated migration system implemented to prevent OAuth and database issues during deployment.

## Overview

The system provides multiple layers of migration protection:

1. **Build-time migrations** - Runs during Vercel build if DATABASE_URL is available
2. **Post-deployment API** - Secure endpoint to run migrations after deployment
3. **Runtime fallback** - Automatic migration detection and execution (optional)
4. **Manual trigger** - Script to manually trigger post-deployment migrations

## Setup Instructions

### 1. Vercel Environment Variables

Add these environment variables to your Vercel project:

**Production Environment Variables:**
```
ADMIN_MIGRATION_KEY=your-secure-random-key-here
AUTO_MIGRATE_ON_STARTUP=true
DATABASE_URL=your-production-database-url
```

**Optional for monitoring:**
```
NEXT_PUBLIC_ADMIN_MIGRATION_KEY=your-secure-random-key-here
```

### 2. Generate Admin Migration Key

Generate a secure key for the migration API:

```bash
# Generate a secure key
openssl rand -base64 32
```

Use this key for the `ADMIN_MIGRATION_KEY` environment variable.

### 3. Vercel Configuration

The `vercel.json` has been updated to:
- Allow 60 seconds timeout for migration endpoint
- Maintain existing function configurations

## Usage

### Automatic (Recommended)

The system will automatically:
1. Try to run migrations during build
2. Check migration status on app startup
3. Run migrations automatically if `AUTO_MIGRATE_ON_STARTUP=true`

### Manual Post-Deployment

If you need to manually trigger migrations after deployment:

```bash
# Set environment variables
export VERCEL_URL="your-app.vercel.app"
export ADMIN_MIGRATION_KEY="your-key"

# Run post-deployment migrations
npm run db:post-deploy
```

### API Endpoints

**Check Migration Status:**
```
GET /api/admin/migrate
Authorization: Bearer YOUR_ADMIN_MIGRATION_KEY
```

**Run Migrations:**
```
POST /api/admin/migrate
Authorization: Bearer YOUR_ADMIN_MIGRATION_KEY
```

## Security

- Migration endpoints require authentication via `ADMIN_MIGRATION_KEY`
- Keys should be stored as Vercel environment variables
- Never commit keys to the repository
- The client-side migration checker only provides status information

## Troubleshooting

### OAuth Issues After Deployment

If you see OAuth callback errors:

1. Check migration status:
   ```bash
   curl -H "Authorization: Bearer YOUR_KEY" https://your-app.vercel.app/api/admin/migrate
   ```

2. Run migrations manually:
   ```bash
   curl -X POST -H "Authorization: Bearer YOUR_KEY" https://your-app.vercel.app/api/admin/migrate
   ```

### Build Logs

During Vercel build, check for these messages:
- ✅ "Migrations deployed" - Migrations ran successfully
- ⚠️ "DATABASE_URL not found during build" - Migrations skipped, will run at runtime
- ❌ Migration errors - Check environment variables and database access

### Runtime Logs

In production console, look for:
- ✅ "Database schema verified" - All good
- ⚠️ "Database schema verification failed, attempting to run migrations" - Auto-fix in progress
- ❌ "Failed to run automatic migrations" - Manual intervention needed

## Files Added/Modified

- `app/api/admin/migrate/route.ts` - Migration API endpoint
- `lib/runtime-migrations.ts` - Enhanced with auto-migration capability
- `components/migration-checker.tsx` - Client-side status checker
- `scripts/post-deploy-migrate.js` - Manual migration trigger script
- `vercel.json` - Updated with migration endpoint configuration
- `package.json` - Added `db:post-deploy` script

## Best Practices

1. **Always test migrations in staging first**
2. **Keep `AUTO_MIGRATE_ON_STARTUP=true` in production**
3. **Monitor deployment logs for migration status**
4. **Have the manual migration script ready as backup**
5. **Regularly rotate the `ADMIN_MIGRATION_KEY`**

## Emergency Recovery

If the system fails completely:

1. Connect to production database directly
2. Run migrations manually:
   ```bash
   DATABASE_URL="your-prod-url" npx prisma migrate deploy
   ```
3. Restart the Vercel deployment to clear any cached issues

This system should prevent future OAuth issues by ensuring database migrations are always applied during deployment.