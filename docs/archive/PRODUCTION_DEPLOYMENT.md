# Production Deployment Guide

This guide covers deploying the Astrid Task Manager to production with a remote PostgreSQL database.

## 🎯 **Prerequisites**

Before deploying to production, ensure you have:
- ✅ **PostgreSQL Database** (Vercel Postgres, Neon, Supabase, etc.)
- ✅ **Vercel Account** and project setup
- ✅ **Google OAuth Credentials** configured for production domain
- ✅ **Environment Variables** ready for production

## 🚀 **Quick Production Deployment**

### Step 1: Set Up Production Database

#### Option A: Vercel Postgres (Recommended)
```bash
# In Vercel dashboard
1. Go to Storage tab
2. Create Postgres database
3. Choose plan (Hobby is free)
4. Copy connection string to DATABASE_URL
```

#### Option B: External Database Provider
```bash
# Set up with your preferred provider:
# - Neon (neon.tech) - Free tier available
# - Supabase (supabase.com) - Free tier + features
# - Railway (railway.app) - Free tier available
# - PlanetScale (planetscale.com) - Free tier available
```

### Step 2: Deploy Database Schema

```bash
# Run the production deployment script
npm run db:deploy-production

# This will:
# 1. Generate Prisma client
# 2. Connect to production database
# 3. Deploy all tables and schema
# 4. Verify database operations
# 5. Display deployment checklist
```

### Step 3: Deploy to Vercel

```bash
# Push your code
git add .
git commit -m "Ready for production deployment"
git push origin main

# Vercel will automatically:
# 1. Build your application
# 2. Run prisma generate
# 3. Deploy to production
```

## 🔧 **Detailed Production Setup**

### 1. Database Configuration

#### Required Database Permissions
Your production database user needs:
```sql
-- Create database (if not exists)
CREATE DATABASE astrid_production;

-- Grant permissions to user
GRANT ALL PRIVILEGES ON DATABASE astrid_production TO your_user;
GRANT ALL PRIVILEGES ON SCHEMA public TO your_user;
GRANT CREATE ON SCHEMA public TO your_user;
```

#### Connection String Format
```bash
# Standard PostgreSQL
DATABASE_URL="postgresql://username:password@host:port/database?sslmode=require"

# Vercel Postgres
DATABASE_URL="postgresql://default:password@host:port/database?sslmode=require"

# Neon
DATABASE_URL="postgresql://user:password@host/database?sslmode=require"

# Supabase
DATABASE_URL="postgresql://postgres:password@host:port/postgres?sslmode=require"
```

### 2. Environment Variables

#### Required in Vercel Dashboard
```bash
# Database
DATABASE_URL="your-production-postgresql-url"

# Authentication
NEXTAUTH_SECRET="generate-32-char-random-string"
NEXTAUTH_URL="https://yourdomain.com"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Optional: Email
RESEND_API_KEY="re_your-resend-key"
FROM_EMAIL="noreply@yourdomain.com"
```

#### Generate NEXTAUTH_SECRET
```bash
# Generate a secure secret
openssl rand -base64 32
# or
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Google OAuth Production Setup

#### Update OAuth Credentials
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to APIs & Services → Credentials
3. Edit your OAuth 2.0 Client ID
4. Add production domain to Authorized redirect URIs:
   ```
   https://yourdomain.com/api/auth/callback/google
   ```

## 📋 **Production Deployment Checklist**

### Pre-Deployment
- [ ] **Database**: PostgreSQL instance created and accessible
- [ ] **Schema**: Database schema deployed (`npm run db:deploy-production`)
- [ ] **Environment**: All variables set in Vercel
- [ ] **OAuth**: Google credentials updated for production domain
- [ ] **Testing**: Local build passes (`npm run build`)

### Deployment
- [ ] **Code**: Pushed to main branch
- [ ] **Build**: Vercel build succeeds
- [ ] **Database**: Connection verified in production
- [ ] **Authentication**: Google OAuth working

### Post-Deployment
- [ ] **Login**: Can sign in with Google
- [ ] **Features**: All core functionality working
- [ ] **Performance**: App loads and responds quickly
- [ ] **Monitoring**: Check Vercel function logs

## 🛠 **Production Scripts**

### Database Management
```bash
# Test production database connection
npm run db:test

