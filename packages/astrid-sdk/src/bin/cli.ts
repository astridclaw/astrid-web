#!/usr/bin/env node
/**
 * @gracefultools/astrid-sdk CLI
 *
 * Command-line interface for running the Astrid AI agent worker
 *
 * Usage:
 *   npx astrid-agent                 # Start polling for tasks (API mode)
 *   npx astrid-agent --terminal      # Start polling using local Claude Code CLI
 *   npx astrid-agent <taskId>        # Process a specific task
 *   npx astrid-agent --help          # Show help
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import { fileURLToPath } from 'url'

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

import {
  planWithClaude,
  executeWithClaude,
  prepareRepository,
  verifyChanges,
  type ClaudeExecutorConfig,
} from '../executors/claude.js'
import {
  TerminalClaudeExecutor,
  terminalSessionStore,
  type TerminalExecutionResult,
} from '../executors/terminal-claude.js'
import { TerminalOpenAIExecutor } from '../executors/terminal-openai.js'
import { TerminalGeminiExecutor } from '../executors/terminal-gemini.js'
import type { TerminalExecutor } from '../executors/terminal-base.js'
import {
  planWithOpenAI,
  executeWithOpenAI,
  type OpenAIExecutorConfig,
} from '../executors/openai.js'
import {
  planWithGemini,
  executeWithGemini,
  type GeminiExecutorConfig,
} from '../executors/gemini.js'
import {
  getAgentService,
  DEFAULT_MODELS,
  isRegisteredAgent,
} from '../utils/agent-config.js'
import type { AIService } from '../types/index.js'
import {
  AstridOAuthClient,
} from '../adapters/astrid-oauth.js'
import type {
  ImplementationPlan,
  PlanningResult,
  ExecutionResult,
  Logger,
  AstridTask,
} from '../types/index.js'

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // AI Provider API Keys
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
  // GitHub
  githubToken: process.env.GITHUB_TOKEN,
  // Astrid OAuth
  astridListId: process.env.ASTRID_OAUTH_LIST_ID,
  // Worker settings
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '30000'),
  maxBudgetUsd: parseFloat(process.env.MAX_BUDGET_USD || '10.0'),
  // Vercel deployment (prefer VERCEL_API_TOKEN over VERCEL_TOKEN)
  vercelToken: process.env.VERCEL_API_TOKEN || process.env.VERCEL_TOKEN,
  // iOS TestFlight
  testflightPublicLink: process.env.TESTFLIGHT_PUBLIC_LINK,
  // Terminal mode settings
  terminalMode: process.env.ASTRID_TERMINAL_MODE === 'true',
  defaultProjectPath: process.env.DEFAULT_PROJECT_PATH || process.cwd(),
  // Claude terminal settings
  claudeModel: process.env.CLAUDE_MODEL || 'opus',
  claudeMaxTurns: parseInt(process.env.CLAUDE_MAX_TURNS || '50', 10),
  // OpenAI terminal settings
  openaiModel: process.env.OPENAI_MODEL || 'o4-mini',
  openaiMaxTurns: parseInt(process.env.OPENAI_MAX_TURNS || '50', 10),
  // Gemini terminal settings
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  geminiMaxTurns: parseInt(process.env.GEMINI_MAX_TURNS || '50', 10),
}

function getApiKeyForService(service: AIService): string | undefined {
  switch (service) {
    case 'claude': return CONFIG.anthropicApiKey
    case 'openai': return CONFIG.openaiApiKey
    case 'gemini': return CONFIG.geminiApiKey
  }
}

/**
 * Create a terminal executor for the specified AI service.
 * Terminal executors process tasks using local tool execution.
 */
function createTerminalExecutor(service: AIService): TerminalExecutor {
  switch (service) {
    case 'claude':
      return new TerminalClaudeExecutor({
        model: CONFIG.claudeModel,
        maxTurns: CONFIG.claudeMaxTurns,
      })
    case 'openai':
      return new TerminalOpenAIExecutor({
        apiKey: CONFIG.openaiApiKey,
        model: CONFIG.openaiModel,
        maxTurns: CONFIG.openaiMaxTurns,
      })
    case 'gemini':
      return new TerminalGeminiExecutor({
        apiKey: CONFIG.geminiApiKey,
        model: CONFIG.geminiModel,
        maxTurns: CONFIG.geminiMaxTurns,
      })
  }
}

/**
 * Check which terminal mode providers are available
 */
async function getAvailableTerminalProviders(): Promise<{ service: AIService; available: boolean }[]> {
  const providers: { service: AIService; available: boolean }[] = []

  // Check Claude Code CLI
  const claudeExecutor = new TerminalClaudeExecutor()
  providers.push({ service: 'claude', available: await claudeExecutor.checkAvailable() })

  // Check OpenAI API key
  const openaiExecutor = new TerminalOpenAIExecutor()
  providers.push({ service: 'openai', available: await openaiExecutor.checkAvailable() })

  // Check Gemini API key
  const geminiExecutor = new TerminalGeminiExecutor()
  providers.push({ service: 'gemini', available: await geminiExecutor.checkAvailable() })

  return providers
}

// ============================================================================
// LOGGING
// ============================================================================

const logger: Logger = (level, message, meta) => {
  const timestamp = new Date().toISOString()
  const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '📝'
  console.log(`${timestamp} ${prefix} ${message}`, meta ? JSON.stringify(meta, null, 2) : '')
}

// ============================================================================
// AI SERVICE ROUTING
// ============================================================================

interface AgentConfig {
  repoPath: string
  apiKey: string
  model?: string
  maxBudgetUsd?: number
  maxTurns?: number
  maxIterations?: number
  logger?: Logger
  onProgress?: (message: string) => void
}

async function routePlanningToService(
  service: AIService,
  taskTitle: string,
  taskDescription: string | null,
  config: AgentConfig
): Promise<PlanningResult> {
  switch (service) {
    case 'claude':
      return planWithClaude(taskTitle, taskDescription, config as ClaudeExecutorConfig)
    case 'openai':
      return planWithOpenAI(taskTitle, taskDescription, config as OpenAIExecutorConfig)
    case 'gemini':
      return planWithGemini(taskTitle, taskDescription, config as GeminiExecutorConfig)
    default:
      throw new Error(`Unknown service: ${service}`)
  }
}

