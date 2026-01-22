/**
 * Claude Agent SDK Executor
 *
 * Thin wrapper around Claude Agent SDK that uses config-driven prompts.
 * Uses Claude Code's native tools (Read, Write, Edit, Bash) for better quality.
 */

import { query, type Options, type SDKMessage, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk'
import type { ImplementationPlan, GeneratedCode } from './types'
import * as fs from 'fs/promises'
import * as path from 'path'
import type { ResolvedAstridConfig } from './config/schema'
import {
  loadAstridConfig,
  detectPlatform,
  generateStructurePrompt,
  generatePlatformHints,
  getInitialGlobPattern,
} from './config'
import { CLAUDE_TOOLS } from './tools/tool-registry'

// ============================================================================
// TYPES
// ============================================================================

export interface PreviousTaskContext {
  hasBeenProcessedBefore: boolean
  previousAttempts: Array<{
    planSummary?: string
    filesModified?: string[]
    prUrl?: string
    outcome?: string
  }>
  userFeedback: Array<{
    content: string
    timestamp: string
  }>
  systemUnderstanding: string
}

export interface ClaudeAgentExecutorConfig {
  repoPath: string
  apiKey?: string
  maxBudgetUsd?: number
  maxTurns?: number
  logger?: (level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void
  onProgress?: (message: string) => void
  previousContext?: PreviousTaskContext
}

export interface PlanningResult {
  success: boolean
  plan?: ImplementationPlan
  error?: string
  /** The AI model's last text response - useful for showing user what went wrong */
  modelResponse?: string
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
  error?: string
  usage?: {
    inputTokens: number
    outputTokens: number
    costUSD: number
  }
}

// ============================================================================
// CONTEXT LOADING
// ============================================================================

async function loadAstridMd(repoPath: string, maxLength: number): Promise<string | null> {
  try {
    const content = await fs.readFile(path.join(repoPath, 'ASTRID.md'), 'utf-8')
    return content.length > maxLength ? content.substring(0, maxLength) + '\n\n[truncated...]' : content
  } catch {
    return null
  }
}

async function detectTestCommand(repoPath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(path.join(repoPath, 'package.json'), 'utf-8')
    const pkg = JSON.parse(content)
    if (pkg.scripts?.test) return 'npm test'
    if (pkg.scripts?.['predeploy:quick']) return 'npm run predeploy:quick'
    if (pkg.scripts?.predeploy) return 'npm run predeploy'
  } catch {
    // No package.json
  }
  return null
}

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
// PLANNING
// ============================================================================

export async function planWithClaudeAgentSDK(
  taskTitle: string,
  taskDescription: string | null,
  executorConfig: ClaudeAgentExecutorConfig
): Promise<PlanningResult> {
  const log = executorConfig.logger || (() => {})
  const onProgress = executorConfig.onProgress || (() => {})

  log('info', 'Starting Claude Agent SDK planning', {
    repoPath: executorConfig.repoPath,
    taskTitle
  })
  onProgress('Initializing Claude Code for planning...')

  // Load config - all behavior comes from here
  const config = await loadAstridConfig(executorConfig.repoPath)
  const platform = detectPlatform(config, taskTitle, taskDescription || '')
  const initialGlobPattern = getInitialGlobPattern(config, platform)

  // Load project context
  const astridMd = await loadAstridMd(executorConfig.repoPath, config.validation.contextTruncationLength)
  if (astridMd) {
    onProgress('Loaded project context from ASTRID.md')
  }

  // Generate config-driven prompts
  const structurePrompt = generateStructurePrompt(config)
  const platformHints = generatePlatformHints(platform)

  // Build previous context section
  const previousContextSection = buildPreviousContextSection(executorConfig.previousContext)

  // Build the planning prompt
  const prompt = buildPlanningPrompt(taskTitle, taskDescription, astridMd, previousContextSection)

  // Configure SDK options from config
  const options: Options = {
    cwd: executorConfig.repoPath,
    permissionMode: 'default',
    maxTurns: executorConfig.maxTurns || config.agent.maxPlanningIterations,
    maxBudgetUsd: executorConfig.maxBudgetUsd || config.safety.maxBudgetPerTask / 2,
    allowedTools: CLAUDE_TOOLS.planning,
    settingSources: [],
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: buildPlanningSystemPrompt(config, structurePrompt, platformHints, platform, initialGlobPattern)
    }
  }

  // Set API key
  const env = { ...process.env }
  if (executorConfig.apiKey) {
    env.ANTHROPIC_API_KEY = executorConfig.apiKey
  }
  options.env = env

  let lastModelResponse: string | undefined  // Track last model text for error reporting

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
              // Capture the model's text response for error reporting
              lastModelResponse = block.text
              onProgress(`Analyzing: ${block.text.substring(0, 100)}...`)
            }
            if (block.type === 'tool_use') {
              onProgress(`Exploring: ${block.name}`)
              log('info', 'Tool use (planning)', { tool: block.name })

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
      return { success: false, error: 'No result received from Claude Agent SDK', modelResponse: lastModelResponse }
    }

    if (result.subtype !== 'success') {
      const errorResult = result as Extract<SDKResultMessage, { subtype: 'error_during_execution' | 'error_max_turns' | 'error_max_budget_usd' | 'error_max_structured_output_retries' }>
      return { success: false, error: `Planning failed: ${result.subtype} - ${errorResult.errors?.join(', ') || 'Unknown error'}`, modelResponse: lastModelResponse }
    }

    log('info', 'Claude Agent SDK planning completed', {
      turns: result.num_turns,
      costUsd: result.total_cost_usd,
      filesExplored: exploredFiles.length
    })

    // Parse the plan
    const plan = parsePlanFromResult(result, exploredFiles, config, log)

    if (!plan) {
      return { success: false, error: 'Could not parse implementation plan from Claude output', modelResponse: lastModelResponse }
    }

    return {
      success: true,
      plan,
      modelResponse: lastModelResponse,
      usage: {
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
        costUSD: result.total_cost_usd
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    log('error', 'Claude Agent SDK planning failed', { error: errorMessage })
    return { success: false, error: errorMessage, modelResponse: lastModelResponse }
  }
}

