#!/usr/bin/env npx tsx
/**
 * AI Agent Worker - Multi-Provider Support
 *
 * ⚠️  DEPRECATION WARNING ⚠️
 * =========================
 * This polling-based worker is deprecated. For better performance and reliability,
 * use the webhook-based Code Remote Server instead:
 *
 *   Option 1: Use astrid-sdk (simple)
 *   npx astrid-agent serve --port=3001
 *
 *   Option 2: Deploy full code-remote server (recommended for production)
 *   cd packages/claude-code-remote && npm install && npm run start
 *
 * Then configure your webhook URL in Astrid:
 *   Settings → Code Remote Server → Enter your server URL
 *
 * The webhook approach provides:
 * - Real-time task notifications (no polling delay)
 * - Session continuity with Claude's --resume flag
 * - Lower API costs and better reliability
 *
 * This file will be removed in a future version.
 * =========================
 *
 * This worker enables a complete AI-assisted development workflow with multiple AI providers:
 * - claude@astrid.cc → Claude Agent SDK (best coding experience)
 * - openai@astrid.cc → OpenAI with function calling
 * - gemini@astrid.cc → Google Gemini 1.5 Pro with function calling
 *
 * Workflow:
 * 1. USER creates task in Astrid app, assigns to an AI agent
 * 2. WORKER picks up task, routes to appropriate AI provider
 * 3. WORKER posts progress updates to Astrid
 * 4. AI creates implementation, WORKER creates PR
 * 5. USER reviews preview and comments "ship it" to deploy
 *
 * Required environment variables:
 *   ASTRID_OAUTH_CLIENT_ID    - OAuth client ID from Astrid
 *   ASTRID_OAUTH_CLIENT_SECRET- OAuth client secret from Astrid
 *   ASTRID_OAUTH_LIST_ID      - List ID to monitor for tasks
 *   GITHUB_TOKEN              - GitHub token for cloning repos AND creating PRs
 *
 * AI Provider Keys (add the ones you want to use):
 *   ANTHROPIC_API_KEY         - For claude@astrid.cc
 *   OPENAI_API_KEY            - For openai@astrid.cc
 *   GEMINI_API_KEY            - For gemini@astrid.cc
 *
 * Optional:
 *   ASTRID_API_URL        - Astrid API URL (default: https://astrid.cc)
 *   POLL_INTERVAL_MS      - Polling interval (default: 30000)
 *   MAX_BUDGET_USD        - Max budget per task (default: 10.0)
 *   AUTO_APPROVE          - Skip permission prompts (default: false)
 *
 * Usage:
 *   # Load from .env.local
 *   npx tsx scripts/ai-agent-worker.ts
 *
 *   # Single task mode
 *   npx tsx scripts/ai-agent-worker.ts <taskId>
 *
 *   # Auto-approve mode (no permission prompts)
 *   AUTO_APPROVE=true npx tsx scripts/ai-agent-worker.ts <taskId>
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import {
  executeWithClaudeAgentSDK,
  planWithClaudeAgentSDK,
  prepareRepository,
  type ClaudeAgentExecutorConfig,
  type PlanningResult,
} from '../lib/ai/claude-agent-sdk-executor'
import {
  executeWithOpenAI,
  planWithOpenAI,
  type OpenAIAgentExecutorConfig,
} from '../lib/ai/openai-agent-executor'
import {
  executeWithGemini,
  planWithGemini,
  type GeminiAgentExecutorConfig,
} from '../lib/ai/gemini-agent-executor'
import {
  isRegisteredAgent,
  getAgentService,
  getAgentConfig,
  DEFAULT_MODELS,
  type AIService,
} from '../lib/ai/agent-config'
import type { ImplementationPlan } from '../lib/ai/types'
// Vercel preview URLs now use Vercel CLI directly (uses CLI's built-in auth)
import { getIOSBuildInfo } from '../lib/app-store-connect-client'

// Configuration from environment
const CONFIG = {
  // AI Provider API Keys
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
  // Astrid OAuth
  astridApiUrl: process.env.ASTRID_API_URL || 'https://astrid.cc',
  astridClientId: process.env.ASTRID_OAUTH_CLIENT_ID,
  astridClientSecret: process.env.ASTRID_OAUTH_CLIENT_SECRET,
  astridListId: process.env.ASTRID_OAUTH_LIST_ID,
  // GitHub
  githubToken: process.env.GITHUB_TOKEN,
  // Worker settings
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '30000'),
  maxBudgetUsd: parseFloat(process.env.MAX_BUDGET_USD || '10.0'),
  autoApprove: process.env.AUTO_APPROVE === 'true',
  approvalTimeoutMs: parseInt(process.env.APPROVAL_TIMEOUT_MS || '300000'), // 5 min default
  // Turn limits - increased for complex tasks like i18n
  planningMaxTurns: parseInt(process.env.PLANNING_MAX_TURNS || '75'),
  implementationMaxTurns: parseInt(process.env.IMPLEMENTATION_MAX_TURNS || '150'),
  // High limits for retry after user approval
  planningMaxTurnsHigh: parseInt(process.env.PLANNING_MAX_TURNS_HIGH || '150'),
  implementationMaxTurnsHigh: parseInt(process.env.IMPLEMENTATION_MAX_TURNS_HIGH || '300'),
  // iOS TestFlight integration
  testflightPublicLink: process.env.TESTFLIGHT_PUBLIC_LINK,
}

// Get API key for a specific AI service
function getApiKeyForService(service: AIService): string | undefined {
  switch (service) {
    case 'claude': return CONFIG.anthropicApiKey
    case 'openai': return CONFIG.openaiApiKey
    case 'gemini': return CONFIG.geminiApiKey
  }
}

// ============================================================================
// AI SERVICE ROUTING
// ============================================================================

interface AgentExecutorConfig {
  repoPath: string
  apiKey: string
  model?: string // User's preferred model (falls back to default if not set)
  maxBudgetUsd?: number
  maxTurns?: number
  maxIterations?: number
  logger?: (level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void
  onProgress?: (message: string) => void
  previousContext?: unknown // Type varies between providers, handled at runtime
}

/**
 * Route planning to the appropriate AI service
 */
async function routePlanningToService(
  service: AIService,
  taskTitle: string,
  taskDescription: string | null,
  config: AgentExecutorConfig
): Promise<PlanningResult> {
  switch (service) {
    case 'claude':
      // Cast to ClaudeAgentExecutorConfig - the types are compatible at runtime
      return planWithClaudeAgentSDK(taskTitle, taskDescription, config as unknown as ClaudeAgentExecutorConfig)

    case 'openai':
      return planWithOpenAI(taskTitle, taskDescription, {
        repoPath: config.repoPath,
        apiKey: config.apiKey,
        model: config.model,
        maxIterations: config.maxTurns || 30,
        logger: config.logger,
        onProgress: config.onProgress,
      })

    case 'gemini':
      return planWithGemini(taskTitle, taskDescription, {
        repoPath: config.repoPath,
        apiKey: config.apiKey,
        model: config.model,
        maxIterations: config.maxTurns || 30,
        logger: config.logger,
        onProgress: config.onProgress,
      })
  }
}

/**
 * Route execution to the appropriate AI service
 */
async function routeExecutionToService(
  service: AIService,
  plan: ImplementationPlan,
  taskTitle: string,
  taskDescription: string | null,
  config: AgentExecutorConfig
): Promise<import('../lib/ai/claude-agent-sdk-executor').ExecutionResult> {
  switch (service) {
    case 'claude':
      // Cast to ClaudeAgentExecutorConfig - the types are compatible at runtime
      return executeWithClaudeAgentSDK(plan, taskTitle, taskDescription, config as unknown as ClaudeAgentExecutorConfig)

    case 'openai':
      return executeWithOpenAI(plan, taskTitle, taskDescription, {
        repoPath: config.repoPath,
        apiKey: config.apiKey,
        model: config.model,
        maxIterations: config.maxTurns || 50,
        logger: config.logger,
        onProgress: config.onProgress,
      })

    case 'gemini':
      return executeWithGemini(plan, taskTitle, taskDescription, {
        repoPath: config.repoPath,
        apiKey: config.apiKey,
        model: config.model,
        maxIterations: config.maxTurns || 50,
        logger: config.logger,
        onProgress: config.onProgress,
      })
  }
}

// ============================================================================
// NON-CODING ASSISTANT WORKFLOW
// ============================================================================

interface AssistantResult {
  success: boolean
  response: string
  error?: string
  usage?: {
    inputTokens: number
    outputTokens: number
    costUSD: number
  }
}

/**
 * Call AI as a simple assistant (no coding tools) for lists without git repos.
 * Returns a helpful response that gets added to the task description.
 */
