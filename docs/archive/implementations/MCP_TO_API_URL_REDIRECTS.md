# MCP → API URL Redirects

**Date**: 2025-11-08
**Status**: Complete

---

## Overview

All old "MCP" URLs have been redirected to new "API" URLs to reflect the updated terminology and branding.

---

## URL Redirects

| Old URL (MCP) | New URL (API) | Status |
|---------------|---------------|--------|
| `/settings/mcp-access` | `/settings/api-access` | ✅ Redirects |
| `/settings/mcp-testing` | `/settings/api-testing` | ✅ Redirects |
| `/settings/mcp-operations` | `/settings/api-testing` | ✅ Redirects |
| `/settings/api-explorer` | `/settings/api-testing` | ✅ Redirects |

---

## Implementation

All redirects are implemented as client-side redirects using Next.js `useRouter`:

```typescript
"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { LoadingScreen } from "@/components/loading-screen"

export default function LegacyMCPAccessPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/settings/api-access')
  }, [router])

  return <LoadingScreen message="Redirecting to API Access..." />
}
```

---

## New Page Structure

### `/settings/api-access` - OAuth App Management
**Component**: `app/settings/api-access/page.tsx`
**Features**:
- OAuth application management
- API overview and documentation
- Scope selection
- Client credential display

### `/settings/api-testing` - API Testing & Operations
**Component**: `app/settings/api-testing/page.tsx`
**Features**:
- API operations testing
- CRUD operation examples
- Request/response viewer
- Token testing

---

## Settings Navigation Updates

### Updated Entry
```typescript
{
  icon: Network,
  title: "API Access",  // Previously "MCP Access"
  description: "OAuth applications and API integrations",
  path: "/settings/api-access",  // Previously "/settings/mcp-access"
  color: "text-blue-600"
}
```

**Location**: `app/settings/page.tsx`

---

## User Impact

### For Existing Users
- All old bookmarks and links **automatically redirect** to new pages
- No manual URL updates required
- Seamless transition with loading message

### For Documentation
- All internal links should be updated to use new URLs
- External documentation may need updates
- Search engines will index new URLs naturally

---

## Backward Compatibility

**Old URLs continue to work indefinitely:**
- ✅ `/settings/mcp-access` → redirects to `/settings/api-access`
- ✅ `/settings/mcp-testing` → redirects to `/settings/api-testing`
- ✅ `/settings/mcp-operations` → redirects to `/settings/api-testing`

**No breaking changes** - all old URLs are preserved via redirects.

---

## Testing

### Test Redirects
```bash
# Visit old URLs in browser to verify redirect:
http://localhost:3000/settings/mcp-access
http://localhost:3000/settings/mcp-testing
http://localhost:3000/settings/mcp-operations

# All should redirect to new /api-* URLs
```

### Expected Behavior
1. User visits old `/settings/mcp-access`
2. Loading screen: "Redirecting to API Access..."
3. Automatically redirected to `/settings/api-access`
4. New page loads immediately

---

## API Endpoints (Unchanged)

**Note**: API endpoints themselves are **NOT redirected**. We support both:

### Legacy Endpoint (Deprecated)
```
POST /api/mcp/operations
```
- ✅ Still works
- ⚠️ Deprecation warning in response headers
- ✅ Supports OAuth, sessions, and legacy MCP tokens

### New API v1 Endpoints
```
GET  /api/v1/tasks
POST /api/v1/tasks
GET  /api/v1/lists
POST /api/v1/oauth/token
...
```
- ✅ RESTful design
- ✅ OAuth authentication
- ✅ Full functionality

---

## Files Modified

```
app/settings/mcp-access/page.tsx      → Redirect to api-access
app/settings/mcp-testing/page.tsx     → Redirect to api-testing
app/settings/mcp-operations/page.tsx  → Redirect to api-testing
app/settings/page.tsx                 → Updated nav link
```

```
app/settings/api-access/page.tsx      → Created (OAuth management)
app/settings/api-testing/page.tsx     → Created (API testing)
app/settings/api-explorer/page.tsx    → Created (redirect to testing)
```

---

## SEO Considerations

### For Production Deployment

Consider adding server-side 301 redirects in `next.config.js` for better SEO:

```javascript
// next.config.js
async redirects() {
  return [
    {
      source: '/settings/mcp-access',
      destination: '/settings/api-access',
      permanent: true, // 301 redirect
    },
    {
      source: '/settings/mcp-testing',
      destination: '/settings/api-testing',
      permanent: true,
    },
    {
      source: '/settings/mcp-operations',
      destination: '/settings/api-testing',
      permanent: true,
    },
  ]
}
```

**Current**: Client-side redirect (works, but not ideal for SEO)
**Recommended**: Add server-side 301 redirects before production

---

## Documentation Updates Needed

### Internal Links
- [ ] Update any internal documentation pointing to `/settings/mcp-*`
- [ ] Update README files
- [ ] Update tutorial screenshots

### External Links
- [ ] Update help center articles
- [ ] Update blog posts
- [ ] Update video tutorials
- [ ] Update email templates

---

## Verification Checklist

- [x] Old MCP URLs redirect correctly
- [x] New API pages load and function
- [x] Settings navigation updated
- [x] No broken links in app
- [ ] Test with real users (pending)
- [ ] Update external documentation (pending)

---

## Related Documentation

- [OAuth Phases 2 & 3 Complete](./OAUTH_PHASES_2_3_COMPLETE.md)
- [OAuth Phase 1 Complete](./OAUTH_PHASE1_COMPLETE.md)
- [Migration Plan](./MCP_TO_API_MIGRATION_PLAN.md)

---

**Last Updated**: 2025-11-08
**Status**: ✅ Complete - All redirects working
