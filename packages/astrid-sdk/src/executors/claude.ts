/**
 * Claude Agent SDK Executor
 *
 * Executes code implementation using Claude Code's native tools (Read, Write, Edit, Bash)
 * instead of generating code via API and parsing JSON responses.
 *
 * This provides:
 * - Better code quality (real file editing vs generated text)
 * - Native error handling and recovery
 * - Actual test execution
 * - Real git operations
 */

import { query, type Options, type SDKMessage, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk'
import * as fs from 'fs/promises'
import * as path from 'path'
import type {
  ImplementationPlan,
  ExecutionResult,
  PlanningResult,
  PreviousTaskContext,
  Logger,
  ProgressCallback,
} from '../types/index.js'
import {
  loadAstridConfig,
  detectPlatform,
  generateStructurePrompt,
  generatePlatformHints,
  getInitialGlobPattern,
} from '../config/index.js'

// ============================================================================
// REPOSITORY CONTEXT LOADING
// ============================================================================

/**
 * Load ASTRID.md from the repository if it exists
 * Also loads README.md as fallback context
 */
async function loadAstridMd(repoPath: string, maxLength: number = 16000): Promise<string | null> {
  const astridPath = path.join(repoPath, 'ASTRID.md')
  try {
    const content = await fs.readFile(astridPath, 'utf-8')
    return content.length > maxLength ? content.substring(0, maxLength) + '\n\n[ASTRID.md truncated...]' : content
  } catch {
    // Try README.md as fallback
    try {
      const readmePath = path.join(repoPath, 'README.md')
      const content = await fs.readFile(readmePath, 'utf-8')
      const truncated = content.length > maxLength / 2
        ? content.substring(0, maxLength / 2) + '\n\n[README.md truncated...]'
        : content
      return `## Project Context (from README.md)\n\n${truncated}`
    } catch {
      return null
    }
  }
}

/**
 * Detect the test command for the repository
 */
async function detectTestCommand(repoPath: string): Promise<string | null> {
  const packageJsonPath = path.join(repoPath, 'package.json')
  try {
    const content = await fs.readFile(packageJsonPath, 'utf-8')
    const pkg = JSON.parse(content)
    // Prefer quick checks over full test suites for faster feedback
    if (pkg.scripts?.['predeploy:quick']) {
      return 'npm run predeploy:quick'
    }
    if (pkg.scripts?.typecheck) {
      return 'npm run typecheck'
    }
    if (pkg.scripts?.['type-check']) {
      return 'npm run type-check'
    }
    if (pkg.scripts?.build) {
      return 'npm run build'
    }
    if (pkg.scripts?.predeploy) {
      return 'npm run predeploy'
    }
    if (pkg.scripts?.test) {
      return 'npm test'
    }
  } catch {
    // No package.json or invalid JSON
  }
  return null
}

/**
 * Verify changes work by running tests/build
 * Returns { success, output, error }
 */
export async function verifyChanges(
  repoPath: string,
  logger?: Logger
): Promise<{ success: boolean; output: string; error?: string }> {
  const { execSync } = await import('child_process')
  const log = logger || (() => {})

  const testCommand = await detectTestCommand(repoPath)
  if (!testCommand) {
    log('info', 'No verification command found, skipping verification')
    return { success: true, output: 'No verification command available' }
  }

  log('info', `Running verification: ${testCommand}`)

  try {
    const output = execSync(testCommand, {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 300000, // 5 minutes for verification
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    })
    log('info', 'Verification passed')
    return { success: true, output: output.slice(-2000) } // Last 2000 chars
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string }
    const combinedOutput = `${err.stdout || ''}\n${err.stderr || ''}`.slice(-3000)
    log('error', 'Verification failed', { error: err.message })
    return {
      success: false,
      output: combinedOutput,
      error: err.message || 'Verification command failed'
    }
  }
}

/**
 * Detect iOS project and return build info
 */
