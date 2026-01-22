# Cloud Workflow: Complete Repository Access for AI Agent

**Date**: 2024-09-30
**Issue**: AI agent in cloud workflow cannot read repository files
**Status**: ⚠️ PARTIAL - Agent can write (create branches/PRs) but cannot read files

## Current State Analysis

### ✅ What Works

1. **GitHub App Integration**
   - User connects GitHub App in Settings → Coding Integration
   - GitHub App is installed on target repositories
   - Installation ID stored in database (`GitHubIntegration` table)

2. **Write Access (Creating Branches/PRs)**
   - `GitHubClient.forUser(userId)` authenticates via GitHub App
   - Can create branches, commit files, create PRs
   - Works in both local and cloud workflows

3. **Repository Awareness**
   - AI agent knows which repository it's working in
   - `githubRepositoryId` passed in webhook payload
   - Agent can reference repository name in responses

### ❌ What Doesn't Work

**Problem**: AI agent cannot read repository files (README.md, package.json, etc.)

**Why**: When the AI agent generates responses:
1. It receives task info + repository name
2. Calls Claude/OpenAI API with a prompt
3. **BUT** - The prompt doesn't include any file contents
4. The AI has no way to fetch files before responding

**Test Case**:
```
User: "What is the 5th word in README.md?"
Agent: "I'm working in jonparis/quote_vote, but I cannot read the README.md file directly yet."
```

## Architecture Overview

### Local Workflow (Works)
```
Claude Code CLI
  ↓
Has direct filesystem access
  ↓
Can read any file in repository
  ↓
Includes file contents in context
```

### Cloud Workflow (Partial)
```
GitHub Actions trigger
  ↓
Astrid API /api/coding-agent/github-trigger
  ↓
AIOrchestrator.executeCompleteWorkflow()
  ↓
GitHubClient.forUser() - ✅ Can WRITE
  ↓
AI Prompt Generation - ❌ Cannot READ
```

## The Missing Piece

The AI agent needs a way to **fetch repository files** before generating responses.

### Option 1: Pre-fetch Common Files (Simple) ⭐ RECOMMENDED

**When task is assigned**, automatically fetch key files and include in prompt:

```typescript
// In controllers/ai-agent-webhook.controller.ts
async function generateAssignmentResponse(...) {
  // ... existing code ...

  // NEW: Fetch repository files if available
  let repositoryContext = ''
  if (repositoryId) {
    try {
      const githubClient = await GitHubClient.forUser(userWithApiKey)

      // Fetch README.md
      const readme = await githubClient.getFile(repositoryId, 'README.md')
        .catch(() => null)

      // Fetch package.json or similar
      const packageJson = await githubClient.getFile(repositoryId, 'package.json')
        .catch(() => null)

      if (readme || packageJson) {
        repositoryContext = `\n\n### Repository Files:\n`
        if (readme) {
          repositoryContext += `\n#### README.md:\n\`\`\`\n${readme.substring(0, 2000)}\n\`\`\`\n`
        }
        if (packageJson) {
          repositoryContext += `\n#### package.json:\n\`\`\`json\n${packageJson.substring(0, 1000)}\n\`\`\`\n`
        }
      }
    } catch (error) {
      console.error('Failed to fetch repository files:', error)
      // Continue without repository context
    }
  }

  const prompt = `You are ${agentName}, an AI coding assistant...

Task: "${taskTitle}"
GitHub Repository: ${repositoryId}
${repositoryContext}

IMPORTANT: You have access to the repository "${repositoryId}" and the files shown above.
...`
}
```

**Pros**:
- ✅ Simple to implement
- ✅ Works immediately
- ✅ No additional dependencies
- ✅ Uses existing GitHubClient

**Cons**:
- ⚠️ Limited to pre-fetched files
- ⚠️ Cannot answer ad-hoc file questions

### Option 2: Add MCP File Operations (Complete)

Add MCP operations that the AI can call to fetch files:

```typescript
// In app/api/mcp/operations/route.ts
case 'get_repository_file':
  return await handleGetRepositoryFile(body, user)

