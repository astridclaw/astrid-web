/**
 * Terminal Executor Base Interface
 *
 * Common interface for all terminal executors (Claude, OpenAI, Gemini).
 * Terminal mode executes tasks using local tools instead of remote APIs.
 */

import type { Session } from '../server/session-manager.js'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result from terminal execution
 */
export interface TerminalExecutionResult {
  exitCode: number | null
  stdout: string
  stderr: string
  sessionId?: string
  gitDiff?: string
  modifiedFiles?: string[]
  prUrl?: string
}

/**
 * Context for terminal task execution
 */
export interface TerminalTaskContext {
  comments?: Array<{
    authorName: string
    content: string
    createdAt: string
  }>
  prUrl?: string
  repository?: string
}

/**
 * Parsed output from terminal execution
 */
export interface ParsedOutput {
  summary?: string
  files?: string[]
  prUrl?: string
  error?: string
}

/**
 * Progress callback function
 */
export type TerminalProgressCallback = (message: string) => void

/**
 * Comment callback function for posting updates to the task
 */
export type TerminalCommentCallback = (content: string) => Promise<void>

/**
 * Options for terminal executor callbacks
 */
export interface TerminalExecutorCallbacks {
  onProgress?: TerminalProgressCallback
  onComment?: TerminalCommentCallback
}

// ============================================================================
// TERMINAL EXECUTOR INTERFACE
// ============================================================================

/**
 * Common interface for all terminal executors.
 *
 * Terminal executors process tasks using local tool execution:
 * - Claude: Spawns local Claude Code CLI
 * - OpenAI: Uses OpenAI API with local tool execution
 * - Gemini: Uses Gemini API with local tool execution
 */
export interface TerminalExecutor {
  /**
   * Check if the executor is available (e.g., CLI installed, API key set)
   */
  checkAvailable(): Promise<boolean>

  /**
   * Start a new session to process a task
   *
   * @param session - The session containing task details
   * @param prompt - Optional custom prompt (uses default if not provided)
   * @param context - Optional context including comments and PR info
   * @param callbacks - Optional callbacks for progress updates and comments
   * @returns Execution result with output, modified files, and PR URL
   */
  startSession(
    session: Session,
    prompt?: string,
    context?: TerminalTaskContext,
    callbacks?: TerminalExecutorCallbacks
  ): Promise<TerminalExecutionResult>

  /**
   * Resume an existing session with new input
   *
   * @param session - The session to resume
   * @param input - New input from user (e.g., follow-up message)
   * @param context - Optional updated context
   * @param callbacks - Optional callbacks for progress updates and comments
   * @returns Execution result
   */
  resumeSession(
    session: Session,
    input: string,
    context?: TerminalTaskContext,
    callbacks?: TerminalExecutorCallbacks
  ): Promise<TerminalExecutionResult>

