# Cloud AI Workflow Fixes

## Problem 1: Context Limits Hit Faster Over API

### Root Causes
1. **max_tokens too low**: 4000 tokens is insufficient for complex code generation
2. **No context management**: Tool use loop accumulates messages without cleanup
3. **No streaming**: Waiting for full responses increases memory pressure
4. **Monolithic prompts**: Planning and implementation in single large prompts

### Solutions

#### A. Increase Token Limits
```typescript
// lib/ai-orchestrator.ts - callClaude method
body: JSON.stringify({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 8192,  // ✅ Match Claude Code CLI limits
  messages,
  tools: tools.length > 0 ? tools : undefined
})
```

#### B. Add Context Window Management
```typescript
private async callClaude(prompt: string, apiKey: string): Promise<string> {
  let messages: Array<{role: string, content: any}> = [
    { role: 'user', content: prompt }
  ]

  let maxIterations = 5
  let iteration = 0

  while (iteration < maxIterations) {
    iteration++

    // ✅ Prune old messages if context getting large
    if (this.getContextSize(messages) > 100000) {
      messages = this.pruneContext(messages)
    }

    const response = await fetch(...)

    // Rest of logic...
  }
}

private getContextSize(messages: any[]): number {
  return JSON.stringify(messages).length
}

private pruneContext(messages: any[]): any[] {
  // Keep system message, latest user message, and last 2 tool interactions
  const systemMsg = messages.find(m => m.role === 'system')
  const userMsgs = messages.filter(m => m.role === 'user')
  const assistantMsgs = messages.filter(m => m.role === 'assistant')

  return [
    ...(systemMsg ? [systemMsg] : []),
    ...userMsgs.slice(-2),
    ...assistantMsgs.slice(-2)
  ]
}
```

#### C. Split Large Operations into Phases
```typescript
async executeCompleteWorkflow(workflowId: string, taskId: string): Promise<void> {
  // Phase 1: Analysis with separate context
  const analysisOrchestrator = await AIOrchestrator.createForTask(taskId, this.userId)
  const plan = await analysisOrchestrator.generateImplementationPlan(planRequest)

  // ✅ CLEAR CONTEXT between phases by creating new orchestrator
  // Phase 2: Implementation with fresh context
  const implementationOrchestrator = await AIOrchestrator.createForTask(taskId, this.userId)
  const generatedCode = await implementationOrchestrator.generateCode(codeRequest, plan)

  // Phase 3: GitHub operations
  await this.createGitHubImplementation(workflow, generatedCode)
}
```

#### D. Use Streaming Responses
```typescript
private async callClaudeStreaming(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [...],
      stream: true  // ✅ Enable streaming
    })
  })

  let fullResponse = ''
  const reader = response.body?.getReader()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = new TextDecoder().decode(value)
    fullResponse += chunk

    // ✅ Post incremental progress updates
    await this.postIncrementalProgress(taskId, chunk)
  }

  return fullResponse
}
```

---

## Problem 2: Hard to Debug When Workflow Gets Stuck

### Root Causes
1. **No structured logging**: Console.log scattered, no trace correlation
2. **Sparse status updates**: Only at major phase boundaries
3. **Generic error messages**: Lose important debugging context
4. **Long polling with no feedback**: 30-minute wait with 30s intervals

### Solutions

