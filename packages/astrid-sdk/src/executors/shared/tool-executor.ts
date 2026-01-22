/**
 * Shared Tool Executor
 *
 * Common tool execution logic used by all AI executors.
 * Handles file operations, bash commands, and search operations.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { execSync } from 'child_process'
import { glob } from 'glob'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result from executing a tool
 */
export interface ToolResult {
  success: boolean
  result: string
  fileChange?: {
    path: string
    content: string
    action: 'create' | 'modify' | 'delete'
  }
}

/**
 * Configuration for tool execution
 */
export interface ToolExecutionConfig {
  bashTimeout?: number       // Timeout for bash commands in ms (default: 120000)
  bashMaxBuffer?: number     // Max output buffer for bash commands (default: 1MB)
  grepTimeout?: number       // Timeout for grep operations (default: 30000)
  grepMaxResults?: number    // Max grep results to return (default: 50)
  globMaxResults?: number    // Max glob results to return (default: 100)
  maxOutputLength?: number   // Max output length before truncation (default: 10000)
}

const DEFAULT_CONFIG: Required<ToolExecutionConfig> = {
  bashTimeout: 120000,
  bashMaxBuffer: 1024 * 1024,
  grepTimeout: 30000,
  grepMaxResults: 50,
  globMaxResults: 100,
  maxOutputLength: 10000
}

// ============================================================================
// SECURITY
// ============================================================================

/**
 * Dangerous commands that should be blocked for safety
 */
const DANGEROUS_COMMANDS = [
  'rm -rf /',
  'rm -rf /*',
  'sudo',
  '> /dev/',
  'mkfs',
  'dd if=',
  ':(){:|:&};:',  // Fork bomb
  'chmod -R 777 /',
  'chown -R',
]

/**
 * Check if a command is potentially dangerous
 */
export function isDangerousCommand(command: string): boolean {
  const lowerCommand = command.toLowerCase()
  return DANGEROUS_COMMANDS.some(d => lowerCommand.includes(d.toLowerCase()))
}

// ============================================================================
// TOOL EXECUTION
// ============================================================================

/**
 * Execute a tool by name with the given arguments
 *
 * @param name - Tool name (read_file, write_file, etc.)
 * @param args - Tool arguments
 * @param repoPath - Base path for file operations
 * @param config - Optional execution configuration
 * @returns Tool execution result
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  repoPath: string,
  config: ToolExecutionConfig = {}
): Promise<ToolResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  try {
    switch (name) {
      case 'read_file':
        return await executeReadFile(args, repoPath)

      case 'write_file':
        return await executeWriteFile(args, repoPath)

      case 'edit_file':
        return await executeEditFile(args, repoPath)

      case 'run_bash':
        return await executeRunBash(args, repoPath, cfg)

      case 'glob_files':
        return await executeGlobFiles(args, repoPath, cfg)

      case 'grep_search':
        return await executeGrepSearch(args, repoPath, cfg)

      case 'task_complete':
        return { success: true, result: 'Task marked complete' }

      default:
        return { success: false, result: `Unknown tool: ${name}` }
    }
  } catch (error) {
    return {
      success: false,
      result: `Error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

// ============================================================================
// INDIVIDUAL TOOL IMPLEMENTATIONS
// ============================================================================

async function executeReadFile(
  args: Record<string, unknown>,
  repoPath: string
): Promise<ToolResult> {
  const filePath = path.join(repoPath, args.file_path as string)
  const content = await fs.readFile(filePath, 'utf-8')
  return { success: true, result: content }
}

async function executeWriteFile(
  args: Record<string, unknown>,
  repoPath: string
): Promise<ToolResult> {
  const filePath = path.join(repoPath, args.file_path as string)
  const content = args.content as string

  // Check if file exists to determine action
  let action: 'create' | 'modify' = 'create'
  try {
    await fs.access(filePath)
    action = 'modify'
  } catch {
    // File doesn't exist, create parent directories
    await fs.mkdir(path.dirname(filePath), { recursive: true })
  }

  await fs.writeFile(filePath, content, 'utf-8')

  return {
    success: true,
    result: `File ${action === 'create' ? 'created' : 'updated'}: ${args.file_path}`,
    fileChange: { path: args.file_path as string, content, action }
  }
}

async function executeEditFile(
  args: Record<string, unknown>,
  repoPath: string
): Promise<ToolResult> {
  const filePath = path.join(repoPath, args.file_path as string)
  const oldContent = await fs.readFile(filePath, 'utf-8')
  const oldString = args.old_string as string
  const newString = args.new_string as string

  if (!oldContent.includes(oldString)) {
    return {
      success: false,
      result: 'Error: Could not find the specified string in file'
    }
  }

  const newContent = oldContent.replace(oldString, newString)
  await fs.writeFile(filePath, newContent, 'utf-8')

  return {
    success: true,
    result: `File edited: ${args.file_path}`,
    fileChange: { path: args.file_path as string, content: newContent, action: 'modify' }
  }
}

async function executeRunBash(
  args: Record<string, unknown>,
  repoPath: string,
  config: Required<ToolExecutionConfig>
): Promise<ToolResult> {
  const command = args.command as string

  // Security check
  if (isDangerousCommand(command)) {
    return {
      success: false,
      result: 'Error: Command blocked by safety policy'
    }
  }

  try {
    const output = execSync(command, {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: config.bashTimeout,
      maxBuffer: config.bashMaxBuffer
    })

    return {
      success: true,
      result: output || '(no output)'
    }
  } catch (error) {
    const err = error as { stderr?: string; stdout?: string; message?: string }
    const errorOutput = err.stderr || err.stdout || err.message || 'Command failed'
    return {
      success: false,
      result: `Error: ${errorOutput}`
    }
  }
}

async function executeGlobFiles(
  args: Record<string, unknown>,
  repoPath: string,
  config: Required<ToolExecutionConfig>
): Promise<ToolResult> {
  const pattern = args.pattern as string
  const files = await glob(pattern, { cwd: repoPath, nodir: true })

  const limitedFiles = files.slice(0, config.globMaxResults)
  const result = limitedFiles.join('\n') || '(no matches)'

  return {
    success: true,
    result: files.length > config.globMaxResults
      ? `${result}\n\n[... ${files.length - config.globMaxResults} more files truncated]`
      : result
  }
}

async function executeGrepSearch(
  args: Record<string, unknown>,
  repoPath: string,
  config: Required<ToolExecutionConfig>
): Promise<ToolResult> {
  const pattern = args.pattern as string
  const filePattern = (args.file_pattern as string) || '.'

  // Escape double quotes in pattern for shell safety
  const escapedPattern = pattern.replace(/"/g, '\\"')

  try {
    const output = execSync(
      `grep -rn "${escapedPattern}" ${filePattern} | head -${config.grepMaxResults}`,
      {
        cwd: repoPath,
        encoding: 'utf-8',
        timeout: config.grepTimeout
      }
    )

    return {
      success: true,
      result: output || '(no matches)'
    }
  } catch {
    // grep returns exit code 1 when no matches found
    return {
      success: true,
      result: '(no matches)'
    }
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Truncate output to maximum length
 */
export function truncateOutput(output: string, maxLength: number = 10000): string {
  if (output.length <= maxLength) {
    return output
  }
  return output.slice(0, maxLength) + '\n\n[... output truncated]'
}

/**
 * Extract tool names from results for tracking
 */
export function getToolNames(): string[] {
  return [
    'read_file',
    'write_file',
    'edit_file',
    'run_bash',
    'glob_files',
    'grep_search',
    'task_complete'
  ]
}
