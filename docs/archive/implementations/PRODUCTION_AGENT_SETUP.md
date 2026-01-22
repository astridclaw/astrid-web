# Production Agent Setup Guide

**Date**: 2024-10-03
**Status**: Implementation Complete with Required Configuration

## 🎯 Current Status

✅ **Tool Use Implemented**: Claude can now call GitHub file access functions
✅ **Question Detection**: System detects questions vs. code changes
❌ **GitHub Integration Required**: Users must connect GitHub to use repository features

## 🔧 What We Built

### 1. Claude Tool Use Integration
- Added `get_repository_file` and `list_repository_files` as Claude tools
- Implemented tool execution loop with Claude API
- Tools are called automatically when Claude needs repository access

### 2. Question vs. Code Change Detection
- System analyzes task title to determine intent
- Questions → Use tools to answer via comments
- Code changes → Create branches and PRs

### 3. Error We're Seeing

```
❌ [Tool Execution] get_repository_file failed:
Cannot read properties of undefined (reading 'repos')
```

**Root Cause**: `GitHubClient.forUser(userId)` requires the user to have a GitHub App installation configured.

## 🚨 Production Requirements

### For Repository Access to Work:

**Option 1: User-Level GitHub Integration** (Current Approach)
- ✅ User goes to Settings → Coding Integration
- ✅ Connects their GitHub account via GitHub App
- ✅ Installs GitHub App on repositories they want agents to access
- ✅ System uses user's GitHub token to access repositories

**Problem**: The AI agent user (`wonk1@kuoparis.com` in testing) doesn't have GitHub integration

### Option 2: System-Level GitHub Token (Production Alternative)
- Use a single GitHub App installation for the entire system
- All agents share one GitHub token
- Simpler setup but less granular permissions

## 🔍 Current Architecture Analysis

### How It Works Now:

1. **Task Assignment**:
   ```
   User assigns task → System detects question → Calls Claude API
   ```

2. **Claude Tool Use**:
   ```
   Claude decides to use tool → executeTool() called → GitHubClient.forUser(userId)
   ```

3. **GitHub Client**:
   ```javascript
   await GitHubClient.forUser(userId)
   // Looks up: GitHubIntegration where userId = userId
   // Gets: installationId
   // Creates: Octokit with app.getInstallationOctokit(installationId)
   ```

4. **The Problem**:
   ```
   wonk1@kuoparis.com has no GitHubIntegration record
   → this.octokit is undefined
   → tool execution fails
   ```

## 🛠️ Production Solutions

### Solution 1: Per-User GitHub Integration (Recommended for Production)

**Setup Required**:
1. User goes to http://localhost:3000/settings/coding-integration
2. Clicks "Connect GitHub Account"
3. Authorizes GitHub App
4. Selects repositories to grant access
5. System stores `GitHubIntegration` record with `installationId`

**Pros**:
- Granular permissions per user
- Users control which repos agents can access
- Proper GitHub App permissions model

**Cons**:
- Each user must set up GitHub integration
- More complex onboarding

### Solution 2: System-Wide GitHub Token

**Implementation**:
```typescript
// Instead of GitHubClient.forUser(userId)
// Use a system-wide token

private async executeTool(toolName: string, input: any): Promise<any> {
  const { Octokit } = await import('@octokit/rest')

  // Use system-wide GitHub token from env
  const octokit = new Octokit({
    auth: process.env.SYSTEM_GITHUB_TOKEN
  })

  switch (toolName) {
    case 'get_repository_file':
      const { data } = await octokit.repos.getContent({
        owner: this._repositoryId!.split('/')[0],
        repo: this._repositoryId!.split('/')[1],
        path: input.path,
        ref: input.ref
      })
      // ... decode content
  }
}
```

**Pros**:
- Simple setup - one token for all users
- No per-user GitHub integration needed
- Works immediately

**Cons**:
- Single point of failure
- All agents share same permissions
- Cannot restrict per-user access