#### A. Add Structured Logging with Trace IDs
```typescript
class AIOrchestrator {
  private traceId: string

  constructor(aiService: 'claude' | 'openai', userId: string, repositoryId?: string) {
    this.aiService = aiService
    this.userId = userId
    this._repositoryId = repositoryId
    this.traceId = `trace-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }

  private log(level: 'info' | 'warn' | 'error', message: string, meta?: any) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      traceId: this.traceId,
      level,
      service: 'AIOrchestrator',
      message,
      ...meta
    }

    console.log(JSON.stringify(logEntry))

    // ✅ Also store in database for debugging
    this.storeLog(logEntry)
  }

  private async storeLog(logEntry: any) {
    try {
      await prisma.workflowLog.create({
        data: {
          traceId: this.traceId,
          level: logEntry.level,
          message: logEntry.message,
          metadata: logEntry,
          timestamp: new Date()
        }
      })
    } catch (err) {
      // Don't fail workflow if logging fails
      console.error('Failed to store log:', err)
    }
  }
}
```

#### B. Add Granular Progress Updates
```typescript
async executeCompleteWorkflow(workflowId: string, taskId: string): Promise<void> {
  try {
    this.log('info', 'Starting workflow execution', { workflowId, taskId })

    // ✅ Update at every major step
    await this.updateProgress(taskId, 'ANALYZING', 'Reading task requirements...')

    const plan = await this.generateImplementationPlan(planRequest)
    await this.updateProgress(taskId, 'PLANNING', 'Generated implementation plan')

    await this.updateProgress(taskId, 'IMPLEMENTING', 'Generating code...')
    const generatedCode = await this.generateCode(codeRequest, plan)

    await this.updateProgress(taskId, 'COMMITTING', 'Creating GitHub branch...')
    await this.createGitHubImplementation(workflow, generatedCode)

    await this.updateProgress(taskId, 'COMPLETED', 'Workflow complete!')

  } catch (error) {
    this.log('error', 'Workflow failed', {
      error: error.message,
      stack: error.stack,
      phase: this.currentPhase
    })
    throw error
  }
}

private async updateProgress(taskId: string, phase: string, message: string) {
  this.currentPhase = phase

  // Update workflow status in database
  await prisma.codingTaskWorkflow.updateMany({
    where: { taskId },
    data: {
      status: phase,
      metadata: {
        lastUpdate: new Date().toISOString(),
        currentMessage: message
      }
    }
  })

  // Post comment to task
  await this.postStatusComment(taskId, `🔄 ${phase}`, message)
}
```

#### C. Improve Error Messages with Context
```typescript
private async callAIService(prompt: string): Promise<string> {
  const startTime = Date.now()

  try {
    this.log('info', 'Calling AI service', {
      service: this.aiService,
      promptLength: prompt.length,
      promptPreview: prompt.substring(0, 200)
    })

    const response = await this.callClaude(prompt, apiKey)

    this.log('info', 'AI service call succeeded', {
      duration: Date.now() - startTime,
      responseLength: response.length
    })

    return response

  } catch (error) {
    this.log('error', 'AI service call failed', {
      service: this.aiService,
      duration: Date.now() - startTime,
      error: error.message,
      stack: error.stack,
      promptLength: prompt.length,
      // ✅ Include full context for debugging
      fullPrompt: process.env.NODE_ENV === 'development' ? prompt : undefined
    })

    throw new Error(
      `AI service (${this.aiService}) failed: ${error.message}. ` +
      `Trace ID: ${this.traceId}. Check logs for full context.`
    )
  }
}
```

#### D. Add Real-Time Progress Endpoint
```typescript
// app/api/coding-workflow/progress/[taskId]/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const { taskId } = params

  // Get latest logs for this task's workflow
  const logs = await prisma.workflowLog.findMany({
    where: {
      traceId: {
        in: await prisma.codingTaskWorkflow.findMany({
          where: { taskId },
          select: { metadata: true }
        }).then(workflows =>
          workflows.map(w => (w.metadata as any)?.traceId).filter(Boolean)
        )
      }
    },
    orderBy: { timestamp: 'desc' },
    take: 50
  })

  return NextResponse.json({
    taskId,
    logs: logs.map(log => ({
      timestamp: log.timestamp,
      level: log.level,
      message: log.message,
      phase: (log.metadata as any)?.phase
    }))
  })
}
```

#### E. Update GitHub Actions Workflow to Show Progress
```yaml
# .github/workflows/astrid-coding-agent.yml
- name: Monitor AI Workflow Progress
  id: monitor
  env:
    TASK_ID: ${{ needs.setup.outputs.task_id }}
    ASTRID_MCP_TOKEN: ${{ secrets.ASTRID_MCP_TOKEN }}
  run: |
    echo "🔍 Monitoring AI workflow progress for task: $TASK_ID"

    MAX_ATTEMPTS=60
    ATTEMPT=0
    LAST_MESSAGE=""

    while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
      ATTEMPT=$((ATTEMPT + 1))

      # ✅ Get detailed progress instead of just status
      PROGRESS_RESPONSE=$(curl -s \
        -H "Authorization: Bearer $ASTRID_MCP_TOKEN" \
        "$ASTRID_WEBHOOK_URL/api/coding-workflow/progress/$TASK_ID")

      # Extract current phase and message
      PHASE=$(echo "$PROGRESS_RESPONSE" | jq -r '.logs[0].phase // "UNKNOWN"')
      MESSAGE=$(echo "$PROGRESS_RESPONSE" | jq -r '.logs[0].message // ""')

      # ✅ Only print when message changes (reduce spam)
      if [ "$MESSAGE" != "$LAST_MESSAGE" ]; then
        echo "[$ATTEMPT/$MAX_ATTEMPTS] Phase: $PHASE - $MESSAGE"
        LAST_MESSAGE="$MESSAGE"
      fi

      # Check for completion
      if [ "$PHASE" = "COMPLETED" ] || [ "$PHASE" = "TESTING" ]; then
        echo "✅ Workflow reached completion phase: $PHASE"
        exit 0
      fi

      if [ "$PHASE" = "FAILED" ] || [ "$PHASE" = "CANCELLED" ]; then
        echo "❌ Workflow failed with phase: $PHASE"
        # ✅ Print last 10 log entries for debugging
        echo "$PROGRESS_RESPONSE" | jq -r '.logs[0:10]'
        exit 1
      fi

      sleep 30
    done
