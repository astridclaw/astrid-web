# Authentication System

This document outlines the authentication setup and important configuration details to prevent regressions.

## Overview

The application uses **NextAuth.js** with **JWT sessions** supporting two authentication methods:
- **Google OAuth** - Social login with Google accounts
- **Credentials** - Email/password authentication

## Critical Configuration

### ⚠️ **MUST USE JWT SESSIONS**

The system **MUST** use JWT sessions (`strategy: "jwt"`), not database sessions. This is critical for credentials authentication to work properly.

```typescript
// lib/auth-config.ts
session: {
  strategy: "jwt",  // ← CRITICAL: Must be "jwt", not "database"
  maxAge: 30 * 24 * 60 * 60, // 30 days
}
```

### Required Callbacks

Both JWT and session callbacks are required:

```typescript
callbacks: {
  jwt: ({ token, user, account }) => {
    // Store user data in JWT token on first signin
    if (user && account) {
      token.id = user.id
      token.provider = account.provider
      token.email = user.email
      token.name = user.name
      token.image = user.image
    }
    return token
  },
  session: ({ session, token }) => {
    // Pass JWT data to session object
    if (session?.user && token) {
      session.user.id = token.id as string
      session.user.email = token.email as string
      session.user.name = token.name as string
      session.user.image = token.image as string
    }
    return session
  }
}
```

### React Signin Form

The signin form **MUST NOT** use `redirect: false` with credentials. Let NextAuth handle redirects:

```typescript
// ✅ CORRECT
const result = await signIn("credentials", {
  email,
  password,
  callbackUrl: "/",
})

// ❌ WRONG - Breaks with JWT sessions
const result = await signIn("credentials", {
  email,
  password,
  redirect: false,  // ← Don't use this
})
```

## Environment Variables

Required environment variables:

```bash
NEXTAUTH_URL=http://localhost:3000  # Must match actual port
NEXTAUTH_SECRET=your-secret-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
DATABASE_URL=postgresql://...
```

## Provider Configuration

### Google OAuth Provider
```typescript
GoogleProvider({
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  authorization: {
    params: {
      prompt: "consent",
      access_type: "offline",
      response_type: "code"
    }
  }
})
```

### Credentials Provider
```typescript
CredentialsProvider({
  name: "credentials",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Password", type: "password" }
  },
  async authorize(credentials) {
    // Validate email/password against database
    // Return user object or null
  }
})
```

## Custom Adapter

The system uses a custom Prisma adapter that:
- Prevents duplicate user creation for OAuth
- Handles email case normalization
- **Note:** Database session creation in custom adapter is not needed with JWT strategy

## Testing

### Smoke Test
Run the authentication smoke test to verify the system is working:

```bash
DATABASE_URL="postgresql://..." npx tsx scripts/test-auth-smoke.ts
```

### Unit Tests
```bash
npm test tests/auth.test.ts
npm test tests/auth-api.test.ts
```

## Common Issues & Solutions

### Issue: "Invalid CSRF token" or redirect loops
**Cause:** Usually port mismatch between `NEXTAUTH_URL` and actual server port  
**Solution:** Ensure `NEXTAUTH_URL` matches the actual development server port

### Issue: Credentials authentication not working
**Cause:** Using database sessions instead of JWT sessions  
**Solution:** Verify `session.strategy` is set to `"jwt"` in auth config

### Issue: Session not persisting after credentials login  
**Cause:** Missing or incorrect JWT/session callbacks  
**Solution:** Ensure both JWT and session callbacks are properly implemented

### Issue: "User already exists" but can't sign in
**Cause:** Password not properly stored or validated  
**Solution:** Check bcrypt hashing/comparison in credentials provider

## Database Schema

Users table must include:
- `id` (string, primary key)
- `email` (string, unique)  
- `password` (string, optional - for credentials auth)
- `name` (string, optional)
- `image` (string, optional)
- Standard NextAuth fields for OAuth support

## Security Notes

- Passwords are hashed with bcrypt (12 rounds)
- Email addresses are normalized to lowercase
- JWT tokens are encrypted with NEXTAUTH_SECRET
- CSRF protection is enabled by default
- Rate limiting is applied to signup endpoint

## Debugging

Enable debug mode in development:
```typescript
debug: process.env.NODE_ENV === "development"
```

Check console logs for:
- `[Auth] JWT callback:` - JWT token creation
- `[Auth] Session callback (JWT):` - Session object creation  
- `[Auth] Authentication successful for:` - Credentials validation
- `[Auth] SignIn event:` - Successful signin events

## Version History

- **v2.0** - Switched to JWT sessions (CURRENT)
- **v1.0** - Database sessions (DEPRECATED - caused credentials auth issues)