/**
 * Astrid SDK Server
 *
 * Express server that receives webhooks from Astrid and executes
 * AI coding agents (Claude, OpenAI, Gemini) with full tool access.
 *
 * Usage:
 *   npx astrid-agent serve --port=3001
 */

import { verifyWebhookSignature } from './webhook-signature.js'
import { sessionManager, type Session, type AIProvider } from './session-manager.js'
import { astridClient } from './astrid-client.js'
import { repoManager } from './repo-manager.js'
import {
  planWithClaude,
  executeWithClaude,
  type ClaudeExecutorConfig,
} from '../executors/claude.js'
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
import { DEFAULT_MODELS } from '../utils/agent-config.js'
import type { AIService } from '../types/index.js'

// Type for Express-like request with rawBody
interface RawBodyRequest {
  rawBody?: Buffer
  body: Record<string, unknown>
  headers: Record<string, string | string[] | undefined>
}

// Type for Express-like response
interface ExpressResponse {
  json(data: unknown): void
  status(code: number): ExpressResponse
}

// Type for Express-like application
interface ExpressApplication {
  use(handler: unknown): void
  get(path: string, handler: (req: unknown, res: ExpressResponse) => void | Promise<void>): void
  post(path: string, handler: (req: unknown, res: ExpressResponse) => void | Promise<void>): void
  listen(port: number, host: string, callback: () => void): void
}

export interface ServerConfig {
  port: number
  webhookSecret?: string
  callbackUrl?: string
}

/**
 * Get model for provider, handling unknown case
 */
function getModelForProvider(provider: AIProvider): string {
  if (provider === 'unknown') {
    return DEFAULT_MODELS['claude'] // Default to claude
  }
  return DEFAULT_MODELS[provider as AIService]
}

// Track active executions to prevent concurrent runs for the same task
const activeExecutions = new Set<string>()

/**
 * Detect provider from agent info
 */
function detectProvider(aiAgent: { email?: string; type?: string }): AIProvider {
  const email = aiAgent?.email?.toLowerCase() || ''
  const type = aiAgent?.type?.toLowerCase() || ''

  if (email.includes('claude') || type.includes('claude')) return 'claude'
  if (email.includes('openai') || email.includes('gpt') || type.includes('openai')) return 'openai'
  if (email.includes('gemini') || email.includes('google') || type.includes('gemini')) return 'gemini'

  return 'claude' // Default
}

/**
 * Get provider display name
 */
function getProviderName(provider: AIProvider): string {
  switch (provider) {
    case 'claude': return 'Claude'
    case 'openai': return 'OpenAI'
    case 'gemini': return 'Gemini'
    default: return 'AI Agent'
  }
}

/**
 * Get API key for provider
 */
function getApiKeyForProvider(provider: AIProvider): string | undefined {
  switch (provider) {
    case 'claude': return process.env.ANTHROPIC_API_KEY
    case 'openai': return process.env.OPENAI_API_KEY
    case 'gemini': return process.env.GEMINI_API_KEY
    default: return undefined
  }
}

/**
 * Get project path from list configuration
 */
function getProjectPath(list: { id?: string; repository?: string }): string | undefined {
  if (!list?.id) {
    return process.env.DEFAULT_PROJECT_PATH || undefined
  }

  // Try to get from environment based on list ID
  const envKey = `PROJECT_PATH_${list.id.replace(/-/g, '_').toUpperCase()}`
  if (process.env[envKey]) {
    return process.env[envKey]
  }

  return process.env.DEFAULT_PROJECT_PATH || undefined
}

/**
 * Handle new task assignment
 */
