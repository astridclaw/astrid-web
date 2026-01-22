# MCP to Astrid API Migration Plan

**Status**: In Progress
**Started**: 2025-11-07
**Goal**: Transform "MCP" (Model Context Protocol) into a properly-named, OAuth-enabled "Astrid API"

---

## Executive Summary

The current "MCP" implementation is actually a comprehensive REST API serving multiple clients (iOS app, web app, AI agents). The name "Model Context Protocol" is misleading and confusing. This plan migrates to:

1. **Clear naming**: "Astrid API" instead of "MCP"
2. **Standard OAuth 2.0**: Proper authentication flows
3. **RESTful patterns**: Resource-based routes with HTTP verbs
4. **Better architecture**: Clean separation of concerns
5. **Full backward compatibility**: During migration period

---

## Current State Analysis

### What "MCP" Actually Is
- ✅ Full REST API at `/api/mcp/operations`
- ✅ 30+ operations (tasks, lists, comments, members, attachments, GitHub)
- ✅ Multiple auth methods (tokens + session cookies)
- ✅ Used by 3 clients: iOS app, web app, AI agents

### Problems with Current Implementation
- ❌ Name "MCP" implies AI-only, but it's used by iOS app
- ❌ Single endpoint pattern instead of RESTful resources
- ❌ Manual token management instead of OAuth
- ❌ Confusing documentation mixing AI agents with mobile clients
- ❌ No standard OAuth flows for third-party integrations

---

## Migration Phases

## Phase 1: OAuth + API Architecture ✅ IN PROGRESS

### 1.1 OAuth 2.0 Authentication Infrastructure

**Goal**: Implement standard OAuth 2.0 flows

**New Database Schema**:
```prisma
model OAuthClient {
  id            String   @id @default(cuid())
  clientId      String   @unique
  clientSecret  String   // Hashed
  name          String
  description   String?
  userId        String
  user          User     @relation(fields: [userId], references: [id])

  // OAuth configuration
  redirectUris  String[]
  grantTypes    String[] // ["client_credentials", "authorization_code", "refresh_token"]
  scopes        String[] // ["tasks:read", "tasks:write", "lists:read", etc.]

  // Metadata
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  lastUsedAt    DateTime?

  tokens        OAuthToken[]
  @@index([userId])
}

model OAuthToken {
  id              String   @id @default(cuid())
  accessToken     String   @unique
  refreshToken    String?  @unique
  tokenType       String   @default("Bearer")

  clientId        String
  client          OAuthClient @relation(fields: [clientId], references: [id])
  userId          String
  user            User     @relation(fields: [userId], references: [id])

  scopes          String[]
  expiresAt       DateTime
  refreshExpiresAt DateTime?

  createdAt       DateTime @default(now())
  revokedAt       DateTime?

  @@index([userId])
  @@index([clientId])
  @@index([accessToken])
}

model OAuthAuthorizationCode {
  id            String   @id @default(cuid())
  code          String   @unique
  clientId      String
  userId        String
  redirectUri   String
  scopes        String[]
  expiresAt     DateTime
  usedAt        DateTime?
  createdAt     DateTime @default(now())

  @@index([code])
}
```

**OAuth Flows to Implement**:

1. **Client Credentials Flow** (iOS app, server-to-server)
```typescript
POST /api/v1/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id={client_id}
&client_secret={client_secret}
&scope=tasks:read tasks:write lists:read lists:write

Response:
{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "tasks:read tasks:write lists:read lists:write"
}
```

2. **Authorization Code Flow** (Third-party integrations)
```typescript
// Step 1: Authorization request
GET /api/v1/oauth/authorize?
  response_type=code
  &client_id={client_id}
  &redirect_uri={redirect_uri}
  &scope=tasks:read lists:read
  &state={random_state}

// User approves, redirected to:
{redirect_uri}?code={auth_code}&state={random_state}

// Step 2: Exchange code for token
POST /api/v1/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code={auth_code}
&redirect_uri={redirect_uri}
&client_id={client_id}
&client_secret={client_secret}

Response:
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "tasks:read lists:read"
}
```

3. **Refresh Token Flow**
```typescript
POST /api/v1/oauth/token

grant_type=refresh_token
&refresh_token={refresh_token}
&client_id={client_id}
&client_secret={client_secret}
```

**Files to Create**:
- `lib/oauth/oauth-service.ts` - OAuth business logic
- `lib/oauth/oauth-client-manager.ts` - Client registration/management
- `lib/oauth/oauth-token-manager.ts` - Token generation/validation
- `lib/oauth/oauth-scopes.ts` - Scope definitions and validation
- `app/api/v1/oauth/token/route.ts` - Token endpoint
- `app/api/v1/oauth/authorize/route.ts` - Authorization endpoint
- `app/api/v1/oauth/revoke/route.ts` - Token revocation