### Solution 3: Hybrid Approach (Best for Production)

**Smart Fallback**:
```typescript
private async executeTool(toolName: string, input: any): Promise<any> {
  const { GitHubClient } = await import('./github-client')

  let githubClient

  try {
    // Try user-specific GitHub integration first
    githubClient = await GitHubClient.forUser(this.userId)
  } catch (error) {
    console.log(`No user GitHub integration, using system token`)

    // Fallback to system-wide token
    const { Octokit } = await import('@octokit/rest')
    githubClient = new Octokit({
      auth: process.env.SYSTEM_GITHUB_TOKEN
    })
  }

  // Use githubClient for tool operations
}
```

**Pros**:
- Best of both worlds
- Users can use their own GitHub integration if set up
- Falls back to system token if not
- Gradual migration path

**Cons**:
- More complex logic
- Need to maintain both paths

## 📋 Immediate Action Items

### For Local Testing:

**Option A: Set Up GitHub Integration for Test User**
1. Log in as `wonk1@kuoparis.com`
2. Go to Settings → Coding Integration
3. Connect GitHub account
4. Install GitHub App on `jonparis/config` repository

**Option B: Use System Token (Quick Fix)**
1. Add to `.env.local`:
   ```
   SYSTEM_GITHUB_TOKEN=ghp_your_personal_access_token
   ```
2. Modify `executeTool` to use system token
3. Test with token-based access

### For Production Deployment:

1. **Document GitHub Setup Requirements**
   - Add to user onboarding
   - Show setup wizard on first agent assignment
   - Provide clear error messages when GitHub not connected

2. **Implement Graceful Degradation**
   - Detect when GitHub integration is missing
   - Show helpful error in agent response:
     ```
     ❌ I need GitHub access to read repository files.

     Please set up GitHub integration:
     1. Go to Settings → Coding Integration
     2. Connect your GitHub account
     3. Grant access to the repository
     4. Reassign this task to me
     ```

3. **Add Health Checks**
   - Verify GitHub integration before allowing repository tasks
   - Show status indicators on lists with GitHub repos
   - Validate installation permissions

## 🎯 Recommended Production Path

### Phase 1: Immediate (Local Testing)
- Use system token for local development
- Validate tool use is working correctly
- Test end-to-end agent responses

### Phase 2: Short Term (Production Beta)
- Require users to set up GitHub integration
- Add setup wizard on first use
- Show clear error messages with setup instructions

### Phase 3: Long Term (Production Scale)
- Implement hybrid approach
- Allow system-wide token as fallback
- Add admin controls for token management
- Monitor GitHub API usage and rate limits

## 🔐 Security Considerations

### User GitHub Integration:
- ✅ Scoped to user's permissions
- ✅ Users control repository access
- ✅ Follows GitHub's security model
- ⚠️ Requires user action to set up

### System Token:
- ⚠️ Broad access to all configured repositories
- ⚠️ Single point of compromise
- ⚠️ Need to rotate regularly
- ✅ Simple to manage

## 📊 Current Test Results

### What Works:
- ✅ Claude tool use working
- ✅ Tools are called with correct parameters
- ✅ Question detection working
- ✅ Error handling and logging

### What Needs Setup:
- ❌ GitHub integration for test user
- ❌ Graceful error messages to users
- ❌ Setup wizard for GitHub connection

## 🚀 Next Steps

1. **Choose approach**: User integration vs. System token vs. Hybrid
2. **Implement chosen approach**
3. **Add error handling** with user-friendly messages
4. **Document setup process** for end users
5. **Test complete workflow** with GitHub access working
6. **Deploy to production** with proper monitoring

---

**Question for Product Decision**:

Which approach should we use for production?

1. **User GitHub Integration Only** - More secure, more setup
2. **System Token Only** - Simpler, less secure
3. **Hybrid** - Best UX, more complex

My recommendation: **Hybrid approach** for best production experience.
