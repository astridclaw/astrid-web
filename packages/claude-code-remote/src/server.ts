/**
 * Code Remote Server
 *
 * Self-hosted server that receives webhooks from Astrid and executes
 * AI coding agents (Claude, OpenAI, Gemini) with session management.
 *
 * Usage:
 *   npm run dev           # Development with hot reload
 *   npm run build && npm start  # Production
 */

import express, { Request, Response } from 'express'
import { verifyWebhookSignature } from './webhook-signature'
import { sessionManager, type Session } from './session-manager'
import { claudeExecutor } from './claude-executor'
import { astridClient } from './astrid-client'
import { repoManager } from './repo-manager'
import {
  detectProvider,
  getExecutor,
  getProviderName,
  type AIProvider
} from './executors/index'

// Extend Express Request to include rawBody
interface RawBodyRequest extends Request {
  rawBody?: Buffer
}

const app = express()

// Parse JSON with raw body preservation for signature verification
app.use(express.json({
  verify: (req: RawBodyRequest, _res, buf) => {
    req.rawBody = buf
  }
}))

// Health check endpoint
app.get('/health', async (_req: Request, res: Response) => {
  const claudeAvailable = await claudeExecutor.checkAvailable()
  const openaiAvailable = !!process.env.OPENAI_API_KEY
  const geminiAvailable = !!process.env.GEMINI_API_KEY
  const activeSessions = await sessionManager.getActiveSessions()

  const hasAnyProvider = claudeAvailable || openaiAvailable || geminiAvailable

  // Check API key status (don't expose the actual key)
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const apiKeyStatus = anthropicKey
    ? `set (${anthropicKey.length} chars, starts with: ${anthropicKey.substring(0, 10)}...)`
    : 'not set'

  res.json({
    status: hasAnyProvider ? 'healthy' : 'degraded',
    providers: {
      claude: claudeAvailable ? 'available' : 'not installed',
      openai: openaiAvailable ? 'available' : 'not configured',
      gemini: geminiAvailable ? 'available' : 'not configured'
    },
    anthropicApiKey: apiKeyStatus,
    activeSessions: activeSessions.length,
    timestamp: new Date().toISOString()
  })
})

// Test webhook handler directly - simulates receiving a webhook
app.post('/test-webhook', async (req: Request, res: Response) => {
  console.log('🧪 Testing webhook handler directly...')

  // Build a mock payload similar to what Astrid sends
  const mockPayload = {
    task: {
      id: `test-${Date.now()}`,
      title: req.body.title || 'Test task for debugging',
      description: req.body.description || 'This is a test task.',
      priority: 'medium'
    },
    list: {
      id: 'test-list',
      name: 'Test List',
      githubRepositoryId: 'Graceful-Tools/astrid-res-www' // Will trigger repo setup
    },
    aiAgent: {
      id: 'test-agent',
      name: 'Claude Agent',
      type: 'claude_agent',
      model: req.body.model || 'opus'
    },
    mcp: {
      accessToken: undefined // No MCP token for test
    },
    comments: []
  }

  console.log(`📋 Mock payload:`, JSON.stringify(mockPayload, null, 2))

  // Respond immediately like the real webhook
  res.json({ success: true, message: 'Processing started' })

  // Call handleTaskAssigned in background
  setImmediate(async () => {
    try {
      // Use the actual handleTaskAssigned function
      await handleTaskAssigned(mockPayload)
      console.log('✅ Test webhook handler completed')
    } catch (error) {
      console.error('❌ Test webhook handler failed:', error)
    }
  })
})