### 1.2 Unified API Authentication Middleware

**Goal**: Single middleware supporting all auth methods

**Implementation**:
```typescript
// lib/api-auth-middleware.ts

export type AuthSource = 'oauth' | 'session' | 'legacy_mcp'

export interface AuthContext {
  userId: string
  source: AuthSource
  scopes?: string[]
  clientId?: string
  isAIAgent?: boolean
}

export async function authenticateAPI(
  req: NextRequest
): Promise<AuthContext> {
  // Priority 1: OAuth token (new standard)
  const oauthToken = extractOAuthToken(req)
  if (oauthToken) {
    const validated = await validateOAuthToken(oauthToken)
    if (validated) {
      return {
        userId: validated.userId,
        source: 'oauth',
        scopes: validated.scopes,
        clientId: validated.clientId,
        isAIAgent: validated.user.isAIAgent
      }
    }
  }

  // Priority 2: Session cookie (web users)
  const session = await getServerSession(authConfig)
  if (session?.user?.id) {
    return {
      userId: session.user.id,
      source: 'session',
      scopes: ['*'], // Full access for session users
    }
  }

  // Priority 3: Legacy MCP token (deprecated, backward compat)
  const mcpToken = extractMCPToken(req)
  if (mcpToken) {
    const validated = await validateMCPToken(mcpToken)
    if (validated) {
      console.warn('[API Auth] Legacy MCP token used - please migrate to OAuth')
      return {
        userId: validated.userId,
        source: 'legacy_mcp',
        scopes: ['*'], // Legacy tokens have full access
      }
    }
  }

  throw new UnauthorizedError('No valid authentication found')
}

// Scope validation helper
export function requireScopes(
  auth: AuthContext,
  requiredScopes: string[]
): void {
  if (auth.scopes?.includes('*')) return // Full access

  const hasAllScopes = requiredScopes.every(
    scope => auth.scopes?.includes(scope)
  )

  if (!hasAllScopes) {
    throw new ForbiddenError(
      `Missing required scopes: ${requiredScopes.join(', ')}`
    )
  }
}
```

**Files to Create**:
- `lib/api-auth-middleware.ts` - Main authentication middleware
- `lib/api-errors.ts` - Standard API error classes
- `lib/oauth/token-extractor.ts` - Extract tokens from various sources
- `lib/oauth/token-validator.ts` - Validate OAuth tokens

### 1.3 RESTful API v1 Routes Structure

**Goal**: Replace single `/api/mcp/operations` with resource-based routes

**New Route Structure**:
```
app/api/v1/
├── tasks/
│   ├── route.ts                 # GET /api/v1/tasks (list), POST (create)
│   ���── [id]/
│   │   ├── route.ts            # GET /api/v1/tasks/:id, PUT (update), DELETE
│   │   ├── comments/route.ts   # GET /api/v1/tasks/:id/comments, POST
│   │   └── attachments/route.ts
├── lists/
│   ├── route.ts                 # GET /api/v1/lists, POST
│   ├── [id]/
│   │   ├── route.ts            # GET /api/v1/lists/:id, PUT, DELETE
│   │   ├── tasks/route.ts      # GET /api/v1/lists/:id/tasks
│   │   ├── members/route.ts    # GET /api/v1/lists/:id/members, POST
│   │   └── copy/route.ts       # POST /api/v1/lists/:id/copy
├── comments/
│   └── [id]/route.ts           # DELETE /api/v1/comments/:id
├── users/
│   ├── me/
│   │   ├── route.ts            # GET /api/v1/users/me
│   │   ├── tasks/route.ts      # GET /api/v1/users/me/tasks
│   │   ├── lists/route.ts      # GET /api/v1/users/me/lists
│   │   └── settings/route.ts   # GET /api/v1/users/me/settings, PUT
├── oauth/
│   ├── token/route.ts          # POST /api/v1/oauth/token
│   ├── authorize/route.ts      # GET /api/v1/oauth/authorize
│   └── revoke/route.ts         # POST /api/v1/oauth/revoke
└── public/
    └── lists/route.ts           # GET /api/v1/public/lists
```

**Migration Strategy**:
- Keep `/api/mcp/operations` working (proxies to v1 routes)
- Add deprecation warnings in responses
- Sunset after 6 months (or when all clients migrated)