function buildPlanningSystemPrompt(
  config: ResolvedAstridConfig,
  structurePrompt: string,
  platformHints: string,
  platform: ReturnType<typeof detectPlatform>,
  initialGlobPattern: string
): string {
  const rules = config.prompts.planningRules
    .map(rule => rule.replace('{{maxFilesPerPlan}}', String(config.validation.maxFilesPerPlan)))
    .map(rule => `- ${rule}`)
    .join('\n')

  const protectedPaths = config.protectedPaths?.length
    ? `- DO NOT modify these paths: ${config.protectedPaths.join(', ')}`
    : ''

  return `
You are analyzing a codebase to create an implementation plan for a coding task.

${structurePrompt}
${platformHints}
${config.customInstructions ? `\n## Custom Instructions\n${config.customInstructions}\n` : ''}

CRITICAL RULES:
1. DO NOT modify any files - this is READ-ONLY exploration
2. DO NOT use Write or Edit tools
3. Explore the codebase to understand the structure and patterns
4. Read relevant files to understand existing implementations
5. Create a focused, surgical implementation plan
${platform ? `6. For ${platform.name} tasks, START with pattern: "${initialGlobPattern}"` : ''}

After exploring, output ONLY a JSON block with this exact structure:
\`\`\`json
{
  "summary": "Brief summary of what needs to be done",
  "approach": "High-level approach to implementing the changes",
  "files": [
    {
      "path": "path/to/file.ts",
      "purpose": "Why this file needs changes",
      "changes": "Specific changes to make"
    }
  ],
  "estimatedComplexity": "simple|medium|complex",
  "considerations": ["Important consideration 1", "Important consideration 2"]
}
\`\`\`

PLANNING RULES:
${rules}
${protectedPaths}
`
}

