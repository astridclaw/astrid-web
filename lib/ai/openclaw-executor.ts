/**
 * OpenClaw Executor
 *
 * Executes tasks on user's self-hosted OpenClaw workers.
 * OpenClaw workers run Claude Code with full CLI capabilities.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import {
  OpenClawRPCClient,
  createOpenClawClient,
  type OpenClawSessionEvent,
  type OpenClawRPCClientConfig,
} from './openclaw-rpc-client'
import type { ImplementationPlan } from './types'
import { loadAstridConfig, detectPlatform } from './config'
import {
  buildPlanningPrompt,
  buildExecutionPrompt,
  type PlanningPromptContext,
  type ExecutionPromptContext,
} from './config/prompt-builder'

// ============================================================================
// TYPES
// ============================================================================

export interface OpenClawExecutorConfig {
  /** Path to the repository (for context loading) */
  repoPath: string
  /** OpenClaw Gateway URL (ws:// or wss://) */
  gatewayUrl: string
  /** Optional authentication token */
  authToken?: string
  /** Model to use (e.g., 'anthropic/claude-opus-4-5') */
  model?: string
  /** Maximum turns for execution */
  maxTurns?: number
  /** Progress callback */
  onProgress?: (message: string) => void
  /** Event callback for detailed progress */
  onEvent?: (event: OpenClawSessionEvent) => void
  /** Logger function */
  logger?: (level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void
  /** Timeout for planning phase in ms */
  planningTimeoutMs?: number
  /** Timeout for execution phase in ms */
  executionTimeoutMs?: number
  /** Comment posting throttle in ms */
  progressThrottleMs?: number
}

export interface PlanningResult {
  success: boolean
  plan?: ImplementationPlan
  error?: string
  modelResponse?: string
  sessionId?: string
  usage?: {
    inputTokens: number
    outputTokens: number
    costUSD: number
  }
}

export interface ExecutionResult {
  success: boolean
  files: Array<{
    path: string
    content: string
    action: 'create' | 'modify' | 'delete'
  }>
  commitMessage: string
  prTitle: string
  prDescription: string
  prUrl?: string
  commitHash?: string
  error?: string
  sessionId?: string
  workflowSuggestions?: WorkflowSuggestion[]
  usage?: {
    inputTokens: number
    outputTokens: number
    costUSD: number
  }
}

export interface WorkflowSuggestion {
  type: 'automation' | 'optimization' | 'pattern' | 'dependency'
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
}

// ============================================================================
// CONTEXT LOADING
// ============================================================================

async function loadAstridMd(repoPath: string, maxLength: number = 50000): Promise<string | null> {
  try {
    const content = await fs.readFile(path.join(repoPath, 'ASTRID.md'), 'utf-8')
    return content.length > maxLength
      ? content.substring(0, maxLength) + '\n\n[truncated...]'
      : content
  } catch {
    return null
  }
}

// ============================================================================
// PLANNING
// ============================================================================

