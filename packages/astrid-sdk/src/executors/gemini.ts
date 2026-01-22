/**
 * Gemini Agent Executor
 *
 * Executes code implementation using Google's Gemini API with function calling.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { execSync } from 'child_process'
import { glob } from 'glob'
import type {
  ImplementationPlan,
  ExecutionResult,
  PlanningResult,
  Logger,
  ProgressCallback,
} from '../types/index.js'
import { DEFAULT_MODELS } from '../utils/agent-config.js'
import {
  loadAstridConfig,
  detectPlatform,
  generateStructurePrompt,
  generatePlatformHints,
  getInitialGlobPattern,
} from '../config/index.js'

// ============================================================================
// CONFIG
// ============================================================================

export interface GeminiExecutorConfig {
  /** Path to the cloned repository */
  repoPath: string
  /** Gemini API key */
  apiKey: string
  /** Model to use */
  model?: string
  /** Maximum iterations for tool use loop */
  maxIterations?: number
  /** Logger function */
  logger?: Logger
  /** Callback for progress updates */
  onProgress?: ProgressCallback
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

const TOOL_DECLARATIONS = [
  {
    name: 'read_file',
    description: 'Read the contents of a file',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the file' }
      },
      required: ['file_path']
    }
  },
  {
    name: 'write_file',
    description: 'Write content to a file (creates or overwrites)',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the file' },
        content: { type: 'string', description: 'Content to write' }
      },
      required: ['file_path', 'content']
    }
  },
  {
    name: 'edit_file',
    description: 'Edit a file by replacing old_string with new_string',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the file' },
        old_string: { type: 'string', description: 'String to find' },
        new_string: { type: 'string', description: 'Replacement string' }
      },
      required: ['file_path', 'old_string', 'new_string']
    }
  },
  {
    name: 'run_bash',
    description: 'Run a bash command',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The bash command' }
      },
      required: ['command']
    }
  },
  {
    name: 'glob_files',
    description: 'Find files matching a glob pattern',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern' }
      },
      required: ['pattern']
    }
  },
  {
    name: 'grep_search',
    description: 'Search for a pattern in files',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Search pattern' },
        file_pattern: { type: 'string', description: 'Optional glob pattern' }
      },
      required: ['pattern']
    }
  },
  {
    name: 'task_complete',
    description: 'Signal task completion',
    parameters: {
      type: 'object',
      properties: {
        commit_message: { type: 'string', description: 'Git commit message' },
        pr_title: { type: 'string', description: 'PR title' },
        pr_description: { type: 'string', description: 'PR description' }
      },
      required: ['commit_message', 'pr_title', 'pr_description']
    }
  }
]

// ============================================================================
// TOOL EXECUTION
// ============================================================================