async function routeAssistantToService(
  service: AIService,
  taskTitle: string,
  taskDescription: string | null,
  apiKey: string,
  model?: string
): Promise<AssistantResult> {
  const prompt = `You are a helpful AI assistant. The user has created a task that needs your help.

**Task Title:** ${taskTitle}
${taskDescription ? `\n**Task Description:**\n${taskDescription}` : ''}

Please provide a helpful, comprehensive response to this task. You can:
- Answer questions
- Provide recommendations
- Create plans or outlines
- Offer analysis or insights
- Suggest next steps

Format your response in clear markdown. Be thorough but concise.`

  try {
    switch (service) {
      case 'gemini': {
        const geminiModel = model || 'gemini-2.0-flash'
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: 4096,
              temperature: 0.7
            }
          })
        })

        if (!response.ok) {
          const error = await response.text()
          return { success: false, response: '', error: `Gemini API error: ${error}` }
        }

        const data = await response.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
        const inputTokens = data.usageMetadata?.promptTokenCount || 0
        const outputTokens = data.usageMetadata?.candidatesTokenCount || 0

        return {
          success: true,
          response: text,
          usage: {
            inputTokens,
            outputTokens,
            costUSD: (inputTokens * 0.00125 + outputTokens * 0.005) / 1000
          }
        }
      }

      case 'openai': {
        // Model is configured per-agent or uses OpenAI's default
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model, // Configured per-agent, API will use default if not set
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 4096,
            temperature: 0.7
          })
        })

        if (!response.ok) {
          const error = await response.text()
          return { success: false, response: '', error: `OpenAI API error: ${error}` }
        }

        const data = await response.json()
        const text = data.choices?.[0]?.message?.content || ''
        const inputTokens = data.usage?.prompt_tokens || 0
        const outputTokens = data.usage?.completion_tokens || 0

        return {
          success: true,
          response: text,
          usage: {
            inputTokens,
            outputTokens,
            costUSD: (inputTokens * 0.0025 + outputTokens * 0.01) / 1000
          }
        }
      }

      case 'claude': {
        const claudeModel = model || 'claude-sonnet-4-20250514'
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: claudeModel,
            max_tokens: 4096,
            messages: [{ role: 'user', content: prompt }]
          })
        })

        if (!response.ok) {
          const error = await response.text()
          return { success: false, response: '', error: `Claude API error: ${error}` }
        }

        const data = await response.json()
        const text = data.content?.[0]?.text || ''
        const inputTokens = data.usage?.input_tokens || 0
        const outputTokens = data.usage?.output_tokens || 0

        return {
          success: true,
          response: text,
          usage: {
            inputTokens,
            outputTokens,
            costUSD: (inputTokens * 0.003 + outputTokens * 0.015) / 1000
          }
        }
      }
    }
  } catch (error) {
    return {
      success: false,
      response: '',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * Process a task using the non-coding assistant workflow.
 * Used for lists without a configured git repository.
 */
async function processTaskAsAssistant(
  task: AstridTask,
  agentEmail: string,
  agentService: AIService,
  agentDisplayName: string,
  apiKey: string,
  model?: string
): Promise<void> {
  console.log(`📝 Processing task as assistant (no git repo): ${task.title}`)

  // Post starting message
  await postComment(
    task.id,
    `🤖 **${agentDisplayName} Starting**

**Task:** ${task.title}

This list doesn't have a GitHub repository configured, so I'll help you as an AI assistant instead of making code changes.

⏳ Analyzing your request...`,
    agentEmail
  )

  // Call the AI assistant
  const result = await routeAssistantToService(
    agentService,
    task.title,
    task.description,
    apiKey,
    model
  )

  if (!result.success) {
    await postComment(
      task.id,
      `❌ **Assistant Error**

${result.error || 'Unknown error occurred'}

Please try again or provide more details.`,
      agentEmail
    )

    // Reassign back to creator
    if (task.creatorId || task.creator?.id) {
      await reassignTask(task.id, task.creatorId || task.creator!.id)
    }
    return
  }

  // Update task description with the AI's response
  try {
    const response = await astridFetch(`/api/v1/tasks/${task.id}`)
    const currentTask = response.task || response

    // Build updated description with AI response
    let newDescription = currentTask.description || ''

    // Remove old AI response if present
    const existingResponseIndex = newDescription.indexOf('\n\n---\n## AI Assistant Response')
    if (existingResponseIndex >= 0) {
      newDescription = newDescription.substring(0, existingResponseIndex).trim()
    }

    // Add new AI response
    newDescription = `${newDescription}\n\n---\n## AI Assistant Response\n\n${result.response}\n\n---\n*Generated by ${agentDisplayName}${result.usage ? ` • Cost: $${result.usage.costUSD.toFixed(4)}` : ''}*`

    await astridFetch(`/api/v1/tasks/${task.id}`, {
      method: 'PUT',
      body: JSON.stringify({ description: newDescription }),
    })

    console.log(`📝 Updated task description with AI response`)
  } catch (error) {
    console.error(`Failed to update task description:`, error)
  }

  // Post completion message
  await postComment(
    task.id,
    `✅ **Assistant Complete**

I've added my response to the task description above.

${result.usage ? `*Cost: $${result.usage.costUSD.toFixed(4)}*` : ''}

---
*If you need code changes, please configure a GitHub repository for this list.*`,
    agentEmail
  )

  // Reassign back to creator
  if (task.creatorId || task.creator?.id) {
    await reassignTask(task.id, task.creatorId || task.creator!.id)
  }
}

// Cached OAuth token
let cachedToken: string | null = null
let tokenExpiresAt: number = 0

// Cached AI agent user IDs by email
const agentIdCache: Map<string, string> = new Map()

// Look up AI agent ID by email - uses known agent emails
async function getAgentIdByEmail(email: string): Promise<string | null> {
  // Check cache first
  if (agentIdCache.has(email)) {
    return agentIdCache.get(email)!
  }

  try {
    // Fetch all tasks to find one assigned to this agent - this lets us get the agent ID
    const response = await astridFetch(`/api/v1/tasks?assigneeEmail=${encodeURIComponent(email)}&limit=1`)
    const tasks = response.tasks || [response.task].filter(Boolean)

    if (tasks.length > 0 && tasks[0].assignee?.id) {
      const agentId = tasks[0].assignee.id
      console.log(`✅ Found AI agent ID for ${email}: ${agentId}`)
      agentIdCache.set(email, agentId)
      return agentId
    }

    // Fallback: Try to find the agent in our known configs
    // The agent-config has the email patterns, we need to match and find via tasks API
    console.warn(`⚠️ No tasks found for agent ${email} - cannot determine agent ID`)
    return null
  } catch (error) {
    console.error(`Failed to look up agent ID for ${email}:`, error)
    return null
  }
}

// Validate required config
function validateConfig() {
  const missing: string[] = []

  // Check that at least one AI provider key is configured
  if (!CONFIG.anthropicApiKey && !CONFIG.openaiApiKey && !CONFIG.geminiApiKey) {
    missing.push('At least one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY')
  }

  if (!CONFIG.astridClientId) missing.push('ASTRID_OAUTH_CLIENT_ID')
  if (!CONFIG.astridClientSecret) missing.push('ASTRID_OAUTH_CLIENT_SECRET')
  if (!CONFIG.astridListId) missing.push('ASTRID_OAUTH_LIST_ID')
  if (!CONFIG.githubToken) missing.push('GITHUB_TOKEN')

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:')
    missing.forEach((v) => console.error(`   - ${v}`))
    console.log('\nSetup instructions:')
    console.log('1. Create OAuth client at https://astrid.cc/settings/api-access')
    console.log('2. Add to .env.local:')
    console.log('   ANTHROPIC_API_KEY=sk-ant-...')
    console.log('   ASTRID_OAUTH_CLIENT_ID=astrid_client_...')
    console.log('   ASTRID_OAUTH_CLIENT_SECRET=your-secret')
    console.log('   ASTRID_OAUTH_LIST_ID=your-list-uuid')
    console.log('   GITHUB_TOKEN=ghp_...')
    process.exit(1)
  }
}

// Get OAuth access token (with caching)
async function getAccessToken(): Promise<string> {
  // Return cached token if still valid
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken
  }

  console.log('🔐 Obtaining OAuth access token...')
  const response = await fetch(`${CONFIG.astridApiUrl}/api/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: CONFIG.astridClientId,
      client_secret: CONFIG.astridClientSecret,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OAuth token request failed: ${error}`)
  }

  const data = await response.json()
  cachedToken = data.access_token
  // Tokens typically expire in 1 hour
  tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000
  console.log('✅ Access token obtained')

  return cachedToken!
}

// API helpers
async function astridFetch(path: string, options: RequestInit = {}) {
  const token = await getAccessToken()
  const url = `${CONFIG.astridApiUrl}${path}`
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-OAuth-Token': token,
      ...options.headers,
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Astrid API error ${response.status}: ${text}`)
  }

  return response.json()
}

/**
 * Fetch user's model preferences for a specific AI service
 * Falls back to default model if user hasn't set a preference
 */
async function getUserModelPreference(userId: string, service: AIService): Promise<string> {
  try {
    // Call internal API to get user's model preferences
    // This endpoint is called with server-side auth, not user OAuth
    const response = await fetch(`${CONFIG.astridApiUrl}/api/internal/user-model-preferences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': process.env.INTERNAL_API_SECRET || '',
      },
      body: JSON.stringify({ userId, service }),
    })

    if (response.ok) {
      const data = await response.json()
      if (data.model) {
        console.log(`   Using user's preferred model for ${service}: ${data.model}`)
        return data.model
      }
    }
  } catch (error) {
    // Silently fall back to default on error
    console.log(`   Could not fetch user model preference, using default`)
  }

  // Fall back to default model
  return DEFAULT_MODELS[service]
}

// Types for Astrid API responses
interface AstridTask {
  id: string
  title: string
  description: string | null
  completed: boolean
  creatorId?: string
  assignee?: {
    id: string
    email: string
  }
  creator?: {
    id: string
    email: string
    name?: string
  }
  lists: Array<{
    id: string
    name: string
    githubRepositoryId?: string
  }>
  comments?: Array<{
    id: string
    content: string
    createdAt: string
    author?: {
      id: string
      email?: string
      isAIAgent?: boolean
    }
  }>
}

// Check if a comment indicates the task is actively being processed
// Supports all AI agents: Claude, OpenAI, Gemini
// Supports both CLI worker and cloud orchestration patterns
function isActiveProcessingMarker(content: string, createdAt: string): boolean {
  const lowerContent = content.toLowerCase()

  // Match various starting patterns from both CLI worker and cloud orchestration:
  // - CLI worker: "🤖 **Gemini AI Agent Starting**" (has 'Starting' + 'Agent')
  // - Cloud: "🤖 **Starting work**" (has 'Starting' but no 'Agent')
  // - Cloud: "🤖 **Gemini AI Agent starting**" (has 'Agent' but lowercase 'starting')
  const hasStartingMarker = (
    // Pattern 1: "starting" (case-insensitive) + "agent" (case-insensitive)
    (lowerContent.includes('starting') && lowerContent.includes('agent')) ||
    // Pattern 2: "**starting work**" (cloud orchestration pattern)
    lowerContent.includes('**starting work**')
  )

  if (hasStartingMarker) {
    // Only consider "Starting" markers within the last 15 minutes as active
    // Reduced from 2 hours - if task hasn't progressed past "Starting" in 15 min, it's stuck
    const markerTime = new Date(createdAt).getTime()
    const fifteenMinutesAgo = Date.now() - (15 * 60 * 1000)
    return markerTime > fifteenMinutesAgo
  }
  return false
}

// Check if a comment indicates the task was completed (has PR link or completion markers)
function isCompletionMarker(content: string): boolean {
  // Check for PR link
  if (content.includes('Pull Request Created') || (content.includes('github.com') && content.includes('/pull/'))) {
    return true
  }
  // Check for implementation complete marker
  if (content.includes('Implementation Complete') || content.includes('Implementation Failed')) {
    return true
  }
  // Check for worker error (task failed but should allow retry)
  if (content.includes('Worker Error') || content.includes('Planning Failed')) {
    return true
  }
  // Check for ship it deployment completion (prevents re-triggering after deployment)
  if (content.includes('Deployment Complete') || content.includes('Ship It Deployment Started')) {
    return true
  }
  return false
}

// Simple approval keywords that indicate the user is happy with the PR
const APPROVAL_KEYWORDS = [
  'approve', 'approved', 'yes', 'y', 'lgtm', 'looks good',
  'merge', 'ship it', 'ship', 'thanks', 'thank you', 'great',
  'perfect', 'good', 'ok', 'okay', 'done', 'nice'
]

function isApprovalComment(content: string): boolean {
  const trimmed = content.toLowerCase().trim()
  // Check if entire comment is just an approval word/phrase
  if (APPROVAL_KEYWORDS.includes(trimmed)) return true
  // Check for short approval responses (under 20 chars and contains approval word)
  if (trimmed.length < 20 && APPROVAL_KEYWORDS.some(k => trimmed.includes(k))) return true
  return false
}

// Check specifically for "ship it" deployment trigger
function isShipItComment(content: string): boolean {
  const trimmed = content.toLowerCase().trim()
  return trimmed.includes('ship it') || trimmed === 'ship' || trimmed.includes('merge and ship')
}

// Extract PR number from task comments
function extractPRNumber(task: AstridTask): number | null {
  if (!task.comments?.length) return null

  // Look for PR links in comments (most recent first)
  for (let i = task.comments.length - 1; i >= 0; i--) {
    const content = task.comments[i].content
    const prMatch = content.match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/)
    if (prMatch) {
      return parseInt(prMatch[1], 10)
    }
  }
  return null
}

interface ExistingPRInfo {
  prNumber: number
  branchName: string
  prUrl: string
}

// Extract existing PR info from task comments
function extractExistingPRInfo(task: AstridTask): ExistingPRInfo | null {
  if (!task.comments?.length) return null

  // Look for the most recent PR link in comments
  for (let i = task.comments.length - 1; i >= 0; i--) {
    const content = task.comments[i].content
    const prMatch = content.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
    if (prMatch) {
      return {
        prNumber: parseInt(prMatch[3], 10),
        // Branch name will be fetched from GitHub API
        branchName: '',
        prUrl: `https://github.com/${prMatch[1]}/${prMatch[2]}/pull/${prMatch[3]}`,
      }
    }
  }
  return null
}

// Fetch PR branch name from GitHub API
async function fetchPRBranchName(owner: string, repo: string, prNumber: number): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
      {
        headers: {
          'Authorization': `Bearer ${CONFIG.githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    )

    if (!response.ok) {
      console.log(`⚠️ Could not fetch PR #${prNumber}: ${response.status}`)
      return null
    }

    const pr = await response.json() as { head: { ref: string }, state: string }

    // Only return branch if PR is still open
    if (pr.state !== 'open') {
      console.log(`📋 PR #${prNumber} is ${pr.state}, will create new PR`)
      return null
    }

    return pr.head.ref
  } catch (error) {
    console.error('Error fetching PR branch:', error)
    return null
  }
}