async function handleTaskAssigned(payload: {
  task: { id: string; title: string; description?: string }
  list?: { id?: string; name?: string; githubRepositoryId?: string }
  mcp?: { accessToken?: string }
  comments?: Array<{ content: string; author?: { name?: string } }>
  aiAgent?: { email?: string; type?: string; model?: string }
}): Promise<void> {
  const { task, list, comments, aiAgent } = payload

  // Prevent concurrent executions for the same task
  if (activeExecutions.has(task.id)) {
    console.log(`⚠️ Task ${task.id} already executing, skipping duplicate`)
    return
  }
  activeExecutions.add(task.id)
  console.log(`🔒 Acquired execution lock for task ${task.id}`)

  // Detect which AI provider to use based on the agent
  const provider = detectProvider(aiAgent || {})
  const providerName = getProviderName(provider)
  const apiKey = getApiKeyForProvider(provider)

  console.log(`🆕 New task assigned: ${task.title}`)
  console.log(`🤖 AI Provider: ${providerName}`)
  console.log(`📋 List: ${list?.name}, Repo: ${list?.githubRepositoryId || 'none'}`)
  console.log(`💬 Comments provided: ${comments?.length || 0}`)

  if (!apiKey) {
    console.error(`❌ No API key configured for ${providerName}`)
    activeExecutions.delete(task.id)
    return
  }

  // Check if we already have a session for this task
  let session = await sessionManager.getByTaskId(task.id)

  if (session) {
    console.log(`📂 Session already exists for task ${task.id}, status: ${session.status}`)

    if (session.status === 'interrupted' || session.status === 'error') {
      console.log(`🔄 Restarting session for task ${task.id}`)
      await sessionManager.deleteSession(task.id)
      session = undefined
    } else if (session.status === 'running') {
      // Check if the session is stale
      const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000
      const lastUpdate = new Date(session.updatedAt).getTime()

      if (lastUpdate < thirtyMinutesAgo) {
        console.log(`⚠️ Session appears stuck, resetting`)
        await sessionManager.deleteSession(task.id)
        session = undefined
      } else {
        console.log(`⚠️ Session already running for task ${task.id}`)
        activeExecutions.delete(task.id)
        return
      }
    }
  }

  // Clone/update repository if specified
  let projectPath = getProjectPath(list || {})

  if (list?.githubRepositoryId) {
    console.log(`📥 Setting up repository: ${list.githubRepositoryId}`)
    const repoInfo = await repoManager.getRepo(list.githubRepositoryId)

    if (repoInfo) {
      projectPath = repoInfo.path
      console.log(`✅ Repository ready at: ${projectPath}`)

      try {
        const branchName = await repoManager.createTaskBranch(repoInfo.path, task.id)
        console.log(`🌿 Working on branch: ${branchName}`)
      } catch (err) {
        console.log(`⚠️ Could not create task branch, working on main`)
      }
    } else {
      console.error(`❌ Failed to setup repository: ${list.githubRepositoryId}`)
    }
  }

  if (!projectPath) {
    console.log(`⚠️ No project path - ${providerName} will work without file context`)
    projectPath = process.cwd()
  }

  // Create new session
  session = await sessionManager.createSession({
    taskId: task.id,
    title: task.title,
    description: task.description || '',
    projectPath,
    provider,
    metadata: {
      listId: list?.id,
      listName: list?.name,
      repository: list?.githubRepositoryId,
      aiAgent: aiAgent
    }
  })

  await sessionManager.updateSession(task.id, { status: 'running' })
  await astridClient.notifyStarted(task.id, session.id, `Starting work on: ${task.title} (using ${providerName})`)

  try {
    const config = {
      repoPath: projectPath,
      apiKey,
      model: getModelForProvider(provider),
      maxBudgetUsd: parseFloat(process.env.MAX_BUDGET_USD || '10.0'),
      maxTurns: 50,
      maxIterations: 50,
      logger: (level: string, msg: string) => console.log(`[${level}] ${msg}`),
      onProgress: (msg: string) => {
        astridClient.notifyProgress(task.id, session!.id, msg)
      },
    }

    // Plan phase
    console.log(`📋 Planning phase starting...`)
    let planResult

    switch (provider) {
      case 'claude':
        planResult = await planWithClaude(task.title, task.description || null, config as ClaudeExecutorConfig)
        break
      case 'openai':
        planResult = await planWithOpenAI(task.title, task.description || null, config as OpenAIExecutorConfig)
        break
      case 'gemini':
        planResult = await planWithGemini(task.title, task.description || null, config as GeminiExecutorConfig)
        break
    }

    if (!planResult?.success || !planResult?.plan) {
      throw new Error(`Planning failed: ${planResult?.error || 'No plan generated'}`)
    }

    console.log(`✅ Plan created: ${planResult.plan.summary}`)

    // Execute phase
    console.log(`🔨 Execution phase starting...`)
    let execResult

    switch (provider) {
      case 'claude':
        execResult = await executeWithClaude(planResult.plan, task.title, task.description || null, config as ClaudeExecutorConfig)
        break
      case 'openai':
        execResult = await executeWithOpenAI(planResult.plan, task.title, task.description || null, config as OpenAIExecutorConfig)
        break
      case 'gemini':
        execResult = await executeWithGemini(planResult.plan, task.title, task.description || null, config as GeminiExecutorConfig)
        break
    }

    if (!execResult?.success) {
      throw new Error(`Execution failed: ${execResult?.error || 'Unknown error'}`)
    }

    console.log(`✅ Execution complete: ${execResult.files.length} files modified`)

    await sessionManager.updateSession(task.id, { status: 'completed' })
    await astridClient.notifyCompleted(task.id, session.id, {
      summary: execResult.commitMessage || planResult.plan.summary,
      files: execResult.files.map(f => f.path),
      prUrl: (execResult as { prUrl?: string }).prUrl
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`❌ ${providerName} execution failed:`, error)

    await sessionManager.updateSession(task.id, { status: 'error' })
    await astridClient.notifyError(task.id, session.id, errorMessage)
  } finally {
    activeExecutions.delete(task.id)
    console.log(`🔓 Released execution lock for task ${task.id}`)
  }
}

/**
 * Handle comment on assigned task
 */
async function handleCommentCreated(payload: {
  task: { id: string; title: string; description?: string }
  comment: { content: string }
  comments?: Array<{ content: string; author?: { name?: string } }>
  mcp?: { accessToken?: string }
  aiAgent?: { email?: string; type?: string; model?: string }
}): Promise<void> {
  const { task, comment, comments, aiAgent } = payload

  console.log(`💬 Comment received on task ${task.id}: ${comment.content.slice(0, 50)}...`)

  // Get existing session
  const session = await sessionManager.getByTaskId(task.id)

  if (!session) {
    console.log(`⚠️ No session found for task ${task.id}, creating new one`)
    await handleTaskAssigned(payload)
    return
  }

  // For now, treat comments as continuing the task
  // Could implement specific comment handling (e.g., "retry", "ship it")
  await sessionManager.incrementMessageCount(task.id)
  console.log(`📝 Comment logged for session ${session.id}`)
}

/**
 * Create and configure the Express server
 */
export async function createServer(config: ServerConfig): Promise<ExpressApplication> {
  // Dynamic import of express
  const expressModule = await import('express')
  const express = expressModule.default || expressModule

  const app = express()
  const webhookSecret = config.webhookSecret || process.env.ASTRID_WEBHOOK_SECRET

  if (!webhookSecret) {
    throw new Error('ASTRID_WEBHOOK_SECRET not configured')
  }

  // Parse JSON with raw body preservation for signature verification
  app.use(express.json({
    verify: (req: RawBodyRequest, _res: unknown, buf: Buffer) => {
      req.rawBody = buf
    }
  }))

  // Health check endpoint
  app.get('/health', async (_req: unknown, res: ExpressResponse) => {
    const claudeAvailable = !!process.env.ANTHROPIC_API_KEY
    const openaiAvailable = !!process.env.OPENAI_API_KEY
    const geminiAvailable = !!process.env.GEMINI_API_KEY
    const activeSessions = await sessionManager.getActiveSessions()

    res.json({
      status: (claudeAvailable || openaiAvailable || geminiAvailable) ? 'healthy' : 'degraded',
      providers: {
        claude: claudeAvailable ? 'available' : 'not configured',
        openai: openaiAvailable ? 'available' : 'not configured',
        gemini: geminiAvailable ? 'available' : 'not configured'
      },
      activeSessions: activeSessions.length,
      timestamp: new Date().toISOString()
    })
  })

  // Webhook endpoint
  app.post('/webhook', async (rawReq: unknown, res: ExpressResponse) => {
    const req = rawReq as RawBodyRequest
    const signature = req.headers['x-astrid-signature'] as string
    const timestamp = req.headers['x-astrid-timestamp'] as string
    const event = req.headers['x-astrid-event'] as string

    const rawBody = req.rawBody?.toString() || JSON.stringify(req.body)
    const verification = verifyWebhookSignature(rawBody, signature, webhookSecret, timestamp)

    if (!verification.valid) {
      console.error(`❌ Webhook signature verification failed: ${verification.error}`)
      res.status(401).json({ error: verification.error })
      return
    }

    console.log(`📥 Received webhook: ${event}`)

    // Respond immediately
    res.json({ success: true, event, message: 'Processing started' })

    // Process webhook asynchronously
    setImmediate(async () => {
      try {
        const body = req.body as Record<string, unknown>
        switch (event) {
          case 'task.assigned':
            await handleTaskAssigned(body as Parameters<typeof handleTaskAssigned>[0])
            break
          case 'comment.created':
            await handleCommentCreated(body as Parameters<typeof handleCommentCreated>[0])
            break
          case 'task.updated':
            console.log(`📝 Task updated: ${(body.task as { id?: string })?.id}`)
            break
          default:
            console.log(`⚠️ Unknown event type: ${event}`)
        }
      } catch (error) {
        console.error(`❌ Error handling webhook:`, error)
      }
    })
  })

  // List sessions endpoint
  app.get('/sessions', async (_req: unknown, res: ExpressResponse) => {
    const sessions = await sessionManager.getAllSessions()
    res.json({
      count: sessions.length,
      sessions: sessions.map(s => ({
        id: s.id,
        taskId: s.taskId,
        title: s.title,
        status: s.status,
        provider: s.provider,
        updatedAt: s.updatedAt
      }))
    })
  })

  return app as ExpressApplication
}

/**
 * Start the server
 */
export async function startServer(config: ServerConfig): Promise<void> {
  const providers: string[] = []
  if (process.env.ANTHROPIC_API_KEY) providers.push('Claude')
  if (process.env.OPENAI_API_KEY) providers.push('OpenAI')
  if (process.env.GEMINI_API_KEY) providers.push('Gemini')

  if (providers.length === 0) {
    console.warn(`⚠️ No AI providers configured! Add at least one:
   ANTHROPIC_API_KEY=sk-ant-...  (for Claude)
   OPENAI_API_KEY=sk-...         (for OpenAI)
   GEMINI_API_KEY=AIza...        (for Gemini)
`)
  } else {
    console.log(`✅ Available providers: ${providers.join(', ')}`)
  }

  // Recover interrupted sessions
  await sessionManager.recoverSessions()
  await sessionManager.cleanupExpired()

  const app = await createServer(config)

  app.listen(config.port, '0.0.0.0', () => {
    const providerStatus = providers.length > 0 ? providers.join(', ') : 'None'
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║           Astrid SDK Server                                    ║
╠════════════════════════════════════════════════════════════════╣
║  Status:    Running                                            ║
║  Providers: ${providerStatus.padEnd(42)}   ║
║  Address:   http://0.0.0.0:${config.port}                                  ║
║  Webhook:   http://0.0.0.0:${config.port}/webhook                          ║
║  Health:    http://0.0.0.0:${config.port}/health                           ║
╠════════════════════════════════════════════════════════════════╣
║  Supported AI Agents:                                          ║
║  - claude@astrid.cc  → Claude Agent SDK                        ║
║  - openai@astrid.cc  → OpenAI API (GPT-4o)                     ║
║  - gemini@astrid.cc  → Google Gemini API                       ║
╠════════════════════════════════════════════════════════════════╣
║  Configure in Astrid:                                          ║
║  1. Go to Settings → AI Agent Settings                         ║
║  2. Set URL to your server's /webhook endpoint                 ║
║  3. Copy the webhook secret to ASTRID_WEBHOOK_SECRET           ║
╚════════════════════════════════════════════════════════════════╝
`)
  })
}

// Re-export types
export { Session, AIProvider } from './session-manager.js'
export { AstridClient, AstridClientConfig, CallbackPayload } from './astrid-client.js'
export { sessionManager } from './session-manager.js'
export { astridClient } from './astrid-client.js'
export { repoManager } from './repo-manager.js'