// Debug endpoint - test with executor code path
// Use ?full=true to simulate the full webhook flow including sessionManager
app.get('/test-executor', async (req: Request, res: Response) => {
  const testCwd = req.query.cwd as string || '/app/persistent/repos/Graceful-Tools/astrid-res-www'
  const taskTitle = (req.query.title as string) || 'Test task'
  const taskDescription = (req.query.description as string) || 'This is a test task description.'
  const maxTurns = parseInt(req.query.maxTurns as string || '1', 10)
  const useFullFlow = req.query.full === 'true'

  console.log('🧪 Testing with executor code path...')
  console.log(`📁 CWD: ${testCwd}`)
  console.log(`📋 Title: ${taskTitle}`)
  console.log(`📝 Description: ${taskDescription.slice(0, 100)}...`)
  console.log(`🔄 Max turns: ${maxTurns}`)
  console.log(`🔀 Full flow: ${useFullFlow}`)

  try {
    let session: any

    if (useFullFlow) {
      // Use sessionManager like the real webhook handler
      const testTaskId = `test-${Date.now()}`
      session = await sessionManager.createSession({
        taskId: testTaskId,
        title: taskTitle,
        description: taskDescription,
        projectPath: testCwd,
        provider: 'claude',
        metadata: {}
      })
      await sessionManager.updateSession(testTaskId, { status: 'running' })
      console.log(`📂 Created session via sessionManager: ${session.id}`)
    } else {
      // Create a mock session directly
      session = {
        id: 'test-session',
        taskId: 'test-task',
        title: taskTitle,
        description: taskDescription,
        projectPath: testCwd,
        status: 'running' as const,
        provider: 'claude' as const,
        messageCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {}
      }
    }

    // Override maxTurns for testing
    const originalMaxTurns = (claudeExecutor as any).maxTurns
    ;(claudeExecutor as any).maxTurns = maxTurns

    // Build context similar to real webhook
    const testContext = {
      comments: req.query.comments ? JSON.parse(req.query.comments as string) : undefined,
      repository: req.query.repository as string || undefined,
      mcpToken: req.query.mcpToken as string || undefined,
      model: req.query.model as string || undefined
    }
    console.log(`🔧 Test context:`, JSON.stringify(testContext))

    const result = await claudeExecutor.startSession(session, undefined, testContext)

    // Restore maxTurns
    ;(claudeExecutor as any).maxTurns = originalMaxTurns

    // Clean up test session if created via sessionManager
    if (useFullFlow) {
      await sessionManager.deleteSession(session.taskId)
    }

    res.json({
      success: true,
      exitCode: result.exitCode,
      stdout: result.stdout.slice(0, 2000),
      stderr: result.stderr.slice(0, 500),
      sessionId: result.sessionId,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ Executor test failed:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    })
  }
})