export async function planWithOpenClaw(
  taskTitle: string,
  taskDescription: string | null,
  executorConfig: OpenClawExecutorConfig
): Promise<PlanningResult> {
  const log = executorConfig.logger || (() => {})
  const onProgress = executorConfig.onProgress || (() => {})
  const timeoutMs = executorConfig.planningTimeoutMs || 10 * 60 * 1000 // 10 minutes

  log('info', 'Starting OpenClaw planning', {
    repoPath: executorConfig.repoPath,
    gatewayUrl: executorConfig.gatewayUrl,
    taskTitle,
  })
  onProgress('Connecting to OpenClaw worker...')

  // Load config for prompt building
  const config = await loadAstridConfig(executorConfig.repoPath)
  const platform = detectPlatform(config, taskTitle, taskDescription || '')

  // Load ASTRID.md for context
  const astridMd = await loadAstridMd(executorConfig.repoPath, config.validation.contextTruncationLength)
  if (astridMd) {
    onProgress('Loaded project context from ASTRID.md')
  }

  // Build planning prompt
  const promptContext: PlanningPromptContext = {
    taskTitle,
    taskDescription,
  }
  const systemPrompt = buildPlanningPrompt(config, promptContext, platform)

  // Create planning task prompt
  const planningPrompt = buildOpenClawPlanningPrompt(taskTitle, taskDescription, systemPrompt, astridMd)

  // Create RPC client
  const client = createOpenClawClient({
    gatewayUrl: executorConfig.gatewayUrl,
    authToken: executorConfig.authToken,
    connectionTimeoutMs: 30000,
    logger: log,
  })

  let sessionId: string | undefined
  let lastOutput = ''

  try {
    await client.connect()
    onProgress('Connected to OpenClaw worker')

    // Send planning task
    const result = await client.sendTask({
      prompt: planningPrompt,
      workingDir: executorConfig.repoPath,
      model: executorConfig.model,
      maxTurns: executorConfig.maxTurns || 25,
    })

    sessionId = result.sessionId
    log('info', 'Planning session started', { sessionId })
    onProgress(`Planning session started: ${sessionId}`)

    // Subscribe to events
    const unsubscribe = client.subscribe(sessionId, (event) => {
      if (executorConfig.onEvent) {
        executorConfig.onEvent(event)
      }

      if (event.type === 'output') {
        const data = event.data as { content?: string }
        if (data.content) {
          lastOutput += data.content
        }
      } else if (event.type === 'progress') {
        const data = event.data as { message?: string }
        if (data.message) {
          onProgress(data.message)
        }
      }
    })

    // Wait for completion with timeout
    const planResult = await waitForSessionComplete(client, sessionId, timeoutMs, onProgress)
    unsubscribe()

    if (!planResult.success) {
      return {
        success: false,
        error: planResult.error || 'Planning failed',
        modelResponse: lastOutput || planResult.output,
        sessionId,
      }
    }

    // Parse plan from output
    const plan = parsePlanFromOpenClawOutput(planResult.output || lastOutput)

    if (!plan) {
      return {
        success: false,
        error: 'Failed to parse implementation plan from OpenClaw output',
        modelResponse: planResult.output || lastOutput,
        sessionId,
      }
    }

    log('info', 'Planning complete', { files: plan.files.length, sessionId })

    return {
      success: true,
      plan,
      sessionId,
      modelResponse: planResult.output,
    }
  } catch (error) {
    log('error', 'Planning failed', { error, sessionId })
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      sessionId,
    }
  } finally {
    client.disconnect()
  }
}

// ============================================================================
// EXECUTION
// ============================================================================