async function detectiOSProject(repoPath: string): Promise<{
  hasIOSProject: boolean
  projectPath?: string
  schemeName?: string
  buildCommand?: string
} | null> {
  const possiblePaths = ['ios-app', 'ios', 'iOS', '.']

  for (const subdir of possiblePaths) {
    const searchPath = path.join(repoPath, subdir)
    try {
      const entries = await fs.readdir(searchPath)
      const xcodeproj = entries.find(e => e.endsWith('.xcodeproj'))

      if (xcodeproj) {
        const schemeName = xcodeproj.replace('.xcodeproj', '')
        const projectPath = subdir === '.' ? xcodeproj : `${subdir}/${xcodeproj}`

        return {
          hasIOSProject: true,
          projectPath,
          schemeName,
          buildCommand: `cd ${subdir === '.' ? '.' : subdir} && xcodebuild -scheme "${schemeName}" -destination "platform=iOS Simulator,name=iPhone 16" -configuration Debug build 2>&1 | tail -50`
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }

  return null
}

// ============================================================================
// EXECUTOR CONFIG
// ============================================================================

export interface ClaudeExecutorConfig {
  /** Path to the cloned repository */
  repoPath: string
  /** Anthropic API key (optional, uses ANTHROPIC_API_KEY env var if not provided) */
  apiKey?: string
  /** Maximum budget in USD */
  maxBudgetUsd?: number
  /** Maximum turns before stopping */
  maxTurns?: number
  /** Logger function */
  logger?: Logger
  /** Callback for progress updates */
  onProgress?: ProgressCallback
  /** Context from previous attempts */
  previousContext?: PreviousTaskContext
}

// ============================================================================
// PLANNING
// ============================================================================

/**
 * Generate an implementation plan using Claude Agent SDK
 */
export async function planWithClaude(
  taskTitle: string,
  taskDescription: string | null,
  config: ClaudeExecutorConfig
): Promise<PlanningResult> {
  const log = config.logger || (() => {})
  const onProgress = config.onProgress || (() => {})

  log('info', 'Starting Claude Agent SDK planning', {
    repoPath: config.repoPath,
    taskTitle
  })

  onProgress('Initializing Claude Code for planning...')

  // Load project-specific configuration
  const astridConfig = await loadAstridConfig(config.repoPath)

  const astridMd = await loadAstridMd(config.repoPath)
  if (astridMd) {
    log('info', 'Loaded ASTRID.md from repository')
    onProgress('Loaded project context from ASTRID.md')
  }

  // Detect platform from config
  const platform = detectPlatform(astridConfig, taskTitle, taskDescription || '')

  // Generate prompts from config
  const structurePrompt = generateStructurePrompt(astridConfig)
  const platformHints = generatePlatformHints(platform)
  const initialGlobPattern = getInitialGlobPattern(astridConfig, platform)

  if (config.previousContext?.hasBeenProcessedBefore) {
    log('info', 'Task has previous context', {
      attempts: config.previousContext.previousAttempts.length,
      feedbackItems: config.previousContext.userFeedback.length
    })
    onProgress('Considering previous attempts and user feedback...')
  }

  const prompt = buildPlanningPrompt(taskTitle, taskDescription, astridMd, config.previousContext)

  const options: Options = {
    cwd: config.repoPath,
    permissionMode: 'default',
    maxTurns: config.maxTurns || 30,
    maxBudgetUsd: config.maxBudgetUsd || 2.0,
    allowedTools: ['Read', 'Glob', 'Grep', 'Bash'],
    settingSources: [],
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: `
You are an expert software engineer analyzing a codebase to create an implementation plan.

${structurePrompt}
${platformHints}
${astridConfig.customInstructions ? `\n## Custom Instructions\n${astridConfig.customInstructions}\n` : ''}

## EXPLORATION WORKFLOW (MANDATORY)

You MUST follow this workflow before creating a plan:

### Step 1: Understand Project Structure
- Use Glob with patterns like "**/*.{ts,tsx,js,jsx}" to find source files
- Use Glob with patterns like "**/package.json" to find project roots
- Read key config files: package.json, tsconfig.json, etc.

### Step 2: Find Relevant Code
- Use Grep to search for related terms, functions, or patterns
- Read files that are likely to need changes
- Read adjacent files to understand context and patterns

### Step 3: Analyze Patterns
- Note coding conventions (naming, structure, imports)
- Note testing patterns if tests exist
- Note type patterns and interfaces

### Step 4: Create Precise Plan
After thorough exploration, create a surgical implementation plan.

CRITICAL RULES:
1. DO NOT modify any files - this is READ-ONLY exploration
2. DO NOT use Write or Edit tools
3. MUST read at least 3-5 relevant files before creating a plan
4. MUST use Grep to find related code patterns
${platform ? `5. For ${platform.name} tasks, START with pattern: "${initialGlobPattern}"` : ''}

After exploring, output ONLY a JSON block with this exact structure:
\`\`\`json
{
  "summary": "Brief summary of what needs to be done",
  "approach": "High-level approach with specific technical details",
  "files": [
    {
      "path": "path/to/file.ts",
      "purpose": "Why this file needs changes",
      "changes": "Specific, detailed changes to make"
    }
  ],
  "estimatedComplexity": "simple|medium|complex",
  "considerations": ["Edge case 1", "Testing requirement", "Pattern to follow"]
}
\`\`\`

PLANNING RULES:
- Maximum 8 files in the plan
- Be SURGICAL: only list files that MUST change
- Include SPECIFIC file paths you discovered (no guessing)
- Follow existing patterns in the codebase
- Consider edge cases and error handling
- Note any tests that need updating
${astridConfig.protectedPaths?.length ? `- DO NOT modify these paths: ${astridConfig.protectedPaths.join(', ')}` : ''}
`
    }
  }

  const env = { ...process.env }
  if (config.apiKey) {
    env.ANTHROPIC_API_KEY = config.apiKey
  }
  options.env = env

  try {
    const messages: SDKMessage[] = []
    let result: SDKResultMessage | null = null
    const exploredFiles: Array<{ path: string; content: string; relevance: string }> = []

    onProgress('Claude Code is exploring the codebase...')

    for await (const message of query({ prompt, options })) {
      messages.push(message)

      if (message.type === 'assistant') {
        const content = message.message.content
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              onProgress(`Analyzing: ${block.text.substring(0, 100)}...`)
            }
            if (block.type === 'tool_use') {
              onProgress(`Exploring: ${block.name}`)
              log('info', 'Tool use (planning)', { tool: block.name, input: block.input })

              if (block.name === 'Read' && typeof block.input === 'object' && block.input !== null) {
                const input = block.input as { file_path?: string }
                if (input.file_path) {
                  exploredFiles.push({
                    path: input.file_path,
                    content: '',
                    relevance: 'Explored during planning'
                  })
                }
              }
            }
          }
        }
      }

      if (message.type === 'result') {
        result = message
      }
    }

    if (!result) {
      throw new Error('No result received from Claude Agent SDK')
    }

    if (result.subtype !== 'success') {
      const errorResult = result as Extract<SDKResultMessage, { subtype: 'error_during_execution' | 'error_max_turns' | 'error_max_budget_usd' | 'error_max_structured_output_retries' }>
      throw new Error(`Planning failed: ${result.subtype} - ${errorResult.errors?.join(', ') || 'Unknown error'}`)
    }

    log('info', 'Claude Agent SDK planning completed', {
      turns: result.num_turns,
      costUsd: result.total_cost_usd,
      filesExplored: exploredFiles.length
    })

    const plan = parsePlanFromResult(result, exploredFiles, log)

    if (!plan) {
      throw new Error('Could not parse implementation plan from Claude output')
    }

    return {
      success: true,
      plan,
      usage: {
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
        costUSD: result.total_cost_usd
      }
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    log('error', 'Claude Agent SDK planning failed', { error: errorMessage })

    return {
      success: false,
      error: errorMessage
    }
  }
}