// Test endpoint - runs a simple Claude command
// Add ?cwd=/path to test with a specific working directory
app.get('/test-claude', async (req: Request, res: Response) => {
  const { spawnSync, spawn } = require('child_process')

  const testCwd = req.query.cwd as string || undefined
  const testPrompt = (req.query.prompt as string) || 'Respond with just the word OK'

  console.log('🧪 Testing Claude Code CLI...')
  console.log(`🔑 ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'set' : 'not set'}`)
  console.log(`📁 Test CWD: ${testCwd || 'default'}`)
  console.log(`📝 Test prompt: ${testPrompt.slice(0, 100)}...`)

  // First test --version synchronously
  console.log('Testing --version...')
  const versionResult = spawnSync('claude', ['--version'], { encoding: 'utf8', timeout: 5000 })
  console.log('Version result:', versionResult.stdout, versionResult.stderr, 'code:', versionResult.status)

  // Test with same args as the executor uses
  const testModel = (req.query.model as string) || 'opus'
  const testMaxTurns = (req.query.maxTurns as string) || '1'
  const args = [
    '--print',
    '--model', testModel,
    '--max-turns', testMaxTurns,
    '--output-format', 'text',
    '--dangerously-skip-permissions',
    '-p', testPrompt
  ]

  console.log(`🤖 Running: claude ${args.join(' ')}`)

  // Use same env as the executor
  const testEnv = {
    ...process.env,
    CLAUDE_CODE_ENTRYPOINT: 'cli',
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR || '/app/persistent/.claude'
  }

  const spawnOptions: any = {
    env: testEnv,
    timeout: 30000,
    stdio: ['ignore', 'pipe', 'pipe'] // Explicitly set stdio
  }
  if (testCwd) {
    spawnOptions.cwd = testCwd
  }

  console.log(`🔧 CLAUDE_CODE_ENTRYPOINT: ${testEnv.CLAUDE_CODE_ENTRYPOINT}`)
  console.log(`🔧 CLAUDE_CONFIG_DIR: ${testEnv.CLAUDE_CONFIG_DIR}`)

  const proc = spawn('claude', args, spawnOptions)

  let stdout = ''
  let stderr = ''
  let responded = false

  proc.stdout.on('data', (data: Buffer) => {
    const chunk = data.toString()
    stdout += chunk
    console.log('stdout:', chunk)
  })

  proc.stderr.on('data', (data: Buffer) => {
    const chunk = data.toString()
    stderr += chunk
    console.log('stderr:', chunk)
  })

  proc.on('error', (error: Error) => {
    console.error('Process error:', error)
    if (!responded) {
      responded = true
      res.status(500).json({ error: error.message })
    }
  })

  proc.on('close', (code: number) => {
    console.log(`✅ Claude exited with code ${code}`)
    if (!responded) {
      responded = true
      res.json({
        version: versionResult.stdout?.trim() || 'unknown',
        exitCode: code,
        stdout: stdout.slice(0, 1000),
        stderr: stderr.slice(0, 1000),
        timestamp: new Date().toISOString()
      })
    }
  })

  // Timeout after 30 seconds
  setTimeout(() => {
    if (!proc.killed && !responded) {
      console.log('⏰ Test timeout, killing process')
      proc.kill('SIGTERM')
      responded = true
      res.status(504).json({
        error: 'Timeout after 30s',
        version: versionResult.stdout?.trim() || 'unknown',
        stdout: stdout.slice(0, 500),
        stderr: stderr.slice(0, 500)
      })
    }
  }, 30000)
})