async function routeExecutionToService(
  service: AIService,
  plan: ImplementationPlan,
  taskTitle: string,
  taskDescription: string | null,
  config: AgentConfig
): Promise<ExecutionResult> {
  switch (service) {
    case 'claude':
      return executeWithClaude(plan, taskTitle, taskDescription, config as ClaudeExecutorConfig)
    case 'openai':
      return executeWithOpenAI(plan, taskTitle, taskDescription, config as OpenAIExecutorConfig)
    case 'gemini':
      return executeWithGemini(plan, taskTitle, taskDescription, config as GeminiExecutorConfig)
    default:
      throw new Error(`Unknown service: ${service}`)
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get assignee email from task, handling both flat and nested formats
 * API v1 returns assignee as nested object: { assignee: { email } }
 * Some APIs may return flat assigneeEmail field
 */
function getAssigneeEmail(task: AstridTask): string | undefined {
  return task.assigneeEmail || task.assignee?.email
}

// ============================================================================
// TASK PROCESSING
// ============================================================================

interface ProcessTaskOptions {
  onComment?: (message: string) => Promise<void>
}

async function processTask(
  task: { id: string; title: string; description: string | null; assigneeEmail?: string },
  repoPath: string,
  options?: ProcessTaskOptions
): Promise<{ plan: ImplementationPlan; execResult: ExecutionResult }> {
  const assigneeEmail = task.assigneeEmail || 'claude@astrid.cc'
  const service = getAgentService(assigneeEmail)
  const apiKey = getApiKeyForService(service)
  const onComment = options?.onComment || (async () => {})

  if (!apiKey) {
    throw new Error(`No API key configured for ${service}. Set ${service.toUpperCase()}_API_KEY`)
  }

  let iterationCount = 0
  const config: AgentConfig = {
    repoPath,
    apiKey,
    model: DEFAULT_MODELS[service],
    maxBudgetUsd: CONFIG.maxBudgetUsd,
    maxTurns: 50,
    maxIterations: 50,
    logger,
    onProgress: async (msg) => {
      console.log(`  → ${msg}`)
      // Post progress update every 10 iterations during execution
      iterationCount++
      if (iterationCount % 10 === 0) {
        await onComment(`📊 **Progress Update**\n\nIteration ${iterationCount}: ${msg}`)
      }
    },
  }

  console.log(`\n🔄 Processing task: ${task.title}`)
  console.log(`   Service: ${service}`)
  console.log(`   Repository: ${repoPath}`)

  // Phase 1: Planning
  console.log('\n📋 Phase 1: Planning...')
  const planResult = await routePlanningToService(
    service,
    task.title,
    task.description,
    config
  )

  if (!planResult.success || !planResult.plan) {
    throw new Error(`Planning failed: ${planResult.error}`)
  }

  console.log('\n✅ Plan created:')
  console.log(`   Summary: ${planResult.plan.summary}`)
  console.log(`   Files: ${planResult.plan.files.length}`)
  console.log(`   Complexity: ${planResult.plan.estimatedComplexity}`)
  if (planResult.usage) {
    console.log(`   Cost: $${planResult.usage.costUSD.toFixed(4)}`)
  }

  // Post planning complete comment
  const filesList = planResult.plan.files.slice(0, 5).map(f => `- \`${f.path}\`: ${f.purpose}`).join('\n')
  const moreFiles = planResult.plan.files.length > 5 ? `\n- ... and ${planResult.plan.files.length - 5} more files` : ''
  await onComment(
    `📋 **Planning Complete**\n\n` +
    `**Summary:** ${planResult.plan.summary}\n\n` +
    `**Complexity:** ${planResult.plan.estimatedComplexity}\n\n` +
    `**Files to modify (${planResult.plan.files.length}):**\n${filesList}${moreFiles}\n\n` +
    `⏳ Starting implementation...`
  )

  // Phase 2: Execution
  console.log('\n🔨 Phase 2: Execution...')
  iterationCount = 0 // Reset for execution phase
  const execResult = await routeExecutionToService(
    service,
    planResult.plan,
    task.title,
    task.description,
    config
  )

  if (!execResult.success) {
    throw new Error(`Execution failed: ${execResult.error}`)
  }

  console.log('\n✅ Execution complete:')
  console.log(`   Files modified: ${execResult.files.length}`)
  console.log(`   Commit message: ${execResult.commitMessage}`)
  if (execResult.usage) {
    console.log(`   Cost: $${execResult.usage.costUSD.toFixed(4)}`)
  }

  // Show modified files
  if (execResult.files.length > 0) {
    console.log('\n📁 Modified files:')
    for (const file of execResult.files) {
      console.log(`   ${file.action === 'create' ? '+' : file.action === 'delete' ? '-' : '~'} ${file.path}`)
    }
  }

  return { plan: planResult.plan, execResult }
}

// ============================================================================
// TERMINAL MODE TASK PROCESSING
// ============================================================================

interface TerminalTaskResult {
  success: boolean
  prUrl?: string
  files?: string[]
  summary?: string
  error?: string
}

/**
 * Process a task using terminal mode (local tool execution)
 * Routes to the appropriate executor based on assignee email.
 *
 * @param task - Task details including id, title, description, and assignee
 * @param projectPath - Path to the project directory
 * @param comments - Previous comments on the task for context
 * @param isFollowUp - Whether this is a follow-up to a previous session
 * @param onComment - Optional callback to post comments during execution
 */
async function processTaskTerminal(
  task: { id: string; title: string; description: string | null; assigneeEmail?: string },
  projectPath: string,
  comments?: Array<{ authorName: string; content: string; createdAt: string }>,
  isFollowUp?: boolean,
  onComment?: (content: string) => Promise<void>
): Promise<TerminalTaskResult> {
  // Determine which service to use based on assignee
  const assigneeEmail = task.assigneeEmail || 'claude@astrid.cc'
  const service = getAgentService(assigneeEmail)
  const executor = createTerminalExecutor(service)

  // Check if the executor is available
  const isAvailable = await executor.checkAvailable()
  if (!isAvailable) {
    const errorMessages: Record<AIService, string> = {
      claude: 'Claude Code CLI not found. Install it with: npm install -g @anthropic-ai/claude-code',
      openai: 'OpenAI API key not configured. Set OPENAI_API_KEY environment variable.',
      gemini: 'Gemini API key not configured. Set GEMINI_API_KEY environment variable.',
    }
    return {
      success: false,
      error: errorMessages[service]
    }
  }

  // Get model and max turns for the selected service
  const modelConfig: Record<AIService, { model: string; maxTurns: number }> = {
    claude: { model: CONFIG.claudeModel, maxTurns: CONFIG.claudeMaxTurns },
    openai: { model: CONFIG.openaiModel, maxTurns: CONFIG.openaiMaxTurns },
    gemini: { model: CONFIG.geminiModel, maxTurns: CONFIG.geminiMaxTurns },
  }
  const { model, maxTurns } = modelConfig[service]

  console.log(`\n🖥️  Terminal Mode: Processing task with ${service.toUpperCase()}`)
  console.log(`   Task: ${task.title}`)
  console.log(`   Project: ${projectPath}`)
  console.log(`   Service: ${service}`)
  console.log(`   Model: ${model}`)
  console.log(`   Max turns: ${maxTurns}`)

  // Create session object
  const session = {
    id: task.id,
    taskId: task.id,
    title: task.title,
    description: task.description || '',
    projectPath,
    provider: service,
    claudeSessionId: undefined, // Only used by Claude executor
    status: 'pending' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 0,
  }

  const context = { comments }

  let result: TerminalExecutionResult

  // Check if we should resume an existing session (only Claude supports native session resumption)
  const existingSessionId = service === 'claude'
    ? await terminalSessionStore.getClaudeSessionId(task.id)
    : undefined

  // Helper to transform retry-trigger comments into meaningful prompts
  // If user just says "retry!" we need to provide full task context, not pass "retry!" as the prompt
  const getEffectiveInput = (userComment: string | undefined): string => {
    const defaultPrompt = `Please continue with this task: ${task.title}${task.description ? `. ${task.description}` : ''}`

    if (!userComment) {
      return defaultPrompt
    }

    // Check if this is a retry-trigger phrase (like "retry!", "try again", etc.)
    // These shouldn't be passed as-is to Claude - they need to be expanded with full context
    if (isRetryComment(userComment)) {
      console.log(`📝 Expanding retry trigger "${userComment}" to full task context`)
      return defaultPrompt
    }

    // User provided meaningful instructions, use them as-is
    return userComment
  }

  // Build callbacks object
  const callbacks = {
    onProgress: (msg: string) => {
      console.log(`  → ${msg}`)
    },
    onComment,
  }

  if (isFollowUp && existingSessionId) {
    // Get the last user comment as the follow-up input
    const lastUserComment = comments?.filter(c => !c.authorName.includes('Agent'))?.pop()
    const input = getEffectiveInput(lastUserComment?.content)

    console.log(`\n🔄 Resuming existing session: ${existingSessionId}`)
    result = await executor.resumeSession(session, input, context, callbacks)
  } else if (isFollowUp) {
    // Non-Claude services rebuild context for follow-ups
    const lastUserComment = comments?.filter(c => !c.authorName.includes('Agent'))?.pop()
    const input = getEffectiveInput(lastUserComment?.content)

    console.log(`\n🔄 Processing follow-up with ${service.toUpperCase()}...`)
    result = await executor.resumeSession(session, input, context, callbacks)
  } else {
    console.log(`\n🚀 Starting new ${service.toUpperCase()} session...`)
    result = await executor.startSession(session, undefined, context, callbacks)
  }

  // Parse the output
  const parsed = executor.parseOutput(result.stdout)

  if (result.exitCode !== 0 && result.exitCode !== null) {
    return {
      success: false,
      error: parsed.error || `${service.toUpperCase()} executor exited with code ${result.exitCode}`,
      files: result.modifiedFiles,
    }
  }

  return {
    success: true,
    prUrl: result.prUrl || parsed.prUrl,
    files: result.modifiedFiles || parsed.files,
    summary: parsed.summary,
  }
}

// ============================================================================
// TASK STATUS DETECTION
// ============================================================================

interface Comment {
  id: string
  content: string
  authorId?: string
  author?: { email?: string; name?: string }
  createdAt: string
}

function isStartingMarker(content: string): boolean {
  const lower = content.toLowerCase()
  return content.includes('**Starting work**') ||
         content.includes('**Gemini AI Agent Starting**') ||
         content.includes('**Claude AI Agent Starting**') ||
         content.includes('**OpenAI Agent Starting**') ||
         content.includes('Gemini AI Agent starting') ||
         content.includes('Claude AI Agent starting') ||
         (lower.includes('starting') && lower.includes('agent'))
}

function isStartingMarkerStale(content: string, createdAt: string): boolean {
  // A "Starting" marker is stale if it's older than 5 minutes
  // If the task hasn't progressed past "Starting" in 5 min, something went wrong
  if (!isStartingMarker(content)) return false
  const markerTime = new Date(createdAt).getTime()
  const fiveMinutesAgo = Date.now() - (5 * 60 * 1000)
  return markerTime < fiveMinutesAgo
}

function isFailureMarker(content: string): boolean {
  return content.includes('Workflow Failed') ||
         content.includes('❌ **Error**') ||
         content.includes('❌ **Processing Failed**') ||
         content.includes('Planning produced no files') ||
         content.includes('**Implementation Failed**')
}

function isCompletionMarker(content: string): boolean {
  return content.includes('**Pull Request Created**') ||
         content.includes('🎉 **Pull Request Created!**') ||
         content.includes('**Implementation Complete**') ||
         content.includes('**Implementation Complete!**') ||  // Terminal mode posts with !
         content.includes('🎉 **Shipped!**') ||
         content.includes('**Shipped!**') ||
         content.includes('has been merged to main') ||
         content.includes('❌ **Failed**') ||
         content.includes('❌ **Processing Failed**') ||
         content.includes('**Processing Failed**') ||
         content.includes('🚀 **Ready for Review!**')  // Task is done when ready for review
}

function isShippedMarker(content: string): boolean {
  return content.includes('🎉 **Shipped!**') ||
         content.includes('**Shipped!**') ||
         content.includes('has been merged to main')
}

/**
 * Check if task is in a terminal state (done, no more processing needed)
 * This catches tasks that have a completion marker AND no actionable feedback
 */
function isTerminalState(content: string): boolean {
  return isShippedMarker(content) ||
         content.includes('🚀 **Ready for Review!**') ||
         content.includes('**Implementation Complete**') ||
         content.includes('**Implementation Complete!**') ||
         content.includes('❌ **Processing Failed**') ||
         content.includes('**Processing Failed**')
}

function isRetryComment(content: string): boolean {
  const lower = content.toLowerCase().trim()
  // Match various ways users might ask for retry
  const retryPhrases = [
    'retry',
    'try again',
    'tryagain',
    'please retry',
    'retry please',
    'reprocess',
    'please reprocess',
    'redo',
    'do again',
    'run again',
    'try it again',
    'give it another try',
    'one more time',
    'again please',
    'again',
  ]

  for (const phrase of retryPhrases) {
    if (lower === phrase || lower.startsWith(phrase + ' ') || lower.endsWith(' ' + phrase)) {
      return true
    }
  }

  // Also match if "retry" or "try again" appears anywhere in a short message
  if (lower.length < 50 && (lower.includes('retry') || lower.includes('try again'))) {
    return true
  }

  return false
}

function isShipItComment(content: string): boolean {
  const lower = content.toLowerCase().trim()
  return lower === 'ship it' ||
         lower === 'shipit' ||
         lower === 'ship' ||
         lower === 'merge' ||
         lower === 'lgtm' ||
         lower.startsWith('ship it')
}

function isApprovalOrAckComment(content: string): boolean {
  // Comments that acknowledge completion but don't request changes
  const lower = content.toLowerCase().trim()
  const approvalPhrases = [
    'thanks', 'thank you', 'thx', 'ty',
    'great', 'awesome', 'perfect', 'nice', 'good',
    'looks good', 'looking good',
    'approved', 'approve',
    '👍', '🎉', '✅', '💯',
    'ok', 'okay', 'k',
    'done', 'complete', 'finished',
    'ship it', 'shipit', 'ship', 'merge', 'lgtm' // Also ignore ship it here - handled separately
  ]

  // Short comments that are likely acknowledgments
  if (lower.length < 30) {
    for (const phrase of approvalPhrases) {
      if (lower === phrase || lower.startsWith(phrase + ' ') || lower.startsWith(phrase + '!')) {
        return true
      }
    }
  }
  return false
}

function extractPrUrl(comments: Comment[]): string | null {
  for (const comment of comments) {
    // Look for PR URLs in comments
    const prMatch = comment.content.match(/https:\/\/github\.com\/[^\/]+\/[^\/]+\/pull\/\d+/)
    if (prMatch) {
      return prMatch[0]
    }
  }
  return null
}

function isAIAgentComment(comment: Comment): boolean {
  const email = comment.author?.email || ''
  return email.endsWith('@astrid.cc') && email !== 'system@astrid.cc'
}

interface TaskProcessingStatus {
  shouldProcess: boolean
  reason: string
  action?: 'process' | 'ship_it'
  prUrl?: string
}

/**
 * Determine if a task should be processed based on its comments.
 * NOTE: Task completion status (task.completed) should be checked BEFORE calling this.
 * This function only handles comment-based state detection for incomplete tasks.
 */
function shouldProcessTask(comments: Comment[]): TaskProcessingStatus {
  // No comments = new task, process it
  if (comments.length === 0) {
    return { shouldProcess: true, reason: 'New task - no comments' }
  }

  // Sort by date descending (most recent first)
  const sorted = [...comments].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  // Find most recent AI agent comment and most recent user comment
  const mostRecentAgentComment = sorted.find(c => isAIAgentComment(c))
  const mostRecentUserComment = sorted.find(c => !isAIAgentComment(c))

  // If no agent has worked on this yet, process it
  if (!mostRecentAgentComment) {
    return { shouldProcess: true, reason: 'No agent activity yet' }
  }

  // Check if task has a PR ready for shipping
  if (mostRecentUserComment && isShipItComment(mostRecentUserComment.content)) {
    // Only ship if there's a PR created comment before this
    const prUrl = extractPrUrl(sorted)
    if (prUrl) {
      return { shouldProcess: true, action: 'ship_it', reason: 'User requested ship it', prUrl }
    }
  }

  // Check if agent is currently working (starting marker without completion)
  if (isStartingMarker(mostRecentAgentComment.content)) {
    if (isStartingMarkerStale(mostRecentAgentComment.content, mostRecentAgentComment.createdAt)) {
      return { shouldProcess: true, reason: 'Starting marker is stale (>5 min) - task likely stuck' }
    }
    return { shouldProcess: false, reason: 'Task is currently being processed' }
  }

  // Check if agent finished (any completion or terminal state)
  if (isCompletionMarker(mostRecentAgentComment.content) || isTerminalState(mostRecentAgentComment.content)) {
    // Shipped = done forever
    if (isShippedMarker(mostRecentAgentComment.content)) {
      return { shouldProcess: false, reason: 'Task already shipped' }
    }

    // PR created or ready for review = waiting for user action, don't reprocess
    if (mostRecentAgentComment.content.includes('**Pull Request Created**') ||
        mostRecentAgentComment.content.includes('**Ready for Review!**')) {
      return { shouldProcess: false, reason: 'PR created - waiting for user review' }
    }

    // Implementation complete = waiting for "ship it" approval, don't reprocess
    if (mostRecentAgentComment.content.includes('**Implementation Complete**') ||
        mostRecentAgentComment.content.includes('**Implementation Complete!**')) {
      // Check if user said "ship it" after completion
      if (mostRecentUserComment && isShipItComment(mostRecentUserComment.content)) {
        // Check if there's a PR to ship
        const prUrl = extractPrUrl(sorted)
        if (prUrl) {
          return { shouldProcess: true, action: 'ship_it', reason: 'User requested ship it after completion', prUrl }
        }
        // No PR, but user wants to ship - allow processing to push/deploy
        return { shouldProcess: true, action: 'ship_it', reason: 'User requested ship it - will push and deploy' }
      }
      return { shouldProcess: false, reason: 'Implementation complete - comment "ship it" to deploy' }
    }

    // Failed = only reprocess if user explicitly requests retry
    if (mostRecentAgentComment.content.includes('**Processing Failed**') ||
        mostRecentAgentComment.content.includes('**Failed**')) {
      if (mostRecentUserComment && isRetryComment(mostRecentUserComment.content)) {
        return { shouldProcess: true, reason: 'User requested retry after failure' }
      }
      return { shouldProcess: false, reason: 'Task failed - comment "retry" or "try again" to retry' }
    }

    // Other completion - don't reprocess unless explicit retry
    if (mostRecentUserComment && isRetryComment(mostRecentUserComment.content)) {
      return { shouldProcess: true, reason: 'User requested retry' }
    }
    return { shouldProcess: false, reason: 'Task already completed' }
  }

  // Default: process if we can't determine state
  return { shouldProcess: true, reason: 'Unknown state - processing' }
}

// ============================================================================
// GITHUB PR CREATION
// ============================================================================

async function createPullRequest(
  repoPath: string,
  owner: string,
  repo: string,
  taskTitle: string,
  commitMessage: string,
  prDescription: string,
  agentName: string
): Promise<{ success: boolean; prUrl?: string; branchName?: string; error?: string }> {
  const { execSync } = await import('child_process')

  try {
    // Create branch name
    const timestamp = Date.now()
    const safeName = taskTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)
    const branchName = `astrid-ai/${timestamp}-${safeName}`

    console.log(`📦 Creating branch: ${branchName}`)
    execSync(`git checkout -b ${branchName}`, { cwd: repoPath, stdio: 'pipe' })

    // Stage and commit
    execSync('git add -A', { cwd: repoPath, stdio: 'pipe' })

    const status = execSync('git status --porcelain', { cwd: repoPath, encoding: 'utf-8' })
    if (!status.trim()) {
      return { success: false, error: 'No changes to commit' }
    }

    const fullCommit = `${commitMessage}\n\n🤖 Generated with ${agentName} via Astrid`
    execSync(`git commit -m "${fullCommit.replace(/"/g, '\\"')}"`, { cwd: repoPath, stdio: 'pipe' })

    console.log(`📤 Pushing to origin/${branchName}`)
    execSync(`git push -u origin ${branchName}`, { cwd: repoPath, stdio: 'pipe' })

    // Create PR via GitHub API
    console.log('🔗 Creating pull request')
    const prBody = `${prDescription}\n\n---\n🤖 Generated with ${agentName} via Astrid`

    const prResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${CONFIG.githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: commitMessage,
        body: prBody,
        head: branchName,
        base: 'main',
      }),
    })

    if (!prResponse.ok) {
      const error = await prResponse.text()
      return { success: false, error: `GitHub API error: ${error}` }
    }

    const prData = await prResponse.json() as { html_url: string }
    console.log(`✅ PR created: ${prData.html_url}`)

    return { success: true, prUrl: prData.html_url, branchName }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