```

---

## Problem 3: Prompts Don't Include Repository Context

### Current Issue
```typescript
// ai-orchestrator.ts:734-787
private buildPlanningPrompt(request: CodeGenerationRequest): string {
  return `You are an expert software developer...

  ### 📋 TASK DETAILS:
  Task: ${request.taskTitle}
  Description: ${request.taskDescription}
  Framework: ${request.targetFramework || 'React TypeScript'}

  // ❌ NO repository-specific context (ARCHITECTURE.md, CLAUDE.md, etc.)
  // ❌ NO file tree or codebase structure
  // ❌ Generic "autonomous workflow" instructions
  `
}
```

### Solution: Include Repository-Specific Context

```typescript
private async buildPlanningPrompt(request: CodeGenerationRequest): Promise<string> {
  // ✅ Read repository-specific instructions
  let repositoryContext = ''

  if (this._repositoryId) {
    const { GitHubClient } = await import('./github-client')
    const githubClient = await GitHubClient.forUser(this.userId)

    // Try to read ASTRID.md or CLAUDE.md
    try {
      const astridMd = await githubClient.getFile(this._repositoryId, 'ASTRID.md')
      repositoryContext += `\n\n## Repository-Specific Instructions (ASTRID.md)\n${astridMd}\n`
    } catch (err) {
      // Try CLAUDE.md as fallback
      try {
        const claudeMd = await githubClient.getFile(this._repositoryId, 'CLAUDE.md')
        repositoryContext += `\n\n## Repository-Specific Instructions (CLAUDE.md)\n${claudeMd}\n`
      } catch (err2) {
        this.log('warn', 'No ASTRID.md or CLAUDE.md found in repository')
      }
    }

    // Get repository structure
    try {
      const fileTree = await this.getRepositoryStructure(githubClient)
      repositoryContext += `\n\n## Repository Structure\n${fileTree}\n`
    } catch (err) {
      this.log('warn', 'Failed to get repository structure')
    }
  }

  return `You are an expert software developer implementing autonomous coding workflow.

${repositoryContext}

### 📋 TASK DETAILS:
Task: ${request.taskTitle}
Description: ${request.taskDescription}
Framework: ${request.targetFramework || 'React TypeScript'}

### 🎯 YOUR ANALYSIS APPROACH:
...`
}