// Diagnostics endpoint - detailed system information for debugging
app.get('/diagnostics', async (_req: Request, res: Response) => {
  const { spawnSync } = require('child_process')
  const fs = require('fs')

  // Helper to check if a path exists and get permissions
  const checkPath = (p: string) => {
    try {
      const stats = fs.statSync(p)
      return {
        exists: true,
        isDirectory: stats.isDirectory(),
        permissions: stats.mode.toString(8).slice(-3),
        owner: `${stats.uid}:${stats.gid}`
      }
    } catch (err: any) {
      return { exists: false, error: err.code }
    }
  }

  // Helper to mask secrets
  const maskSecret = (value: string | undefined): string => {
    if (!value) return 'not set'
    if (value.length <= 10) return '***'
    return `${value.substring(0, 10)}...*** (${value.length} chars)`
  }

  // Check Claude CLI version
  const claudeVersion = spawnSync('claude', ['--version'], { encoding: 'utf8', timeout: 5000 })
  const gitVersion = spawnSync('git', ['--version'], { encoding: 'utf8', timeout: 5000 })
  const ghVersion = spawnSync('gh', ['--version'], { encoding: 'utf8', timeout: 5000 })

  // Check Claude settings file
  const settingsPath = '/app/persistent/.claude/settings.json'
  let settingsContent: any = null
  try {
    settingsContent = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  } catch (err: any) {
    settingsContent = { error: err.code || err.message }
  }

  // Check symlink status
  let claudeSymlink: any = null
  try {
    const symlinkTarget = fs.readlinkSync('/home/claude/.claude')
    claudeSymlink = { exists: true, target: symlinkTarget }
  } catch (err: any) {
    claudeSymlink = { exists: false, error: err.code }
  }

  res.json({
    timestamp: new Date().toISOString(),

    environment: {
      NODE_ENV: process.env.NODE_ENV,
      HOME: process.env.HOME,
      USER: process.env.USER || 'unknown',
      ANTHROPIC_API_KEY: maskSecret(process.env.ANTHROPIC_API_KEY),
      GH_TOKEN: maskSecret(process.env.GH_TOKEN),
      ASTRID_WEBHOOK_SECRET: maskSecret(process.env.ASTRID_WEBHOOK_SECRET),
      SESSIONS_DIR: process.env.SESSIONS_DIR || '/app/persistent/sessions (default)',
      DATA_DIR: process.env.DATA_DIR || '/app/persistent/sessions (default)',
      REPOS_DIR: process.env.REPOS_DIR || '/app/persistent/repos (default)'
    },

    directories: {
      '/app/persistent': checkPath('/app/persistent'),
      '/app/persistent/sessions': checkPath('/app/persistent/sessions'),
      '/app/persistent/repos': checkPath('/app/persistent/repos'),
      '/app/persistent/.claude': checkPath('/app/persistent/.claude'),
      '/home/claude': checkPath('/home/claude'),
      '/home/claude/.claude': checkPath('/home/claude/.claude')
    },

    symlinks: {
      '~/.claude': claudeSymlink
    },

    cliTools: {
      claude: {
        available: claudeVersion.status === 0,
        version: claudeVersion.stdout?.trim() || claudeVersion.stderr?.trim() || 'error',
        exitCode: claudeVersion.status
      },
      git: {
        available: gitVersion.status === 0,
        version: gitVersion.stdout?.trim() || 'error'
      },
      gh: {
        available: ghVersion.status === 0,
        version: ghVersion.stdout?.split('\n')[0]?.trim() || 'error'
      }
    },

    claudeSettings: {
      path: settingsPath,
      content: settingsContent
    },

    sessions: {
      storagePath: `/app/persistent/sessions/sessions.json`,
      exists: checkPath('/app/persistent/sessions/sessions.json').exists
    }
  })
})

// Webhook endpoint - receives notifications from Astrid
app.post('/webhook', async (req: RawBodyRequest, res: Response) => {
  const signature = req.headers['x-astrid-signature'] as string
  const timestamp = req.headers['x-astrid-timestamp'] as string
  const event = req.headers['x-astrid-event'] as string

  // Verify webhook signature
  const secret = process.env.ASTRID_WEBHOOK_SECRET
  if (!secret) {
    console.error('❌ ASTRID_WEBHOOK_SECRET not configured')
    return res.status(500).json({ error: 'Server not configured' })
  }

  const rawBody = req.rawBody?.toString() || JSON.stringify(req.body)
  const verification = verifyWebhookSignature(rawBody, signature, secret, timestamp)

  if (!verification.valid) {
    console.error(`❌ Webhook signature verification failed: ${verification.error}`)
    return res.status(401).json({ error: verification.error })
  }

  console.log(`📥 Received webhook: ${event}`)

  // Respond immediately - don't wait for processing to complete
  // This prevents Astrid's HTTP request from timing out
  res.json({ success: true, event, message: 'Processing started' })

  // Process webhook asynchronously (fire and forget)
  setImmediate(async () => {
    try {
      switch (event) {
        case 'task.assigned':
          await handleTaskAssigned(req.body)
          break
        case 'comment.created':
          await handleCommentCreated(req.body)
          break
        case 'task.updated':
          console.log(`📝 Task updated: ${req.body.task?.id}`)
          break
        default:
          console.log(`⚠️ Unknown event type: ${event}`)
      }
    } catch (error) {
      console.error(`❌ Error handling webhook:`, error)
      // Error is logged but not returned to client since response already sent
    }
  })
})

