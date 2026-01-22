# OAuth Implementation - Quick Start Guide

**Status**: ✅ Complete and Ready for Production
**Date**: 2025-11-08

---

## TL;DR

We've successfully migrated from "MCP" to a proper "Astrid API" with OAuth 2.0 authentication. Everything works, is backward compatible, and ready for production.

---

## What Changed?

### Before
- Single endpoint: `/api/mcp/operations`
- Manual token management
- Confusing "MCP" terminology

### After
- ✅ OAuth 2.0 authentication (industry standard)
- ✅ RESTful API v1 endpoints
- ✅ Backward compatible with legacy MCP tokens
- ✅ Better naming: "Astrid API" instead of "MCP"

---

## Quick Test

```bash
# 1. Start dev server
npm run dev

# 2. In another terminal, test OAuth
npm run test:oauth
```

**Expected output**: All green checkmarks ✅

---

## For Developers

### Create an OAuth Client

```bash
POST /api/v1/oauth/clients
Content-Type: application/json

{
  "name": "My App",
  "scopes": ["tasks:read", "tasks:write"]
}
```

### Get an Access Token

```bash
POST /api/v1/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
client_id=astrid_client_...
client_secret=...
scope=tasks:read tasks:write
```

### Use the Token

```bash
GET /api/v1/tasks
Authorization: Bearer astrid_...
```

---

## Available Scopes

**Tasks**: `tasks:read`, `tasks:write`, `tasks:delete`
**Lists**: `lists:read`, `lists:write`, `lists:delete`, `lists:manage_members`
**Comments**: `comments:read`, `comments:write`, `comments:delete`
**User**: `user:read`, `user:write`
**Attachments**: `attachments:read`, `attachments:write`, `attachments:delete`
**Public**: `public:read`, `public:write`

---

## New API Endpoints

### OAuth Management
- `POST /api/v1/oauth/token` - Get access tokens
- `GET /api/v1/oauth/clients` - List your OAuth apps
- `POST /api/v1/oauth/clients` - Create OAuth app
- `DELETE /api/v1/oauth/clients/:id` - Delete OAuth app

### Tasks (RESTful)
- `GET /api/v1/tasks` - List tasks
- `POST /api/v1/tasks` - Create task
- `GET /api/v1/tasks/:id` - Get task details
- `PUT /api/v1/tasks/:id` - Update task
- `DELETE /api/v1/tasks/:id` - Delete task

### Legacy (Still Works)
- `POST /api/mcp/operations` - All operations (with deprecation warning)

---

## Backward Compatibility

**Legacy MCP tokens still work!** They will:
- ✅ Work on all endpoints
- ⚠️ Show deprecation warnings
- 📖 Include migration guide URL

No breaking changes. Existing integrations continue working.

---

## Authentication Methods Supported

The API now accepts **3 authentication methods**:

1. **OAuth tokens** (new, recommended)
   ```
   Authorization: Bearer astrid_...
   ```

2. **Session cookies** (web users)
   ```
   Cookie: next-auth.session-token=...
   ```

3. **Legacy MCP tokens** (deprecated)
   ```
   X-MCP-Access-Token: astrid_mcp_...
   ```

---

## Next Steps

### For iOS App (Phase 2)
1. Create OAuth client for iOS app
2. Implement OAuth manager
3. Replace manual token with automatic OAuth

### For Web UI (Phase 3)
1. Build OAuth app management interface
2. Rename "MCP" → "API" in UI
3. Add OAuth app creation wizard

### For Documentation (Phase 4)
1. API documentation site
2. OpenAPI specification
3. Migration guides

---

## Files Created

**Infrastructure**:
- `lib/oauth/oauth-scopes.ts`
- `lib/oauth/oauth-token-manager.ts`
- `lib/oauth/oauth-client-manager.ts`
- `lib/api-auth-middleware.ts`

**API Endpoints**:
- `app/api/v1/oauth/token/route.ts`
- `app/api/v1/oauth/clients/route.ts`
- `app/api/v1/tasks/route.ts`
- `app/api/v1/tasks/[id]/route.ts`

**Tests**:
- `tests/api/oauth-authentication.test.ts`
- `scripts/test-oauth-local.ts`

**Database**:
- `OAuthClient`, `OAuthToken`, `OAuthAuthorizationCode` tables

---

## Documentation

**Comprehensive Guides**:
- [MCP_TO_API_MIGRATION_PLAN.md](./MCP_TO_API_MIGRATION_PLAN.md) - Full 6-phase plan
- [OAUTH_PHASE1_COMPLETE.md](./OAUTH_PHASE1_COMPLETE.md) - Complete implementation details

**This File**: Quick reference for common tasks

---

## Support

**Run tests**: `npm run test:oauth`
**Check database**: `npm run db:studio`
**View API**: Start server and visit `http://localhost:3000/api/health`

---

**Phase 1 Status**: ✅ Complete
**Production Ready**: ✅ Yes
**Breaking Changes**: ❌ No
**Backward Compatible**: ✅ Yes

🎉 **Ready to ship!**