**Example v1 Route Implementation**:
```typescript
// app/api/v1/tasks/route.ts

export async function GET(req: NextRequest) {
  const auth = await authenticateAPI(req)
  requireScopes(auth, ['tasks:read'])

  const url = new URL(req.url)
  const filters = {
    listId: url.searchParams.get('listId'),
    completed: url.searchParams.get('completed') === 'true',
    priority: url.searchParams.get('priority'),
  }

  const tasks = await tasksController.getTasks(auth.userId, filters)

  return NextResponse.json({
    tasks,
    meta: {
      apiVersion: 'v1',
      authSource: auth.source
    }
  })
}

export async function POST(req: NextRequest) {
  const auth = await authenticateAPI(req)
  requireScopes(auth, ['tasks:write'])

  const body = await req.json()
  const task = await tasksController.createTask(auth.userId, body)

  return NextResponse.json({ task }, { status: 201 })
}
```

### 1.4 Scope System

**Standard Scopes**:
```typescript
// lib/oauth/oauth-scopes.ts

export const OAUTH_SCOPES = {
  // Task scopes
  'tasks:read': 'Read tasks',
  'tasks:write': 'Create and update tasks',
  'tasks:delete': 'Delete tasks',

  // List scopes
  'lists:read': 'Read lists',
  'lists:write': 'Create and update lists',
  'lists:delete': 'Delete lists',
  'lists:manage_members': 'Manage list members',

  // Comment scopes
  'comments:read': 'Read comments',
  'comments:write': 'Create comments',
  'comments:delete': 'Delete comments',

  // User scopes
  'user:read': 'Read user profile',
  'user:write': 'Update user settings',

  // Special scopes
  '*': 'Full access (internal use only)',
} as const

export type OAuthScope = keyof typeof OAUTH_SCOPES

// Scope groups for common use cases
export const SCOPE_GROUPS = {
  // iOS app needs full task/list management
  mobile_app: [
    'tasks:read', 'tasks:write', 'tasks:delete',
    'lists:read', 'lists:write', 'lists:delete', 'lists:manage_members',
    'comments:read', 'comments:write', 'comments:delete',
    'user:read', 'user:write'
  ],

  // Read-only access for monitoring tools
  readonly: [
    'tasks:read', 'lists:read', 'comments:read', 'user:read'
  ],

  // AI agents need task/comment access
  ai_agent: [
    'tasks:read', 'tasks:write',
    'lists:read',
    'comments:read', 'comments:write'
  ],
}
```

---

## Phase 2: iOS App Migration

### 2.1 OAuth Integration for iOS

**Goal**: Replace manual token management with OAuth client credentials

**Files to Update**:
- `ios-app/Astrid App/Core/Networking/MCPClient.swift` → Rename to `AstridAPIClient.swift`
- Create `ios-app/Astrid App/Core/Authentication/OAuthManager.swift`

**Implementation**:
```swift
// OAuthManager.swift - New file

class OAuthManager {
    static let shared = OAuthManager()

    private let clientId: String
    private let clientSecret: String
    private var accessToken: String?
    private var tokenExpiresAt: Date?

    private init() {
        // Load from secure config or keychain
        self.clientId = Config.oauthClientId
        self.clientSecret = Config.oauthClientSecret
    }

    func getAccessToken() async throws -> String {
        // Return cached token if still valid
        if let token = accessToken,
           let expiresAt = tokenExpiresAt,
           expiresAt > Date().addingTimeInterval(60) { // 1 min buffer
            return token
        }

        // Refresh token
        return try await refreshAccessToken()
    }

    private func refreshAccessToken() async throws -> String {
        let url = URL(string: "\(Constants.API.baseURL)/api/v1/oauth/token")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        let body = "grant_type=client_credentials&client_id=\(clientId)&client_secret=\(clientSecret)&scope=\(scopeString)"
        request.httpBody = body.data(using: .utf8)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw OAuthError.tokenRequestFailed
        }

        let tokenResponse = try JSONDecoder().decode(OAuthTokenResponse.self, from: data)

        self.accessToken = tokenResponse.accessToken
        self.tokenExpiresAt = Date().addingTimeInterval(TimeInterval(tokenResponse.expiresIn))

        return tokenResponse.accessToken
    }

    private var scopeString: String {
        SCOPE_GROUPS.mobile_app.joined(separator: " ")
    }
}

struct OAuthTokenResponse: Codable {
    let accessToken: String
    let tokenType: String
    let expiresIn: Int
    let scope: String

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case tokenType = "token_type"
        case expiresIn = "expires_in"
        case scope
    }
}
```