/**
 * Check if a PR contains iOS app changes
 * Returns true if any files in ios-app/, *.swift, *.xcodeproj, etc. were modified
 */
async function checkPRHasIOSChanges(owner: string, repo: string, prNumber: number): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`,
      {
        headers: {
          'Authorization': `Bearer ${CONFIG.githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    )

    if (!response.ok) {
      console.log(`⚠️ Could not fetch PR files: ${response.statusText}`)
      return false
    }

    const files = await response.json() as Array<{ filename: string }>

    // iOS file patterns - common iOS project paths and extensions
    const iosPatterns = [
      /^ios-app\//,           // ios-app/ directory
      /^ios\//,               // ios/ directory
      /\.swift$/,             // Swift files
      /\.xcodeproj\//,        // Xcode project files
      /\.xcworkspace\//,      // Xcode workspace files
      /\.xcdatamodeld\//,     // Core Data models
      /\.storyboard$/,        // Storyboards
      /\.xib$/,               // XIB files
      /Info\.plist$/,         // Info.plist files
      /\.entitlements$/,      // Entitlements files
      /Podfile(\.lock)?$/,    // CocoaPods
      /Package\.swift$/,      // Swift Package Manager
    ]

    const hasIOSChanges = files.some(file =>
      iosPatterns.some(pattern => pattern.test(file.filename))
    )

    if (hasIOSChanges) {
      const iosFiles = files.filter(file =>
        iosPatterns.some(pattern => pattern.test(file.filename))
      )
      console.log(`📱 Found ${iosFiles.length} iOS file(s) changed:`)
      iosFiles.slice(0, 5).forEach(f => console.log(`   - ${f.filename}`))
      if (iosFiles.length > 5) console.log(`   ... and ${iosFiles.length - 5} more`)
    }

    return hasIOSChanges
  } catch (error) {
    console.error('Error checking for iOS changes:', error)
    return false
  }
}

// Handle "ship it" deployment workflow
async function handleShipItDeployment(task: AstridTask): Promise<boolean> {
  console.log(`\n🚀 Ship it deployment triggered for task ${task.id}`)

  // Extract PR number
  const prNumber = extractPRNumber(task)
  if (!prNumber) {
    await postComment(task.id, '❌ Could not find PR number in task comments. Please ensure a PR was created.')
    return false
  }

  console.log(`📦 Found PR #${prNumber}`)

  try {
    // Post deployment starting comment
    await postComment(task.id, `🚀 **Ship It Deployment Started**\n\nMerging PR #${prNumber} and deploying to production...`)

    // Get repository info from task
    const listWithRepo = task.lists.find(l => l.githubRepositoryId)
    if (!listWithRepo?.githubRepositoryId) {
      await postComment(task.id, '❌ No GitHub repository configured for this list.')
      return false
    }

    const [owner, repo] = listWithRepo.githubRepositoryId.split('/')

    // Merge PR using GitHub API
    console.log(`🔀 Merging PR #${prNumber}...`)
    const mergeResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/merge`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${CONFIG.githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          commit_title: `Merge pull request #${prNumber}`,
          merge_method: 'merge',
        }),
      }
    )

    if (!mergeResponse.ok) {
      const errorData = await mergeResponse.json()
      throw new Error(`Failed to merge PR: ${errorData.message || mergeResponse.statusText}`)
    }

    const mergeData = await mergeResponse.json()
    console.log(`✅ PR merged: ${mergeData.sha}`)

    // Check what kind of changes were in the PR
    const hasIOSChanges = await checkPRHasIOSChanges(owner, repo, prNumber)

    // Build deployment message based on what was changed
    let deploymentMessage = `✅ PR #${prNumber} merged to main\n\n`

    // Web deployment - explicitly trigger Vercel production deployment
    const vercelToken = process.env.VERCEL_API_TOKEN || process.env.VERCEL_TOKEN
    const vercelProjectName = process.env.VERCEL_PROJECT_NAME || 'newastrid'

    if (vercelToken) {
      console.log(`📦 Triggering Vercel production deployment...`)
      const { execSync } = await import('child_process')

      try {
        // Link to the correct project first
        console.log(`   Linking to project: ${vercelProjectName}`)
        execSync(
          `vercel link --project ${vercelProjectName} --yes --token=${vercelToken}`,
          { encoding: 'utf-8', timeout: 60000, stdio: 'pipe' }
        )

        // Deploy to production
        console.log(`   Running: vercel --prod --yes --token=***`)
        const deployOutput = execSync(
          `vercel --prod --yes --token=${vercelToken}`,
          { encoding: 'utf-8', timeout: 300000, stdio: 'pipe' }
        )

        // Extract deployment URL from output
        const deploymentUrl = deployOutput.trim().split('\n').find(line => line.includes('.vercel.app'))?.trim()
        console.log(`✅ Vercel production deployed: ${deploymentUrl || 'URL not extracted'}`)

        deploymentMessage += `📦 **Web:** [Production deployed](${deploymentUrl || 'https://astrid.cc'})\n`
      } catch (vercelError) {
        const errorMsg = vercelError instanceof Error ? vercelError.message : String(vercelError)
        console.log(`⚠️ Vercel deployment failed: ${errorMsg}`)
        deploymentMessage += `⚠️ **Web:** Vercel deployment failed - ${errorMsg}\n`
      }
    } else {
      console.log(`⚠️ No Vercel token configured - skipping production deployment`)
      deploymentMessage += `⚠️ **Web:** No Vercel token configured - manual deployment required\n`
    }

    // iOS deployment (Xcode Cloud auto-builds when main is updated)
    let iosBuildInfo: { available: boolean; comment: string; publicLink: string | null } | null = null
    if (hasIOSChanges) {
      console.log(`📱 iOS changes detected - fetching build info...`)

      try {
        iosBuildInfo = await getIOSBuildInfo()
        deploymentMessage += `\n${iosBuildInfo.comment}\n`
      } catch (error) {
        console.log(`⚠️ Could not fetch iOS build info: ${error}`)
        deploymentMessage += `📱 **iOS:** Xcode Cloud build triggered automatically\n`

        if (CONFIG.testflightPublicLink) {
          deploymentMessage += `\n🍎 **TestFlight:** [Get the latest build](${CONFIG.testflightPublicLink})\n`
          deploymentMessage += `*(Build will be available in ~10-15 minutes after Xcode Cloud completes)*\n`
        }
      }
    }

    await postComment(task.id, deploymentMessage)

    // Final completion message
    console.log(`✅ Marking task as complete...`)
    let completionMessage = `🎉 **Deployment Complete!**\n\n✅ PR #${prNumber} merged and deployed`

    const testflightLink = iosBuildInfo?.publicLink || CONFIG.testflightPublicLink
    if (hasIOSChanges && testflightLink) {
      completionMessage += `\n\n📱 **iOS TestFlight:** [${testflightLink}](${testflightLink})`
    }

    completionMessage += `\n\n---\n*Automated ship it deployment*`
    await postComment(task.id, completionMessage)

    // Reassign task back to creator to prevent AI agent from reprocessing
    // This is CRITICAL to prevent race conditions when user reassigns to AI agent after ship it
    if (task.creatorId || task.creator?.id) {
      const creatorId = task.creatorId || task.creator!.id
      console.log(`🔄 Reassigning task to creator (${creatorId}) after deployment`)
      await reassignTask(task.id, creatorId)
    }

    // Try to mark task complete (may fail if task state doesn't allow it)
    try {
      await astridFetch(`/api/v1/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({ completed: true }),
      })
      console.log(`✅ Task marked as complete`)
    } catch (completeError) {
      console.log(`⚠️ Could not mark task as completed (comment added successfully)`)
    }

    return true
  } catch (error) {
    console.error(`❌ Ship it deployment failed:`, error)
    await postComment(
      task.id,
      `❌ **Ship It Deployment Failed**\n\nError: ${error instanceof Error ? error.message : String(error)}\n\nPlease merge and deploy manually.`
    )
    return false
  }
}

// Check if task has a "ship it" comment after completion (and hasn't been deployed yet)
function hasShipItComment(task: AstridTask): boolean {
  if (!task.comments?.length) return false

  const sortedComments = [...task.comments].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )

  // Find the most recent completion marker
  let lastCompletionIndex = -1
  for (let i = sortedComments.length - 1; i >= 0; i--) {
    if (isCompletionMarker(sortedComments[i].content)) {
      lastCompletionIndex = i
      break
    }
  }

  if (lastCompletionIndex === -1) return false

  // Check if there's already a deployment marker after completion
  const commentsAfterCompletion = sortedComments.slice(lastCompletionIndex + 1)
  const hasDeploymentMarker = commentsAfterCompletion.some(
    c => c.content.includes('Ship It Deployment Started') || c.content.includes('Deployment Complete')
  )

  if (hasDeploymentMarker) {
    console.log(`   ⏭️  Ship it deployment already processed`)
    return false
  }

  // Check for "ship it" comments after completion
  for (const comment of commentsAfterCompletion) {
    // Skip system comments and AI agent comments
    if (!comment.author?.id || comment.author.isAIAgent) continue
    if (isSystemComment(comment.content)) continue

    // Check if this is a "ship it" comment
    if (isShipItComment(comment.content)) {
      console.log(`🚀 Found "ship it" comment from ${comment.author.email}`)
      return true
    }
  }

  return false
}

// Patterns that indicate a system-generated comment (not from a real user)
const SYSTEM_COMMENT_PATTERNS = [
  /^.+ (reassigned|assigned|changed priority|marked this|moved to|removed from)/i,
  /^.+ (created|deleted|updated) (this task|a subtask)/i,
]

// Patterns that indicate a worker-generated comment (posted by AI agent worker)
// These should be filtered out when extracting user feedback
// NOTE: Patterns are agent-agnostic to support Claude, OpenAI, and Gemini agents
const WORKER_COMMENT_PATTERNS = [
  /^🤖 \*\*.+ Starting\*\*/i,  // Any agent "Starting" marker
  /^\*\*.+ Starting\*\*/i,     // Without emoji
  /^\*\*Phase \d+:/i,
  /^📋 \*\*Phase \d+:/i,
  /^⚙️ \*\*Phase \d+:/i,
  /^\*\*Implementation Plan\*\*/i,
  /^📝 \*\*Implementation Plan\*\*/i,
  /^\*\*Implementation Complete\*\*/i,
  /^✅ \*\*Implementation Complete\*\*/i,
  /^\*\*Implementation Failed\*\*/i,
  /^❌ \*\*Implementation Failed\*\*/i,
  /^\*\*Planning Failed\*\*/i,
  /^❌ \*\*Planning Failed\*\*/i,
  /^\*\*Pull Request Created\*\*/i,
  /^🎉 \*\*Pull Request Created/i,
  /^\*\*PR Updated\*\*/i,
  /^🔄 \*\*PR Updated/i,
  /^\*\*Preview URL Not Available\*\*/i,
  /^⚠️ \*\*Preview URL Not Available\*\*/i,
  /^\*\*Staging Site Ready\*\*/i,
  /^🚀 \*\*Staging Site Ready/i,
  /^\*\*Worker Error\*\*/i,
  /^❌ \*\*Worker Error\*\*/i,
  /^\*\*No Changes Made\*\*/i,
  /^⚠️ \*\*No Changes Made\*\*/i,
  /^\*\*Ship It Deployment/i,
  /^🚀 \*\*Ship It Deployment/i,
  /^\*\*Deployment Complete\*\*/i,
  /^🎉 \*\*Deployment Complete/i,
  /^🔐 \*\*Permission Request\*\*/i,
  /^⚠️ \*\*Task Complexity Limit/i,
  /^✅ Approved - continuing/i,
  /^❌ Denied - skipping/i,
  /^⏰ Timeout - no response/i,
  /^✅ Budget increase approved/i,
  /^❌ Budget increase denied/i,
  /^🔄 \*\*Retrying/i,
  /^🤖 \*\*.+ starting\*\*/i,   // Any agent starting (lowercase)
  /^🤖 \*\*Starting work\*\*/i,
]

function isSystemComment(content: string): boolean {
  return SYSTEM_COMMENT_PATTERNS.some(pattern => pattern.test(content))
}

function isWorkerComment(content: string): boolean {
  return WORKER_COMMENT_PATTERNS.some(pattern => pattern.test(content))
}

// Check if task has already been processed (has PR link or completion markers)
// Allows reprocessing if:
// 1. There are user comments AFTER the most recent completion marker
// 2. User feedback indicates an issue (not just approval)
function isTaskAlreadyProcessed(task: AstridTask): boolean {
  if (!task.comments?.length) return false

  // Sort comments by createdAt ascending (oldest first)
  const sortedComments = [...task.comments].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )

  // Find the index of the most recent "Agent Starting" marker
  let lastStartingIndex = -1
  for (let i = sortedComments.length - 1; i >= 0; i--) {
    if (isActiveProcessingMarker(sortedComments[i].content, sortedComments[i].createdAt)) {
      lastStartingIndex = i
      break
    }
  }

  // Find the index of the most recent completion marker
  let lastCompletionIndex = -1
  for (let i = sortedComments.length - 1; i >= 0; i--) {
    if (isCompletionMarker(sortedComments[i].content)) {
      lastCompletionIndex = i
      break
    }
  }

  // Check if task is ACTIVELY being processed:
  // There's a recent "Starting" marker AND no completion/failure marker after it
  if (lastStartingIndex >= 0 && lastStartingIndex > lastCompletionIndex) {
    // But first, check if there are user comments AFTER the Starting marker
    // that indicate the user wants to continue/retry (e.g., after a timeout or failure)
    const commentsAfterStarting = sortedComments.slice(lastStartingIndex + 1)
    let hasUserContinueRequest = false

    for (const comment of commentsAfterStarting) {
      // Skip system and AI comments
      if (!comment.author?.id || !comment.author?.email) continue
      if (isSystemComment(comment.content)) continue
      if (comment.author.isAIAgent) continue

      // User commented after Starting - they want to continue/retry
      console.log(`📝 Found user comment after "Starting" marker - will reprocess`)
      console.log(`   Comment: "${comment.content.substring(0, 100)}..."`)
      hasUserContinueRequest = true
      break
    }

    if (!hasUserContinueRequest) {
      console.log(`⏳ Task has recent "Starting" marker with no completion after - currently being processed`)
      return true
    }
    // If user commented after Starting, fall through to allow reprocessing
  }

  // No completion markers - task hasn't been processed yet
  if (lastCompletionIndex === -1) {
    console.log(`🆕 No completion markers found - new task`)
    return false
  }

  // Check for user comments AFTER the last completion marker
  const commentsAfterCompletion = sortedComments.slice(lastCompletionIndex + 1)
  console.log(`   Checking ${commentsAfterCompletion.length} comments after completion marker`)

  for (const comment of commentsAfterCompletion) {
    // Skip system-generated comments (state changes, reassignments, etc.)
    // These have null author or match system patterns
    if (!comment.author?.id || !comment.author?.email) {
      console.log(`   ↳ Skipping system comment (no author): "${comment.content.substring(0, 50)}..."`)
      continue
    }

    // Skip comments that look like system messages even if they have an author
    if (isSystemComment(comment.content)) {
      console.log(`   ↳ Skipping system-pattern comment: "${comment.content.substring(0, 50)}..."`)
      continue
    }

    // Skip worker-generated comments (implementation plans, status updates, etc.)
    if (isWorkerComment(comment.content)) {
      console.log(`   ↳ Skipping worker-generated comment: "${comment.content.substring(0, 50)}..."`)
      continue
    }

    // Skip AI agent comments
    if (comment.author.isAIAgent) {
      console.log(`   ↳ Skipping AI agent comment from ${comment.author.email}`)
      continue
    }

    // This is a real user comment - check if it's just an approval
    if (isApprovalComment(comment.content)) {
      console.log(`   ↳ User approval comment (won't trigger reprocess): "${comment.content.substring(0, 50)}..."`)
      continue
    }

    // User provided actual feedback - allow reprocessing
    console.log(`📝 Found user feedback after completion - will reprocess`)
    console.log(`   Comment: "${comment.content.substring(0, 100)}..."`)
    console.log(`   Author: ${comment.author.email} (isAIAgent: ${comment.author.isAIAgent})`)
    return false
  }

  // Task was completed and no meaningful user feedback found
  console.log(`⏭️  Task was completed, no user feedback requesting changes`)
  return true
}