export async function executeWithOpenClaw(
  plan: ImplementationPlan,
  taskTitle: string,
  taskDescription: string | null,
  executorConfig: OpenClawExecutorConfig
): Promise<ExecutionResult> {
  const log = executorConfig.logger || (() => {})
  const onProgress = executorConfig.onProgress || (() => {})
  const timeoutMs = executorConfig.executionTimeoutMs || 30 * 60 * 1000 // 30 minutes

  log('info', 'Starting OpenClaw execution', {
    repoPath: executorConfig.repoPath,
    gatewayUrl: executorConfig.gatewayUrl,
    filesInPlan: plan.files.length,
  })
  onProgress('Connecting to OpenClaw worker...')

  // Load config for prompt building
  const config = await loadAstridConfig(executorConfig.repoPath)
  const platform = detectPlatform(config, taskTitle, taskDescription || '')

  // Build execution prompt
  const promptContext: ExecutionPromptContext = {
    taskTitle,
    taskDescription,
    plan,
  }
  const systemPrompt = buildExecutionPrompt(config, promptContext, platform)

  // Create execution task prompt
  const executionPrompt = buildOpenClawExecutionPrompt(taskTitle, taskDescription, plan, systemPrompt)

  // Create RPC client
  const client = createOpenClawClient({
    gatewayUrl: executorConfig.gatewayUrl,
    authToken: executorConfig.authToken,
    connectionTimeoutMs: 30000,
    logger: log,
  })

  let sessionId: string | undefined
  let lastOutput = ''
  const fileChanges: Array<{ path: string; action: 'create' | 'modify' | 'delete' }> = []

  try {
    await client.connect()
    onProgress('Connected to OpenClaw worker')

    // Send execution task
    const result = await client.sendTask({
      prompt: executionPrompt,
      workingDir: executorConfig.repoPath,
      model: executorConfig.model,
      maxTurns: executorConfig.maxTurns || 100,
    })

    sessionId = result.sessionId
    log('info', 'Execution session started', { sessionId })
    onProgress(`Execution session started: ${sessionId}`)

    // Subscribe to events
    const unsubscribe = client.subscribe(sessionId, (event) => {
      if (executorConfig.onEvent) {
        executorConfig.onEvent(event)
      }

      if (event.type === 'output') {
        const data = event.data as { content?: string }
        if (data.content) {
          lastOutput += data.content
        }
      } else if (event.type === 'tool_call') {
        const data = event.data as { tool?: string; file?: string; action?: string }
        if (data.tool === 'write_file' || data.tool === 'edit_file') {
          if (data.file) {
            fileChanges.push({
              path: data.file,
              action: data.action as 'create' | 'modify' || 'modify',
            })
          }
        }
        if (data.tool) {
          onProgress(`Tool: ${data.tool}`)
        }
      } else if (event.type === 'progress') {
        const data = event.data as { message?: string }
        if (data.message) {
          onProgress(data.message)
        }
      }
    })

    // Wait for completion with timeout
    const execResult = await waitForSessionComplete(client, sessionId, timeoutMs, onProgress)
    unsubscribe()

    if (!execResult.success) {
      return {
        success: false,
        files: [],
        commitMessage: '',
        prTitle: '',
        prDescription: '',
        error: execResult.error || 'Execution failed',
        sessionId,
      }
    }

    // Parse execution result
    const parsed = parseExecutionResult(execResult.output || lastOutput, plan, taskTitle, taskDescription)

    // Extract workflow suggestions
    const suggestions = extractWorkflowSuggestions(execResult.output || lastOutput)

    log('info', 'Execution complete', {
      sessionId,
      filesChanged: parsed.files.length,
      suggestions: suggestions.length,
    })

    return {
      success: true,
      files: parsed.files,
      commitMessage: parsed.commitMessage,
      prTitle: parsed.prTitle,
      prDescription: parsed.prDescription,
      prUrl: execResult.prUrl,
      commitHash: execResult.commitHash,
      sessionId,
      workflowSuggestions: suggestions.length > 0 ? suggestions : undefined,
    }
  } catch (error) {
    log('error', 'Execution failed', { error, sessionId })
    return {
      success: false,
      files: [],
      commitMessage: '',
      prTitle: '',
      prDescription: '',
      error: error instanceof Error ? error.message : String(error),
      sessionId,
    }
  } finally {
    client.disconnect()
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function waitForSessionComplete(
  client: OpenClawRPCClient,
  sessionId: string,
  timeoutMs: number,
  onProgress: (message: string) => void
): Promise<{
  success: boolean
  output?: string
  error?: string
  prUrl?: string
  commitHash?: string
}> {
  const startTime = Date.now()
  const pollInterval = 2000 // 2 seconds

  while (Date.now() - startTime < timeoutMs) {
    try {
      const sessions = await client.listSessions()
      const session = sessions.find(s => s.id === sessionId)

      if (!session) {
        return { success: false, error: 'Session not found' }
      }

      if (session.status === 'completed') {
        const history = await client.getSessionHistory(sessionId)
        const output = history.messages
          .filter(m => m.role === 'assistant')
          .map(m => m.content)
          .join('\n')

        // Extract PR URL and commit hash from output if present
        const prUrlMatch = output.match(/https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/)
        const commitHashMatch = output.match(/commit\s+([a-f0-9]{7,40})/i)

        return {
          success: true,
          output,
          prUrl: prUrlMatch?.[0],
          commitHash: commitHashMatch?.[1],
        }
      }

      if (session.status === 'failed') {
        const history = await client.getSessionHistory(sessionId)
        const output = history.messages
          .filter(m => m.role === 'assistant')
          .map(m => m.content)
          .join('\n')

        return {
          success: false,
          output,
          error: 'Session failed',
        }
      }

      // Still running
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    } catch (error) {
      // Connection might be temporarily lost, continue polling
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }
  }

  return {
    success: false,
    error: `Session timed out after ${timeoutMs / 1000 / 60} minutes`,
  }
}

function buildOpenClawPlanningPrompt(
  taskTitle: string,
  taskDescription: string | null,
  systemPrompt: string,
  astridMd: string | null
): string {
  let prompt = `You are analyzing a coding task to create an implementation plan.

${systemPrompt}

${astridMd ? `## Project Context\n\n${astridMd}\n\n` : ''}

## Task

**Title:** ${taskTitle}

${taskDescription ? `**Description:** ${taskDescription}` : ''}

## Instructions

1. Explore the codebase to understand the current implementation
2. Identify the files that need to be modified
3. Create a detailed implementation plan

Your response MUST include a JSON code block with the following structure:

\`\`\`json
{
  "summary": "Brief description of changes",
  "files": [
    {
      "path": "path/to/file.ts",
      "action": "modify",
      "changes": "Description of what to change"
    }
  ],
  "testStrategy": "How to verify the changes",
  "risks": ["Any potential risks or concerns"]
}
\`\`\`

Begin by exploring the codebase.`

  return prompt
}

function buildOpenClawExecutionPrompt(
  taskTitle: string,
  taskDescription: string | null,
  plan: ImplementationPlan,
  systemPrompt: string
): string {
  const planSummary = plan.files.map(f => `- ${f.path}: ${f.purpose}`).join('\n')

  return `You are implementing a coding task based on an approved plan.

${systemPrompt}

## Task

**Title:** ${taskTitle}

${taskDescription ? `**Description:** ${taskDescription}` : ''}

## Approved Implementation Plan

${plan.summary}

### Files to Modify

${planSummary}

${plan.approach ? `### Approach\n${plan.approach}` : ''}

## Instructions

1. Implement the changes according to the plan
2. Run tests to verify the implementation
3. Create a commit with the changes
4. Create a pull request if the repository supports it

When complete, provide a summary of what was done.

If you notice any workflow improvements that could help the team, mention them at the end with the prefix "WORKFLOW_SUGGESTION:".

Begin implementation.`
}

function parsePlanFromOpenClawOutput(output: string): ImplementationPlan | null {
  // Try to find JSON block in the output
  const jsonMatch = output.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1])

      if (parsed.files && Array.isArray(parsed.files)) {
        return {
          summary: parsed.summary || 'Implementation plan',
          approach: parsed.approach || parsed.testStrategy || '',
          files: parsed.files.map((f: { path: string; purpose?: string; action?: string; changes?: string }) => ({
            path: f.path,
            purpose: f.purpose || f.action || 'modify',
            changes: f.changes || '',
          })),
          estimatedComplexity: parsed.estimatedComplexity || 'medium',
          considerations: parsed.risks || parsed.considerations || [],
        }
      }
    } catch {
      // Failed to parse JSON, continue to fallback
    }
  }

  // Fallback: try to extract file paths from the output
  const fileMatches = output.match(/(?:modify|create|update|edit|change).*?([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)/gi)

  if (fileMatches && fileMatches.length > 0) {
    const files = fileMatches
      .map(match => {
        const pathMatch = match.match(/([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)/)
        return pathMatch ? { path: pathMatch[1], purpose: 'modify', changes: match } : null
      })
      .filter((f): f is { path: string; purpose: string; changes: string } => f !== null)

    if (files.length > 0) {
      return {
        summary: 'Extracted implementation plan',
        approach: '',
        files,
        estimatedComplexity: 'medium' as const,
        considerations: [],
      }
    }
  }

  return null
}

function parseExecutionResult(
  output: string,
  plan: ImplementationPlan,
  taskTitle: string,
  taskDescription: string | null
): {
  files: Array<{ path: string; content: string; action: 'create' | 'modify' | 'delete' }>
  commitMessage: string
  prTitle: string
  prDescription: string
} {
  // Default values based on task
  let commitMessage = `feat: ${taskTitle}`
  let prTitle = `feat: ${taskTitle}`
  let prDescription = taskDescription || plan.summary || taskTitle

  // Try to extract commit message from output
  const commitMatch = output.match(/commit.*?["'](.+?)["']/i)
  if (commitMatch) {
    commitMessage = commitMatch[1]
  }

  // Try to extract PR title from output
  const prTitleMatch = output.match(/pull request.*?["'](.+?)["']/i)
  if (prTitleMatch) {
    prTitle = prTitleMatch[1]
  }

  // Files are tracked separately via tool_call events
  // Return empty array here as actual file tracking happens in event handler
  return {
    files: [],
    commitMessage,
    prTitle,
    prDescription,
  }
}

function extractWorkflowSuggestions(output: string): WorkflowSuggestion[] {
  const suggestions: WorkflowSuggestion[] = []

  // Look for WORKFLOW_SUGGESTION markers using a simple loop approach (ES2017 compatible)
  const regex = /WORKFLOW_SUGGESTION:\s*([^\n]+(?:\n(?!WORKFLOW_SUGGESTION:)[^\n]*)*)/g
  let suggestionMatch
  const suggestionMatches: string[] = []
  while ((suggestionMatch = regex.exec(output)) !== null) {
    suggestionMatches.push(suggestionMatch[0])
  }

  if (suggestionMatches.length > 0) {
    for (const match of suggestionMatches) {
      const content = match.replace(/^WORKFLOW_SUGGESTION:\s*/, '').trim()

      // Try to parse structured suggestion
      const typeMatch = content.match(/\[(automation|optimization|pattern|dependency)\]/i)
      const priorityMatch = content.match(/\((low|medium|high)\)/i)

      suggestions.push({
        type: (typeMatch?.[1].toLowerCase() as WorkflowSuggestion['type']) || 'optimization',
        title: content.split('\n')[0].replace(/\[.*?\]|\(.*?\)/g, '').trim().substring(0, 100),
        description: content,
        priority: (priorityMatch?.[1].toLowerCase() as WorkflowSuggestion['priority']) || 'medium',
      })
    }
  }

  return suggestions
}

// ============================================================================
// WORKFLOW SUGGESTION TASK CREATION
// ============================================================================

/**
 * Create Astrid tasks for workflow suggestions
 * These are assigned to the original task creator for review
 */
export function formatWorkflowSuggestionsAsTaskDescriptions(
  suggestions: WorkflowSuggestion[],
  originalTaskTitle: string
): Array<{ title: string; description: string }> {
  return suggestions.map(suggestion => ({
    title: `[Workflow Suggestion] ${suggestion.title}`,
    description: `## Workflow Improvement Suggestion

**From task:** ${originalTaskTitle}
**Type:** ${suggestion.type}
**Priority:** ${suggestion.priority}

### Details

${suggestion.description}

---
*This suggestion was automatically generated by OpenClaw after completing a task. Review and create implementation tasks if the suggestion would improve your workflow.*`,
  }))
}
