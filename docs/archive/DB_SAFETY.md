# Database Safety Guidelines

## ⚠️ CRITICAL: Database Safety Rules

### NEVER RUN THESE COMMANDS ON PRODUCTION:
- `prisma migrate reset`
- `prisma db push --force-reset`
- `npm run db:reset:unsafe`
- Any command that deletes data without confirmation

### Production Database Protection

1. **Automatic Safety Checks**: All destructive database commands now include safety checks that:
   - Detect production database URLs (containing 'prod', 'production', cloud provider domains)
   - Require explicit confirmation for destructive operations
   - Create backups before dangerous operations (when possible)

2. **Safe Commands to Use**:
   - `npm run db:backup` - Creates a backup of the current database
   - `npm run db:safety-check` - Checks if current DATABASE_URL is production
   - `npm run db:reset` - Safe reset with multiple confirmations and backup attempt
   - `npm run db:migrate` - Safe for development
   - `npm run db:deploy` - Safe for production (applies migrations without data loss)

3. **Environment Variables**:
   - `DATABASE_URL` - Your database connection string
   - `ALLOW_PRODUCTION_DESTRUCTIVE=true` - Override safety check (USE WITH EXTREME CAUTION)

### Development vs Production

**Development Database URL Example:**
```
DATABASE_URL="postgresql://postgres:password@localhost:5432/astrid_dev"
```

**Production Database URL Examples (PROTECTED):**
```
DATABASE_URL="postgresql://user:pass@db.amazonaws.com:5432/astrid_prod"
DATABASE_URL="postgresql://user:pass@db.supabase.co:5432/postgres"
DATABASE_URL="postgresql://user:pass@db.neon.tech/astrid"
```

### Before Any Database Reset:

1. **Always backup first**: `npm run db:backup`
2. **Check which database**: `npm run db:safety-check`
3. **Use safe reset**: `npm run db:reset` (includes confirmations)
4. **Never use**: `npm run db:reset:unsafe` on production

### Recovery from Accidental Data Loss:

1. Check `backups/` directory for recent backups
2. Restore using: `psql $DATABASE_URL < backups/backup-file.sql`
3. Or restore JSON backup using custom restore script

### Best Practices:

1. **Separate Environment Files**:
   - `.env.local` for development (gitignored)
   - `.env.production` for production (never commit)

2. **Use Different Database Names**:
   - Development: `astrid_dev`
   - Staging: `astrid_staging`
   - Production: `astrid_prod` or `astrid_production`

3. **Regular Backups**:
   - Run `npm run db:backup` before major changes
   - Set up automated backups for production
   - Store backups in a safe location (not in the repo)

## Emergency Contacts

If you accidentally delete production data:
1. DON'T PANIC
2. Check backups/ directory immediately
3. Contact your database provider's support if hosted
4. Restore from the most recent backup

Remember: **It's better to be overly cautious than to lose user data!**