**Update AstridAPIClient.swift**:
```swift
// Changes to make:
// 1. Rename file from MCPClient.swift to AstridAPIClient.swift
// 2. Replace manual token with OAuth manager
// 3. Update all endpoint URLs from /api/mcp/operations to /api/v1/*

private func executeMCPOperation<T: Codable>(
    operation: String,
    args: [String: Any]
) async throws -> T {
    // OLD: let token = mcpToken
    // NEW: Get OAuth token automatically
    let token = try await OAuthManager.shared.getAccessToken()

    // OLD: POST /api/mcp/operations
    // NEW: Use RESTful endpoints based on operation
    let endpoint = mapOperationToEndpoint(operation, args)

    // ... rest of implementation
}

private func mapOperationToEndpoint(
    _ operation: String,
    _ args: [String: Any]
) -> (url: URL, method: String) {
    switch operation {
    case "get_user_tasks":
        return (
            URL(string: "\(baseURL)/api/v1/users/me/tasks")!,
            "GET"
        )
    case "create_task":
        return (
            URL(string: "\(baseURL)/api/v1/tasks")!,
            "POST"
        )
    case "update_task":
        let taskId = args["taskId"] as! String
        return (
            URL(string: "\(baseURL)/api/v1/tasks/\(taskId)")!,
            "PUT"
        )
    // ... map all operations
    }
}
```

### 2.2 iOS Configuration

**Add OAuth credentials to iOS app**:
```swift
// Config.swift or Constants.swift
struct OAuthConfig {
    static let clientId: String = {
        // Load from Info.plist or environment
        guard let id = Bundle.main.object(forInfoDictionaryKey: "OAUTH_CLIENT_ID") as? String else {
            fatalError("OAUTH_CLIENT_ID not configured")
        }
        return id
    }()

    static let clientSecret: String = {
        // In production, fetch from secure backend endpoint
        // For now, embed securely
        guard let secret = Bundle.main.object(forInfoDictionaryKey: "OAUTH_CLIENT_SECRET") as? String else {
            fatalError("OAUTH_CLIENT_SECRET not configured")
        }
        return secret
    }()
}
```

**Info.plist**:
```xml
<key>OAUTH_CLIENT_ID</key>
<string>astrid_ios_app</string>
<key>OAUTH_CLIENT_SECRET</key>
<string>${OAUTH_CLIENT_SECRET}</string> <!-- From Xcode build settings -->
```

---

## Phase 3: Web App Updates

### 3.1 Rename Settings Pages

**Files to rename**:
```bash
app/settings/mcp-access/       → app/settings/api-access/
app/settings/mcp-testing/      → app/settings/api-testing/
app/settings/mcp-operations/   → app/settings/api-explorer/
```

### 3.2 Update UI Components

**Files to update**:
```bash
components/mcp-token-manager.tsx       → components/api-token-manager.tsx
components/mcp-token-manager-user.tsx  → components/api-access-settings.tsx
components/mcp-list-settings-modal.tsx → components/api-list-settings-modal.tsx
components/mcp-crud-viewer.tsx         → components/api-explorer.tsx
```

**UI Copy Updates**:
- "MCP Access" → "API Access"
- "MCP Token" → "API Token" or "Access Token"
- "Model Context Protocol" → "Astrid API"
- "MCP Operations" → "API Explorer"

### 3.3 OAuth App Management UI

**New Component**: `components/oauth-app-manager.tsx`
```typescript
// Features:
// - Register new OAuth applications
// - View client credentials
// - Configure redirect URIs
// - Set allowed scopes
// - View/revoke tokens
// - Monitor API usage
```

**New Page**: `app/settings/oauth-apps/page.tsx`

---

## Phase 4: Documentation Updates

### 4.1 Files to Update or Rename

**Documentation files**:
```bash
# Rename
docs/testing/MCP_TESTING_GUIDE.md → docs/testing/API_TESTING_GUIDE.md
docs/archive/MCP_V2_IMPLEMENTATION_GUIDE.md → docs/archive/API_V2_MIGRATION.md
mcp/README.md → api/README.md
docs/MCP_TASK_COMMENT_TROUBLESHOOTING.md → docs/API_TROUBLESHOOTING.md

# Update content (30+ files reference "MCP")
CLAUDE.md - Update all MCP references to API
docs/ARCHITECTURE.md - Update MCP section to "Astrid API"
docs/ai-agents/*.md - Clarify MCP vs API terminology
ios-app/**/*.md - Update iOS docs to reference API instead of MCP
```

### 4.2 New Documentation to Create

**API Reference**:
- `docs/api/README.md` - API overview
- `docs/api/AUTHENTICATION.md` - OAuth flows and migration guide
- `docs/api/ENDPOINTS.md` - Complete endpoint reference
- `docs/api/SCOPES.md` - Scope system documentation
- `docs/api/MIGRATION_FROM_MCP.md` - Migration guide