private async getRepositoryStructure(githubClient: any): Promise<string> {
  const files = await githubClient.listFiles(this._repositoryId!, '', undefined)

  // Build tree structure
  const tree = this.buildFileTree(files)
  return this.renderFileTree(tree)
}
```

---

## Quick Wins - Implement These First

### 1. Increase max_tokens (5 min)
```typescript
// lib/ai-orchestrator.ts:594
max_tokens: 8192  // Change from 4000
```

### 2. Add trace IDs to all logs (15 min)
```typescript
constructor(...) {
  this.traceId = `trace-${Date.now()}-${Math.random().toString(36).substring(7)}`
}

private log(level, message, meta = {}) {
  console.log(JSON.stringify({ traceId: this.traceId, level, message, ...meta }))
}
```

### 3. Create progress endpoint (20 min)
```typescript
// app/api/coding-workflow/progress/[taskId]/route.ts
export async function GET(request, { params }) {
  // Return real-time logs and current phase
}
```

### 4. Update GitHub Actions to show progress (10 min)
```yaml
# Show current phase and message in each poll
echo "Phase: $PHASE - $MESSAGE"
```

---

## Testing Your Fixes

### 1. Local Testing
```bash
# Test with a simple task first
npm run dev

# Assign task to AI agent, monitor logs:
tail -f logs/ai-orchestrator.log | jq

# Check progress endpoint:
curl http://localhost:3000/api/coding-workflow/progress/TASK_ID
```

### 2. Cloud Testing
```bash
# Push changes, trigger workflow
git push origin main

# Watch GitHub Actions live:
gh run watch

# Check progress in Astrid task comments
```

---

## Architecture Improvements for Long-Term

### 1. Add Queue System (Recommended)
```typescript
// Use a job queue (BullMQ, Inngest, etc.) instead of fire-and-forget async
import { Queue } from 'bullmq'

const aiWorkflowQueue = new Queue('ai-workflows', {
  connection: redisConnection
})

// Enqueue workflow
await aiWorkflowQueue.add('execute-workflow', {
  workflowId,
  taskId,
  userId
})

// Worker processes jobs with retries, progress tracking
```

### 2. Split into Microservices
- **API Service**: Handle webhooks, create workflows
- **AI Orchestration Service**: Long-running AI operations
- **GitHub Service**: Branch creation, PR management
- **Vercel Service**: Deployment management

### 3. Add Observability
- **Sentry**: Error tracking with context
- **DataDog/NewRelic**: Performance monitoring
- **PostHog**: User analytics and funnel tracking

---

## Summary

**To make cloud workflow as reliable as CLI:**

1. ✅ **Increase max_tokens to 8192** (matches Claude Code)
2. ✅ **Add context pruning** between tool use iterations
3. ✅ **Split operations into phases** with fresh contexts
4. ✅ **Add structured logging with trace IDs** for debugging
5. ✅ **Create progress endpoint** for real-time monitoring
6. ✅ **Update GitHub Actions** to show detailed progress
7. ✅ **Include repository context** (ASTRID.md, file tree) in prompts
8. ✅ **Add streaming responses** for better memory management

**Quick wins (< 1 hour):**
- Change max_tokens to 8192
- Add trace ID to constructor
- Create progress endpoint
- Update GitHub Actions polling

**These changes will:**
- ✅ Eliminate context limit errors
- ✅ Provide real-time debugging visibility
- ✅ Match Claude Code CLI reliability
- ✅ Enable developers to self-serve debugging