// ============================================================================
// EXECUTION
// ============================================================================

/**
 * Execute an implementation plan using Claude Agent SDK
 */
export async function executeWithClaude(
  plan: ImplementationPlan,
  taskTitle: string,
  taskDescription: string | null,
  config: ClaudeExecutorConfig
): Promise<ExecutionResult> {
  const log = config.logger || (() => {})
  const onProgress = config.onProgress || (() => {})

  log('info', 'Starting Claude Agent SDK execution', {
    repoPath: config.repoPath,
    filesInPlan: plan.files.length,
    complexity: plan.estimatedComplexity
  })

  onProgress('Initializing Claude Code agent...')

  const astridMd = await loadAstridMd(config.repoPath)
  const testCommand = await detectTestCommand(config.repoPath)
  const iosProject = await detectiOSProject(config.repoPath)

  if (astridMd) log('info', 'Loaded ASTRID.md from repository')
  if (testCommand) log('info', `Detected test command: ${testCommand}`)
  if (iosProject?.hasIOSProject) {
    log('info', `Detected iOS project: ${iosProject.projectPath}`)
    onProgress(`Found iOS project: ${iosProject.schemeName}`)
  }

  const prompt = buildImplementationPrompt(plan, taskTitle, taskDescription, astridMd, testCommand, iosProject)

  let testingInstructions = ''
  if (testCommand) {
    testingInstructions += `
WEB/NODE TESTING:
1. After making code changes, run: ${testCommand}
2. If tests fail, fix the issues before completing`
  }

  if (iosProject?.hasIOSProject) {
    testingInstructions += `

iOS BUILD REQUIREMENTS (CRITICAL):
1. If you modified ANY Swift files, you MUST run the iOS build
2. Build command: ${iosProject.buildCommand}
3. If the build fails, FIX THE ERRORS before completing`
  }

  const options: Options = {
    cwd: config.repoPath,
    permissionMode: 'acceptEdits',
    maxTurns: config.maxTurns || 50,
    maxBudgetUsd: config.maxBudgetUsd || 5.0,
    allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
    settingSources: [],
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: `
You are an expert software engineer implementing a coding task from an approved plan.

## IMPLEMENTATION WORKFLOW (MANDATORY)

### Step 1: Verify Understanding
- Re-read the files in the plan to confirm your approach
- Check import paths and dependencies
- Understand the existing code patterns

### Step 2: Implement Changes
- Make changes one file at a time
- Follow existing code style and patterns
- Write complete, production-ready code (no TODOs or placeholders)
- Handle edge cases and errors properly

### Step 3: Verify Changes
- After making changes, run the test/build command
- If tests fail, FIX the issues before continuing
- Do not proceed to the next file until current changes pass

### Step 4: Final Verification
- Run the full test suite one more time
- Confirm all changes are complete

CRITICAL RULES:
1. Follow the implementation plan exactly
2. Create/modify ONLY the files specified in the plan
3. Write complete, working code - no placeholders or TODOs
4. Run tests/builds after making changes - they MUST pass
5. If verification fails, FIX THE ISSUES before completing
6. Do NOT commit changes - just make the file edits
${testingInstructions}

After completing all changes AND verification passes, output a JSON block:
\`\`\`json
{
  "completed": true,
  "filesModified": ["path/to/file1.ts"],
  "testsRun": true,
  "testsPassed": true,
  "commitMessage": "brief commit message following conventional commits",
  "prTitle": "feat/fix/chore: Short descriptive title",
  "prDescription": "## Summary\\n\\nWhat this PR does and why.\\n\\n## Changes\\n\\n- Change 1\\n- Change 2"
}
\`\`\`
`
    }
  }

  const env = { ...process.env }
  if (config.apiKey) {
    env.ANTHROPIC_API_KEY = config.apiKey
  }
  options.env = env

  try {
    const messages: SDKMessage[] = []
    let result: SDKResultMessage | null = null

    onProgress('Claude Code is analyzing the codebase...')

    for await (const message of query({ prompt, options })) {
      messages.push(message)

      if (message.type === 'assistant') {
        const content = message.message.content
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              onProgress(`Working: ${block.text.substring(0, 100)}...`)
            }
            if (block.type === 'tool_use') {
              onProgress(`Using tool: ${block.name}`)
              log('info', 'Tool use', { tool: block.name, input: block.input })
            }
          }
        }
      }

      if (message.type === 'result') {
        result = message
      }
    }

    if (!result) {
      throw new Error('No result received from Claude Agent SDK')
    }

    if (result.subtype !== 'success') {
      const errorResult = result as Extract<SDKResultMessage, { subtype: 'error_during_execution' | 'error_max_turns' | 'error_max_budget_usd' | 'error_max_structured_output_retries' }>
      throw new Error(`Execution failed: ${result.subtype} - ${errorResult.errors?.join(', ') || 'Unknown error'}`)
    }

    log('info', 'Claude Agent SDK execution completed', {
      turns: result.num_turns,
      costUsd: result.total_cost_usd,
      inputTokens: result.usage.input_tokens,
      outputTokens: result.usage.output_tokens
    })

    const executionResult = await parseExecutionResult(config.repoPath, result, plan, log)

    return {
      ...executionResult,
      usage: {
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
        costUSD: result.total_cost_usd
      }
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    log('error', 'Claude Agent SDK execution failed', { error: errorMessage })

    return {
      success: false,
      files: [],
      commitMessage: '',
      prTitle: '',
      prDescription: '',
      error: errorMessage
    }
  }
}