interface WorkflowMetadata {
  plan?: ImplementationPlan
  status?: string
}

// ============================================================================
// CONTEXT EXTRACTION - Learning from previous attempts
// ============================================================================

interface PreviousAttempt {
  planSummary?: string
  filesModified?: string[]
  prUrl?: string
  prTitle?: string
  outcome?: string  // 'success' | 'failed' | 'rejected'
}

interface UserFeedback {
  content: string
  timestamp: string
}

interface TaskContext {
  hasBeenProcessedBefore: boolean
  previousAttempts: PreviousAttempt[]
  userFeedback: UserFeedback[]
  systemUnderstanding: string
}

/**
 * Extract context from previous comments to understand what was tried and what user wants
 */
function extractTaskContext(task: AstridTask): TaskContext {
  const context: TaskContext = {
    hasBeenProcessedBefore: false,
    previousAttempts: [],
    userFeedback: [],
    systemUnderstanding: '',
  }

  if (!task.comments?.length) {
    context.systemUnderstanding = `Original request: ${task.title}${task.description ? `\n\nDetails: ${task.description}` : ''}`
    return context
  }

  // Sort comments by createdAt ascending (oldest first)
  const sortedComments = [...task.comments].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )

  let currentAttempt: PreviousAttempt = {}
  let lastCompletionIndex = -1

  for (let i = 0; i < sortedComments.length; i++) {
    const comment = sortedComments[i]
    const content = comment.content

    // Track implementation plans
    if (content.includes('**Implementation Plan**') || content.includes('**Summary:**')) {
      const summaryMatch = content.match(/\*\*Summary:\*\*\s*(.+?)(?:\n|$)/)
      if (summaryMatch) {
        currentAttempt.planSummary = summaryMatch[1].trim()
      }
    }

    // Track files modified
    if (content.includes('**Files modified:**') || content.includes('Files to modify:')) {
      const filesMatch = content.match(/`([^`]+\.(ts|tsx|swift|js|jsx|json))`/g)
      if (filesMatch) {
        currentAttempt.filesModified = filesMatch.map(f => f.replace(/`/g, ''))
      }
    }

    // Track PR creation
    if (content.includes('Pull Request Created') || content.includes('/pull/')) {
      const prUrlMatch = content.match(/https:\/\/github\.com\/[^\s)]+\/pull\/\d+/)
      const prTitleMatch = content.match(/\*\*Title:\*\*\s*(.+?)(?:\n|$)/)

      if (prUrlMatch) currentAttempt.prUrl = prUrlMatch[0]
      if (prTitleMatch) currentAttempt.prTitle = prTitleMatch[1].trim()

      context.hasBeenProcessedBefore = true
      lastCompletionIndex = i

      // Save this attempt
      if (currentAttempt.planSummary || currentAttempt.prUrl) {
        currentAttempt.outcome = 'completed'
        context.previousAttempts.push({ ...currentAttempt })
        currentAttempt = {}
      }
    }

    // Track implementation failures
    if (content.includes('Implementation Failed') || content.includes('Planning Failed')) {
      context.hasBeenProcessedBefore = true
      currentAttempt.outcome = 'failed'
      if (currentAttempt.planSummary) {
        context.previousAttempts.push({ ...currentAttempt })
        currentAttempt = {}
      }
    }
  }

  // Extract user feedback after the last completion
  if (lastCompletionIndex >= 0) {
    const commentsAfterCompletion = sortedComments.slice(lastCompletionIndex + 1)

    for (const comment of commentsAfterCompletion) {
      // Skip system and AI comments
      if (!comment.author?.email || comment.author.isAIAgent) continue
      if (isSystemComment(comment.content)) continue
      // Skip worker-generated comments (these are posted by the AI agent worker)
      if (isWorkerComment(comment.content)) continue
      if (isApprovalComment(comment.content)) continue

      context.userFeedback.push({
        content: comment.content,
        timestamp: comment.createdAt,
      })
    }
  }

  // Build system understanding
  context.systemUnderstanding = buildSystemUnderstanding(task, context)

  return context
}

/**
 * Build a summary of the system's understanding of the task
 */
function buildSystemUnderstanding(task: AstridTask, context: TaskContext): string {
  const lines: string[] = []

  lines.push(`## System Understanding`)
  lines.push(``)
  lines.push(`**Original Request:** ${task.title}`)

  if (task.description) {
    lines.push(``)
    lines.push(`**Original Description:** ${task.description.substring(0, 500)}${task.description.length > 500 ? '...' : ''}`)
  }

  if (context.previousAttempts.length > 0) {
    lines.push(``)
    lines.push(`### Previous Attempts (${context.previousAttempts.length})`)

    context.previousAttempts.forEach((attempt, i) => {
      lines.push(``)
      lines.push(`**Attempt ${i + 1}:**`)
      if (attempt.planSummary) {
        lines.push(`- Plan: ${attempt.planSummary}`)
      }
      if (attempt.filesModified?.length) {
        lines.push(`- Files modified: ${attempt.filesModified.slice(0, 5).join(', ')}${attempt.filesModified.length > 5 ? '...' : ''}`)
      }
      if (attempt.prUrl) {
        lines.push(`- PR: ${attempt.prUrl}`)
      }
      if (attempt.outcome) {
        lines.push(`- Outcome: ${attempt.outcome}`)
      }
    })
  }

  if (context.userFeedback.length > 0) {
    lines.push(``)
    lines.push(`### User Feedback (Most Recent)`)

    // Show last 3 feedback comments
    const recentFeedback = context.userFeedback.slice(-3)
    recentFeedback.forEach(feedback => {
      lines.push(``)
      lines.push(`> "${feedback.content.substring(0, 200)}${feedback.content.length > 200 ? '...' : ''}"`)
    })

    lines.push(``)
    lines.push(`### Key Issues to Address`)

    // Extract key issues from feedback
    const allFeedback = context.userFeedback.map(f => f.content.toLowerCase()).join(' ')
    const issues: string[] = []

    if (allFeedback.includes('web') && allFeedback.includes('ios')) {
      issues.push('Need to separate web and iOS changes - user may want changes in only one platform')
    }
    if (allFeedback.includes('swift') || allFeedback.includes('ios app')) {
      issues.push('Focus changes on iOS/Swift code')
    }
    if (allFeedback.includes('broken') || allFeedback.includes('not working')) {
      issues.push('Previous implementation broke something - need to fix or revert')
    }
    if (allFeedback.includes('wrong') || allFeedback.includes('incorrect')) {
      issues.push('Previous approach was incorrect - need different solution')
    }
    if (allFeedback.includes('only') || allFeedback.includes("don't change")) {
      issues.push('User wants minimal/targeted changes - avoid touching unrelated code')
    }

    if (issues.length > 0) {
      issues.forEach(issue => lines.push(`- ${issue}`))
    } else {
      lines.push(`- Review user feedback carefully to understand specific concerns`)
    }
  }

  return lines.join('\n')
}

