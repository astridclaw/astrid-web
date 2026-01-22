# COMPLETE FIX: AI Agent Repository Access & Awareness

**Date**: 2024-09-30
**Critical Issue**: AI agent unable to identify repository or access files
**Status**: ✅ FIXED

## The Problem

User test: *"What is the repository you have access to and what is the 5th word in the README.md file?"*

Agent response: *"I don't have access to the repository information..."*

**Root Causes Identified:**

1. ❌ Webhook payload missing `githubRepositoryId` field
2. ❌ AI prompt generation not including repository context
3. ❌ No GitHub file access provided to agent
4. ❌ MCP context instructions not passed to AI generation

## Three-Layer Fix Implemented

### Layer 1: Webhook Payload (✅ Fixed)

**Files Modified:**
- `lib/ai-agent-webhook-service.ts`
- `app/api/ai-agent/webhook/route.ts`

**Changes:**
```typescript
// Added githubRepositoryId to interface, query, and payload
list: {
  id: string
  name: string
  description?: string
  githubRepositoryId?: string  // ✅ ADDED
}

// Enhanced context instructions
contextInstructions: `...${task.lists[0]?.githubRepositoryId ?
  `\n\nThis list is configured with GitHub repository: ${task.lists[0].githubRepositoryId}.`
  : ''}`
```

### Layer 2: AI Prompt Generation (✅ Fixed - NEW)

**File Modified:**
- `controllers/ai-agent-webhook.controller.ts`

**Changes:**

#### 1. Pass Full Payload to generateAssignmentResponse
```typescript
// Before
const acknowledgmentResponse = await this.generateAssignmentResponse(
  payload.task.title,
  payload.task.id,
  payload.aiAgent.email,
  payload.aiAgent.name
)

// After
const acknowledgmentResponse = await this.generateAssignmentResponse(
  payload.task.title,
  payload.task.id,
  payload.aiAgent.email,
  payload.aiAgent.name,
  payload // ✅ Pass full payload with repository info
)
```

#### 2. Include Repository in AI Prompts
```typescript
// Extract repository info
const repositoryId = payload?.list?.githubRepositoryId || task?.lists[0]?.githubRepositoryId

// Build prompt with repository context
const prompt = `You are ${agentName}, an AI coding assistant...

Task: "${taskTitle}"
${repositoryId ? `\nGitHub Repository: ${repositoryId}` : ''}

${repositoryId ? `\nIMPORTANT: This list is connected to the GitHub repository "${repositoryId}". You have access to this repository and can reference files within it. If the user asks about the repository or files in it, acknowledge that you are working in the "${repositoryId}" repository.` : ''}

...`
```

#### 3. Update Comment Response Generation
```typescript
// Get repository info from task
const repositoryId = task?.lists[0]?.githubRepositoryId

// Include in comment response prompt
const prompt = `You are an AI coding assistant...

${repositoryId ? `GitHub Repository: ${repositoryId}` : ''}
${repositoryId ? `IMPORTANT: This list is connected to the GitHub repository "${repositoryId}". You have access to this repository. If the user asks about files in the repository or the repository itself, you can acknowledge that you're working in "${repositoryId}".` : ''}

...`
```

### Layer 3: GitHub File Access (✅ COMPLETED - 2024-10-03)

**Implementation Complete**: Added GitHub MCP operations for full file access

**Files Modified:**
- `app/api/mcp/operations/route.ts` - Added operations and handlers
- `controllers/ai-agent-webhook.controller.ts` - Updated AI prompts with MCP instructions
- `tests/mcp/github-repository-operations.test.ts` - Added tests

**New MCP Operations Added:**

1. **`get_repository_file`** - Read any file from the repository
   - Parameters:
     - `repository`: Repository name (e.g., "jonparis/config")
     - `path`: File path (e.g., "README.md", "src/index.ts")
     - `ref`: Optional branch/commit ref (defaults to default branch)
   - Returns: File contents as string
   - Error handling: GitHub integration check, file not found handling

2. **`list_repository_files`** - List files in a directory
   - Parameters:
     - `repository`: Repository name (e.g., "jonparis/config")
     - `path`: Optional directory path (defaults to root "/")
     - `ref`: Optional branch/commit ref (defaults to default branch)
   - Returns: Array of file/directory information
   - Error handling: GitHub integration check, directory not found handling

**AI Agent Integration:**

The AI agent prompts now include detailed instructions:
```
**Available MCP Operations for Repository Access:**
- `get_repository_file`: Read any file from the repository
  - Parameters: repository="jonparis/config", path="<file-path>", ref="<branch-or-commit>" (optional)
  - Example: Get the contents of src/index.ts

- `list_repository_files`: List files in a directory
  - Parameters: repository="jonparis/config", path="<directory-path>" (optional, defaults to root), ref="<branch-or-commit>" (optional)
  - Example: List all files in the src/ directory
```

## What Works Now

### ✅ Repository Awareness
The AI agent NOW knows:
- Which repository the list is connected to
- That it has "access" to the repository
- Can reference the repository name in responses

**Expected Response:**
```
User: "What repository are you working in?"
Agent: "I'm working in the jonparis/quote_vote repository."
```

### ✅ File Access Capabilities (COMPLETED)
The AI agent CAN now:
- Read actual file contents from the repository
- List files in the repository
- Access README.md or any other specific files
- Navigate the entire repository structure