// List sessions endpoint (for debugging)
app.get('/sessions', async (_req: Request, res: Response) => {
  const sessions = await sessionManager.getAllSessions()
  res.json({
    count: sessions.length,
    sessions: sessions.map(s => ({
      id: s.id,
      taskId: s.taskId,
      title: s.title,
      status: s.status,
      provider: s.provider || 'claude',
      providerSessionId: s.claudeSessionId,
      messageCount: s.messageCount,
      updatedAt: s.updatedAt
    }))
  })
})

// Delete/reset a session (for stuck sessions)
app.delete('/sessions/:taskId', async (req: Request, res: Response) => {
  const { taskId } = req.params

  const session = await sessionManager.getByTaskId(taskId)
  if (!session) {
    return res.status(404).json({ error: 'Session not found' })
  }

  console.log(`🗑️ Manually deleting session for task ${taskId} (was ${session.status})`)
  await sessionManager.deleteSession(taskId)

  res.json({
    success: true,
    message: `Session deleted for task ${taskId}`,
    previousStatus: session.status
  })
})

// Reset all stuck sessions (running for > 1 hour)
app.post('/sessions/reset-stuck', async (_req: Request, res: Response) => {
  const sessions = await sessionManager.getAllSessions()
  const oneHourAgo = Date.now() - 60 * 60 * 1000
  const stuck: string[] = []

  for (const session of sessions) {
    if (session.status === 'running') {
      const updatedAt = new Date(session.updatedAt).getTime()
      if (updatedAt < oneHourAgo) {
        console.log(`🔄 Marking stuck session as interrupted: ${session.taskId}`)
        await sessionManager.updateSession(session.taskId, { status: 'interrupted' })
        stuck.push(session.taskId)
      }
    }
  }

  res.json({
    success: true,
    message: `Reset ${stuck.length} stuck sessions`,
    resetTaskIds: stuck
  })
})

// Track active executions to prevent concurrent runs for the same task
const activeExecutions = new Set<string>()

/**
 * Handle new task assignment
 */