/**
 * Update task description with system understanding
 */
async function updateTaskWithUnderstanding(taskId: string, understanding: string) {
  try {
    // Get current task
    const response = await astridFetch(`/api/v1/tasks/${taskId}`)
    const task = response.task || response

    // Build updated description
    let newDescription = task.description || ''

    // Remove old system understanding if present
    const existingUnderstandingIndex = newDescription.indexOf('---\n## System Understanding')
    if (existingUnderstandingIndex >= 0) {
      newDescription = newDescription.substring(0, existingUnderstandingIndex).trim()
    }

    // Add new understanding
    newDescription = `${newDescription}\n\n---\n${understanding}`

    // Update task (API uses PUT, not PATCH)
    await astridFetch(`/api/v1/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify({ description: newDescription }),
    })

    console.log(`📝 Updated task description with system understanding`)
  } catch (error) {
    console.error(`Failed to update task description:`, error)
    // Non-fatal - continue processing
  }
}

// Fetch tasks from configured list that are assigned to AI agents
async function fetchAssignedTasks(): Promise<AstridTask[]> {
  try {
    // Get tasks from the configured list that are not completed
    const response = await astridFetch(
      `/api/v1/tasks?listId=${CONFIG.astridListId}&completed=false&includeComments=true`
    )

    // Filter to tasks assigned to any registered AI agent that we have an API key for
    const tasks = response.tasks || []
    const agentTasks = tasks.filter((task: AstridTask) => {
      const email = task.assignee?.email
      if (!email || !isRegisteredAgent(email)) return false

      // Check if we have an API key for this agent's service
      const service = getAgentService(email)
      const apiKey = getApiKeyForService(service)
      if (!apiKey) {
        console.log(`⚠️ Skipping task "${task.title}" - no API key for ${service}`)
        return false
      }

      return true
    })

    const agentBreakdown = agentTasks.reduce((acc: Record<string, number>, task: AstridTask) => {
      const email = task.assignee?.email || 'unknown'
      acc[email] = (acc[email] || 0) + 1
      return acc
    }, {})
    console.log(`📋 Found ${tasks.length} total tasks, ${agentTasks.length} assigned to AI agents`)
    if (agentTasks.length > 0) {
      console.log(`   Breakdown: ${Object.entries(agentBreakdown).map(([e, c]) => `${e}=${c}`).join(', ')}`)
    }

    // First, check for "ship it" deployments and handle them separately
    const shipItTasks: AstridTask[] = []
    const regularTasks = agentTasks.filter((task: AstridTask) => {
      console.log(`\n🔍 Evaluating task: "${task.title}"`)
      console.log(`   ID: ${task.id}`)
      console.log(`   Agent: ${task.assignee?.email}`)
      console.log(`   Comments: ${task.comments?.length || 0}`)

      // Cache the agent ID for posting comments
      const email = task.assignee?.email
      if (email && task.assignee?.id && !agentIdCache.has(email)) {
        agentIdCache.set(email, task.assignee.id)
        console.log(`🤖 Cached agent ID for ${email}: ${task.assignee.id}`)
      }

      // Check if task has "ship it" comment - handle deployment immediately
      if (hasShipItComment(task)) {
        console.log(`   🚀 HAS SHIP IT: Will trigger deployment`)
        shipItTasks.push(task)
        return false // Don't include in regular processing
      }

      // Check if task should be processed
      const alreadyProcessed = isTaskAlreadyProcessed(task)

      if (alreadyProcessed) {
        console.log(`   ❌ SKIP: Already processed`)
        return false
      }

      console.log(`   ✅ PROCESS: Task will be processed`)
      return true
    })

    // Handle ship it deployments immediately (before returning)
    for (const shipItTask of shipItTasks) {
      console.log(`\n🚀 Processing ship it deployment for: ${shipItTask.title}`)
      await handleShipItDeployment(shipItTask)
    }

    return regularTasks
  } catch (error) {
    console.error('Failed to fetch tasks:', error)
    return []
  }
}

// Reassign task to a user (typically the creator for review)
async function reassignTask(taskId: string, userId: string) {
  try {
    // API uses PUT, not PATCH
    await astridFetch(`/api/v1/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify({ assigneeId: userId }),
    })
    console.log(`🔄 Reassigned task ${taskId} to ${userId}`)
  } catch (error) {
    console.error(`Failed to reassign task ${taskId}:`, error)
  }
}

// Post a comment to a task (as the assigned AI agent)
async function postComment(taskId: string, content: string, agentEmail?: string) {
  try {
    // Include aiAgentId so comments appear from the correct agent
    const body: { content: string; aiAgentId?: string } = { content }

    // Get the agent ID - first check cache, then look up by email if needed
    if (agentEmail) {
      if (agentIdCache.has(agentEmail)) {
        body.aiAgentId = agentIdCache.get(agentEmail)
      } else {
        // Cache miss - look up the agent ID by email
        const agentId = await getAgentIdByEmail(agentEmail)
        if (agentId) {
          agentIdCache.set(agentEmail, agentId)
          body.aiAgentId = agentId
        }
      }
    }

    if (!body.aiAgentId && agentEmail) {
      console.warn(`⚠️ Could not find agent ID for ${agentEmail} - comment will be posted as OAuth user`)
    }

    await astridFetch(`/api/v1/tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    console.log(`📝 Posted comment to task ${taskId}${agentEmail ? ` (as ${agentEmail})` : ''}`)
  } catch (error) {
    console.error(`Failed to post comment to task ${taskId}:`, error)
  }
}

// Update task status
async function updateTaskStatus(
  taskId: string,
  updates: { completed?: boolean }
) {
  try {
    await astridFetch(`/api/v1/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
    console.log(`✅ Updated task ${taskId}`)
  } catch (error) {
    console.error(`Failed to update task ${taskId}:`, error)
  }
}

// ============================================================================
// INTERACTIVE APPROVAL FLOW
// ============================================================================

interface ApprovalRequest {
  taskId: string
  toolName: string
  toolInput: Record<string, unknown>
  description: string
}

// Request approval from user via Astrid comment
async function requestApproval(request: ApprovalRequest): Promise<'approve' | 'deny'> {
  if (CONFIG.autoApprove) {
    console.log(`🤖 Auto-approving: ${request.toolName}`)
    return 'approve'
  }

  // Post approval request to Astrid
  const approvalComment = `
🔐 **Permission Request**

The AI Agent wants to use: **${request.toolName}**

**Details:**
\`\`\`
${JSON.stringify(request.toolInput, null, 2).substring(0, 500)}
\`\`\`

**Reply with:**
- ✅ \`approve\` or \`yes\` to allow
- ❌ \`deny\` or \`no\` to reject

_Waiting ${CONFIG.approvalTimeoutMs / 1000}s for response..._
`

  await postComment(request.taskId, approvalComment)
  console.log(`⏳ Waiting for approval: ${request.toolName}`)

  // Poll for user response
  const startTime = Date.now()
  const approvalCommentTime = new Date().toISOString()

  while (Date.now() - startTime < CONFIG.approvalTimeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 5000)) // Poll every 5s

    try {
      const response = await astridFetch(
        `/api/v1/tasks/${request.taskId}?includeComments=true`
      )
      const task = response.task || response
      const comments = task.comments || []

      // Look for approval response after our request
      for (const comment of comments) {
        if (new Date(comment.createdAt) > new Date(approvalCommentTime)) {
          const content = comment.content.toLowerCase().trim()
          if (content.includes('approve') || content === 'yes' || content === 'y') {
            console.log(`✅ Approved by user`)
            await postComment(request.taskId, '✅ Approved - continuing execution')
            return 'approve'
          }
          if (content.includes('deny') || content === 'no' || content === 'n' || content.includes('reject')) {
            console.log(`❌ Denied by user`)
            await postComment(request.taskId, '❌ Denied - skipping this action')
            return 'deny'
          }
        }
      }
    } catch (error) {
      console.error('Error polling for approval:', error)
    }
  }

  console.log(`⏰ Approval timeout - denying by default`)
  await postComment(request.taskId, '⏰ Timeout - no response received, skipping action')
  return 'deny'
}

// Request user approval to increase budget/turns for complex tasks
interface BudgetIncreaseOptions {
  currentTurns: number
  proposedTurns: number
  currentBudget: number
  proposedBudget: number
}

async function requestBudgetIncrease(
  taskId: string,
  phase: 'planning' | 'implementation',
  options: BudgetIncreaseOptions
): Promise<'approve' | 'deny'> {
  // If auto-approve is enabled, automatically approve budget increases
  if (CONFIG.autoApprove) {
    console.log(`🤖 Auto-approving budget increase for ${phase}`)
    return 'approve'
  }

  const budgetComment = `
⚠️ **Task Complexity Limit Reached**

The ${phase} phase hit the turn limit (${options.currentTurns} turns, $${options.currentBudget} budget).

This task appears to be complex and needs more resources to complete.

**Proposed increase:**
- Turns: ${options.currentTurns} → ${options.proposedTurns}
- Budget: $${options.currentBudget} → $${options.proposedBudget}

**Reply with:**
- ✅ \`continue\` or \`yes\` to approve and retry
- ❌ \`stop\` or \`no\` to cancel

_Waiting ${CONFIG.approvalTimeoutMs / 1000}s for response..._
`

  await postComment(taskId, budgetComment)
  console.log(`⏳ Waiting for budget increase approval: ${phase}`)

  // Poll for user response
  const startTime = Date.now()
  const requestTime = new Date().toISOString()

  while (Date.now() - startTime < CONFIG.approvalTimeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 5000)) // Poll every 5s

    try {
      const response = await astridFetch(
        `/api/v1/tasks/${taskId}?includeComments=true`
      )
      const task = response.task || response
      const comments = task.comments || []

      // Look for approval response after our request
      for (const comment of comments) {
        if (new Date(comment.createdAt) > new Date(requestTime)) {
          // Skip AI agent comments
          if (comment.author?.isAIAgent) continue

          const content = comment.content.toLowerCase().trim()
          if (content.includes('continue') || content.includes('approve') || content === 'yes' || content === 'y') {
            console.log(`✅ Budget increase approved by user`)
            await postComment(taskId, '✅ Budget increase approved - retrying with higher limits')
            return 'approve'
          }
          if (content.includes('stop') || content.includes('deny') || content === 'no' || content === 'n' || content.includes('cancel')) {
            console.log(`❌ Budget increase denied by user`)
            await postComment(taskId, '❌ Budget increase denied - stopping execution')
            return 'deny'
          }
        }
      }
    } catch (error) {
      console.error('Error polling for budget approval:', error)
    }
  }

  console.log(`⏰ Budget approval timeout`)
  await postComment(taskId, '⏰ Timeout - no response received for budget increase')
  return 'deny'
}

// ============================================================================
// GITHUB PR CREATION
// ============================================================================

interface PRResult {
  success: boolean
  prUrl?: string
  prNumber?: number
  branchName?: string
  error?: string
  isUpdate?: boolean // True if we updated an existing PR
}