**OpenAPI Specification**:
- `docs/api/openapi.yaml` - Complete OpenAPI 3.0 spec

---

## Phase 5: Testing Strategy

### 5.1 Migration Tests

**Test dual authentication**:
```typescript
// tests/api/auth-compatibility.test.ts

describe('API Authentication Compatibility', () => {
  it('accepts OAuth tokens', async () => {
    const token = await createOAuthToken({ scopes: ['tasks:read'] })
    const response = await fetch('/api/v1/tasks', {
      headers: { Authorization: `Bearer ${token}` }
    })
    expect(response.status).toBe(200)
  })

  it('accepts session cookies (web users)', async () => {
    const session = await createUserSession()
    const response = await fetch('/api/v1/tasks', {
      headers: { Cookie: session.cookie }
    })
    expect(response.status).toBe(200)
  })

  it('accepts legacy MCP tokens (deprecated)', async () => {
    const mcpToken = await createLegacyMCPToken()
    const response = await fetch('/api/v1/tasks', {
      headers: { 'X-MCP-Access-Token': mcpToken }
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('X-Deprecation-Warning')).toBeDefined()
  })
})
```

### 5.2 OAuth Flow Tests

```typescript
// tests/oauth/client-credentials.test.ts
// tests/oauth/authorization-code.test.ts
// tests/oauth/token-refresh.test.ts
// tests/oauth/scope-validation.test.ts
```

### 5.3 iOS Integration Tests

```swift
// ios-app/Astrid AppTests/OAuthManagerTests.swift
// ios-app/Astrid AppTests/AstridAPIClientTests.swift
```

### 5.4 E2E Tests

```typescript
// e2e/api-access-settings.spec.ts - Test OAuth app creation UI
// e2e/api-migration.spec.ts - Test backward compatibility
```

---

## Phase 6: Migration Timeline

### Month 1: Foundation (Weeks 1-4)
- ✅ Week 1: OAuth infrastructure + database schema
- ✅ Week 2: API v1 routes + authentication middleware
- Week 3: Testing infrastructure
- Week 4: Documentation + migration guides

### Month 2: Client Updates (Weeks 5-8)
- Week 5: iOS app OAuth integration
- Week 6: Web UI updates (rename pages, OAuth app management)
- Week 7: Update all documentation files
- Week 8: Comprehensive testing

### Month 3: Deprecation Warnings (Weeks 9-12)
- Add deprecation headers to legacy MCP endpoints
- Monitor usage metrics
- Reach out to any external integrations
- Final testing and validation

### Month 4+: Optional Sunset
- Evaluate if legacy MCP tokens can be fully removed
- If all clients migrated, remove legacy code
- Otherwise, maintain dual support indefinitely

---

## Success Metrics

### Technical Metrics
- [ ] All API endpoints support OAuth authentication
- [ ] iOS app uses OAuth (no manual token management)
- [ ] Web app OAuth app management UI complete
- [ ] 100% test coverage for OAuth flows
- [ ] All documentation updated
- [ ] Zero breaking changes for existing clients

### User Experience Metrics
- [ ] Clear API documentation published
- [ ] OAuth flow < 30 seconds for developers
- [ ] iOS app seamless token management (invisible to users)
- [ ] API explorer UI for testing endpoints

### Migration Metrics
- [ ] 0% error rate during migration
- [ ] Legacy MCP tokens still work (backward compat)
- [ ] No user-facing disruption

---

## Rollback Plan

If critical issues arise:

1. **Immediate**: Disable new OAuth endpoints (keep legacy working)
2. **Short-term**: Fix issues, deploy patch
3. **Long-term**: Resume migration after validation

---

## Related Documentation

- [API Testing Guide](../testing/API_TESTING_GUIDE.md) (to be created)
- [OAuth Implementation Details](../api/AUTHENTICATION.md) (to be created)
- [Architecture Overview](../ARCHITECTURE.md)
- [iOS Migration Guide](../../ios-app/API_MIGRATION.md) (to be created)

---

## Appendix: Terminology Changes

| Old Term | New Term | Context |
|----------|----------|---------|
| MCP | Astrid API | General API reference |
| MCP Token | API Token / Access Token | Authentication tokens |
| MCP Operations | API Endpoints | Endpoint references |
| MCP Access | API Access | Settings pages |
| MCP Client | API Client | Client libraries |
| Model Context Protocol | Astrid API | User-facing documentation |

---

**Last Updated**: 2025-11-07
**Next Review**: After Phase 1 completion