async function handleTaskAssigned(payload: any): Promise<void> {
  const { task, list, mcp, comments, aiAgent } = payload

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

  console.log(`🆕 New task assigned: ${task.title}`)
  console.log(`🤖 AI Provider: ${providerName}`)
  console.log(`📋 List: ${list?.name}, Repo: ${list?.githubRepositoryId || 'none'}`)
  console.log(`💬 Comments provided: ${comments?.length || 0}`)

  // Check if we already have a session for this task
  let session = await sessionManager.getByTaskId(task.id)

  if (session) {
    console.log(`📂 Session already exists for task ${task.id}, status: ${session.status}`)

    if (session.status === 'interrupted' || session.status === 'error') {
      // Resume interrupted/errored session
      console.log(`🔄 Restarting session for task ${task.id}`)
      // Delete old session and create new one
      await sessionManager.deleteSession(task.id)
      session = undefined
    } else if (session.status === 'running') {
      // Check if the session is stale (running for > 30 minutes without update)
      const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000
      const lastUpdate = new Date(session.updatedAt).getTime()

      if (lastUpdate < thirtyMinutesAgo) {
        console.log(`⚠️ Session for task ${task.id} appears stuck (last update: ${session.updatedAt})`)
        console.log(`🔄 Resetting stuck session and starting fresh`)
        await sessionManager.deleteSession(task.id)
        session = undefined
      } else {
        // Recently active, don't start another session
        console.log(`⚠️ Session already running for task ${task.id}`)
        activeExecutions.delete(task.id)
        console.log(`🔓 Released execution lock for task ${task.id} (session already running)`)
        return
      }
    }
  }

  // Clone/update repository if specified
  let projectPath = getProjectPath(list)

  if (list?.githubRepositoryId) {
    console.log(`📥 Setting up repository: ${list.githubRepositoryId}`)
    const repoInfo = await repoManager.getRepo(list.githubRepositoryId)

    if (repoInfo) {
      projectPath = repoInfo.path
      console.log(`✅ Repository ready at: ${projectPath}`)

      // Create task-specific branch
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
  }

  // Create new session with provider info
  session = await sessionManager.createSession({
    taskId: task.id,
    title: task.title,
    description: task.description,
    projectPath,
    provider,
    metadata: {
      listId: list?.id,
      listName: list?.name,
      repository: list?.githubRepositoryId,
      mcpToken: mcp?.accessToken,
      aiAgent: aiAgent
    }
  })

  // Update session status
  await sessionManager.updateSession(task.id, { status: 'running' })

  // Notify Astrid that we've started
  await astridClient.notifyStarted(task.id, session.id, `Starting work on: ${task.title} (using ${providerName})`)

  // Get the appropriate executor for this provider
  const executor = getExecutor(provider)

  // Check if executor is available
  const isAvailable = await executor.checkAvailable()
  if (!isAvailable) {
    const errorMsg = `${providerName} is not available. Please check configuration.`
    console.error(`❌ ${errorMsg}`)
    await sessionManager.updateSession(task.id, { status: 'error' })
    await astridClient.notifyError(task.id, session.id, errorMsg)
    activeExecutions.delete(task.id)
    console.log(`🔓 Released execution lock for task ${task.id} (executor not available)`)
    return
  }

  try {
    // Build context from payload
    const context = {
      comments: comments?.map((c: any) => ({
        authorName: c.author?.name || c.authorName || 'Unknown',
        content: c.content || c.body,
        createdAt: c.createdAt
      })),
      repository: list?.githubRepositoryId,
      mcpToken: mcp?.accessToken,
      model: aiAgent?.model // User-configured model preference
    }

    console.log(`🔌 MCP token ${mcp?.accessToken ? 'provided' : 'not provided'}`)
    if (aiAgent?.model) {
      console.log(`🧠 Model preference: ${aiAgent.model}`)
    }

    // Progress callback for real-time updates
    const onProgress = (message: string) => {
      astridClient.notifyProgress(task.id, session.id, message)
    }

    // Execute with the appropriate provider
    const result = await executor.startSession(session, undefined, context, onProgress)

    // Store session ID if extracted (for providers that support resumption)
    if (result.sessionId) {
      await sessionManager.setClaudeSessionId(task.id, result.sessionId)
    }

    // Parse output using the executor's parser
    const parsed = executor.parseOutput(result.stdout)

    // Capture git changes after execution
    let gitChanges = { diff: '', files: [] as string[] }
    if (session.projectPath && 'captureGitChanges' in executor) {
      gitChanges = await (executor as any).captureGitChanges(session.projectPath)
    }

    // Extract PR URL from output if not already found
    let prUrl = parsed.prUrl
    if (!prUrl && 'extractPrUrl' in executor) {
      prUrl = (executor as any).extractPrUrl(result.stdout)
    }

    // Merge files from parsing and git status
    const allFiles = [...new Set([...(parsed.files || []), ...gitChanges.files])]

    // Determine if the agent is asking a question or done
    if (result.stdout.toLowerCase().includes('?') && !prUrl) {
      // Likely asking a question
      await sessionManager.updateSession(task.id, { status: 'waiting_input' })
      await astridClient.notifyWaitingInput(
        task.id,
        session.id,
        parsed.summary || 'Need your input to continue',
        undefined,
        {
          files: allFiles,
          diff: gitChanges.diff,
          prUrl
        }
      )
    } else if (result.exitCode === 0) {
      // Successfully completed
      await sessionManager.updateSession(task.id, { status: 'completed' })
      await astridClient.notifyCompleted(task.id, session.id, {
        summary: parsed.summary,
        files: allFiles,
        prUrl,
        diff: gitChanges.diff
      })
    } else {
      // Error occurred
      await sessionManager.updateSession(task.id, { status: 'error' })
      await astridClient.notifyError(
        task.id,
        session.id,
        parsed.error || `${providerName} exited with code ${result.exitCode}`,
        result.stderr
      )
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`❌ ${providerName} execution failed:`, error)

    await sessionManager.updateSession(task.id, { status: 'error' })
    await astridClient.notifyError(task.id, session.id, errorMessage)
  } finally {
    // Always release the execution lock
    activeExecutions.delete(task.id)
    console.log(`🔓 Released execution lock for task ${task.id}`)
  }
}

/**
 * Handle comment on assigned task
 */
async function handleCommentCreated(payload: any): Promise<void> {
  const { task, comment, comments, mcp, aiAgent } = payload

  console.log(`💬 Comment received on task ${task.id}: ${comment.content.slice(0, 50)}...`)
  console.log(`💬 Total comments in payload: ${comments?.length || 0}`)
  console.log(`🔌 MCP token ${mcp?.accessToken ? 'provided' : 'not provided'}`)

  // Get existing session
  const session = await sessionManager.getByTaskId(task.id)

  if (!session) {
    console.log(`⚠️ No session found for task ${task.id}, creating new one`)
    await handleTaskAssigned(payload)
    return
  }

  // Get the provider for this session (or detect from payload)
  const provider = session.provider || detectProvider(aiAgent || {})
  const providerName = getProviderName(provider)
  const executor = getExecutor(provider)

  // For Claude, check if we can resume (OpenAI/Gemini don't have true session resumption)
  if (provider === 'claude' && !session.claudeSessionId) {
    console.log(`⚠️ No Claude session ID, starting fresh`)
    await handleTaskAssigned(payload)
    return
  }

  await sessionManager.incrementMessageCount(task.id)
  await sessionManager.updateSession(task.id, { status: 'running' })

  try {
    // Build context from payload (includes all previous comments)
    const context = {
      comments: comments?.map((c: any) => ({
        authorName: c.author?.name || c.authorName || 'Unknown',
        content: c.content || c.body,
        createdAt: c.createdAt
      })),
      mcpToken: mcp?.accessToken,
      model: aiAgent?.model // User-configured model preference
    }

    // Progress callback for real-time updates
    const onProgress = (message: string) => {
      astridClient.notifyProgress(task.id, session.id, message)
    }

    // Resume session with the appropriate provider
    console.log(`🔄 Resuming ${providerName} session for task ${task.id}`)
    const result = await executor.resumeSession(session, comment.content, context, onProgress)

    // Parse output using the executor's parser
    const parsed = executor.parseOutput(result.stdout)

    // Determine outcome
    if (result.stdout.toLowerCase().includes('?') && !parsed.prUrl) {
      await sessionManager.updateSession(task.id, { status: 'waiting_input' })
      await astridClient.notifyWaitingInput(
        task.id,
        session.id,
        parsed.summary || 'Need more input'
      )
    } else if (result.exitCode === 0) {
      await sessionManager.updateSession(task.id, { status: 'completed' })
      await astridClient.notifyCompleted(task.id, session.id, {
        summary: parsed.summary,
        files: parsed.files,
        prUrl: parsed.prUrl
      })
    } else {
      await sessionManager.updateSession(task.id, { status: 'error' })
      await astridClient.notifyError(
        task.id,
        session.id,
        parsed.error || `Exit code ${result.exitCode}`
      )
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`❌ Failed to resume ${providerName} session:`, error)

    await sessionManager.updateSession(task.id, { status: 'error' })
    await astridClient.notifyError(task.id, session.id, errorMessage)
  }
}

/**
 * Resume an interrupted session
 */
async function resumeInterruptedSession(session: Session, message: string): Promise<void> {
  console.log(`🔄 Resuming interrupted session ${session.id}`)

  await sessionManager.updateSession(session.taskId, { status: 'running' })

  try {
    const result = await claudeExecutor.resumeSession(session, message)
    const parsed = claudeExecutor.parseOutput(result.stdout)

    if (result.exitCode === 0) {
      await sessionManager.updateSession(session.taskId, { status: 'completed' })
      await astridClient.notifyCompleted(session.taskId, session.id, {
        summary: parsed.summary,
        files: parsed.files,
        prUrl: parsed.prUrl
      })
    }
  } catch (error) {
    console.error(`❌ Failed to resume interrupted session:`, error)
    await sessionManager.updateSession(session.taskId, { status: 'error' })
  }
}

/**
 * Get project path from list configuration
 */
function getProjectPath(list: any): string | undefined {
  if (!list?.id) {
    return process.env.DEFAULT_PROJECT_PATH || undefined
  }

  // Try to get from environment based on list ID
  const envKey = `PROJECT_PATH_${list.id.replace(/-/g, '_').toUpperCase()}`
  if (process.env[envKey]) {
    return process.env[envKey]
  }

  // Try to get from project map file
  const projectMapPath = process.env.PROJECT_MAP_PATH
  if (projectMapPath) {
    try {
      const fs = require('fs')
      const projectMap = JSON.parse(fs.readFileSync(projectMapPath, 'utf-8'))
      if (projectMap[list.id]?.path) {
        return projectMap[list.id].path
      }
    } catch {
      // Ignore errors reading project map
    }
  }

  // Default project path
  return process.env.DEFAULT_PROJECT_PATH || undefined
}

// Start server
const PORT = process.env.PORT || 3001
const HOST = process.env.HOST || '0.0.0.0'

async function main() {
  // Check provider availability
  const claudeAvailable = await claudeExecutor.checkAvailable()
  const openaiAvailable = !!process.env.OPENAI_API_KEY
  const geminiAvailable = !!process.env.GEMINI_API_KEY

  // Build status lines
  const providers: string[] = []
  if (claudeAvailable) providers.push('Claude')
  if (openaiAvailable) providers.push('OpenAI')
  if (geminiAvailable) providers.push('Gemini')

  if (providers.length === 0) {
    console.warn('⚠️ No AI providers configured!')
    console.warn('   - Claude: Install claude-code CLI (npm install -g @anthropic-ai/claude-code)')
    console.warn('   - OpenAI: Set OPENAI_API_KEY environment variable')
    console.warn('   - Gemini: Set GEMINI_API_KEY environment variable')
  } else {
    console.log(`✅ Available providers: ${providers.join(', ')}`)
  }

  // Recover any interrupted sessions
  await sessionManager.recoverSessions()

  // Clean up old sessions
  await sessionManager.cleanupExpired()

  // Start listening
  app.listen(Number(PORT), HOST, () => {
    const providerStatus = `${providers.length > 0 ? providers.join(', ') : 'None'}`.padEnd(30)
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║           Code Remote Server (Multi-Provider)                  ║
╠════════════════════════════════════════════════════════════════╣
║  Status:    Running                                            ║
║  Providers: ${providerStatus}   ║
║  Address:   http://${HOST}:${PORT}                                    ║
║  Webhook:   http://${HOST}:${PORT}/webhook                            ║
║  Health:    http://${HOST}:${PORT}/health                             ║
╠════════════════════════════════════════════════════════════════╣
║  Supported AI Agents:                                          ║
║  - claude@astrid.cc  → Claude Code CLI                         ║
║  - openai@astrid.cc  → OpenAI API (GPT-4o)                     ║
║  - gemini@astrid.cc  → Google Gemini API                       ║
╠════════════════════════════════════════════════════════════════╣
║  Configure in Astrid:                                          ║
║  1. Go to Settings → Webhook Settings                          ║
║  2. Set URL to your server's /webhook endpoint                 ║
║  3. Copy the webhook secret to ASTRID_WEBHOOK_SECRET           ║
╚════════════════════════════════════════════════════════════════╝
`)
  })
}

main().catch(console.error)