// ============================================================================
// REPOSITORY PREPARATION
// ============================================================================

/**
 * Fetch the authenticated GitHub user's info from the token
 */
export async function getGitHubUser(githubToken: string): Promise<{ login: string; email: string | null; name: string | null }> {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
      }
    })
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`)
    }
    const data = await response.json() as { login: string; email: string | null; name: string | null }
    return data
  } catch {
    return { login: 'unknown', email: null, name: null }
  }
}

/**
 * Prepare a repository for execution
 */
export async function prepareRepository(
  repoOwner: string,
  repoName: string,
  branch: string,
  githubToken: string,
  workDir?: string,
  gitAuthor?: { email: string; name: string }
): Promise<{ repoPath: string; cleanup: () => Promise<void> }> {
  const { execSync } = await import('child_process')
  const os = await import('os')

  const tempDir = workDir || await fs.mkdtemp(path.join(os.tmpdir(), 'claude-agent-'))
  const repoPath = path.join(tempDir, repoName)

  // Clone with more history for context (depth 50 instead of 1)
  const cloneUrl = `https://x-access-token:${githubToken}@github.com/${repoOwner}/${repoName}.git`
  execSync(`git clone --depth 50 --branch ${branch} ${cloneUrl} ${repoPath}`, {
    stdio: 'pipe',
    timeout: 180000
  })

  // Install dependencies if package.json exists
  const packageJsonPath = path.join(repoPath, 'package.json')
  try {
    await fs.access(packageJsonPath)
    console.log('📦 Installing dependencies...')
    execSync('npm install --legacy-peer-deps', {
      cwd: repoPath,
      stdio: 'pipe',
      timeout: 300000 // 5 minutes for npm install
    })
    console.log('✅ Dependencies installed')
  } catch {
    // No package.json or npm install failed - continue anyway
  }

  // Use configurable git author for commits
  // Priority: 1) env vars, 2) passed gitAuthor, 3) fetch from GitHub API
  let gitEmail = process.env.VERCEL_GIT_EMAIL || process.env.AI_AGENT_GIT_EMAIL
  let gitName = process.env.VERCEL_GIT_NAME || process.env.AI_AGENT_GIT_NAME

  if (!gitEmail && gitAuthor?.email) {
    gitEmail = gitAuthor.email
    gitName = gitAuthor.name || gitName
  }

  // If still no email, fetch from GitHub API (for Vercel preview compatibility)
  if (!gitEmail) {
    const user = await getGitHubUser(githubToken)
    if (user.email) {
      gitEmail = user.email
      gitName = gitName || user.name || user.login
    } else {
      // Use noreply email for Vercel compatibility
      gitEmail = `${user.login}@users.noreply.github.com`
      gitName = gitName || user.name || user.login
    }
  }

  gitName = gitName || 'Astrid AI Agent'
  execSync(`git config user.email "${gitEmail}"`, { cwd: repoPath })
  execSync(`git config user.name "${gitName}"`, { cwd: repoPath })

  return {
    repoPath,
    cleanup: async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildPlanningPrompt(
  taskTitle: string,
  taskDescription: string | null,
  astridMd: string | null,
  previousContext?: PreviousTaskContext
): string {
  const contextSection = astridMd
    ? `## Project Context (from ASTRID.md)\n\n${astridMd}\n\n---\n\n`
    : ''

  let previousAttemptsSection = ''
  if (previousContext?.hasBeenProcessedBefore) {
    previousAttemptsSection = `## Previous Attempts & User Feedback\n\n`

    if (previousContext.previousAttempts.length > 0) {
      previousAttemptsSection += `### Previous Attempts\n`
      previousContext.previousAttempts.forEach((attempt, i) => {
        previousAttemptsSection += `\n**Attempt ${i + 1}:**\n`
        if (attempt.planSummary) previousAttemptsSection += `- Previous plan: ${attempt.planSummary}\n`
        if (attempt.filesModified?.length) previousAttemptsSection += `- Files modified: ${attempt.filesModified.slice(0, 5).join(', ')}\n`
        if (attempt.prUrl) previousAttemptsSection += `- PR created: ${attempt.prUrl}\n`
        if (attempt.outcome) previousAttemptsSection += `- Outcome: ${attempt.outcome}\n`
      })
    }

    if (previousContext.userFeedback.length > 0) {
      previousAttemptsSection += `\n### User Feedback (Address These)\n`
      previousContext.userFeedback.forEach(feedback => {
        previousAttemptsSection += `\n> "${feedback.content}"\n`
      })
    }

    previousAttemptsSection += `\n---\n\n`
  }

  return `# Planning Task

${contextSection}${previousAttemptsSection}## Task to Implement
**${taskTitle}**

${taskDescription || 'No additional description provided.'}

## Your Mission

1. **Check for ASTRID.md** - Read project context
2. **Explore the codebase** - Understand structure and patterns
3. **Read key files** - Understand implementations you'll change
4. **Create an implementation plan** - List specific files to modify

Begin exploration now.`
}

function buildImplementationPrompt(
  plan: ImplementationPlan,
  taskTitle: string,
  taskDescription: string | null,
  astridMd: string | null,
  testCommand: string | null,
  iosProject?: { hasIOSProject: boolean; projectPath?: string; schemeName?: string; buildCommand?: string } | null
): string {
  const filesSection = plan.files
    .map(f => `- **${f.path}**: ${f.purpose}\n  Changes: ${f.changes}`)
    .join('\n')

  const contextSection = astridMd
    ? `## Project Context\n\n${astridMd.substring(0, 4000)}${astridMd.length > 4000 ? '\n\n[truncated...]' : ''}\n\n---\n\n`
    : ''

  let testingSection = '## Testing Requirements\n\n'
  if (testCommand) {
    testingSection += `**Test Command:** \`${testCommand}\`\n\n`
  }
  if (iosProject?.hasIOSProject) {
    testingSection += `**iOS Build:** \`${iosProject.buildCommand}\`\n\n`
  }

  return `# Implementation Task

${contextSection}## Task
**${taskTitle}**
${taskDescription || ''}

## Approved Implementation Plan

### Summary
${plan.summary}

### Approach
${plan.approach}

### Files to Modify
${filesSection}

### Complexity
${plan.estimatedComplexity}

${testingSection}

Begin implementation now.`
}

function parsePlanFromResult(
  result: SDKResultMessage & { subtype: 'success' },
  exploredFiles: Array<{ path: string; content: string; relevance: string }>,
  log: Logger
): ImplementationPlan | null {
  const resultText = result.result || ''
  const jsonMatch = resultText.match(/```json\s*([\s\S]*?)\s*```/)

  if (!jsonMatch) {
    log('warn', 'No JSON block found in planning output', {})
    return null
  }

  try {
    const parsed = JSON.parse(jsonMatch[1])

    if (!parsed.summary || !parsed.files || !Array.isArray(parsed.files)) {
      log('warn', 'Invalid plan structure', { parsed })
      return null
    }

    // Validate plan has at least 1 file
    if (parsed.files.length === 0) {
      log('warn', 'Plan has no files to modify', { parsed })
      return null
    }

    const plan: ImplementationPlan = {
      summary: parsed.summary,
      approach: parsed.approach || parsed.summary,
      files: parsed.files.map((f: { path: string; purpose?: string; changes?: string }) => ({
        path: f.path,
        purpose: f.purpose || 'Implementation',
        changes: f.changes || 'See plan'
      })),
      estimatedComplexity: parsed.estimatedComplexity || 'medium',
      considerations: parsed.considerations || [],
      exploredFiles
    }

    log('info', 'Successfully parsed implementation plan', {
      filesInPlan: plan.files.length,
      filesExplored: plan.exploredFiles?.length || 0
    })

    return plan

  } catch (error) {
    log('error', 'Failed to parse plan JSON', { error: String(error), jsonText: jsonMatch[1] })
    return null
  }
}

async function parseExecutionResult(
  repoPath: string,
  result: SDKResultMessage & { subtype: 'success' },
  plan: ImplementationPlan,
  log: Logger
): Promise<Omit<ExecutionResult, 'usage'>> {
  const { execSync } = await import('child_process')

  try {
    const gitStatusRaw = execSync('git status --porcelain', {
      cwd: repoPath,
      encoding: 'utf-8'
    })

    const lines = gitStatusRaw.split('\n').filter(line => line.trim().length > 0)

    if (lines.length === 0) {
      log('warn', 'No file changes detected by git', {})
      return {
        success: false,
        files: [],
        commitMessage: '',
        prTitle: '',
        prDescription: '',
        error: 'No file changes were made'
      }
    }

    const files: ExecutionResult['files'] = []

    for (const line of lines) {
      const status = line.substring(0, 2).trim()
      const filePath = line.substring(3).trim()

      let action: 'create' | 'modify' | 'delete'
      if (status === 'D' || status === ' D') {
        action = 'delete'
      } else if (status === '?' || status === 'A' || status === '??') {
        action = 'create'
      } else {
        action = 'modify'
      }

      let content = ''
      if (action !== 'delete') {
        const fullPath = path.join(repoPath, filePath)
        try {
          content = await fs.readFile(fullPath, 'utf-8')
        } catch {
          log('warn', `Could not read file: ${filePath}`, {})
        }
      }

      files.push({ path: filePath, content, action })
    }

    log('info', 'Parsed file changes from git', {
      totalFiles: files.length,
      created: files.filter(f => f.action === 'create').length,
      modified: files.filter(f => f.action === 'modify').length,
      deleted: files.filter(f => f.action === 'delete').length
    })

    const resultText = result.result || ''
    const jsonMatch = resultText.match(/```json\s*([\s\S]*?)\s*```/)

    let commitMessage = `feat: ${plan.summary.substring(0, 50)}`
    let prTitle = plan.summary
    let prDescription = plan.approach

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1])
        if (parsed.commitMessage) commitMessage = parsed.commitMessage
        if (parsed.prTitle) prTitle = parsed.prTitle
        if (parsed.prDescription) prDescription = parsed.prDescription
      } catch {
        log('warn', 'Could not parse JSON output from Claude', {})
      }
    }

    return {
      success: true,
      files,
      commitMessage,
      prTitle,
      prDescription
    }

  } catch (error) {
    log('error', 'Failed to parse execution result', {
      error: error instanceof Error ? error.message : String(error)
    })

    return {
      success: false,
      files: [],
      commitMessage: '',
      prTitle: '',
      prDescription: '',
      error: `Failed to parse file changes: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}