// Update an existing PR by pushing new changes to its branch
async function updateExistingPR(
  repoPath: string,
  branchName: string,
  prNumber: number,
  prUrl: string,
  commitMessage: string,
  agentDisplayName: string,
  userFeedback?: string
): Promise<PRResult> {
  const { execSync } = await import('child_process')

  try {
    console.log(`📦 Updating existing PR #${prNumber} on branch: ${branchName}`)

    // Checkout the existing branch
    // Note: The repo may be a shallow clone (--depth 1), so we need to unshallow
    // or fetch the specific branch with enough depth to work with it
    try {
      // First, try to unshallow the repo to get all refs
      try {
        execSync('git fetch --unshallow', { cwd: repoPath, stdio: 'pipe' })
        console.log(`   Unshallowed repository`)
      } catch {
        // Already unshallowed or not a shallow clone, continue
      }

      // Fetch the specific branch
      execSync(`git fetch origin ${branchName}:${branchName}`, { cwd: repoPath, stdio: 'pipe' })
      execSync(`git checkout ${branchName}`, { cwd: repoPath, stdio: 'pipe' })
    } catch (checkoutError) {
      console.log(`⚠️ Could not checkout branch ${branchName}, it may have been deleted`)
      console.log(`   Error: ${checkoutError instanceof Error ? checkoutError.message : String(checkoutError)}`)
      return { success: false, error: `Branch ${branchName} not found or deleted` }
    }

    // Stage all changes
    execSync('git add -A', { cwd: repoPath, stdio: 'pipe' })

    // Check if there are changes to commit
    const status = execSync('git status --porcelain', { cwd: repoPath, encoding: 'utf-8' })
    if (!status.trim()) {
      return { success: false, error: 'No changes to commit' }
    }

    // Build commit message with feedback context
    let fullCommitMessage = commitMessage
    if (userFeedback) {
      fullCommitMessage += `\n\nBased on feedback: ${userFeedback.substring(0, 200)}${userFeedback.length > 200 ? '...' : ''}`
    }
    fullCommitMessage += `\n\n🤖 Generated with ${agentDisplayName} via Astrid`

    // Commit changes
    execSync(`git commit -m "${fullCommitMessage.replace(/"/g, '\\"')}"`, {
      cwd: repoPath,
      stdio: 'pipe'
    })

    console.log(`📤 Pushing update to origin/${branchName}`)

    // Push to remote (branch already exists)
    execSync(`git push origin ${branchName}`, { cwd: repoPath, stdio: 'pipe' })

    console.log(`✅ PR #${prNumber} updated with new commit`)

    return {
      success: true,
      prUrl,
      prNumber,
      branchName,
      isUpdate: true,
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Failed to update PR:', errorMessage)
    return { success: false, error: errorMessage }
  }
}

// Create a GitHub PR with the changes
async function createGitHubPR(
  repoPath: string,
  owner: string,
  repo: string,
  taskTitle: string,
  prTitle: string,
  prDescription: string,
  commitMessage: string,
  agentDisplayName: string
): Promise<PRResult> {
  const { execSync } = await import('child_process')

  try {
    // Generate branch name from task title
    const branchName = `astrid-ai/${Date.now()}-${taskTitle
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 30)}`

    console.log(`📦 Creating branch: ${branchName}`)

    // Create and checkout new branch
    execSync(`git checkout -b ${branchName}`, { cwd: repoPath, stdio: 'pipe' })

    // Stage all changes
    execSync('git add -A', { cwd: repoPath, stdio: 'pipe' })

    // Check if there are changes to commit
    const status = execSync('git status --porcelain', { cwd: repoPath, encoding: 'utf-8' })
    if (!status.trim()) {
      return { success: false, error: 'No changes to commit' }
    }

    // Commit changes
    const fullCommitMessage = `${commitMessage}\n\n🤖 Generated with ${agentDisplayName} via Astrid`
    execSync(`git commit -m "${fullCommitMessage.replace(/"/g, '\\"')}"`, {
      cwd: repoPath,
      stdio: 'pipe'
    })

    console.log(`📤 Pushing to origin/${branchName}`)

    // Push to remote
    execSync(`git push -u origin ${branchName}`, { cwd: repoPath, stdio: 'pipe' })

    console.log(`🔗 Creating pull request`)

    // Create PR via GitHub API
    const prResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: prTitle,
        body: `${prDescription}\n\n---\n\n🤖 *Generated by ${agentDisplayName} via [Astrid](https://astrid.cc)*`,
        head: branchName,
        base: 'main',
      }),
    })

    if (!prResponse.ok) {
      const error = await prResponse.text()
      return { success: false, error: `GitHub API error: ${error}` }
    }

    const prData = await prResponse.json()
    console.log(`✅ PR created: ${prData.html_url}`)

    return {
      success: true,
      prUrl: prData.html_url,
      prNumber: prData.number,
      branchName,
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Failed to create PR:', errorMessage)
    return { success: false, error: errorMessage }
  }
}

// ============================================================================
// VERCEL PREVIEW URL
// ============================================================================

interface VercelPreviewResult {
  success: boolean
  previewUrl?: string
  vercelUrl?: string // Original vercel.app URL (for fallback)
  error?: string
}

/**
 * Sanitize branch name for use as subdomain
 * Converts "fix/my-feature" to "fix-my-feature"
 */
function branchToSubdomain(branchName: string): string {
  return branchName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/-+/g, '-')         // Collapse multiple hyphens
    .replace(/^-|-$/g, '')       // Remove leading/trailing hyphens
    .substring(0, 63)            // Max subdomain length
}

/**
 * Trigger a Vercel preview deployment directly using Vercel CLI
 * This is more reliable than waiting for GitHub integration webhooks
 */