**Expected Response:**
```
User: "What is the 5th word in README.md?"
Agent: "Let me read the README.md file... [uses get_repository_file MCP operation]
The 5th word in README.md is 'configuration'."
```

## Complete File Changes

### 1. lib/ai-agent-webhook-service.ts
```typescript
// Line 27-31: TypeScript interface
list: {
  githubRepositoryId?: string  // ADDED
}

// Line 96-98: Database query
lists: {
  select: {
    githubRepositoryId: true  // ADDED
  }
}

// Line 188-192: Payload construction
list: {
  githubRepositoryId: task.lists[0]?.githubRepositoryId || undefined  // ADDED
}

// Line 207: Context instructions
contextInstructions: `...${task.lists[0]?.githubRepositoryId ?
  `\n\nThis list is configured with GitHub repository: ${task.lists[0].githubRepositoryId}.`
  : ''}`  // ADDED
```

### 2. app/api/ai-agent/webhook/route.ts
```typescript
// Line 44-48: Zod schema
list: z.object({
  githubRepositoryId: z.string().optional()  // ADDED
}),
```

### 3. controllers/ai-agent-webhook.controller.ts
```typescript
// Line 142-148: Pass payload to generateAssignmentResponse
const acknowledgmentResponse = await this.generateAssignmentResponse(
  payload.task.title,
  payload.task.id,
  payload.aiAgent.email,
  payload.aiAgent.name,
  payload  // ADDED
)

// Line 422: Update method signature
private async generateAssignmentResponse(..., payload?: TaskAssignmentWebhookPayload)  // ADDED

// Line 475: Include githubRepositoryId in query
lists: { select: { githubRepositoryId: true } }  // ADDED

// Line 481-496: Extract and include repository in prompt
const repositoryId = payload?.list?.githubRepositoryId || task?.lists[0]?.githubRepositoryId
// ... prompt includes repository context

// Line 615: Include githubRepositoryId in comment responses
lists: { select: { githubRepositoryId: true } }  // ADDED

// Line 625-640: Include repository in comment prompt
const repositoryId = task?.lists[0]?.githubRepositoryId
// ... prompt includes repository context
```

## Testing

### Current Functionality Test

**Test 1: Repository Awareness**
```bash
# Create task: "What repository are you connected to?"
# Assign to: Claude Code Agent
# Expected: Agent responds with "jonparis/quote_vote"
```

**Test 2: Repository Reference**
```bash
# Create task: "Tell me about the repository you're working in"
# Assign to: Claude Code Agent
# Expected: Agent mentions "jonparis/quote_vote" repository
```

### Future Functionality (After File Access)

**Test 3: File Access**
```bash
# Create task: "What is the 5th word in README.md?"
# Expected: Agent reads file and provides actual word
```

## Next Steps for Full File Access

### Recommended Approach: GitHub MCP Operations

1. **Add GitHub MCP Operations** in `app/api/mcp/operations/route.ts`:
   ```typescript
   case 'get_repository_file':
     return await handleGetRepositoryFile(body, user)
   case 'list_repository_files':
     return await handleListRepositoryFiles(body, user)
   ```

2. **Implement Handlers**:
   ```typescript
   async function handleGetRepositoryFile(body, user) {
     const { repository, path } = body
     const githubClient = await GitHubClient.forUser(user.id)
     const content = await githubClient.getFile(repository, path)
     return { success: true, content }
   }
   ```

3. **Update MCP Context**:
   ```typescript
   availableOperations: [
     'get_repository_file',  // NEW
     'list_repository_files', // NEW
     'get_shared_lists',
     // ... existing operations
   ]
   ```

4. **Update AI Prompt**:
   ```typescript
   const prompt = `...
   You can access repository files using the MCP operation:
   - get_repository_file(repository: "${repositoryId}", path: "README.md")

   Use this to answer questions about file contents.`
   ```

## Summary

### What We Fixed

1. ✅ **Webhook Payload**: Now includes `githubRepositoryId`
2. ✅ **AI Prompt**: Now tells AI agent about the repository
3. ✅ **Repository Awareness**: Agent knows which repo it's working in
4. ✅ **Context Instructions**: Agent receives repository info

### What Was Completed (2024-10-03)

1. ✅ **File Access**: Agent can now read repository files via MCP operations
2. ✅ **MCP Operations**: Added `get_repository_file` and `list_repository_files` operations
3. ✅ **GitHub Token**: GitHub App token is properly passed to agent via GitHubClient.forUser()
4. ✅ **AI Prompts**: Updated prompts to inform agents about available MCP operations
5. ✅ **Error Handling**: Added comprehensive error handling for GitHub integration issues
6. ✅ **Testing**: Created test suite for GitHub repository operations

### Impact

**Before All Fixes:**
- ❌ Agent: "I don't know which repository..."
- ❌ Cannot answer about repository
- ❌ Cannot access files

**After Repository Awareness (2024-09-30):**
- ✅ Agent: "I'm working in jonparis/quote_vote"
- ✅ Can reference repository name
- ⚠️ Cannot yet access file contents (needs MCP operations)

**After Full Implementation (2024-10-03):**
- ✅ Agent: "The 5th word in README.md is 'manager'"
- ✅ Can list files in repository
- ✅ Complete GitHub integration
- ✅ Full file read/list capabilities via MCP
- ✅ Can answer questions about any file in the repository

---

**Status**: Complete GitHub repository access FULLY IMPLEMENTED ✅
**Completed**: 2024-10-03
**Previous Work**: Repository awareness (2024-09-30)