  /**
   * Parse output to extract key information
   *
   * @param output - Raw output string from execution
   * @returns Parsed output with summary, files, PR URL, and error
   */
  parseOutput(output: string): ParsedOutput
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract PR URL from output text
 */
export function extractPrUrl(output: string): string | undefined {
  const prUrlPatterns = [
    /https:\/\/github\.com\/[^\/]+\/[^\/]+\/pull\/\d+/g,
    /PR URL:\s*(https:\/\/[^\s]+)/i,
    /Pull Request:\s*(https:\/\/[^\s]+)/i
  ]

  for (const pattern of prUrlPatterns) {
    const match = output.match(pattern)
    if (match) {
      return match[0].replace(/PR URL:\s*/i, '').replace(/Pull Request:\s*/i, '')
    }
  }

  return undefined
}

/**
 * Format comment history for context
 */
export function formatCommentHistory(comments?: TerminalTaskContext['comments']): string {
  if (!comments || comments.length === 0) return ''

  const formatted = comments
    .slice(-10)
    .map(c => `**${c.authorName}** (${new Date(c.createdAt).toLocaleString()}):\n${c.content}`)
    .join('\n\n---\n\n')

  return `\n\n## Previous Discussion\n\n${formatted}`
}

/**
 * Capture current git status (untracked and modified files)
 * Call this BEFORE task execution to get baseline
 */
export async function captureGitBaseline(projectPath: string): Promise<Set<string>> {
  const { execSync } = await import('child_process')

  try {
    const statusOutput = execSync('git status --porcelain', {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 10000
    })

    const files = new Set(
      statusOutput
        .split('\n')
        .filter(line => line.trim())
        .map(line => line.slice(3).trim())
    )

    console.log(`📊 Git baseline: ${files.size} pre-existing uncommitted files`)
    return files
  } catch {
    return new Set()
  }
}

/**
 * Capture git changes in a repository
 * If baseline is provided, only returns NEW changes (not pre-existing)
 */
export async function captureGitChanges(
  projectPath: string,
  baseline?: Set<string>
): Promise<{ diff: string; files: string[] }> {
  const { execSync } = await import('child_process')

  try {
    // Get modified files (staged and unstaged)
    const statusOutput = execSync('git status --porcelain', {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 10000
    })

    let files = statusOutput
      .split('\n')
      .filter(line => line.trim())
      .map(line => line.slice(3).trim()) // Remove status prefix

    // If baseline provided, filter out pre-existing files
    if (baseline && baseline.size > 0) {
      const originalCount = files.length
      files = files.filter(f => !baseline.has(f))
      if (originalCount !== files.length) {
        console.log(`📊 Filtered out ${originalCount - files.length} pre-existing files`)
      }
    }

    // Get diff (staged and unstaged, limited to 5000 chars)
    let diff = ''
    try {
      diff = execSync('git diff HEAD --no-color', {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 10000,
        maxBuffer: 1024 * 1024 // 1MB max
      })

      // Truncate if too long
      if (diff.length > 5000) {
        diff = diff.slice(0, 5000) + '\n\n[... diff truncated ...]'
      }
    } catch {
      // No diff or not a git repo
    }

    console.log(`📊 Git changes: ${files.length} files modified by task`)
    return { diff, files }
  } catch {
    return { diff: '', files: [] }
  }
}

/**
 * Build default prompt for a task
 */
export function buildDefaultPrompt(
  session: Session,
  context?: TerminalTaskContext
): string {
  const commentHistory = formatCommentHistory(context?.comments)

  return `# Task: ${session.title}

${session.description || ''}
${commentHistory}

## Workflow Requirements

1. Understand the task and verify the platform (iOS = ios-app/, Web = components/, app/)
2. Locate relevant code and make ONLY the requested changes
3. Run predeploy tests: \`npm run predeploy\`
4. Create PR: \`gh pr create\` with a clear title

## Output Requirements

Your response MUST include:
1. Task understanding: What was requested
2. Actual changes made: What you changed and WHY
3. Files modified: List each file path
4. Test results: Output from \`npm run predeploy\`
5. PR URL: The pull request URL (REQUIRED)

Begin by analyzing the task.`
}

// ============================================================================
// OUTPUT PARSING FOR PLANS AND QUESTIONS
// ============================================================================

/**
 * Types of content detected in Claude's output
 */
export type OutputContentType = 'plan' | 'question' | 'progress' | 'error' | 'pr_created'

/**
 * Detected content from parsing output
 */
export interface DetectedContent {
  type: OutputContentType
  content: string
  raw?: string
}

/**
 * Parser state for accumulating output across chunks
 */
export interface OutputParserState {
  buffer: string
  lastPlanPosted: number
  lastProgressPosted: number
  lastQuestionPosted: number
  postedPlans: Set<string>
  postedQuestions: Set<string>
}

/**
 * Create a new parser state
 */
export function createParserState(): OutputParserState {
  return {
    buffer: '',
    lastPlanPosted: 0,
    lastProgressPosted: 0,
    lastQuestionPosted: 0,
    postedPlans: new Set(),
    postedQuestions: new Set(),
  }
}

/**
 * Patterns for detecting different types of content
 */
const PLAN_PATTERNS = [
  // Plan mode headers
  /^#+\s*(?:Implementation\s+)?Plan\b/mi,
  /^#+\s*Approach\b/mi,
  /^\*\*(?:Implementation\s+)?Plan\*\*/mi,
  // Numbered plan steps
  /^(?:##\s+)?(?:Step\s+)?\d+\.\s+(?:First|Create|Modify|Update|Add|Remove|Fix|Implement)/mi,
  // Plan summary patterns
  /(?:Here(?:'s| is) (?:my|the) (?:implementation )?plan|I(?:'ll| will) (?:start|begin) by|Let me (?:outline|plan|describe) (?:my|the) approach)/i,
]

const QUESTION_PATTERNS = [
  // Direct questions to user
  /(?:Do you want|Would you like|Should I|Can I|May I)\s+.+\?/i,
  /(?:Please (?:confirm|clarify|specify|let me know))/i,
  /(?:Before I (?:proceed|continue|start)|I need (?:to know|clarification|more information))/i,
  // Options presented
  /(?:Option\s+[1-3A-C]:|Which (?:approach|option|method) (?:do you prefer|should I use)\?)/i,
]

const PROGRESS_PATTERNS = [
  // File operations
  /(?:Creating|Modifying|Updating|Deleting|Reading|Writing)\s+(?:file\s+)?[`']?[\w\/.]+[`']?/i,
  // Git operations
  /(?:Committing|Pushing|Creating branch|Creating PR|Merging)/i,
  // Test/build operations
  /(?:Running|Executing)\s+(?:tests|build|lint|predeploy)/i,
]

const PR_CREATED_PATTERN = /(?:PR|Pull Request)\s+(?:created|opened).*?(https:\/\/github\.com\/[^\s]+\/pull\/\d+)/i

/**
 * Parse a chunk of output and detect any plans, questions, or progress updates.
 * Uses the state to track what's been posted to avoid duplicates.
 *
 * @param chunk - New output chunk to parse
 * @param state - Parser state for tracking
 * @returns Array of detected content items
 */
export function parseOutputChunk(
  chunk: string,
  state: OutputParserState
): DetectedContent[] {
  const results: DetectedContent[] = []

  // Add chunk to buffer
  state.buffer += chunk

  // Process complete paragraphs/sections (split by double newline)
  const sections = state.buffer.split(/\n\n+/)

  // Keep the last incomplete section in buffer
  if (!state.buffer.endsWith('\n\n')) {
    state.buffer = sections.pop() || ''
  } else {
    state.buffer = ''
  }

  const now = Date.now()

  for (const section of sections) {
    const trimmed = section.trim()
    if (!trimmed || trimmed.length < 20) continue

    // Create a hash for deduplication
    const hash = trimmed.slice(0, 100)

    // Check for PR created
    const prMatch = trimmed.match(PR_CREATED_PATTERN)
    if (prMatch) {
      results.push({
        type: 'pr_created',
        content: prMatch[1],
        raw: trimmed,
      })
      continue
    }

    // Check for plans (rate limit: once per 30s)
    if (now - state.lastPlanPosted > 30000) {
      for (const pattern of PLAN_PATTERNS) {
        if (pattern.test(trimmed) && !state.postedPlans.has(hash)) {
          state.postedPlans.add(hash)
          state.lastPlanPosted = now
          results.push({
            type: 'plan',
            content: extractPlanContent(trimmed),
            raw: trimmed,
          })
          break
        }
      }
    }

    // Check for questions (rate limit: once per 60s)
    if (now - state.lastQuestionPosted > 60000) {
      for (const pattern of QUESTION_PATTERNS) {
        if (pattern.test(trimmed) && !state.postedQuestions.has(hash)) {
          state.postedQuestions.add(hash)
          state.lastQuestionPosted = now
          results.push({
            type: 'question',
            content: trimmed,
            raw: trimmed,
          })
          break
        }
      }
    }

    // Check for progress (rate limit: once per 15s)
    if (now - state.lastProgressPosted > 15000) {
      for (const pattern of PROGRESS_PATTERNS) {
        if (pattern.test(trimmed)) {
          state.lastProgressPosted = now
          results.push({
            type: 'progress',
            content: extractProgressSummary(trimmed),
            raw: trimmed,
          })
          break
        }
      }
    }
  }

  return results
}

/**
 * Extract the key content from a plan section
 */
function extractPlanContent(text: string): string {
  // Limit to first 1000 chars and clean up
  const limited = text.slice(0, 1000)

  // If it's very long, add truncation indicator
  if (text.length > 1000) {
    return limited + '\n\n*[Plan truncated...]*'
  }

  return limited
}

/**
 * Extract a short progress summary
 */
function extractProgressSummary(text: string): string {
  // Get first line or first 200 chars
  const firstLine = text.split('\n')[0]
  if (firstLine.length <= 200) {
    return firstLine
  }
  return firstLine.slice(0, 200) + '...'
}

/**
 * Format detected content as a comment for posting
 */
export function formatContentAsComment(content: DetectedContent, agentName: string = 'Claude'): string {
  switch (content.type) {
    case 'plan':
      return `📋 **${agentName}'s Plan**\n\n${content.content}\n\n---\n*Planning in progress...*`

    case 'question':
      return `❓ **${agentName} has a question**\n\n${content.content}\n\n---\n*Please reply to this comment to provide clarification.*`

    case 'progress':
      return `⏳ **Progress Update**\n\n${content.content}`

    case 'pr_created':
      return `🔗 **Pull Request Created**\n\n[${content.content}](${content.content})`

    case 'error':
      return `⚠️ **Issue Detected**\n\n${content.content}`

    default:
      return content.content
  }
}

// ============================================================================
// GIT WORKTREE ISOLATION
// ============================================================================

/**
 * Configuration for worktree isolation
 */
export interface WorktreeConfig {
  /** Enable worktree isolation (default: true for safety) */
  enabled: boolean
  /** Base directory for worktrees (default: /tmp/astrid-worktrees) */
  baseDir: string
  /** Clean up worktrees after completion (default: true) */
  autoCleanup: boolean
}

/**
 * Get worktree configuration from environment variables
 */
export function getWorktreeConfig(): WorktreeConfig {
  return {
    enabled: process.env.ASTRID_AGENT_WORKTREE !== 'false',
    baseDir: process.env.ASTRID_AGENT_WORKTREE_DIR || '/tmp/astrid-worktrees',
    autoCleanup: process.env.ASTRID_AGENT_WORKTREE_CLEANUP !== 'false',
  }
}

/**
 * Result from creating a worktree
 */
export interface WorktreeResult {
  /** Path to the worktree directory */
  worktreePath: string
  /** Branch name created for this worktree */
  branchName: string
  /** Cleanup function to remove the worktree */
  cleanup: () => Promise<void>
}

/**
 * Create an isolated git worktree for a task.
 * This allows the agent to work on changes without affecting the main working directory.
 *
 * @param projectPath - Path to the main git repository
 * @param taskId - Task ID for naming the worktree and branch
 * @param branchPrefix - Prefix for the branch name (default: 'task/')
 * @returns WorktreeResult with path and cleanup function
 */
export async function createWorktree(
  projectPath: string,
  taskId: string,
  branchPrefix: string = 'task/'
): Promise<WorktreeResult> {
  const { execSync } = await import('child_process')
  const fs = await import('fs/promises')
  const path = await import('path')

  const config = getWorktreeConfig()
  const shortId = taskId.slice(0, 8)
  const branchName = `${branchPrefix}${shortId}`
  const worktreePath = path.join(config.baseDir, `task-${shortId}-${Date.now()}`)

  console.log(`🌳 Creating git worktree for task ${shortId}...`)
  console.log(`   Branch: ${branchName}`)
  console.log(`   Path: ${worktreePath}`)

  try {
    // Ensure base directory exists
    await fs.mkdir(config.baseDir, { recursive: true })

    // Fetch latest from origin to ensure we have up-to-date refs
    try {
      execSync('git fetch origin', {
        cwd: projectPath,
        stdio: 'pipe',
        timeout: 30000,
      })
    } catch {
      console.log('   ⚠️ Could not fetch from origin (continuing anyway)')
    }

    // Check if branch already exists (local or remote)
    let branchExists = false
    try {
      execSync(`git rev-parse --verify ${branchName}`, {
        cwd: projectPath,
        stdio: 'pipe',
      })
      branchExists = true
    } catch {
      // Branch doesn't exist locally, check remote
      try {
        execSync(`git rev-parse --verify origin/${branchName}`, {
          cwd: projectPath,
          stdio: 'pipe',
        })
        branchExists = true
      } catch {
        // Branch doesn't exist at all
      }
    }

    if (branchExists) {
      // Use existing branch
      console.log(`   📌 Using existing branch: ${branchName}`)
      execSync(`git worktree add "${worktreePath}" ${branchName}`, {
        cwd: projectPath,
        stdio: 'pipe',
        timeout: 60000,
      })
    } else {
      // Create new branch from main/master
      const defaultBranch = getDefaultBranch(projectPath)
      console.log(`   🌱 Creating new branch from ${defaultBranch}`)
      execSync(`git worktree add -b ${branchName} "${worktreePath}" ${defaultBranch}`, {
        cwd: projectPath,
        stdio: 'pipe',
        timeout: 60000,
      })
    }

    console.log(`   ✅ Worktree created successfully`)

    // Create cleanup function
    const cleanup = async () => {
      if (!config.autoCleanup) {
        console.log(`   ⏭️ Skipping worktree cleanup (auto-cleanup disabled)`)
        return
      }

      console.log(`   🧹 Cleaning up worktree: ${worktreePath}`)
      try {
        // Remove the worktree
        execSync(`git worktree remove "${worktreePath}" --force`, {
          cwd: projectPath,
          stdio: 'pipe',
          timeout: 30000,
        })
        console.log(`   ✅ Worktree removed`)
      } catch (error) {
        console.error(`   ⚠️ Failed to remove worktree:`, error)
        // Try to force remove the directory
        try {
          await fs.rm(worktreePath, { recursive: true, force: true })
          // Prune the worktree reference
          execSync('git worktree prune', {
            cwd: projectPath,
            stdio: 'pipe',
          })
        } catch {
          console.error(`   ⚠️ Could not clean up worktree directory`)
        }
      }
    }

    return {
      worktreePath,
      branchName,
      cleanup,
    }
  } catch (error) {
    console.error(`❌ Failed to create worktree:`, error)
    throw new Error(`Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Get the default branch name (main or master)
 */
function getDefaultBranch(projectPath: string): string {
  const { execSync } = require('child_process')

  try {
    // Try to get the default branch from remote
    const result = execSync('git symbolic-ref refs/remotes/origin/HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return result.trim().replace('refs/remotes/origin/', '')
  } catch {
    // Fall back to checking if main or master exists
    try {
      execSync('git rev-parse --verify main', {
        cwd: projectPath,
        stdio: 'pipe',
      })
      return 'main'
    } catch {
      return 'master'
    }
  }
}

/**
 * Check if worktree isolation should be used
 */
export function shouldUseWorktree(): boolean {
  return getWorktreeConfig().enabled
}

/**
 * Push changes from worktree and create PR
 * Returns the PR URL if successful
 */
export async function pushWorktreeChanges(
  worktreePath: string,
  branchName: string,
  taskTitle: string
): Promise<string | undefined> {
  const { execSync } = await import('child_process')

  try {
    // Check if there are any commits to push
    const status = execSync('git status --porcelain', {
      cwd: worktreePath,
      encoding: 'utf-8',
    })

    if (status.trim()) {
      console.log(`   📝 Uncommitted changes detected, committing...`)
      // Stage and commit any remaining changes
      execSync('git add -A', { cwd: worktreePath, stdio: 'pipe' })
      const commitPrefix = taskTitle.toLowerCase().includes('fix') ? 'fix' : 'feat'
      const shortTitle = taskTitle.slice(0, 50).replace(/"/g, "'")
      try {
        execSync(`git commit -m "${commitPrefix}: ${shortTitle}"`, {
          cwd: worktreePath,
          stdio: 'pipe',
        })
      } catch {
        // No changes to commit
      }
    }

    // Push the branch
    console.log(`   🚀 Pushing branch: ${branchName}`)
    execSync(`git push -u origin ${branchName}`, {
      cwd: worktreePath,
      stdio: 'pipe',
      timeout: 60000,
    })

    // Check if PR already exists
    try {
      const existingPr = execSync(`gh pr view ${branchName} --json url -q .url`, {
        cwd: worktreePath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      if (existingPr.trim()) {
        console.log(`   📋 PR already exists: ${existingPr.trim()}`)
        return existingPr.trim()
      }
    } catch {
      // No existing PR
    }

    // Create PR
    console.log(`   📋 Creating pull request...`)
    const prUrl = execSync(
      `gh pr create --title "${taskTitle.slice(0, 100)}" --body "Task implementation\n\nCreated by Astrid AI Agent" --head ${branchName}`,
      {
        cwd: worktreePath,
        encoding: 'utf-8',
        timeout: 30000,
      }
    )

    const url = prUrl.trim()
    console.log(`   ✅ PR created: ${url}`)
    return url
  } catch (error) {
    console.error(`   ⚠️ Failed to push/create PR:`, error)
    return undefined
  }
}
