/**
 * Executor Router
 *
 * Routes task execution to the appropriate provider (Claude, OpenAI, Gemini)
 * based on the AI agent email pattern.
 */

import type { Session } from '../session-manager'
import type { ExecutionResult, TaskContext } from '../claude-executor'
import { claudeExecutor } from '../claude-executor'
import { openaiExecutor } from './openai-executor'
import { geminiExecutor } from './gemini-executor'

export type AIProvider = 'claude' | 'openai' | 'gemini' | 'unknown'

/**
 * Detect the AI provider from the agent email or type
 */
export function detectProvider(aiAgent: { email?: string; type?: string }): AIProvider {
  const email = aiAgent.email?.toLowerCase() || ''
  const type = aiAgent.type?.toLowerCase() || ''

  // Check email patterns
  if (email.includes('claude') || email.startsWith('claude@')) {
    return 'claude'
  }
  if (email.includes('openai') || email.startsWith('openai@') || email.includes('codex')) {
    return 'openai'
  }
  if (email.includes('gemini') || email.startsWith('gemini@') || email.includes('google')) {
    return 'gemini'
  }

  // Check type field
  if (type.includes('claude')) {
    return 'claude'
  }
  if (type.includes('openai') || type.includes('gpt')) {
    return 'openai'
  }
  if (type.includes('gemini') || type.includes('google')) {
    return 'gemini'
  }

  // Default to Claude (has the best capabilities)
  return 'claude'
}

/**
 * Check if a provider is available based on environment configuration
 */
export function isProviderAvailable(provider: AIProvider): boolean {
  switch (provider) {
    case 'claude':
      // Claude Code CLI needs to be installed
      return true // We'll check availability at runtime
    case 'openai':
      return !!process.env.OPENAI_API_KEY
    case 'gemini':
      return !!process.env.GEMINI_API_KEY
    default:
      return false
  }
}

/**
 * Get the display name for a provider
 */
export function getProviderName(provider: AIProvider): string {
  switch (provider) {
    case 'claude':
      return 'Claude Code'
    case 'openai':
      return 'OpenAI'
    case 'gemini':
      return 'Gemini'
    default:
      return 'Unknown'
  }
}

export interface ExecutorInterface {
  startSession(
    session: Session,
    prompt?: string,
    context?: TaskContext,
    onProgress?: (message: string) => void
  ): Promise<ExecutionResult>

  resumeSession(
    session: Session,
    input: string,
    context?: TaskContext,
    onProgress?: (message: string) => void
  ): Promise<ExecutionResult>

  parseOutput(output: string): {
    summary?: string
    files?: string[]
    prUrl?: string
    question?: string
    error?: string
  }

  checkAvailable(): Promise<boolean>
}

/**
 * Get the executor for a specific provider
 */
export function getExecutor(provider: AIProvider): ExecutorInterface {
  switch (provider) {
    case 'claude':
      return claudeExecutor
    case 'openai':
      return openaiExecutor
    case 'gemini':
      return geminiExecutor
    default:
      // Default to Claude for unknown providers
      console.warn(`Unknown provider "${provider}", falling back to Claude`)
      return claudeExecutor
  }
}

/**
 * Execute a task with automatic provider detection
 */
export async function executeTask(
  session: Session,
  aiAgent: { email?: string; type?: string },
  prompt?: string,
  context?: TaskContext,
  onProgress?: (message: string) => void
): Promise<{ provider: AIProvider; result: ExecutionResult }> {
  const provider = detectProvider(aiAgent)
  const executor = getExecutor(provider)

  console.log(`🤖 Using ${getProviderName(provider)} executor for task`)

  // Check availability
  const available = await executor.checkAvailable()
  if (!available) {
    throw new Error(`${getProviderName(provider)} is not available. Please check configuration.`)
  }

  const result = await executor.startSession(session, prompt, context, onProgress)
  return { provider, result }
}

/**
 * Resume a task with the appropriate provider
 */
export async function resumeTask(
  session: Session,
  provider: AIProvider,
  input: string,
  context?: TaskContext,
  onProgress?: (message: string) => void
): Promise<ExecutionResult> {
  const executor = getExecutor(provider)

  console.log(`🔄 Resuming with ${getProviderName(provider)} executor`)

  return executor.resumeSession(session, input, context, onProgress)
}

export { claudeExecutor } from '../claude-executor'
export { openaiExecutor } from './openai-executor'
export { geminiExecutor } from './gemini-executor'