async function getVercelPreviewUrl(
  owner: string,
  repo: string,
  branchName: string,
  repoPath?: string
): Promise<VercelPreviewResult> {
  const { execSync } = await import('child_process')
  const subdomain = branchToSubdomain(branchName)

  console.log(`🚀 Triggering Vercel preview deployment for branch: ${branchName}`)

  try {
    // If we have a repo path, deploy from there. Otherwise, deploy current directory
    const deployDir = repoPath || process.cwd()

    console.log(`   Deploying from: ${deployDir}`)

    // Override git author to bypass Vercel team access check
    // Vercel checks git author email against team members, so we need to use a team member's email
    // This only affects the deployment, not the actual commit in the repo
    const vercelGitEmail = process.env.VERCEL_GIT_EMAIL || 'jonparis@gmail.com'
    const vercelGitName = process.env.VERCEL_GIT_NAME || 'Jon Paris'

    console.log(`   Setting git author to ${vercelGitName} <${vercelGitEmail}> for Vercel deployment`)
    try {
      execSync(`git config user.email "${vercelGitEmail}"`, { cwd: deployDir, encoding: 'utf-8' })
      execSync(`git config user.name "${vercelGitName}"`, { cwd: deployDir, encoding: 'utf-8' })
    } catch (gitConfigError) {
      console.log(`   ⚠️ Could not set git config: ${gitConfigError}`)
    }

    // MUST link to correct project to avoid Vercel auto-linking to wrong project (astrid-res-www vs newastrid)
    const vercelProjectName = process.env.VERCEL_PROJECT_NAME || 'newastrid'
    const vercelToken = process.env.VERCEL_API_TOKEN || process.env.VERCEL_TOKEN

    if (!vercelToken) {
      console.log(`❌ No Vercel token found (VERCEL_API_TOKEN or VERCEL_TOKEN)`)
      return { success: false, error: 'No Vercel token configured' }
    }

    // First, link to the correct project (creates .vercel/project.json)
    console.log(`   Running: vercel link --project ${vercelProjectName} --yes`)
    try {
      execSync(
        `vercel link --project ${vercelProjectName} --yes --token=${vercelToken}`,
        {
          encoding: 'utf-8',
          timeout: 60000,
          cwd: deployDir,
          stdio: 'pipe',
        }
      )
      console.log(`   ✓ Linked to Vercel project: ${vercelProjectName}`)
    } catch (linkError) {
      console.log(`   ⚠️ Vercel link warning (continuing): ${linkError instanceof Error ? linkError.message : String(linkError)}`)
    }

    // Deploy to Vercel preview (not production)
    // Project is now linked via .vercel/project.json, so no --project flag needed
    console.log(`   Running: vercel deploy --yes --force --token=***`)
    const deployOutput = execSync(
      `vercel deploy --yes --force --token=${vercelToken}`,
      {
        encoding: 'utf-8',
        timeout: 300000, // 5 minutes
        cwd: deployDir,
        stdio: 'pipe',
      }
    )

    console.log(`   Deploy output: ${deployOutput.trim()}`)

    // Extract the deployment URL from output (last line is usually the URL)
    const lines = deployOutput.trim().split('\n')
    const deploymentUrl = lines.find(line => line.includes('.vercel.app'))?.trim()

    if (!deploymentUrl) {
      console.log(`❌ Could not extract deployment URL from Vercel output`)
      return { success: false, error: 'Could not extract deployment URL from Vercel output' }
    }

    console.log(`✅ Vercel preview deployed: ${deploymentUrl}`)

    // Try to create alias to *.astrid.cc for passkey support
    const aliasHostname = `${subdomain}.astrid.cc`

    console.log(`🔗 Creating alias: ${aliasHostname}`)
    try {
      execSync(
        `vercel alias ${deploymentUrl} ${aliasHostname} --token=${vercelToken}`,
        {
          encoding: 'utf-8',
          timeout: 30000,
          stdio: 'pipe',
        }
      )
      const aliasUrl = `https://${aliasHostname}`
      console.log(`✅ Staging URL ready: ${aliasUrl}`)
      return {
        success: true,
        previewUrl: aliasUrl,
        vercelUrl: deploymentUrl,
      }
    } catch (aliasError) {
      // Fallback to the deployment URL if alias fails
      console.log(`⚠️ Alias failed, using original URL: ${deploymentUrl}`)
      return {
        success: true,
        previewUrl: deploymentUrl,
        vercelUrl: deploymentUrl,
      }
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.log(`❌ Vercel deployment failed: ${errorMessage}`)
    return { success: false, error: `Vercel deployment failed: ${errorMessage}` }
  }
}


// Process a single task
async function processTask(task: AstridTask) {
  console.log(`\n🔧 Processing task: ${task.title}`)
  console.log(`   ID: ${task.id}`)
  console.log(`   List: ${task.lists[0]?.name || 'Unknown'}`)

  // Get the agent info for this task - MUST have an assignee
  const agentEmail = task.assignee?.email
  if (!agentEmail) {
    console.log(`   ⚠️ Task has no assignee email, skipping`)
    return
  }
  const agentService = getAgentService(agentEmail)
  const agentConfig = getAgentConfig(agentEmail)
  const apiKey = getApiKeyForService(agentService)

  console.log(`   Agent: ${agentEmail} (${agentService})`)

  // Cache the agent ID for posting comments
  if (task.assignee?.id && !agentIdCache.has(agentEmail)) {
    agentIdCache.set(agentEmail, task.assignee.id)
    console.log(`🤖 Cached agent ID for ${agentEmail}: ${task.assignee.id}`)
  }

  // Verify we have an API key for this service
  if (!apiKey) {
    await postComment(
      task.id,
      `❌ **Error**: No API key configured for ${agentService}. Please add ${agentService === 'claude' ? 'ANTHROPIC_API_KEY' : agentService === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY'} to your environment.`,
      agentEmail
    )
    return
  }

  // =========================================================================
  // CONTEXT EXTRACTION - Learn from previous attempts
  // =========================================================================
  const taskContext = extractTaskContext(task)

  if (taskContext.hasBeenProcessedBefore) {
    console.log(`📚 Task has been processed before:`)
    console.log(`   Previous attempts: ${taskContext.previousAttempts.length}`)
    console.log(`   User feedback items: ${taskContext.userFeedback.length}`)
  }

  // Get repository from list - find first list with a repository (task may be in multiple lists)
  const listWithRepo = task.lists.find(l => l.githubRepositoryId)
  const repoId = listWithRepo?.githubRepositoryId

  // If no git repo configured, use the assistant workflow instead of coding workflow
  if (!repoId) {
    console.log(`   No GitHub repository configured - using assistant workflow`)

    // Fetch user's preferred model for this AI service
    const creatorId = task.creatorId || task.creator?.id
    let userModel: string | undefined
    if (creatorId) {
      userModel = await getUserModelPreference(creatorId, agentService)
    } else {
      userModel = DEFAULT_MODELS[agentService]
    }

    await processTaskAsAssistant(
      task,
      agentEmail,
      agentService,
      agentConfig?.displayName || 'AI Agent',
      apiKey!,
      userModel
    )
    return
  }

  // Parse owner/repo
  const [owner, repo] = repoId.split('/')
  if (!owner || !repo) {
    await postComment(
      task.id,
      `❌ **Error**: Invalid repository format: ${repoId}. Expected "owner/repo".`,
      agentEmail
    )
    return
  }

  console.log(`   Repository: ${owner}/${repo}`)

  // Get agent display name for messages
  const agentDisplayName = agentConfig?.displayName || 'AI Agent'
  const agentSdkName = agentService === 'claude' ? 'Claude Agent SDK' : agentService === 'openai' ? 'OpenAI API' : 'Gemini API'

  // Build starting message based on context
  let startingMessage = `🤖 **${agentDisplayName} Starting**

**Task:** ${task.title}
**Repository:** \`${owner}/${repo}\``

  // Add context summary for reprocessing
  if (taskContext.hasBeenProcessedBefore && taskContext.userFeedback.length > 0) {
    startingMessage += `

📚 **Continuing from previous attempt**
- Previous attempts: ${taskContext.previousAttempts.length}
- User feedback received: ${taskContext.userFeedback.length} comment(s)

**Latest feedback:**
> "${taskContext.userFeedback.slice(-1)[0]?.content.substring(0, 150)}${(taskContext.userFeedback.slice(-1)[0]?.content.length || 0) > 150 ? '...' : ''}"`
  }

  startingMessage += `

**Workflow:**
1. ⏳ Clone repository
2. ⏳ **Planning** - Analyze codebase${taskContext.hasBeenProcessedBefore ? ' (considering previous feedback)' : ''}
3. ⏳ **Implementation** - Make changes
4. ⏳ Create pull request

---
*Using ${agentSdkName} • Auto-approve: ${CONFIG.autoApprove ? 'Yes' : 'No'}*`

  await postComment(task.id, startingMessage, agentEmail)

  // Update task description with system understanding
  if (taskContext.systemUnderstanding) {
    await updateTaskWithUnderstanding(task.id, taskContext.systemUnderstanding)
  }

  let repoPath: string | undefined
  let cleanup: (() => Promise<void>) | undefined

  try {
    // Clone repository
    console.log(`📦 Cloning repository ${owner}/${repo}...`)
    const prepared = await prepareRepository(
      owner,
      repo,
      'main',
      CONFIG.githubToken!
    )
    repoPath = prepared.repoPath
    cleanup = prepared.cleanup

    // Fetch user's preferred model for this AI service
    const creatorId = task.creatorId || task.creator?.id
    let userModel: string | undefined
    if (creatorId) {
      userModel = await getUserModelPreference(creatorId, agentService)
    } else {
      userModel = DEFAULT_MODELS[agentService]
    }

    // Shared config for both planning and implementation
    const baseConfig: AgentExecutorConfig = {
      repoPath,
      apiKey: apiKey!, // We already verified this exists
      model: userModel, // User's preferred model
      maxBudgetUsd: CONFIG.maxBudgetUsd,
      maxTurns: CONFIG.implementationMaxTurns,
      logger: (level, message, _meta) => {
        const icon =
          level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️'
        console.log(`   ${icon} ${message}`)
      },
      onProgress: async (message) => {
        console.log(`   🔄 ${message}`)
      },
    }

    // =========================================================================
    // PHASE 1: PLANNING with AI Agent
    // =========================================================================
    const agentDisplayName = agentConfig?.displayName || agentService.toUpperCase()
    console.log(`📋 Starting planning phase with ${agentDisplayName}...`)
    await postComment(
      task.id,
      `📋 **Phase 1: Planning**\n\n${agentDisplayName} is analyzing the codebase to create an implementation plan...`,
      agentEmail
    )

    // Try planning with normal limits first
    let planningConfig: AgentExecutorConfig = {
      ...baseConfig,
      maxBudgetUsd: 3.0,
      maxTurns: CONFIG.planningMaxTurns,
      previousContext: taskContext.hasBeenProcessedBefore ? {
        hasBeenProcessedBefore: taskContext.hasBeenProcessedBefore,
        previousAttempts: taskContext.previousAttempts,
        userFeedback: taskContext.userFeedback,
        systemUnderstanding: taskContext.systemUnderstanding,
      } : undefined,
    }

    let planningResult = await routePlanningToService(
      agentService,
      task.title,
      task.description,
      planningConfig
    )

    // If planning hit turn limit, ask user for permission to retry with higher limits
    if (!planningResult.success && planningResult.error?.includes('error_max_turns')) {
      console.log('📊 Planning hit turn limit, requesting user approval for higher limits...')

      const approval = await requestBudgetIncrease(task.id, 'planning', {
        currentTurns: CONFIG.planningMaxTurns,
        proposedTurns: CONFIG.planningMaxTurnsHigh,
        currentBudget: 3.0,
        proposedBudget: 6.0,
      })

      if (approval === 'approve') {
        console.log('✅ User approved higher planning limits, retrying...')
        await postComment(task.id, '🔄 **Retrying Planning** with increased limits...', agentEmail)

        planningConfig = {
          ...planningConfig,
          maxBudgetUsd: 6.0,
          maxTurns: CONFIG.planningMaxTurnsHigh,
        }

        planningResult = await routePlanningToService(
          agentService,
          task.title,
          task.description,
          planningConfig
        )
      } else {
        console.log('❌ User denied higher limits or timeout')
      }
    }

    if (!planningResult.success || !planningResult.plan) {
      const errorMessage = planningResult.error?.includes('error_max_turns')
        ? 'Task is too complex for current turn limits. Reply "continue" to retry with higher limits.'
        : planningResult.error || 'Could not generate implementation plan'

      await postComment(
        task.id,
        `❌ **Planning Failed**\n\n${errorMessage}\n\n*You can try again or provide more details in the task description.*`,
        agentEmail
      )
      console.log(`❌ Planning failed: ${planningResult.error}`)

      // Reassign task back to creator
      if (task.creatorId || task.creator?.id) {
        const creatorId = task.creatorId || task.creator!.id
        await reassignTask(task.id, creatorId)
      }
      return
    }

    const plan = planningResult.plan
    console.log(`✅ Planning complete: ${plan.files.length} files identified`)

    // Post the plan for user review
    const planComment = `📝 **Implementation Plan**

**Summary:** ${plan.summary}

**Approach:** ${plan.approach}

**Files to modify:**
${plan.files.map((f) => `- \`${f.path}\`: ${f.purpose}`).join('\n')}

**Complexity:** ${plan.estimatedComplexity}

${plan.considerations?.length ? `**Considerations:**\n${plan.considerations.map(c => `- ${c}`).join('\n')}` : ''}

${planningResult.usage ? `\n*Planning cost: $${planningResult.usage.costUSD.toFixed(4)}*` : ''}

---
⏳ Proceeding to implementation...`

    await postComment(task.id, planComment, agentEmail)

    // =========================================================================
    // PHASE 2: IMPLEMENTATION with AI Agent
    // =========================================================================
    console.log(`🚀 Starting implementation phase with ${agentDisplayName}...`)
    await postComment(
      task.id,
      `⚙️ **Phase 2: Implementation**\n\n${agentDisplayName} is now implementing the plan...\n\n**Steps:**\n1. Make code changes\n2. Add regression tests (for bug fixes)\n3. Run tests to verify\n4. Prepare PR`,
      agentEmail
    )

    let implementationConfig: AgentExecutorConfig = {
      ...baseConfig,
      maxTurns: CONFIG.implementationMaxTurns,
    }

    let result = await routeExecutionToService(
      agentService,
      plan,
      task.title,
      task.description,
      implementationConfig
    )

    // If implementation hit turn limit, ask user for permission to retry with higher limits
    if (!result.success && result.error?.includes('error_max_turns')) {
      console.log('📊 Implementation hit turn limit, requesting user approval for higher limits...')

      const approval = await requestBudgetIncrease(task.id, 'implementation', {
        currentTurns: CONFIG.implementationMaxTurns,
        proposedTurns: CONFIG.implementationMaxTurnsHigh,
        currentBudget: CONFIG.maxBudgetUsd,
        proposedBudget: CONFIG.maxBudgetUsd * 2,
      })

      if (approval === 'approve') {
        console.log('✅ User approved higher implementation limits, retrying...')
        await postComment(task.id, '🔄 **Retrying Implementation** with increased limits...', agentEmail)

        implementationConfig = {
          ...implementationConfig,
          maxBudgetUsd: CONFIG.maxBudgetUsd * 2,
          maxTurns: CONFIG.implementationMaxTurnsHigh,
        }

        result = await routeExecutionToService(
          agentService,
          plan,
          task.title,
          task.description,
          implementationConfig
        )
      } else {
        console.log('❌ User denied higher limits or timeout')
      }
    }

    if (result.success && result.files.length > 0) {
      // Post progress update
      const filesModified = result.files
        .map((f) => `- \`${f.path}\` (${f.action})`)
        .join('\n')

      const usageInfo = result.usage
        ? `\n**Usage:** ${result.usage.inputTokens} in / ${result.usage.outputTokens} out • $${result.usage.costUSD.toFixed(4)}`
        : ''

      console.log(`✅ Implementation complete`)
      console.log(`   Files modified: ${result.files.length}`)
      console.log(`   Cost: $${result.usage?.costUSD.toFixed(4) || 'unknown'}`)

      // Check if we should update an existing PR or create a new one
      let prResult: PRResult
      const existingPRInfo = extractExistingPRInfo(task)
      let existingBranchName: string | null = null

      if (existingPRInfo && taskContext.userFeedback.length > 0) {
        // We have an existing PR and user feedback - try to update the existing PR
        existingBranchName = await fetchPRBranchName(owner, repo, existingPRInfo.prNumber)
      }

      if (existingBranchName) {
        // Update the existing PR
        await postComment(
          task.id,
          `✅ **Implementation Complete**\n\n**Files modified:**\n${filesModified}\n\n✓ Tests run and verified${usageInfo}\n\n📤 Updating existing PR #${existingPRInfo!.prNumber}...`,
          agentEmail
        )

        const latestFeedback = taskContext.userFeedback.slice(-1)[0]?.content
        prResult = await updateExistingPR(
          repoPath!,
          existingBranchName,
          existingPRInfo!.prNumber,
          existingPRInfo!.prUrl,
          result.commitMessage || `fix: Address feedback - ${task.title}`,
          agentDisplayName,
          latestFeedback
        )
      } else {
        // Create a new PR
        await postComment(
          task.id,
          `✅ **Implementation Complete**\n\n**Files modified:**\n${filesModified}\n\n✓ Tests run and verified${usageInfo}\n\n📤 Creating pull request...`,
          agentEmail
        )

        prResult = await createGitHubPR(
          repoPath!,
          owner,
          repo,
          task.title,
          result.prTitle || `feat: ${task.title}`,
          result.prDescription || task.description || task.title,
          result.commitMessage || `feat: ${task.title}`,
          agentDisplayName
        )
      }

      if (prResult.success && prResult.prUrl) {
        // 🎉 Success! Post appropriate message based on whether it's an update or new PR
        if (prResult.isUpdate) {
          await postComment(
            task.id,
            `🔄 **PR Updated!**\n\n🔗 **[${prResult.prUrl}](${prResult.prUrl})**\n\nNew commit pushed addressing your feedback.\n\n⏳ Deploying preview...\n\n---\n*Generated by ${agentDisplayName} via Astrid*`,
            agentEmail
          )
          console.log(`🔄 PR #${prResult.prNumber} updated successfully`)
        } else {
          await postComment(
            task.id,
            `🎉 **Pull Request Created!**\n\n🔗 **[${prResult.prUrl}](${prResult.prUrl})**\n\n**Title:** ${result.prTitle}\n\n⏳ Deploying preview...\n\n---\n*Generated by ${agentDisplayName} via Astrid*`,
            agentEmail
          )
          console.log(`🎉 PR created successfully: ${prResult.prUrl}`)
        }

        // Trigger Vercel preview deployment
        if (prResult.branchName) {
          const vercelResult = await getVercelPreviewUrl(owner, repo, prResult.branchName, repoPath)

          if (vercelResult.success && vercelResult.previewUrl) {
            // Post the staging/preview URL with clickable link
            await postComment(
              task.id,
              `🚀 **Staging Site Ready!**\n\n🔗 **Preview URL:** [${vercelResult.previewUrl}](${vercelResult.previewUrl})\n\n**What's next:**\n1. ✅ Test the changes on the staging site\n2. Review the code in the PR\n3. Comment "ship it" when ready to deploy!\n\n---\n*Vercel preview deployment complete*`,
              agentEmail
            )
            console.log(`🚀 Vercel preview URL posted: ${vercelResult.previewUrl}`)
          } else {
            // Preview failed or timed out - still let user know
            await postComment(
              task.id,
              `⚠️ **Preview URL Not Available**\n\nCould not retrieve Vercel preview URL: ${vercelResult.error || 'Unknown error'}\n\nThe preview may still be deploying. Check the PR for deployment status.\n\n**What's next:**\n1. Review the changes in the PR\n2. Check Vercel for the preview deployment\n3. Merge when ready!`,
              agentEmail
            )
            console.log(`⚠️ Could not get Vercel preview URL: ${vercelResult.error}`)
          }
        }

        // Reassign task back to creator for review
        if (task.creatorId || task.creator?.id) {
          const creatorId = task.creatorId || task.creator!.id
          await reassignTask(task.id, creatorId)
          console.log(`🔄 Task reassigned to creator for review`)
        }
      } else {
        // PR creation failed - still reassign for manual handling
        await postComment(
          task.id,
          `⚠️ **Implementation complete but PR creation failed**\n\n**Error:** ${prResult.error}\n\nThe code changes were made successfully. You may need to create the PR manually.`,
          agentEmail
        )
        console.log(`⚠️ PR creation failed: ${prResult.error}`)

        // Reassign task back to creator
        if (task.creatorId || task.creator?.id) {
          const creatorId = task.creatorId || task.creator!.id
          await reassignTask(task.id, creatorId)
        }
      }

    } else if (result.success && result.files.length === 0) {
      await postComment(
        task.id,
        `⚠️ **No Changes Made**\n\n${agentDisplayName} completed without making any file changes. The task may already be complete, or the requirements may need clarification.`,
        agentEmail
      )
      console.log(`⚠️ Task completed but no files were modified`)

      // Reassign task back to creator
      if (task.creatorId || task.creator?.id) {
        const creatorId = task.creatorId || task.creator!.id
        await reassignTask(task.id, creatorId)
      }

    } else {
      const errorMessage = result.error?.includes('error_max_turns')
        ? 'Task is too complex for current turn limits. Reply "continue" to retry with higher limits, or break the task into smaller pieces.'
        : result.error || 'Unknown error'

      await postComment(
        task.id,
        `❌ **Implementation Failed**\n\n${errorMessage}\n\n*You can try again or provide more details in the task description.*`,
        agentEmail
      )
      console.log(`❌ Task failed: ${result.error}`)

      // Reassign task back to creator
      if (task.creatorId || task.creator?.id) {
        const creatorId = task.creatorId || task.creator!.id
        await reassignTask(task.id, creatorId)
      }
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error)
    await postComment(
      task.id,
      `❌ **Worker Error**\n\n${errorMessage}`,
      agentEmail
    )
    console.error(`❌ Error processing task:`, error)

    // Reassign task back to creator on error
    if (task.creatorId || task.creator?.id) {
      const creatorId = task.creatorId || task.creator!.id
      await reassignTask(task.id, creatorId)
    }
  } finally {
    if (cleanup) {
      console.log('🧹 Cleaning up...')
      await cleanup()
    }
  }
}