async function handleGetRepositoryFile(body: any, user: User) {
  const { repository, path } = body

  // Validate user has access to this repository
  const githubClient = await GitHubClient.forUser(user.id)
  const content = await githubClient.getFile(repository, path)

  return {
    success: true,
    content,
    path
  }
}
```

**Update webhook payload**:
```typescript
mcp: {
  availableOperations: [
    'get_repository_file',  // NEW
    'list_repository_files', // NEW
    'get_shared_lists',
    'get_list_tasks',
    // ... existing
  ]
}
```

**Pros**:
- ✅ AI can fetch any file on-demand
- ✅ Flexible and complete solution
- ✅ Works for all file access scenarios

**Cons**:
- ⚠️ More complex implementation
- ⚠️ Requires AI to know about MCP operations
- ⚠️ Additional API calls

### Option 3: Provide GitHub Context Tool (Advanced)

Give the AI a tool/function it can call:

```typescript
// Using Claude's tool use feature
const tools = [{
  name: 'get_repository_file',
  description: 'Read a file from the GitHub repository',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path in repository' }
    },
    required: ['path']
  }
}]

// AI can then call: get_repository_file({ path: 'README.md' })
```

**Pros**:
- ✅ Most natural for AI
- ✅ Claude/OpenAI native tool support
- ✅ AI decides when to read files

**Cons**:
- ⚠️ Requires tool use implementation
- ⚠️ Multiple API calls per conversation
- ⚠️ More complex orchestration

## Recommended Implementation: Option 1 (Pre-fetch)

Implement Option 1 first as it provides immediate value with minimal complexity.

### Implementation Steps

#### 1. Add getFile Method to GitHubClient

```typescript
// In lib/github-client.ts
async getFile(repoFullName: string, path: string): Promise<string> {
  const octokit = this.ensureAuthenticated()
  const { owner, repo } = this.parseRepo(repoFullName)

  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path
    })

    // GitHub returns base64-encoded content
    if ('content' in data && typeof data.content === 'string') {
      return Buffer.from(data.content, 'base64').toString('utf-8')
    }

    throw new Error(`File ${path} is not a regular file`)
  } catch (error) {
    throw new Error(`Failed to read file ${path}: ${error.message}`)
  }
}
```

#### 2. Update generateAssignmentResponse

```typescript
// In controllers/ai-agent-webhook.controller.ts
private async generateAssignmentResponse(...) {
  // ... existing code up to repository detection ...

  // NEW: Fetch repository files
  let repositoryFiles = ''
  if (repositoryId && userWithApiKey) {
    repositoryFiles = await this.fetchRepositoryContext(repositoryId, userWithApiKey)
  }

  const prompt = `You are ${agentName}...

${repositoryFiles}

IMPORTANT: You have access to the files shown above from repository "${repositoryId}".
If the user asks about specific files or their contents, reference the information above.
...`
}