// ============================================================================
// VERCEL PREVIEW DEPLOYMENT
// ============================================================================

function branchToSubdomain(branchName: string): string {
  // Convert branch name to valid subdomain
  return branchName
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 63)
}

async function deployVercelPreview(
  repoPath: string,
  branchName: string
): Promise<{ success: boolean; previewUrl?: string; error?: string }> {
  if (!CONFIG.vercelToken) {
    return { success: false, error: 'VERCEL_TOKEN not configured' }
  }

  const { execSync } = await import('child_process')
  const subdomain = branchToSubdomain(branchName)

  console.log(`🚀 Deploying Vercel preview for branch: ${branchName}`)

  try {
    // Deploy to Vercel preview
    const deployOutput = execSync(
      `vercel deploy --yes --force --token=${CONFIG.vercelToken}`,
      { cwd: repoPath, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    )

    // Extract deployment URL from output
    const urlMatch = deployOutput.match(/https:\/\/[^\s]+\.vercel\.app/)
    if (!urlMatch) {
      return { success: false, error: 'Could not extract deployment URL' }
    }

    const deploymentUrl = urlMatch[0]
    console.log(`✅ Vercel preview deployed: ${deploymentUrl}`)

    return { success: true, previewUrl: deploymentUrl }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

// ============================================================================
// iOS DETECTION
// ============================================================================

const IOS_FILE_PATTERNS = [
  /^ios-app\//,
  /^ios\//,
  /\.swift$/,
  /\.xcodeproj/,
  /\.xcworkspace/,
  /Info\.plist$/,
  /\.entitlements$/,
  /Podfile$/,
]

function detectIOSChanges(repoPath: string): boolean {
  try {
    const { execSync } = require('child_process')
    // Get list of changed files in the branch
    const changedFiles = execSync(
      'git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only HEAD',
      { cwd: repoPath, encoding: 'utf-8' }
    ).split('\n').filter(Boolean)

    return changedFiles.some((file: string) =>
      IOS_FILE_PATTERNS.some(pattern => pattern.test(file))
    )
  } catch {
    return false
  }
}

// ============================================================================
// WORKER LOOP
// ============================================================================

// Track tasks currently being processed to avoid duplicates
const processingTasks = new Set<string>()

// Track recently completed tasks to prevent rapid reprocessing (cooldown)
const recentlyCompletedTasks = new Map<string, number>() // taskId -> completedAt timestamp
const COMPLETION_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes cooldown after completion

function isInCooldown(taskId: string): boolean {
  const completedAt = recentlyCompletedTasks.get(taskId)
  if (!completedAt) return false
  const elapsed = Date.now() - completedAt
  if (elapsed > COMPLETION_COOLDOWN_MS) {
    recentlyCompletedTasks.delete(taskId) // Clean up expired entry
    return false
  }
  return true
}

function markTaskCompleted(taskId: string): void {
  recentlyCompletedTasks.set(taskId, Date.now())
}

async function runWorker(): Promise<void> {
  const client = new AstridOAuthClient()

  if (!client.isConfigured()) {
    console.error('❌ OAuth credentials not configured')
    console.error('   Set ASTRID_OAUTH_CLIENT_ID and ASTRID_OAUTH_CLIENT_SECRET')
    process.exit(1)
  }

  const listId = CONFIG.astridListId
  if (!listId) {
    console.error('❌ ASTRID_OAUTH_LIST_ID not configured')
    process.exit(1)
  }

  if (!CONFIG.githubToken) {
    console.error('❌ GITHUB_TOKEN not configured')
    process.exit(1)
  }

  console.log('🤖 Astrid Agent Worker')
  console.log(`   List ID: ${listId}`)
  console.log(`   Poll interval: ${CONFIG.pollIntervalMs}ms`)
  console.log('')

  // Test connection
  const testResult = await client.testConnection()
  if (!testResult.success) {
    console.error(`❌ Connection failed: ${testResult.error}`)
    process.exit(1)
  }
  console.log('✅ Connected to Astrid API\n')

  // Get list info to find repository
  const listResult = await client.getList(listId)
  let defaultRepo = { owner: '', repo: '' }
  // API returns githubRepositoryId (e.g., "owner/repo"), not repository
  const repoString = listResult.data?.githubRepositoryId || listResult.data?.repository
  if (listResult.success && repoString) {
    const parts = repoString.split('/')
    if (parts.length === 2) {
      defaultRepo = { owner: parts[0], repo: parts[1] }
      console.log(`📦 Default repository: ${repoString}\n`)
    }
  }

  if (!defaultRepo.owner || !defaultRepo.repo) {
    console.error('❌ No repository configured for this list.')
    console.error('   Set the GitHub repository in list settings on astrid.cc')
    process.exit(1)
  }

  // Polling loop
  while (true) {
    try {
      const tasksResult = await client.getTasks(listId, false)

      if (tasksResult.success && tasksResult.data) {
        // STEP 1: Filter out completed and unassigned tasks FIRST
        // This is the primary filter - don't waste any tokens on these
        const eligibleTasks = tasksResult.data.filter(task => {
          // RULE 1: Completed tasks are NEVER processed
          if (task.completed) {
            return false
          }
          // RULE 2: Must be assigned to a registered AI agent
          const email = getAssigneeEmail(task)
          if (!email || !isRegisteredAgent(email)) {
            return false
          }
          return true
        })

        if (eligibleTasks.length > 0) {
          console.log(`\n📋 Found ${eligibleTasks.length} eligible task(s) (not completed, assigned to AI)`)

          for (const task of eligibleTasks) {
            // Skip if already being processed by this worker instance
            if (processingTasks.has(task.id)) {
              console.log(`   ⏳ ${task.id.slice(0, 8)}... already in progress`)
              continue
            }

            // Skip if in cooldown period (recently completed)
            if (isInCooldown(task.id)) {
              console.log(`   ⏸️ ${task.id.slice(0, 8)}... in cooldown (recently completed)`)
              continue
            }

            // Declare agentUserId outside try block so it's accessible in catch
            let agentUserId: string | null = null

            try {
              // STEP 2: Check comments for processing state
              // (only after we've confirmed task is not completed and is assigned to AI)
              const commentsResult = await client.getComments(task.id)
              const comments = commentsResult.success ? commentsResult.data || [] : []

              const status = shouldProcessTask(comments as Comment[])
              const assigneeEmail = getAssigneeEmail(task) || 'claude@astrid.cc'
              console.log(`\n🔍 Task: ${task.title.slice(0, 50)}...`)
              console.log(`   ID: ${task.id}`)
              console.log(`   Agent: ${assigneeEmail}`)
              console.log(`   Status: ${status.reason}`)

              if (!status.shouldProcess) {
                continue
              }

              // Get agent info for posting comments
              const service = getAgentService(assigneeEmail)
              const agentName = `${service.charAt(0).toUpperCase() + service.slice(1)} AI Agent`

              // Look up agent user ID to post comments as the agent
              agentUserId = await client.getAgentIdByEmail(assigneeEmail)
              if (agentUserId) {
                console.log(`   Posting as: ${assigneeEmail} (${agentUserId})`)
              } else {
                console.log(`   ⚠️ Could not find agent ID for ${assigneeEmail} - comments will be posted as OAuth user`)
              }

              // Handle "ship it" action - merge existing PR instead of reprocessing
              if (status.action === 'ship_it' && status.prUrl) {
                console.log(`\n🚀 Ship It! Merging PR: ${status.prUrl}`)
                processingTasks.add(task.id)

                try {
                  // Extract PR number from URL
                  const prMatch = status.prUrl.match(/\/pull\/(\d+)/)
                  if (!prMatch) {
                    throw new Error('Could not extract PR number from URL')
                  }
                  const prNumber = prMatch[1]

                  // Merge PR using GitHub CLI or API
                  const { execSync } = await import('child_process')
                  execSync(
                    `gh pr merge ${prNumber} --merge --repo ${defaultRepo.owner}/${defaultRepo.repo}`,
                    { stdio: 'inherit' }
                  )

                  console.log(`✅ PR #${prNumber} merged successfully!`)

                  // Deploy to production if Vercel token is configured
                  let productionUrl: string | undefined
                  if (process.env.VERCEL_TOKEN) {
                    console.log(`\n🚀 Deploying to production...`)
                    try {
                      const deployOutput = execSync('vercel --prod --yes', {
                        encoding: 'utf-8',
                        timeout: 300000, // 5 minute timeout
                        env: { ...process.env },
                      })
                      // Extract production URL from output
                      const urlMatch = deployOutput.match(/https:\/\/[^\s]+\.vercel\.app/)
                      if (urlMatch) {
                        productionUrl = urlMatch[0]
                      }
                      console.log(`✅ Production deployment complete!`)
                    } catch (deployError) {
                      console.error(`⚠️ Production deployment failed:`, deployError)
                      // Continue - merge was successful, just deployment failed
                    }
                  }

                  // Post success comment
                  let successMessage = `🎉 **Shipped!**\n\n` +
                    `PR #${prNumber} has been merged to main.\n\n`

                  if (productionUrl) {
                    successMessage += `🌐 **Production:** [${productionUrl}](${productionUrl})\n\n`
                  } else if (process.env.VERCEL_TOKEN) {
                    successMessage += `⚠️ Production deployment may have failed - check Vercel dashboard.\n\n`
                  } else {
                    successMessage += `The changes will be live after deployment completes.\n\n`
                  }

                  successMessage += `---\n*Merged by ${agentName}*`

                  await client.addComment(task.id, successMessage, agentUserId || undefined)
                } catch (mergeError) {
                  console.error('❌ Failed to merge PR:', mergeError)
                  await client.addComment(task.id,
                    `❌ **Merge Failed**\n\n` +
                    `Could not merge PR: ${mergeError instanceof Error ? mergeError.message : String(mergeError)}\n\n` +
                    `Please merge manually: ${status.prUrl}`,
                    agentUserId || undefined
                  )
                } finally {
                  processingTasks.delete(task.id)
                }
                continue
              }

              // Mark as processing for normal workflow
              processingTasks.add(task.id)

              // Post starting comment
              await client.addComment(task.id,
                `🤖 **${agentName} Starting**\n\n` +
                `**Task:** ${task.title}\n` +
                `**Repository:** \`${defaultRepo.owner}/${defaultRepo.repo}\`\n\n` +
                `**Workflow:**\n` +
                `1. ⏳ Clone repository\n` +
                `2. ⏳ **Planning** - Analyze codebase\n` +
                `3. ⏳ **Implementation** - Make changes\n` +
                `4. ⏳ Create pull request\n\n` +
                `---\n*Using ${service} API*`,
                agentUserId || undefined
              )

              // Clone repository
              console.log(`\n📦 Cloning ${defaultRepo.owner}/${defaultRepo.repo}...`)
              const { repoPath, cleanup } = await prepareRepository(
                defaultRepo.owner,
                defaultRepo.repo,
                'main',
                CONFIG.githubToken!
              )

              try {
                // Process task with progress comments
                const { plan, execResult } = await processTask({
                  id: task.id,
                  title: task.title,
                  description: task.description,
                  assigneeEmail,
                }, repoPath, {
                  onComment: async (message) => {
                    await client.addComment(task.id, message, agentUserId || undefined)
                  }
                })

                // Verify changes before creating PR
                console.log(`\n🔍 Verifying changes...`)
                await client.addComment(task.id,
                  `🔍 **Verifying Changes**\n\n` +
                  `Running build/type checks to ensure code quality...`,
                  agentUserId || undefined
                )

                const verificationResult = await verifyChanges(repoPath, logger)

                if (!verificationResult.success) {
                  console.log(`⚠️ Verification failed, attempting to fix...`)
                  // Post verification failure - agent should have already tried to fix
                  await client.addComment(task.id,
                    `⚠️ **Verification Warning**\n\n` +
                    `Initial verification had issues. The agent attempted to fix them.\n\n` +
                    `\`\`\`\n${verificationResult.output.slice(0, 1500)}\n\`\`\`\n\n` +
                    `Proceeding with PR creation - please review carefully.`,
                    agentUserId || undefined
                  )
                } else {
                  console.log(`✅ Verification passed!`)
                }

                // Get the execution result for PR creation
                // For now, use a generic commit message
                const commitMessage = `feat: ${task.title}`
                const prDescription = task.description || task.title

                // Create PR
                const prResult = await createPullRequest(
                  repoPath,
                  defaultRepo.owner,
                  defaultRepo.repo,
                  task.title,
                  commitMessage,
                  prDescription,
                  agentName
                )

                if (prResult.success && prResult.prUrl) {
                  // Post initial PR created message
                  await client.addComment(task.id,
                    `🎉 **Pull Request Created!**\n\n` +
                    `🔗 **[${prResult.prUrl}](${prResult.prUrl})**\n\n` +
                    `⏳ Deploying preview...\n\n` +
                    `---\n*Generated by ${agentName} via Astrid*`,
                    agentUserId || undefined
                  )

                  // Deploy Vercel preview if configured
                  let previewMessage = ''
                  if (prResult.branchName && CONFIG.vercelToken) {
                    const vercelResult = await deployVercelPreview(repoPath, prResult.branchName)
                    if (vercelResult.success && vercelResult.previewUrl) {
                      previewMessage = `🚀 **Preview:** [${vercelResult.previewUrl}](${vercelResult.previewUrl})\n\n`
                      console.log(`   ✅ Preview deployed: ${vercelResult.previewUrl}`)
                    } else {
                      console.log(`   ⚠️ Preview deployment failed: ${vercelResult.error}`)
                    }
                  }

                  // Check for iOS changes and add TestFlight link
                  let iosMessage = ''
                  const hasIOSChanges = detectIOSChanges(repoPath)
                  if (hasIOSChanges && CONFIG.testflightPublicLink) {
                    iosMessage = `📱 **iOS TestFlight:** [${CONFIG.testflightPublicLink}](${CONFIG.testflightPublicLink})\n` +
                      `*(Build will be available after Xcode Cloud completes)*\n\n`
                    console.log(`   📱 iOS changes detected - TestFlight link added`)
                  }

                  // Post staging ready message with preview URL and TestFlight if applicable
                  if (previewMessage || iosMessage) {
                    await client.addComment(task.id,
                      `🚀 **Ready for Review!**\n\n` +
                      previewMessage +
                      iosMessage +
                      `**What's next:**\n` +
                      `1. ✅ Test the changes\n` +
                      `2. Review the code in the PR\n` +
                      `3. Comment "ship it" to merge!\n\n` +
                      `---\n*Preview deployment complete*`,
                      agentUserId || undefined
                    )
                  }

                  // Unassign task so it goes back to user for review
                  await client.reassignTask(task.id, null).catch(err => {
                    console.log(`   ⚠️ Could not unassign task: ${err}`)
                  })
                  console.log(`   ✅ Task unassigned - ready for review`)

                  // Mark as completed with cooldown to prevent rapid reprocessing
                  markTaskCompleted(task.id)
                } else {
                  await client.addComment(task.id,
                    `⚠️ **PR Creation Failed**\n\n` +
                    `Error: ${prResult.error}\n\n` +
                    `The changes were made but could not be pushed. Check the logs for details.`,
                    agentUserId || undefined
                  )
                }
              } finally {
                await cleanup()
                processingTasks.delete(task.id)
              }

            } catch (error) {
              console.error(`❌ Failed to process task ${task.id}:`, error)
              processingTasks.delete(task.id)

              // Post error comment (agentUserId may be undefined if error occurred before lookup)
              await client.addComment(task.id,
                `❌ **Processing Failed**\n\n` +
                `Error: ${error instanceof Error ? error.message : String(error)}\n\n` +
                `---\n` +
                `💡 **To try again:** Comment "retry" or "try again"\n` +
                `💡 **To ship existing PR:** Comment "ship it"`,
                agentUserId || undefined
              ).catch(() => {})
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Poll error:', error)
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, CONFIG.pollIntervalMs))
  }
}

// ============================================================================
// TERMINAL MODE WORKER LOOP
// ============================================================================

/**
 * Terminal mode worker loop - uses local tool execution instead of API
 * Supports Claude (CLI), OpenAI (API), and Gemini (API) providers.
 */
async function runWorkerTerminal(): Promise<void> {
  const client = new AstridOAuthClient()

  if (!client.isConfigured()) {
    console.error('❌ OAuth credentials not configured')
    console.error('   Set ASTRID_OAUTH_CLIENT_ID and ASTRID_OAUTH_CLIENT_SECRET')
    process.exit(1)
  }

  const listId = CONFIG.astridListId
  if (!listId) {
    console.error('❌ ASTRID_OAUTH_LIST_ID not configured')
    process.exit(1)
  }

  // Check which terminal mode providers are available
  const providers = await getAvailableTerminalProviders()
  const availableProviders = providers.filter(p => p.available)

  if (availableProviders.length === 0) {
    console.error('❌ No terminal mode providers available')
    console.error('')
    console.error('   Configure at least one of the following:')
    console.error('   • Claude: Install Claude Code CLI (npm install -g @anthropic-ai/claude-code)')
    console.error('   • OpenAI: Set OPENAI_API_KEY environment variable')
    console.error('   • Gemini: Set GEMINI_API_KEY environment variable')
    console.error('')
    console.error('   Or use API mode: npx astrid-agent (without --terminal)')
    process.exit(1)
  }

  console.log('🤖 Astrid Agent Worker (Terminal Mode)')
  console.log(`   List ID: ${listId}`)
  console.log(`   Poll interval: ${CONFIG.pollIntervalMs}ms`)
  console.log(`   Project path: ${CONFIG.defaultProjectPath}`)
  console.log('')
  console.log('   Available providers:')
  for (const provider of providers) {
    const status = provider.available ? '✅' : '❌'
    const config = provider.service === 'claude'
      ? `(model: ${CONFIG.claudeModel})`
      : provider.service === 'openai'
      ? `(model: ${CONFIG.openaiModel})`
      : `(model: ${CONFIG.geminiModel})`
    console.log(`   ${status} ${provider.service.toUpperCase()} ${provider.available ? config : '(not configured)'}`)
  }
  console.log('')

  // Test connection
  const testResult = await client.testConnection()
  if (!testResult.success) {
    console.error(`❌ Connection failed: ${testResult.error}`)
    process.exit(1)
  }
  console.log('✅ Connected to Astrid API')
  console.log(`✅ ${availableProviders.length} terminal provider(s) available\n`)

  // Polling loop
  while (true) {
    try {
      const tasksResult = await client.getTasks(listId, false)

      if (tasksResult.success && tasksResult.data) {
        // Filter for incomplete tasks assigned to AI agents
        const eligibleTasks = tasksResult.data.filter(task => {
          if (task.completed) return false
          const email = getAssigneeEmail(task)
          if (!email || !isRegisteredAgent(email)) return false
          return true
        })

        if (eligibleTasks.length > 0) {
          console.log(`\n📋 Found ${eligibleTasks.length} eligible task(s)`)

          for (const task of eligibleTasks) {
            // Skip if already being processed
            if (processingTasks.has(task.id)) {
              console.log(`   ⏳ ${task.id.slice(0, 8)}... already in progress`)
              continue
            }

            // Skip if in cooldown period (recently completed)
            if (isInCooldown(task.id)) {
              console.log(`   ⏸️ ${task.id.slice(0, 8)}... in cooldown (recently completed)`)
              continue
            }

            let agentUserId: string | null = null

            try {
              // Check comments for processing state
              const commentsResult = await client.getComments(task.id)
              const comments = commentsResult.success ? commentsResult.data || [] : []

              const status = shouldProcessTask(comments as Comment[])
              const assigneeEmail = getAssigneeEmail(task) || 'claude@astrid.cc'

              console.log(`\n🔍 Task: ${task.title.slice(0, 50)}...`)
              console.log(`   ID: ${task.id}`)
              console.log(`   Agent: ${assigneeEmail}`)
              console.log(`   Status: ${status.reason}`)

              if (!status.shouldProcess) {
                continue
              }

              const service = getAgentService(assigneeEmail)
              const agentName = `${service.charAt(0).toUpperCase() + service.slice(1)} AI Agent (Terminal)`

              // Get agent user ID
              agentUserId = await client.getAgentIdByEmail(assigneeEmail)
              if (agentUserId) {
                console.log(`   Posting as: ${assigneeEmail} (${agentUserId})`)
              }

              // Handle "ship it" action
              if (status.action === 'ship_it' && status.prUrl) {
                console.log(`\n🚀 Ship It! Merging PR: ${status.prUrl}`)
                processingTasks.add(task.id)

                try {
                  const prMatch = status.prUrl.match(/\/pull\/(\d+)/)
                  if (!prMatch) {
                    throw new Error('Could not extract PR number from URL')
                  }
                  const prNumber = prMatch[1]

                  // Get repo from list
                  const listResult = await client.getList(listId)
                  const repoString = listResult.data?.githubRepositoryId || listResult.data?.repository
                  if (!repoString) {
                    throw new Error('No repository configured for this list')
                  }

                  const { execSync } = await import('child_process')
                  execSync(
                    `gh pr merge ${prNumber} --merge --repo ${repoString}`,
                    { stdio: 'inherit' }
                  )

                  console.log(`✅ PR #${prNumber} merged successfully!`)

                  // Deploy to production if Vercel token is configured
                  let productionUrl: string | undefined
                  if (process.env.VERCEL_TOKEN) {
                    console.log(`\n🚀 Deploying to production...`)
                    try {
                      const deployOutput = execSync('vercel --prod --yes', {
                        cwd: CONFIG.defaultProjectPath,
                        encoding: 'utf-8',
                        timeout: 300000, // 5 minute timeout
                        env: { ...process.env },
                      })
                      // Extract production URL from output
                      const urlMatch = deployOutput.match(/https:\/\/[^\s]+\.vercel\.app/)
                      if (urlMatch) {
                        productionUrl = urlMatch[0]
                      }
                      console.log(`✅ Production deployment complete!`)
                    } catch (deployError) {
                      console.error(`⚠️ Production deployment failed:`, deployError)
                      // Continue - merge was successful, just deployment failed
                    }
                  }

                  // Post success comment
                  let successMessage = `🎉 **Shipped!**\n\n` +
                    `PR #${prNumber} has been merged to main.\n\n`

                  if (productionUrl) {
                    successMessage += `🌐 **Production:** [${productionUrl}](${productionUrl})\n\n`
                  } else if (process.env.VERCEL_TOKEN) {
                    successMessage += `⚠️ Production deployment may have failed - check Vercel dashboard.\n\n`
                  } else {
                    successMessage += `The changes will be live after deployment completes.\n\n`
                  }

                  successMessage += `---\n*Merged by ${agentName}*`

                  await client.addComment(task.id, successMessage, agentUserId || undefined)
                } catch (mergeError) {
                  console.error('❌ Failed to merge PR:', mergeError)
                  await client.addComment(task.id,
                    `❌ **Merge Failed**\n\n` +
                    `Could not merge PR: ${mergeError instanceof Error ? mergeError.message : String(mergeError)}\n\n` +
                    `Please merge manually: ${status.prUrl}`,
                    agentUserId || undefined
                  )
                } finally {
                  processingTasks.delete(task.id)
                }
                continue
              }

              // Mark as processing
              processingTasks.add(task.id)

              // Post starting comment
              await client.addComment(task.id,
                `🖥️ **${agentName} Starting**\n\n` +
                `**Task:** ${task.title}\n` +
                `**Mode:** Terminal (local Claude Code CLI)\n` +
                `**Model:** ${CONFIG.claudeModel}\n\n` +
                `Working on this task locally...\n\n` +
                `---\n*Using local Claude Code*`,
                agentUserId || undefined
              )

              // Format comments for terminal executor
              const formattedComments = comments.map(c => ({
                authorName: (c as Comment).author?.name || 'Unknown',
                content: (c as Comment).content,
                createdAt: (c as Comment).createdAt,
              }))

              // Check if this is a follow-up (has previous agent activity)
              const hasAgentActivity = comments.some(c => isAIAgentComment(c as Comment))
              const isFollowUp = hasAgentActivity && comments.length > 1

              // Process task using local Claude Code with comment posting
              const result = await processTaskTerminal(
                {
                  id: task.id,
                  title: task.title,
                  description: task.description,
                  assigneeEmail,
                },
                CONFIG.defaultProjectPath,
                formattedComments,
                isFollowUp,
                // Post intermediate comments (plans, questions, progress) to the task
                async (content: string) => {
                  await client.addComment(task.id, content, agentUserId || undefined)
                }
              )

              if (result.success) {
                // Post success comment
                let successMessage = `🎉 **Implementation Complete!**\n\n`

                if (result.summary) {
                  successMessage += `${result.summary}\n\n`
                }

                if (result.files && result.files.length > 0) {
                  successMessage += `**Files modified:**\n${result.files.map(f => `- \`${f}\``).join('\n')}\n\n`
                }

                if (result.prUrl) {
                  successMessage += `🔗 **Pull Request:** [${result.prUrl}](${result.prUrl})\n\n`

                  // Deploy Vercel preview if configured
                  let previewUrl = ''
                  if (CONFIG.vercelToken && result.prUrl) {
                    // Extract branch name from PR URL or use result
                    const branchMatch = result.prUrl.match(/\/pull\/(\d+)/)
                    if (branchMatch) {
                      // Try to get branch name - for now use task ID prefix
                      const branchName = `task/${task.id.slice(0, 8)}`
                      const vercelResult = await deployVercelPreview(CONFIG.defaultProjectPath, branchName)
                      if (vercelResult.success && vercelResult.previewUrl) {
                        previewUrl = vercelResult.previewUrl
                        successMessage += `🚀 **Preview:** [${previewUrl}](${previewUrl})\n\n`
                        console.log(`   ✅ Preview deployed: ${previewUrl}`)
                      } else {
                        console.log(`   ⚠️ Preview deployment skipped: ${vercelResult.error}`)
                      }
                    }
                  }

                  successMessage += `**What's next:**\n` +
                    `1. Review the changes in the PR\n` +
                    (previewUrl ? `2. Test the preview: ${previewUrl}\n` : `2. Test the preview deployment\n`) +
                    `3. Comment "ship it" to merge!\n\n`
                }

                successMessage += `---\n*Generated by ${agentName}*`

                await client.addComment(task.id, successMessage, agentUserId || undefined)

                // Unassign task so it goes back to user
                await client.reassignTask(task.id, null).catch(err => {
                  console.log(`   ⚠️ Could not unassign task: ${err}`)
                })

                // Mark as completed with cooldown to prevent rapid reprocessing
                markTaskCompleted(task.id)
              } else {
                // Post failure comment
                await client.addComment(task.id,
                  `❌ **Processing Failed**\n\n` +
                  `Error: ${result.error}\n\n` +
                  `---\n` +
                  `💡 **To try again:** Comment "retry" or "try again"\n` +
                  `💡 **To ship existing PR:** Comment "ship it"`,
                  agentUserId || undefined
                )
              }

              processingTasks.delete(task.id)

            } catch (error) {
              console.error(`❌ Failed to process task ${task.id}:`, error)
              processingTasks.delete(task.id)

              await client.addComment(task.id,
                `❌ **Processing Failed**\n\n` +
                `Error: ${error instanceof Error ? error.message : String(error)}\n\n` +
                `---\n` +
                `💡 **To try again:** Comment "retry" or "try again"`,
                agentUserId || undefined
              ).catch(() => {})
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Poll error:', error)
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, CONFIG.pollIntervalMs))
  }
}

// ============================================================================
// MAIN
// ============================================================================

function showHelp(): void {
  console.log(`
@gracefultools/astrid-sdk - AI Agent Worker

Usage:
  npx astrid-agent                 Start polling for tasks (API mode)
  npx astrid-agent --terminal      Start polling using local Claude Code CLI
  npx astrid-agent serve           Start webhook server (for always-on servers)
  npx astrid-agent <taskId>        Process a specific task
  npx astrid-agent --help          Show this help

Modes:

  API MODE (Default)
  ------------------
  Best for: Cloud servers, CI/CD, when you don't have Claude Code CLI installed

  Uses Claude Agent SDK API to process tasks remotely.

  Environment:
    ASTRID_OAUTH_CLIENT_ID       OAuth client ID
    ASTRID_OAUTH_CLIENT_SECRET   OAuth client secret
    ASTRID_OAUTH_LIST_ID         List ID to monitor
    ANTHROPIC_API_KEY            For Claude tasks

  Example:
    npx astrid-agent              # Starts polling (API mode)

  TERMINAL MODE (--terminal)
  --------------------------
  Best for: Local development, when you have Claude Code CLI installed

  Uses your local Claude Code CLI (spawn) to process tasks.
  Enables remote control of your local Claude Code from Astrid.

  Environment:
    ASTRID_TERMINAL_MODE=true    Enable terminal mode (or use --terminal flag)
    CLAUDE_MODEL                 Model to use (default: opus)
    CLAUDE_MAX_TURNS             Max turns per execution (default: 50)
    DEFAULT_PROJECT_PATH         Project directory (default: current dir)

  Example:
    npx astrid-agent --terminal
    # Or with environment variable:
    ASTRID_TERMINAL_MODE=true npx astrid-agent
    # With custom options:
    npx astrid-agent --terminal --model=sonnet --cwd=/path/to/project

  WEBHOOK MODE (serve)
  --------------------
  Best for: Always-on servers with permanent IP (VPS, fly.io, etc.)

  Astrid sends tasks directly to your server via webhook.

  Environment:
    ASTRID_WEBHOOK_SECRET        Secret from Astrid settings
    ASTRID_CALLBACK_URL          Callback URL (optional)

  Example:
    npx astrid-agent serve --port=3001

Common Environment Variables:
  # AI Provider Keys
  ANTHROPIC_API_KEY            For Claude tasks (required)
  OPENAI_API_KEY               For OpenAI tasks (optional)
  GEMINI_API_KEY               For Gemini tasks (optional)

  # GitHub (for repository access)
  GITHUB_TOKEN                 For cloning private repositories

Quick Start (Terminal Mode):
  # 1. Install Claude Code CLI and astrid-sdk
  npm install -g @anthropic-ai/claude-code @gracefultools/astrid-sdk

  # 2. Set up environment
  export ANTHROPIC_API_KEY=sk-ant-...
  export ASTRID_OAUTH_CLIENT_ID=...
  export ASTRID_OAUTH_CLIENT_SECRET=...
  export ASTRID_OAUTH_LIST_ID=...

  # 3. Start in terminal mode
  cd /your/project
  npx astrid-agent --terminal

  # Now create a task in Astrid and assign to claude@astrid.cc
  # Your local Claude Code will process it!

Quick Start (API Mode):
  # 1. Install globally
  npm install -g @gracefultools/astrid-sdk

  # 2. Set up environment (same as above)
  # 3. Start polling
  npx astrid-agent
`)
}

async function startWebhookServer(port: number): Promise<void> {
  // Check for required environment variables
  const webhookSecret = process.env.ASTRID_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error(`❌ ASTRID_WEBHOOK_SECRET not configured

To set up:
1. Go to Settings -> AI Agent Settings in Astrid
2. Configure your webhook URL: http://your-server:${port}/webhook
3. Copy the webhook secret to your .env file:

   ASTRID_WEBHOOK_SECRET=<your-secret-here>
`)
    process.exit(1)
  }

  // Check for at least one AI provider
  const hasProvider = CONFIG.anthropicApiKey || CONFIG.openaiApiKey || CONFIG.geminiApiKey
  if (!hasProvider) {
    console.warn(`⚠️  No AI provider keys configured. Add at least one:
   ANTHROPIC_API_KEY=sk-ant-...  (for Claude)
   OPENAI_API_KEY=sk-...         (for OpenAI)
   GEMINI_API_KEY=AIza...        (for Gemini)
`)
  }

  // Import and start the server from the server module
  try {
    const { startServer } = await import('../server/index.js')
    await startServer({
      port,
      webhookSecret,
      callbackUrl: process.env.ASTRID_CALLBACK_URL,
    })
  } catch (error) {
    if ((error as Error).message?.includes('express')) {
      console.error(`❌ Express not installed. Install it with:
   npm install express
`)
    } else {
      console.error(`❌ Failed to start server:`, error)
    }
    process.exit(1)
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    showHelp()
    process.exit(0)
  }

  // Parse --terminal flag
  if (args.includes('--terminal')) {
    CONFIG.terminalMode = true
  }

  // Parse --model flag
  const modelArg = args.find(a => a.startsWith('--model='))
  if (modelArg) {
    CONFIG.claudeModel = modelArg.split('=')[1]
  }

  // Parse --cwd flag
  const cwdArg = args.find(a => a.startsWith('--cwd='))
  if (cwdArg) {
    CONFIG.defaultProjectPath = cwdArg.split('=')[1]
  }

  // Parse --max-turns flag
  const maxTurnsArg = args.find(a => a.startsWith('--max-turns='))
  if (maxTurnsArg) {
    CONFIG.claudeMaxTurns = parseInt(maxTurnsArg.split('=')[1], 10) || 50
  }

  // Handle 'serve' command
  if (args[0] === 'serve') {
    let port = 3001
    const portArg = args.find(a => a.startsWith('--port='))
    if (portArg) {
      port = parseInt(portArg.split('=')[1], 10) || 3001
    }
    await startWebhookServer(port)
    return
  }

  // Handle specific task ID (first non-flag argument)
  const taskIdArg = args.find(a => !a.startsWith('-') && a !== 'serve')
  if (taskIdArg) {
    // Process a specific task
    const taskId = taskIdArg
    console.log(`\n🎯 Processing task: ${taskId}`)

    const client = new AstridOAuthClient()
    const taskResult = await client.getTask(taskId)

    if (!taskResult.success || !taskResult.data) {
      console.error(`❌ Failed to get task: ${taskResult.error}`)
      process.exit(1)
    }

    const projectPath = CONFIG.defaultProjectPath

    if (CONFIG.terminalMode) {
      console.log(`\n🖥️  Terminal mode enabled`)

      // Initialize OAuth client for posting comments
      const taskData = taskResult.data!
      const assigneeEmail = getAssigneeEmail(taskData)
      const agentUserId = await client.getAgentIdByEmail(assigneeEmail || 'claude@astrid.cc')
      const agentName = assigneeEmail?.includes('gemini') ? 'Gemini AI Agent (Terminal)' :
                        assigneeEmail?.includes('openai') ? 'OpenAI Agent (Terminal)' :
                        'Claude AI Agent (Terminal)'

      // Post starting comment
      await client.addComment(taskData.id,
        `🖥️ **${agentName.replace(' (Terminal)', '')} (Terminal) Starting**\n\n` +
        `**Task:** ${taskData.title}\n` +
        `**Mode:** Terminal (local execution)\n\n` +
        `Working on this task locally...\n\n` +
        `---\n*Using local Claude Code*`,
        agentUserId || undefined
      ).catch(() => {})

      const result = await processTaskTerminal(
        {
          id: taskResult.data.id,
          title: taskResult.data.title,
          description: taskResult.data.description,
          assigneeEmail,
        },
        projectPath,
        undefined, // No previous comments for specific task processing
        false, // Not a follow-up
        // Post intermediate comments (plans, questions, progress) to the task
        async (content: string) => {
          await client.addComment(taskData.id, content, agentUserId || undefined)
        }
      )

      if (!result.success) {
        // Post failure comment
        await client.addComment(taskData.id,
          `❌ **Processing Failed**\n\n` +
          `Error: ${result.error}\n\n` +
          `---\n` +
          `💡 **To try again:** Comment "retry" or "try again"`,
          agentUserId || undefined
        ).catch(() => {})
        console.error(`❌ Task failed: ${result.error}`)
        process.exit(1)
      }

      // Build success message
      let successMessage = `🎉 **Implementation Complete!**\n\n`

      if (result.files && result.files.length > 0) {
        successMessage += `**Files modified:**\n${result.files.map(f => `- \`${f}\``).join('\n')}\n\n`
      }

      if (result.prUrl) {
        successMessage += `🔗 **Pull Request:** [${result.prUrl}](${result.prUrl})\n\n`

        // Deploy Vercel preview if configured
        let previewUrl = ''
        if (CONFIG.vercelToken) {
          const branchName = `task/${taskData.id.slice(0, 8)}`
          console.log(`\n🚀 Deploying Vercel preview...`)
          const vercelResult = await deployVercelPreview(projectPath, branchName)
          if (vercelResult.success && vercelResult.previewUrl) {
            previewUrl = vercelResult.previewUrl
            successMessage += `🚀 **Preview:** [${previewUrl}](${previewUrl})\n\n`
            console.log(`   ✅ Preview deployed: ${previewUrl}`)
          } else {
            console.log(`   ⚠️ Preview deployment skipped: ${vercelResult.error}`)
          }
        }

        successMessage += `**What's next:**\n` +
          `1. Review the changes in the PR\n` +
          (previewUrl ? `2. Test the preview: ${previewUrl}\n` : `2. Test the preview deployment\n`) +
          `3. Comment "ship it" to merge!\n\n`
      }

      successMessage += `---\n*Generated by ${agentName}*`

      // Post success comment
      await client.addComment(taskData.id, successMessage, agentUserId || undefined).catch(() => {})

      console.log(`\n✅ Task completed successfully`)
      if (result.prUrl) {
        console.log(`   PR: ${result.prUrl}`)
      }
    } else {
      // Initialize OAuth client for posting comments
      const client = new AstridOAuthClient()
      const taskData = taskResult.data!
      const assigneeEmail = getAssigneeEmail(taskData)
      const agentUserId = await client.getAgentIdByEmail(assigneeEmail || 'claude@astrid.cc')
      await processTask({
        id: taskData.id,
        title: taskData.title,
        description: taskData.description,
        assigneeEmail,
      }, projectPath, {
        onComment: async (message) => {
          try {
            await client.addComment(taskData.id, message, agentUserId || undefined)
          } catch (err) {
            console.log(`   (Failed to post comment: ${err instanceof Error ? err.message : 'unknown error'})`)
          }
        }
      })
    }

    return
  }

  // Default: Run polling worker
  if (CONFIG.terminalMode) {
    console.log(`
🖥️  Starting terminal mode...

   Terminal mode uses your local Claude Code CLI to process tasks.
   This enables remote control of your local Claude Code from Astrid.

   Settings:
   - Model: ${CONFIG.claudeModel}
   - Max turns: ${CONFIG.claudeMaxTurns}
   - Project path: ${CONFIG.defaultProjectPath}

   Polling for tasks every ${CONFIG.pollIntervalMs / 1000}s...

`)
    await runWorkerTerminal()
  } else {
    console.log(`
🔄 Starting polling mode (API)...

   Polling is ideal for:
   - Local devices behind NAT/firewalls
   - Laptops and home servers
   - Intermittent connectivity

   For terminal mode (uses local Claude Code CLI):
   npx astrid-agent --terminal

   For always-on servers with permanent IPs, consider:
   npx astrid-agent serve --port=3001

`)
    await runWorker()
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