// ============================================================================
// STUCK WORKFLOW RECOVERY
// ============================================================================

/**
 * Check for FAILED workflows with recent user comments and trigger recovery.
 * This catches cases where comment webhooks didn't fire or were missed.
 */
async function checkAndRecoverStuckWorkflows(): Promise<void> {
  console.log(`🔧 Checking for stuck workflows with pending feedback...`)

  try {
    // Fetch all tasks in the list (including those that might be "stuck")
    const response = await astridFetch(
      `/api/v1/tasks?listId=${CONFIG.astridListId}&includeComments=true&limit=50`
    )
    const allTasks = response.tasks || [response.task].filter(Boolean)

    for (const task of allTasks) {
      // Skip tasks not assigned to an AI agent
      if (!task.assignee?.email || !isRegisteredAgent(task.assignee.email)) {
        continue
      }

      // Check if task has a FAILED workflow marker in comments
      const comments = task.comments || []
      const hasFailedMarker = comments.some((c: { content: string }) =>
        c.content.includes('Workflow Failed') ||
        c.content.includes('❌ **Error**') ||
        c.content.includes('Planning produced no files')
      )

      if (!hasFailedMarker) continue

      // Find the most recent failure comment
      let lastFailureTime: Date | null = null
      for (let i = comments.length - 1; i >= 0; i--) {
        const c = comments[i]
        if (c.content.includes('Workflow Failed') ||
            c.content.includes('❌ **Error**') ||
            c.content.includes('Planning produced no files')) {
          lastFailureTime = new Date(c.createdAt)
          break
        }
      }

      if (!lastFailureTime) continue

      // Check for user comments AFTER the failure (potential feedback)
      const userFeedbackAfterFailure = comments.filter((c: { content: string; createdAt: string; author?: { isAIAgent?: boolean } }) => {
        const isUserComment = !c.author?.isAIAgent
        const isAfterFailure = new Date(c.createdAt) > lastFailureTime!
        const isNotSystemGenerated = !c.content.includes('<!-- SYSTEM_GENERATED_COMMENT -->')
        const isNotWorkflowStatus = !c.content.includes('**Starting work**') &&
                                    !c.content.includes('**Still analyzing**') &&
                                    !c.content.includes('Retrying with your feedback')
        return isUserComment && isAfterFailure && isNotSystemGenerated && isNotWorkflowStatus
      })

      if (userFeedbackAfterFailure.length === 0) continue

      // Found a stuck task with user feedback - trigger recovery!
      const latestFeedback = userFeedbackAfterFailure[userFeedbackAfterFailure.length - 1]
      console.log(`🔄 Found stuck task with user feedback: ${task.id}`)
      console.log(`   Task: "${task.title.substring(0, 50)}..."`)
      console.log(`   Feedback: "${latestFeedback.content.substring(0, 50)}..."`)

      // Post acknowledgment and trigger retry
      await postComment(
        task.id,
        `🔄 **Auto-Recovery Triggered**\n\nI noticed you provided feedback after the previous failure. Let me retry with your clarification:\n\n> ${latestFeedback.content.substring(0, 300)}${latestFeedback.content.length > 300 ? '...' : ''}\n\n*Starting new attempt...*`,
        task.assignee.email
      )

      // Re-process the task (the workflow will now have the feedback context)
      // We enhance the task description with the feedback before processing
      const enhancedTask = {
        ...task,
        description: `${task.description || ''}\n\n## User Feedback (after previous failure)\n\n${latestFeedback.content}`
      }

      try {
        await processTask(enhancedTask)
        console.log(`✅ Successfully recovered task ${task.id}`)
      } catch (error) {
        console.error(`❌ Recovery failed for task ${task.id}:`, error)
        await postComment(
          task.id,
          `❌ **Recovery Failed**\n\nI tried to retry with your feedback but encountered an error:\n\n**${error instanceof Error ? error.message : String(error)}**\n\nPlease provide more details or try reassigning the task.`,
          task.assignee.email
        )
      }
    }
  } catch (error) {
    console.error('Error checking for stuck workflows:', error)
  }
}

// Main worker loop
async function runWorker() {
  console.log('🤖 Claude Agent SDK Worker')
  console.log('=' .repeat(50))
  console.log(`API URL: ${CONFIG.astridApiUrl}`)
  console.log(`List ID: ${CONFIG.astridListId}`)
  console.log(`Poll interval: ${CONFIG.pollIntervalMs}ms`)
  console.log(`Max budget: $${CONFIG.maxBudgetUsd}`)
  console.log('=' .repeat(50))

  // Track tasks currently being processed (to prevent concurrent processing)
  const currentlyProcessing = new Set<string>()

  // Counter for periodic stuck workflow checks (every 5 poll cycles)
  let pollCount = 0

  while (true) {
    try {
      console.log(`\n🔍 Polling for tasks in list ${CONFIG.astridListId?.substring(0, 8)}...`)

      // fetchAssignedTasks already filters using isTaskAlreadyProcessed()
      // which checks for completion markers AND user feedback after completion
      const tasks = await fetchAssignedTasks()

      // Only filter out tasks that are actively being processed right now
      const pendingTasks = tasks.filter((t) => !currentlyProcessing.has(t.id))

      if (pendingTasks.length > 0) {
        console.log(`📋 Found ${pendingTasks.length} pending task(s)`)

        for (const task of pendingTasks) {
          // Mark as currently processing to prevent concurrent runs
          currentlyProcessing.add(task.id)
          try {
            await processTask(task)
          } finally {
            // Remove from processing set when done (success or failure)
            // This allows the task to be picked up again if user adds feedback
            currentlyProcessing.delete(task.id)
          }
        }
      } else {
        console.log('💤 No pending tasks')
      }

      // Periodically check for stuck workflows (every 5 poll cycles = ~2.5 minutes)
      pollCount++
      if (pollCount >= 5) {
        pollCount = 0
        await checkAndRecoverStuckWorkflows()
      }
    } catch (error) {
      console.error('Worker error:', error)
    }

    // Wait before next poll
    await new Promise((resolve) =>
      setTimeout(resolve, CONFIG.pollIntervalMs)
    )
  }
}

// Single task mode (for testing)
async function runSingleTask(taskId: string) {
  console.log('🤖 Claude Agent SDK Worker (Single Task Mode)')
  console.log('=' .repeat(50))
  console.log(`Task ID: ${taskId}`)
  console.log('=' .repeat(50))

  try {
    const response = await astridFetch(`/api/v1/tasks/${taskId}?includeComments=true`)
    const task = response.task || response
    await processTask(task)
  } catch (error) {
    console.error('Failed to process task:', error)
  }
}

// Entry point
async function main() {
  // Show deprecation warning
  console.warn(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                        ⚠️  DEPRECATION WARNING ⚠️                             ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  This polling-based worker is deprecated and will be removed in the future.  ║
║                                                                              ║
║  For better performance and reliability, use the webhook-based approach:     ║
║                                                                              ║
║    Option 1 (Simple):    npx astrid-agent serve --port=3001                  ║
║    Option 2 (Full):      cd packages/claude-code-remote && npm start         ║
║                                                                              ║
║  Then configure in Astrid:                                                   ║
║    Settings -> Code Remote Server -> Enter your webhook URL                  ║
║                                                                              ║
║  Benefits: Real-time notifications, session continuity, lower costs          ║
╚══════════════════════════════════════════════════════════════════════════════╝
`)

  // Add a small delay so the warning is visible
  await new Promise(resolve => setTimeout(resolve, 2000))

  validateConfig()

  const taskId = process.argv[2]
  if (taskId) {
    // Single task mode
    await runSingleTask(taskId)
  } else {
    // Worker mode
    await runWorker()
  }
}

main().catch(console.error)