function buildPreviousContextSection(previousContext?: PreviousTaskContext): string {
  if (!previousContext?.hasBeenProcessedBefore) return ''

  const lines = [
    '\n## ⚠️ IMPORTANT: Previous Attempts & User Feedback\n',
    'This task has been attempted before. You MUST consider the previous feedback.\n'
  ]

  if (previousContext.previousAttempts.length > 0) {
    lines.push('### Previous Attempts\n')
    previousContext.previousAttempts.forEach((attempt, i) => {
      lines.push(`\n**Attempt ${i + 1}:**`)
      if (attempt.planSummary) lines.push(`- Previous plan: ${attempt.planSummary}`)
      if (attempt.filesModified?.length) lines.push(`- Files modified: ${attempt.filesModified.slice(0, 5).join(', ')}`)
      if (attempt.prUrl) lines.push(`- PR created: ${attempt.prUrl}`)
      if (attempt.outcome) lines.push(`- Outcome: ${attempt.outcome}`)
    })
  }

  if (previousContext.userFeedback.length > 0) {
    lines.push('\n### User Feedback (CRITICAL - Address These Issues)\n')
    previousContext.userFeedback.forEach(feedback => {
      lines.push(`\n> "${feedback.content}"`)
    })
  }

  return lines.join('\n')
}

function buildPlanningPrompt(
  taskTitle: string,
  taskDescription: string | null,
  astridMd: string | null,
  previousContextSection: string
): string {
  const contextSection = astridMd
    ? `## Project Context (from ASTRID.md)\n\n${astridMd}\n\n---\n\n`
    : ''

  return `# Planning Task

${contextSection}${previousContextSection}## Task to Implement
**${taskTitle}**

${taskDescription || 'No additional description provided.'}

## Your Mission

1. **Check for ASTRID.md** - If not already loaded above, read ASTRID.md from the root for project context

2. **Explore the codebase** to understand:
   - Project structure (use Glob to find relevant files)
   - Existing patterns and conventions
   - Files that will need to be modified

3. **Read key files** to understand:
   - Current implementations you'll be changing
   - Related code that might be affected
   - **Existing test files** - look for tests related to your changes

4. **Create an implementation plan** that:
   - Lists specific files to create or modify
   - Describes the changes needed for each file
   - **Includes test files** - add regression tests for bug fixes
   - Considers dependencies and side effects
   - Estimates complexity

## Testing Requirements

- **For bug fixes**: ALWAYS include a test file that reproduces and verifies the fix
- **For new features**: Include tests for the new functionality
- **Look for existing test patterns** in the tests/ directory

## Instructions

Start by listing the root directory structure, then explore relevant directories.
Read ASTRID.md if present for project conventions.
Read files that are relevant to the task.
Finally, output your implementation plan as JSON.

Begin exploration now.`
}