interface ToolResult {
  success: boolean
  result: string
  fileChange?: { path: string; content: string; action: 'create' | 'modify' | 'delete' }
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  repoPath: string
): Promise<ToolResult> {
  try {
    switch (name) {
      case 'read_file': {
        const filePath = path.join(repoPath, args.file_path as string)
        const content = await fs.readFile(filePath, 'utf-8')
        return { success: true, result: content }
      }

      case 'write_file': {
        const filePath = path.join(repoPath, args.file_path as string)
        const content = args.content as string
        let action: 'create' | 'modify' = 'create'
        try {
          await fs.access(filePath)
          action = 'modify'
        } catch {
          await fs.mkdir(path.dirname(filePath), { recursive: true })
        }
        await fs.writeFile(filePath, content, 'utf-8')
        return {
          success: true,
          result: `File ${action === 'create' ? 'created' : 'updated'}: ${args.file_path}`,
          fileChange: { path: args.file_path as string, content, action }
        }
      }

      case 'edit_file': {
        const filePath = path.join(repoPath, args.file_path as string)
        const oldContent = await fs.readFile(filePath, 'utf-8')
        const oldString = args.old_string as string
        const newString = args.new_string as string
        if (!oldContent.includes(oldString)) {
          return { success: false, result: `Error: Could not find string in file` }
        }
        const newContent = oldContent.replace(oldString, newString)
        await fs.writeFile(filePath, newContent, 'utf-8')
        return {
          success: true,
          result: `File edited: ${args.file_path}`,
          fileChange: { path: args.file_path as string, content: newContent, action: 'modify' }
        }
      }

      case 'run_bash': {
        const command = args.command as string
        const dangerous = ['rm -rf /', 'sudo', '> /dev/', 'mkfs', 'dd if=']
        if (dangerous.some(d => command.includes(d))) {
          return { success: false, result: 'Error: Dangerous command blocked' }
        }
        try {
          const output = execSync(command, {
            cwd: repoPath,
            encoding: 'utf-8',
            timeout: 60000,
            maxBuffer: 1024 * 1024
          })
          return { success: true, result: output || '(no output)' }
        } catch (error) {
          const err = error as { stderr?: string; message?: string }
          return { success: false, result: `Error: ${err.stderr || err.message}` }
        }
      }

      case 'glob_files': {
        const pattern = args.pattern as string
        const files = await glob(pattern, { cwd: repoPath, nodir: true })
        return { success: true, result: files.slice(0, 100).join('\n') || '(no matches)' }
      }

      case 'grep_search': {
        const pattern = args.pattern as string
        const filePattern = (args.file_pattern as string) || '.'
        try {
          const output = execSync(
            `grep -rn "${pattern.replace(/"/g, '\\"')}" ${filePattern} | head -50`,
            { cwd: repoPath, encoding: 'utf-8', timeout: 30000 }
          )
          return { success: true, result: output || '(no matches)' }
        } catch {
          return { success: true, result: '(no matches)' }
        }
      }

      case 'task_complete':
        return { success: true, result: 'Task marked complete' }

      default:
        return { success: false, result: `Unknown tool: ${name}` }
    }
  } catch (error) {
    return { success: false, result: `Error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

// ============================================================================
// API CALLS
// ============================================================================

interface GeminiContent {
  role: 'user' | 'model'
  parts: Array<{
    text?: string
    functionCall?: { name: string; args: Record<string, unknown> }
    functionResponse?: { name: string; response: { result: string } }
  }>
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      role: 'model'
      parts: Array<{
        text?: string
        functionCall?: { name: string; args: Record<string, unknown> }
      }>
    }
    finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER'
  }>
  usageMetadata: { promptTokenCount: number; candidatesTokenCount: number }
}

async function callGemini(
  contents: GeminiContent[],
  systemInstruction: string,
  apiKey: string,
  model: string
): Promise<GeminiResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      toolConfig: {
        functionCallingConfig: {
          mode: 'AUTO'
        }
      },
      generationConfig: { maxOutputTokens: 8192, temperature: 0.2 }
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gemini API error: ${error}`)
  }

  return response.json() as Promise<GeminiResponse>
}

async function loadAstridMd(repoPath: string, maxLength: number = 16000): Promise<string | null> {
  try {
    const content = await fs.readFile(path.join(repoPath, 'ASTRID.md'), 'utf-8')
    return content.length > maxLength ? content.substring(0, maxLength) + '\n\n[truncated...]' : content
  } catch {
    // Try README.md as fallback
    try {
      const content = await fs.readFile(path.join(repoPath, 'README.md'), 'utf-8')
      const truncated = content.length > maxLength / 2
        ? content.substring(0, maxLength / 2) + '\n\n[README.md truncated...]'
        : content
      return `## Project Context (from README.md)\n\n${truncated}`
    } catch {
      return null
    }
  }
}

// ============================================================================
// PLANNING
// ============================================================================