# Deploy schema to production
npm run db:deploy-production

# Generate Prisma client
npm run db:generate

# View database in Prisma Studio (local only)
npm run db:studio
```

### Deployment Checks
```bash
# Quick pre-deployment check
npm run predeploy:quick

# Comprehensive deployment validation
npm run predeploy:check

# Test production build
npm run predeploy:build
```

## 🔍 **Troubleshooting Production Issues**

### Common Database Errors

#### "Connection Refused"
```bash
# Check:
1. Database server is running
2. Firewall allows connections
3. Connection string is correct
4. Database exists
```

#### "Authentication Failed"
```bash
# Check:
1. Username and password are correct
2. User has necessary permissions
3. Database exists
4. SSL requirements (add ?sslmode=require)
```

#### "Permission Denied"
```bash
# Check:
1. User has CREATE privileges
2. User can create tables in public schema
3. Database ownership is correct
```

### Build Failures

#### "Prisma Client Not Generated"
```bash
# Fix:
1. Ensure DATABASE_URL is set
2. Run npm run db:generate
3. Check build script includes prisma generate
```

#### "Environment Variables Missing"
```bash
# Fix:
1. Set all required variables in Vercel
2. Verify variable names match exactly
3. Check for typos in values
```

## 📊 **Production Monitoring**

### Vercel Dashboard
- **Functions**: Monitor API route performance
- **Analytics**: Track user engagement
- **Logs**: Check for errors and issues
- **Performance**: Monitor Core Web Vitals

### Database Monitoring
- **Connection Pool**: Monitor active connections
- **Query Performance**: Check slow queries
- **Storage**: Monitor database size growth
- **Backups**: Ensure regular backups are running

## 🔒 **Production Security**

### Environment Variables
- ✅ Never commit secrets to git
- ✅ Use strong, unique secrets
- ✅ Rotate secrets periodically
- ✅ Limit access to production credentials

### Database Security
- ✅ Use SSL connections (sslmode=require)
- ✅ Implement connection pooling
- ✅ Regular security updates
- ✅ Monitor access logs

### Application Security
- ✅ All routes require authentication
- ✅ Input validation on all endpoints
- ✅ Rate limiting enabled
- ✅ CORS properly configured

## 🚨 **Emergency Procedures**

### Database Issues
```bash
# If database is down:
1. Check database provider status
2. Verify connection string
3. Test connection locally
4. Contact database support if needed
```

### Application Issues
```bash
# If app is broken:
1. Check Vercel deployment logs
2. Verify environment variables
3. Test database connection
4. Rollback to previous deployment if needed
```

### Data Recovery
```bash
# If data is lost:
1. Check database backups
2. Restore from latest backup
3. Verify data integrity
4. Update application if needed
```

## 📞 **Support Resources**

### Documentation
- [Vercel Documentation](https://vercel.com/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [NextAuth.js Documentation](https://next-auth.js.org)

### Community
- [Vercel Community](https://github.com/vercel/vercel/discussions)
- [Prisma Community](https://github.com/prisma/prisma/discussions)
- [Next.js Community](https://github.com/vercel/next.js/discussions)

### Professional Support
- **Vercel**: Enterprise support available
- **Database Providers**: Most offer 24/7 support
- **Development Team**: For custom implementations

## 🎯 **Success Metrics**

### Performance Targets
- **Page Load**: < 3 seconds
- **API Response**: < 500ms
- **Database Queries**: < 100ms
- **Uptime**: > 99.9%

### User Experience
- **Authentication**: Seamless Google OAuth
- **Task Management**: All features working
- **List Sharing**: Invitations and collaboration
- **Mobile**: Responsive on all devices

Remember: **Test thoroughly in staging before going live, and always have a rollback plan ready!**