function parsePlanFromResult(
  result: SDKResultMessage & { subtype: 'success' },
  exploredFiles: Array<{ path: string; content: string; relevance: string }>,
  config: ResolvedAstridConfig,
  log: (level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void
): ImplementationPlan | null {
  const resultText = result.result || ''
  const jsonMatch = resultText.match(/```json\s*([\s\S]*?)\s*```/)

  if (!jsonMatch) {
    log('warn', 'No JSON block found in planning output')
    return null
  }

  try {
    const parsed = JSON.parse(jsonMatch[1])

    if (!parsed.summary || !parsed.files || !Array.isArray(parsed.files)) {
      log('warn', 'Invalid plan structure', { parsed })
      return null
    }

    // Validate plan has at least minFilesPerPlan files
    if (parsed.files.length < config.validation.minFilesPerPlan) {
      log('warn', `Plan has ${parsed.files.length} files, minimum is ${config.validation.minFilesPerPlan}`)
      return null
    }

    // Validate plan doesn't exceed maxFilesPerPlan
    if (parsed.files.length > config.validation.maxFilesPerPlan) {
      log('warn', `Plan has ${parsed.files.length} files, maximum is ${config.validation.maxFilesPerPlan}. Truncating.`)
      parsed.files = parsed.files.slice(0, config.validation.maxFilesPerPlan)
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
    log('error', 'Failed to parse plan JSON', { error: String(error) })
    return null
  }
}

// ============================================================================
// EXECUTION
// ============================================================================

export async function executeWithClaudeAgentSDK(
  plan: ImplementationPlan,
  taskTitle: string,
  taskDescription: string | null,
  executorConfig: ClaudeAgentExecutorConfig
): Promise<ExecutionResult> {
  const log = executorConfig.logger || (() => {})
  const onProgress = executorConfig.onProgress || (() => {})

  log('info', 'Starting Claude Agent SDK execution', {
    repoPath: executorConfig.repoPath,
    filesInPlan: plan.files.length,
    complexity: plan.estimatedComplexity
  })
  onProgress('Initializing Claude Code agent...')

  // Load config
  const config = await loadAstridConfig(executorConfig.repoPath)
  const platform = detectPlatform(config, taskTitle, taskDescription || '')

  // Generate config-driven prompts
  const structurePrompt = generateStructurePrompt(config)
  const platformHints = generatePlatformHints(platform)

  // Load project context
  const astridMd = await loadAstridMd(executorConfig.repoPath, config.validation.contextTruncationLength)
  const testCommand = await detectTestCommand(executorConfig.repoPath)
  const iosProject = await detectiOSProject(executorConfig.repoPath)

  if (astridMd) {
    log('info', 'Loaded ASTRID.md from repository')
  }
  if (testCommand) {
    log('info', `Detected test command: ${testCommand}`)
  }
  if (iosProject?.hasIOSProject) {
    log('info', `Detected iOS project: ${iosProject.projectPath}`)
    onProgress(`Found iOS project: ${iosProject.schemeName}`)
  }

  // Build the implementation prompt
  const prompt = buildImplementationPrompt(plan, taskTitle, taskDescription, astridMd, testCommand, iosProject)

  // Configure SDK options from config
  const options: Options = {
    cwd: executorConfig.repoPath,
    permissionMode: 'acceptEdits',
    maxTurns: executorConfig.maxTurns || config.agent.maxExecutionIterations,
    maxBudgetUsd: executorConfig.maxBudgetUsd || config.safety.maxBudgetPerTask,
    allowedTools: CLAUDE_TOOLS.execution,
    settingSources: [],
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: buildExecutionSystemPrompt(config, structurePrompt, platformHints, testCommand, iosProject)
    }
  }

  // Set API key
  const env = { ...process.env }
  if (executorConfig.apiKey) {
    env.ANTHROPIC_API_KEY = executorConfig.apiKey
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
              log('info', 'Tool use', { tool: block.name })
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
      costUsd: result.total_cost_usd
    })

    // Parse the result
    const executionResult = await parseExecutionResult(executorConfig.repoPath, result, plan, log)

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

function buildExecutionSystemPrompt(
  config: ResolvedAstridConfig,
  structurePrompt: string,
  platformHints: string,
  testCommand: string | null,
  iosProject?: { hasIOSProject: boolean; buildCommand?: string } | null
): string {
  const rules = config.prompts.executionRules.map(rule => `- ${rule}`).join('\n')

  const protectedPaths = config.protectedPaths?.length
    ? `- DO NOT modify these paths: ${config.protectedPaths.join(', ')}`
    : ''

  let testingInstructions = ''
  if (testCommand) {
    testingInstructions += `
WEB/NODE TESTING:
1. After making code changes to web/node files, run: ${testCommand}
2. If tests fail, fix the issues before completing`
  }

  if (iosProject?.hasIOSProject) {
    testingInstructions += `

iOS BUILD REQUIREMENTS (CRITICAL):
1. If you modified ANY Swift files (.swift), you MUST run the iOS build
2. Build command: ${iosProject.buildCommand}
3. If the build fails, FIX THE ERRORS before completing
4. The build MUST succeed - do not complete with build errors`
  }

  return `
You are implementing a coding task from an approved plan.

${structurePrompt}
${platformHints}
${config.customInstructions ? `\n## Custom Instructions\n${config.customInstructions}\n` : ''}

CRITICAL RULES:
${rules}
${protectedPaths}
${testingInstructions}

After completing all changes AND running tests/builds, output a JSON block with this structure:
\`\`\`json
{
  "completed": true,
  "filesModified": ["path/to/file1.ts", "path/to/file2.ts"],
  "testsRun": true,
  "testsPassed": true,
  "iosBuildRun": ${iosProject?.hasIOSProject ? 'true/false' : 'false'},
  "iosBuildPassed": ${iosProject?.hasIOSProject ? 'true/false' : 'false'},
  "commitMessage": "brief commit message",
  "prTitle": "PR title",
  "prDescription": "What this PR does"
}
\`\`\`
`
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

  const contextSection = plan.exploredFiles?.length
    ? `\n## Context Files (already explored)\n${plan.exploredFiles.map(f => `- ${f.path}`).join('\n')}`
    : ''

  const projectContextSection = astridMd
    ? `## Project Context (from ASTRID.md)\n\n${astridMd.substring(0, 4000)}${astridMd.length > 4000 ? '\n\n[truncated...]' : ''}\n\n---\n\n`
    : ''

  let testingSection = '## Testing & Build Requirements\n\n'

  if (testCommand) {
    testingSection += `### Web/Node Testing
**Test Command:** \`${testCommand}\`
1. After implementing web/node changes, run: \`${testCommand}\`
2. If tests fail, fix the issues
3. For bug fixes: Add a regression test that verifies the fix

`
  }

  if (iosProject?.hasIOSProject) {
    testingSection += `### iOS Build (REQUIRED for Swift changes)
**Project:** \`${iosProject.projectPath}\`
**Build Command:** \`${iosProject.buildCommand}\`

**CRITICAL**: If you modify ANY .swift files:
1. Run the iOS build command above
2. If the build fails, you MUST fix the errors
3. DO NOT complete until the build succeeds

`
  }

  if (!testCommand && !iosProject?.hasIOSProject) {
    testingSection += `Look for existing tests in tests/ or __tests__/ directories.
If tests exist, run them to verify your changes work.

`
  }

  return `# Implementation Task

${projectContextSection}## Task
**${taskTitle}**
${taskDescription || ''}

## Approved Implementation Plan

### Summary
${plan.summary}

### Approach
${plan.approach}

### Files to Create/Modify
${filesSection}

### Complexity
${plan.estimatedComplexity}

### Considerations
${plan.considerations?.map(c => `- ${c}`).join('\n') || 'None specified'}
${contextSection}

${testingSection}
## Instructions

1. Read the existing files to understand the current implementation
2. Make the changes specified in the plan above
3. Ensure all code is complete and functional (no TODOs or placeholders)
4. **For bug fixes**: Create a regression test that reproduces and verifies the fix
5. Run tests/builds and fix any failures
6. Output a summary of what was changed including test/build results

Begin implementation now.`
}

async function parseExecutionResult(
  repoPath: string,
  result: SDKResultMessage & { subtype: 'success' },
  plan: ImplementationPlan,
  log: (level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void
): Promise<Omit<ExecutionResult, 'usage'>> {
  const { execSync } = await import('child_process')

  try {
    const gitStatusRaw = execSync('git status --porcelain', {
      cwd: repoPath,
      encoding: 'utf-8'
    })

    const lines = gitStatusRaw.split('\n').filter(line => line.trim().length > 0)

    if (lines.length === 0) {
      log('warn', 'No file changes detected by git')
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
        try {
          content = await fs.readFile(path.join(repoPath, filePath), 'utf-8')
        } catch {
          log('warn', `Could not read file: ${filePath}`)
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

    // Extract commit message from Claude's output
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
        log('warn', 'Could not parse JSON output from Claude')
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

// ============================================================================
// UTILITIES
// ============================================================================

export async function prepareRepository(
  repoOwner: string,
  repoName: string,
  branch: string,
  githubToken: string,
  workDir?: string
): Promise<{ repoPath: string; cleanup: () => Promise<void> }> {
  const { execSync } = await import('child_process')
  const os = await import('os')

  const tempDir = workDir || await fs.mkdtemp(path.join(os.tmpdir(), 'claude-agent-'))
  const repoPath = path.join(tempDir, repoName)

  const cloneUrl = `https://x-access-token:${githubToken}@github.com/${repoOwner}/${repoName}.git`
  execSync(`git clone --depth 1 --branch ${branch} ${cloneUrl} ${repoPath}`, {
    stdio: 'pipe',
    timeout: 120000
  })

  // Use configurable git author for commits
  // Vercel requires the git author to have team access, so allow override via env vars
  const gitEmail = process.env.VERCEL_GIT_EMAIL || process.env.AI_AGENT_GIT_EMAIL || 'ai-agent@astrid.cc'
  const gitName = process.env.VERCEL_GIT_NAME || process.env.AI_AGENT_GIT_NAME || 'Astrid AI Agent'
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

export function toGeneratedCode(result: ExecutionResult): GeneratedCode {
  return {
    files: result.files,
    commitMessage: result.commitMessage,
    prTitle: result.prTitle,
    prDescription: result.prDescription
  }
}