export async function planWithGemini(
  taskTitle: string,
  taskDescription: string | null,
  config: GeminiExecutorConfig
): Promise<PlanningResult> {
  const log = config.logger || (() => {})
  const onProgress = config.onProgress || (() => {})
  const model = config.model || DEFAULT_MODELS.gemini

  log('info', 'Starting Gemini planning', { repoPath: config.repoPath, taskTitle })
  onProgress('Initializing Gemini for planning...')

  const astridMd = await loadAstridMd(config.repoPath)

  const systemInstruction = `You are an expert software engineer with access to tools for exploring codebases.

${astridMd ? `## Project Context\n${astridMd}\n` : ''}

## Your Task
Create an implementation plan for: "${taskTitle}"
${taskDescription ? `\nDetails: ${taskDescription}` : ''}

## EXPLORATION WORKFLOW (MANDATORY)

You MUST follow this workflow:

### Step 1: Understand Project Structure
- Call glob_files with patterns like "**/*.ts" or "**/*.tsx"
- Call read_file on package.json and config files

### Step 2: Find Relevant Code
- Call grep_search to find related terms, functions, or patterns
- Call read_file on files that are likely to need changes
- Read adjacent files to understand context and patterns

### Step 3: Create Precise Plan
After reading at least 3-5 relevant files, create a surgical plan.

CRITICAL: You must use ACTUAL FUNCTION CALLS, not text descriptions.
Do NOT write text saying "I will call X" - actually invoke the function.

## Final Output Format
After exploring, respond with a JSON block:
\`\`\`json
{
  "summary": "Brief summary of what needs to be done",
  "approach": "High-level approach with technical details",
  "files": [
    {"path": "path/to/file.ts", "purpose": "Why this file needs changes", "changes": "Specific changes"}
  ],
  "estimatedComplexity": "simple|medium|complex",
  "considerations": ["Edge case 1", "Testing requirement"]
}
\`\`\`

RULES:
- You MUST call tools first to explore - don't guess file paths
- Include SPECIFIC file paths you discovered
- Be SURGICAL: only list files that MUST change
- Follow existing patterns in the codebase`

  const contents: GeminiContent[] = [
    { role: 'user', parts: [{ text: `Start by calling glob_files to find relevant files, then create an implementation plan for: ${taskTitle}` }] }
  ]

  let totalInputTokens = 0
  let totalOutputTokens = 0
  const maxIterations = config.maxIterations || 20

  try {
    for (let i = 0; i < maxIterations; i++) {
      onProgress(`Planning iteration ${i + 1}...`)

      const response = await callGemini(contents, systemInstruction, config.apiKey, model)
      totalInputTokens += response.usageMetadata?.promptTokenCount || 0
      totalOutputTokens += response.usageMetadata?.candidatesTokenCount || 0

      const candidate = response.candidates[0]
      if (!candidate) {
        return { success: false, error: 'No response from Gemini' }
      }

      contents.push({ role: 'model', parts: candidate.content.parts })

      const functionCalls = candidate.content.parts.filter(p => p.functionCall)

      if (functionCalls.length > 0) {
        const functionResponses: GeminiContent['parts'] = []

        for (const part of functionCalls) {
          if (!part.functionCall) continue
          const { name, args } = part.functionCall
          onProgress(`Using tool: ${name}`)
          const result = await executeTool(name, args, config.repoPath)
          functionResponses.push({
            functionResponse: { name, response: { result: result.result.substring(0, 10000) } }
          })
        }

        contents.push({ role: 'user', parts: functionResponses })
        continue
      }

      const textPart = candidate.content.parts.find(p => p.text)
      if (textPart?.text) {
        const jsonMatch = textPart.text.match(/```json\s*([\s\S]*?)\s*```/)
        if (jsonMatch) {
          try {
            const plan = JSON.parse(jsonMatch[1]) as ImplementationPlan

            // Validate plan has at least 1 file
            if (!plan.files || plan.files.length === 0) {
              log('warn', 'Plan has no files, asking model to explore more', {})
              contents.push({
                role: 'user',
                parts: [{
                  text: 'Your plan has no files to modify. This is not valid. You MUST use the glob_files and read_file tools to explore the codebase first, then provide a plan with specific files to modify. Please call glob_files now to find relevant files.'
                }]
              })
              continue
            }

            return {
              success: true,
              plan,
              usage: {
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens,
                costUSD: (totalInputTokens * 0.00125 + totalOutputTokens * 0.005) / 1000
              }
            }
          } catch {
            log('warn', 'Failed to parse plan JSON', {})
          }
        }

        // Model output text but no JSON plan - check if it's first iteration
        if (i === 0) {
          log('warn', 'First iteration had no function calls - prompting model to use tools', {})
          contents.push({
            role: 'user',
            parts: [{
              text: 'You must use the function calling tools to explore the codebase. Please call glob_files with an appropriate pattern to find relevant files. Do not describe what you will do - actually invoke the function.'
            }]
          })
          continue
        }
      }

      if (candidate.finishReason === 'STOP') {
        contents.push({
          role: 'user',
          parts: [{ text: 'Please provide the implementation plan as a JSON block with at least one file to modify.' }]
        })
      }
    }

    return { success: false, error: 'Max iterations reached' }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

// ============================================================================
// EXECUTION
// ============================================================================

export async function executeWithGemini(
  plan: ImplementationPlan,
  taskTitle: string,
  taskDescription: string | null,
  config: GeminiExecutorConfig
): Promise<ExecutionResult> {
  const log = config.logger || (() => {})
  const onProgress = config.onProgress || (() => {})
  const model = config.model || DEFAULT_MODELS.gemini

  log('info', 'Starting Gemini execution', { repoPath: config.repoPath, filesInPlan: plan.files.length })
  onProgress('Initializing Gemini agent...')

  const astridMd = await loadAstridMd(config.repoPath)

  const systemInstruction = `You are an expert software engineer implementing changes.

${astridMd ? `## Project Context\n${astridMd}\n` : ''}

## Task
Implement: "${taskTitle}"
${taskDescription ? `\nDetails: ${taskDescription}` : ''}

## Implementation Plan
${JSON.stringify(plan, null, 2)}

## IMPLEMENTATION WORKFLOW (MANDATORY)

### Step 1: Verify Understanding
- Read the files in the plan to confirm your approach
- Check import paths and dependencies

### Step 2: Implement Changes
- Make changes one file at a time
- Follow existing code style and patterns
- Write complete, production-ready code (no TODOs)

### Step 3: Verify Changes
- After making changes, run "npm run build" or tests via run_bash
- If build/tests fail, FIX the issues before continuing

### Step 4: Complete
- Call task_complete with good commit message and PR description

## Rules
- Follow the plan exactly
- Write complete code - no placeholders
- Test your changes before completing
- Handle edge cases properly`

  const contents: GeminiContent[] = [
    { role: 'user', parts: [{ text: 'Please implement the changes according to the plan.' }] }
  ]

  const fileChanges: Map<string, { content: string; action: 'create' | 'modify' | 'delete' }> = new Map()
  let totalInputTokens = 0
  let totalOutputTokens = 0
  const maxIterations = config.maxIterations || 50

  try {
    for (let i = 0; i < maxIterations; i++) {
      onProgress(`Implementation iteration ${i + 1}...`)

      const response = await callGemini(contents, systemInstruction, config.apiKey, model)
      totalInputTokens += response.usageMetadata?.promptTokenCount || 0
      totalOutputTokens += response.usageMetadata?.candidatesTokenCount || 0

      const candidate = response.candidates[0]
      if (!candidate) {
        return {
          success: false,
          files: [],
          commitMessage: '',
          prTitle: '',
          prDescription: '',
          error: 'No response from Gemini'
        }
      }

      contents.push({ role: 'model', parts: candidate.content.parts })

      const functionCalls = candidate.content.parts.filter(p => p.functionCall)

      if (functionCalls.length > 0) {
        const functionResponses: GeminiContent['parts'] = []

        for (const part of functionCalls) {
          if (!part.functionCall) continue
          const { name, args } = part.functionCall
          onProgress(`Using tool: ${name}`)

          if (name === 'task_complete') {
            const files = Array.from(fileChanges.entries()).map(([p, change]) => ({
              path: p,
              content: change.content,
              action: change.action
            }))

            return {
              success: true,
              files,
              commitMessage: (args.commit_message as string) || `feat: ${taskTitle}`,
              prTitle: (args.pr_title as string) || `feat: ${taskTitle}`,
              prDescription: (args.pr_description as string) || taskDescription || taskTitle,
              usage: {
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens,
                costUSD: (totalInputTokens * 0.00125 + totalOutputTokens * 0.005) / 1000
              }
            }
          }

          const result = await executeTool(name, args, config.repoPath)
          if (result.fileChange) {
            fileChanges.set(result.fileChange.path, {
              content: result.fileChange.content,
              action: result.fileChange.action
            })
          }

          functionResponses.push({
            functionResponse: { name, response: { result: result.result.substring(0, 10000) } }
          })
        }

        contents.push({ role: 'user', parts: functionResponses })
        continue
      }

      if (candidate.finishReason === 'STOP') {
        contents.push({
          role: 'user',
          parts: [{ text: 'Please call task_complete to finalize.' }]
        })
      }
    }

    const files = Array.from(fileChanges.entries()).map(([p, change]) => ({
      path: p,
      content: change.content,
      action: change.action
    }))

    return {
      success: files.length > 0,
      files,
      commitMessage: `feat: ${taskTitle}`,
      prTitle: `feat: ${taskTitle}`,
      prDescription: taskDescription || taskTitle,
      error: 'Max iterations reached',
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        costUSD: (totalInputTokens * 0.00125 + totalOutputTokens * 0.005) / 1000
      }
    }
  } catch (error) {
    return {
      success: false,
      files: [],
      commitMessage: '',
      prTitle: '',
      prDescription: '',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