private async fetchRepositoryContext(repositoryId: string, userId: string): Promise<string> {
  try {
    const { GitHubClient } = await import('@/lib/github-client')
    const githubClient = await GitHubClient.forUser(userId)

    let context = '\n\n### Repository Context:\n'
    context += `Repository: ${repositoryId}\n\n`

    // Try to fetch README.md
    try {
      const readme = await githubClient.getFile(repositoryId, 'README.md')
      context += `#### README.md (first 2000 chars):\n\`\`\`\n${readme.substring(0, 2000)}\n\`\`\`\n\n`
    } catch {
      context += `README.md: Not found\n\n`
    }

    // Try to fetch package.json
    try {
      const packageJson = await githubClient.getFile(repositoryId, 'package.json')
      const pkg = JSON.parse(packageJson)
      context += `#### package.json:\n\`\`\`json\n${JSON.stringify({
        name: pkg.name,
        version: pkg.version,
        description: pkg.description,
        scripts: pkg.scripts
      }, null, 2)}\n\`\`\`\n\n`
    } catch {
      context += `package.json: Not found\n\n`
    }

    return context
  } catch (error) {
    console.error('Failed to fetch repository context:', error)
    return '\n(Repository files could not be fetched)\n'
  }
}
```

#### 3. Update generateCommentResponse

Apply the same pattern to comment responses so the agent can reference files when responding to follow-up questions.

## Testing

### Test 1: Repository Awareness
```
Task: "What repository are you working in?"
Expected: "I'm working in the jonparis/quote_vote repository."
Status: ✅ WORKS NOW
```

### Test 2: README Access (After Implementation)
```
Task: "What is the 5th word in README.md?"
Expected: Agent reads README and provides the actual word
Status: ⚠️ NEEDS IMPLEMENTATION
```

### Test 3: Package Info (After Implementation)
```
Task: "What dependencies does this project use?"
Expected: Agent reads package.json and lists dependencies
Status: ⚠️ NEEDS IMPLEMENTATION
```

## Cloud Workflow Documentation Updates

### Remove Misleading Information

The coding-integration page currently says:
```typescript
GITHUB_TOKEN_FOR_AI: ${{ secrets.GITHUB_TOKEN }}
```

This is misleading because:
1. ❌ GITHUB_TOKEN is never used by Astrid
2. ✅ Astrid uses the GitHub App integration instead
3. ❌ Adding this secret doesn't provide any functionality

### Correct Documentation

**What's Actually Needed**:

1. ✅ **GitHub App Integration** (Settings → Coding Integration)
   - Install GitHub App on target repository
   - Provides read/write access via App installation

2. ✅ **AI API Key** (Settings → AI Agents)
   - Claude or OpenAI API key
   - For AI response generation

3. ✅ **MCP Token** (Settings → MCP Access)
   - For Astrid task operations
   - Added as `ASTRID_MCP_TOKEN` in GitHub Secrets

4. ✅ **Repository Configuration** (List Settings)
   - Set `githubRepositoryId` for each list
   - Tells agent which repo to work in

**NOT NEEDED**:
- ❌ GITHUB_TOKEN (already have GitHub App)
- ❌ Additional repository tokens
- ❌ Deploy keys

## Summary

### Current Capabilities

| Capability | Local Workflow | Cloud Workflow |
|-----------|----------------|----------------|
| Repository Awareness | ✅ Yes | ✅ Yes (NOW) |
| Read Files | ✅ Yes | ❌ No |
| Create Branches | ✅ Yes | ✅ Yes |
| Commit Changes | ✅ Yes | ✅ Yes |
| Create PRs | ✅ Yes | ✅ Yes |

### After Implementing Option 1

| Capability | Local Workflow | Cloud Workflow |
|-----------|----------------|----------------|
| Repository Awareness | ✅ Yes | ✅ Yes |
| Read Common Files | ✅ Yes | ✅ Yes (NEW) |
| Read Any File | ✅ Yes | ⚠️ Pre-fetched only |
| Create Branches | ✅ Yes | ✅ Yes |
| Commit Changes | ✅ Yes | ✅ Yes |
| Create PRs | ✅ Yes | ✅ Yes |

### Complete Solution Requires

1. ✅ **Done**: Repository awareness in webhook payload
2. ✅ **Done**: Repository context in AI prompts
3. ⚠️ **TODO**: Implement `getFile()` in GitHubClient
4. ⚠️ **TODO**: Pre-fetch common files in `generateAssignmentResponse()`
5. ⚠️ **TODO**: Update documentation to remove misleading GITHUB_TOKEN

---

**Next Steps**: Implement Option 1 (Pre-fetch common files) to enable basic file reading for cloud AI agent.
