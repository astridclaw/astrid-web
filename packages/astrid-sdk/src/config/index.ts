/**
 * Astrid Configuration Loader (v2.0)
 *
 * Loads project-specific configuration from .astrid.config.json
 * Provides config-driven behavior for AI agents.
 */

import * as fs from 'fs/promises'
import * as path from 'path'

// ============================================================================
// CONFIGURATION SCHEMA
// ============================================================================

export interface ProjectStructure {
  /** User-friendly name for this part of the project */
  name?: string
  /** Description of the platform/framework */
  description: string
  /** Root directory for this part of the project */
  rootPath: string
  /** File patterns to search */
  filePatterns: string[]
  /** Key directories to mention */
  keyDirectories?: string[]
}

export interface PlatformDetection {
  /** Name of the platform (e.g., "ios", "android", "web") */
  name: string
  /** Keywords that indicate this platform (regex patterns) */
  keywords: string[]
  /** Preferred file patterns for this platform */
  filePatterns: string[]
  /** Hints to give the AI for this platform */
  hints?: string[]
}

export interface AgentConfig {
  /** Planning timeout in minutes */
  planningTimeoutMinutes: number
  /** Execution timeout in minutes */
  executionTimeoutMinutes: number
  /** Max iterations for planning */
  maxPlanningIterations: number
  /** Max iterations for execution */
  maxExecutionIterations: number
  /** Additional context to always include in prompts */
  additionalContext?: string
  /** Model parameters per phase */
  modelParameters: {
    planning: { temperature: number; maxTokens: number; topP?: number }
    execution: { temperature: number; maxTokens: number; topP?: number }
  }
}

export interface ValidationConfig {
  /** Maximum files per plan */
  maxFilesPerPlan: number
  /** Minimum files per plan */
  minFilesPerPlan: number
  /** Reject plans with no files */
  rejectEmptyPlans: boolean
  /** Maximum file modification size in bytes */
  maxModificationSize: number
  /** Maximum context truncation length */
  contextTruncationLength: number
  /** Max glob results to return */
  maxGlobResults: number
}

export interface SafetyConfig {
  /** Blocked bash command patterns */
  blockedBashPatterns: string[]
  /** Require plan approval before execution */
  requirePlanApproval: boolean
  /** Enforce protected paths */
  enforceProtectedPaths: boolean
  /** Maximum budget per task in USD */
  maxBudgetPerTask: number
  /** Maximum cost per API call */
  maxCostPerCall: number
}

export interface RetryConfig {
  /** Maximum retry attempts */
  maxRetries: number
  /** Initial backoff in milliseconds */
  initialBackoffMs: number
  /** Maximum backoff in milliseconds */
  maxBackoffMs: number
  /** Backoff multiplier */
  backoffMultiplier: number
  /** API timeout in milliseconds */
  apiTimeoutMs: number
}

// ============================================================================
// PREVIEW CONFIGURATION
// ============================================================================

export interface PreviewWebConfig {
  /** Enable web previews */
  enabled: boolean
  /** Preview provider: 'vercel', 'netlify', 'custom' */
  provider: 'vercel' | 'netlify' | 'custom'
  /** Custom URL template. Use ${branch} for branch name. */
  urlTemplate?: string
}

export interface PreviewIOSConfig {
  /** Enable iOS previews */
  enabled: boolean
  /** Static TestFlight link */
  testflightLink?: string
  /** Show Xcode Cloud build status in comments */
  showBuildStatus: boolean
}

export interface PreviewConfig {
  /** Enable preview workflow */
  enabled: boolean
  /** Wait for preview to be ready before continuing workflow */
  waitForReady: boolean
  /** Require preview link before user can approve */
  requiredForApproval: boolean
  /** Polling interval for checking preview status in ms */
  pollingIntervalMs: number
  /** Maximum time to wait for preview in ms */
  maxWaitMs: number
  /** Web preview configuration */
  web: PreviewWebConfig
  /** iOS preview configuration */
  ios: PreviewIOSConfig
  /** Custom comment template. Use ${previewUrl}, ${branch}, ${prNumber} variables. */
  commentTemplate?: string
}

export interface AstridConfig {
  /** Schema version */
  version: string
  /** Project name */
  projectName?: string
  /** Brief description of the project */
  description?: string
  /** Project structure */
  structure?: Record<string, ProjectStructure>
  /** Platform detection rules */
  platforms?: PlatformDetection[]
  /** Files/patterns the agent should never modify */
  protectedPaths?: string[]
  /** Custom instructions for the AI agent */
  customInstructions?: string
  /** Agent configuration */
  agent?: Partial<AgentConfig>
  /** Validation rules */
  validation?: Partial<ValidationConfig>
  /** Safety rules */
  safety?: Partial<SafetyConfig>
  /** Retry configuration */
  retry?: Partial<RetryConfig>
  /** Preview/staging workflow configuration */
  preview?: Partial<PreviewConfig>
}

export interface ResolvedAstridConfig extends Omit<AstridConfig, 'agent' | 'validation' | 'safety' | 'retry' | 'preview'> {
  agent: AgentConfig
  validation: ValidationConfig
  safety: SafetyConfig
  retry: RetryConfig
  preview: PreviewConfig
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_BLOCKED_BASH_PATTERNS = [
  'rm -rf /',
  'rm -rf ~',
  'rm -rf *',
  'sudo',
  '> /dev/',
  'mkfs',
  'dd if=',
  ':(){:|:&};:',
  'chmod -R 777 /',
  'wget -O - | sh',
  'curl | sh',
]

export const DEFAULT_PROTECTED_PATHS = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.*.local',
  '*.pem',
  '*.key',
  '**/credentials.json',
  '**/secrets.*',
  '.git/**',
]

export const CONFIG_DEFAULTS: ResolvedAstridConfig = {
  version: '2.0',
  projectName: undefined,
  description: undefined,
  structure: {},
  platforms: [],
  protectedPaths: DEFAULT_PROTECTED_PATHS,
  customInstructions: '',

  agent: {
    planningTimeoutMinutes: 15,        // Increased from 10
    executionTimeoutMinutes: 20,       // Increased from 15
    maxPlanningIterations: 50,         // Increased from 30 - more exploration
    maxExecutionIterations: 80,        // Increased from 50 - allow more work
    additionalContext: '',
    modelParameters: {
      planning: { temperature: 0.5, maxTokens: 16384, topP: 1.0 },  // Lower temp, more tokens
      execution: { temperature: 0.1, maxTokens: 16384, topP: 1.0 }, // Very low temp for precision
    },
  },

  validation: {
    maxFilesPerPlan: 8,                // Increased from 5 - allow larger changes
    minFilesPerPlan: 1,
    rejectEmptyPlans: true,
    maxModificationSize: 100000,       // Increased from 60000
    contextTruncationLength: 16000,    // Increased from 8000 - more context
    maxGlobResults: 200,               // Increased from 100 - see more files
  },

  safety: {
    blockedBashPatterns: DEFAULT_BLOCKED_BASH_PATTERNS,
    requirePlanApproval: false,
    enforceProtectedPaths: true,
    maxBudgetPerTask: 10.0,
    maxCostPerCall: 2.0,
  },

  retry: {
    maxRetries: 3,
    initialBackoffMs: 2000,
    maxBackoffMs: 30000,
    backoffMultiplier: 2,
    apiTimeoutMs: 120000,
  },

  preview: {
    enabled: true,
    waitForReady: false,
    requiredForApproval: false,
    pollingIntervalMs: 10000,
    maxWaitMs: 360000, // 6 minutes
    web: {
      enabled: true,
      provider: 'vercel',
      urlTemplate: undefined,
    },
    ios: {
      enabled: true,
      testflightLink: undefined,
      showBuildStatus: true,
    },
    commentTemplate: undefined,
  },
}

// ============================================================================
// CONFIGURATION LOADER
// ============================================================================

function isObject(item: unknown): item is Record<string, unknown> {
  return item !== null && typeof item === 'object' && !Array.isArray(item)
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target }

  for (const key of Object.keys(source)) {
    const sourceValue = source[key]
    const targetValue = target[key]

    if (sourceValue === undefined) {
      continue
    }

    if (isObject(sourceValue) && isObject(targetValue)) {
      result[key] = deepMerge(targetValue, sourceValue)
    } else {
      result[key] = sourceValue
    }
  }

  return result
}

let cachedConfig: { config: ResolvedAstridConfig; repoPath: string } | null = null

/**
 * Load Astrid configuration from a repository
 */
export async function loadAstridConfig(repoPath: string): Promise<ResolvedAstridConfig> {
  if (cachedConfig && cachedConfig.repoPath === repoPath) {
    return cachedConfig.config
  }

  const configPath = path.join(repoPath, '.astrid.config.json')
  let userConfig: Partial<AstridConfig> = {}

  try {
    const content = await fs.readFile(configPath, 'utf-8')
    userConfig = JSON.parse(content) as AstridConfig
  } catch {
    // Config file doesn't exist or is invalid - use defaults
  }

  const resolved = deepMerge(
    CONFIG_DEFAULTS as unknown as Record<string, unknown>,
    userConfig as unknown as Record<string, unknown>
  ) as unknown as ResolvedAstridConfig

  cachedConfig = { config: resolved, repoPath }
  return resolved
}

/**
 * Clear the cached configuration
 */
export function clearConfigCache(): void {
  cachedConfig = null
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Detect which platform a task belongs to
 */
export function detectPlatform(
  config: ResolvedAstridConfig,
  taskTitle: string,
  taskDescription: string | null
): PlatformDetection | null {
  if (!config.platforms?.length) {
    return null
  }

  const searchText = `${taskTitle} ${taskDescription || ''}`.toLowerCase()

  for (const platform of config.platforms) {
    for (const keyword of platform.keywords) {
      const regex = new RegExp(keyword, 'i')
      if (regex.test(searchText)) {
        return platform
      }
    }
  }

  return null
}

/**
 * Generate project structure prompt from config
 */
export function generateStructurePrompt(config: ResolvedAstridConfig): string {
  if (!config.structure || Object.keys(config.structure).length === 0) {
    return ''
  }

  const lines = ['## Project Structure']

  for (const [key, structure] of Object.entries(config.structure)) {
    const name = structure.name || key
    lines.push(`### ${name}`)
    lines.push(structure.description)
    lines.push(`Root: \`${structure.rootPath}\``)
    if (structure.keyDirectories?.length) {
      lines.push(`Key directories: ${structure.keyDirectories.join(', ')}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Generate platform-specific hints
 */
export function generatePlatformHints(platform: PlatformDetection | null): string {
  if (!platform) {
    return ''
  }

  const lines = [`## Platform: ${platform.name}`]
  lines.push(`File patterns: ${platform.filePatterns.join(', ')}`)

  if (platform.hints?.length) {
    lines.push('\nHints:')
    for (const hint of platform.hints) {
      lines.push(`- ${hint}`)
    }
  }

  return lines.join('\n')
}

/**
 * Get the initial glob pattern for a task
 */
export function getInitialGlobPattern(
  config: ResolvedAstridConfig,
  platform: PlatformDetection | null
): string {
  if (platform?.filePatterns?.length) {
    return platform.filePatterns[0]
  }
  return '**/*.ts'
}

/**
 * Check if a command is blocked by safety rules
 */
export function isBlockedCommand(command: string, config: ResolvedAstridConfig): boolean {
  const normalizedCommand = command.toLowerCase()
  return config.safety.blockedBashPatterns.some(pattern =>
    normalizedCommand.includes(pattern.toLowerCase())
  )
}

/**
 * Check if a path is protected
 */
export function isProtectedPath(filePath: string, config: ResolvedAstridConfig): boolean {
  if (!config.protectedPaths?.length) return false

  const normalizedPath = filePath.replace(/\\/g, '/')

  for (const pattern of config.protectedPaths) {
    if (pattern.includes('*')) {
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
      )
      if (regex.test(normalizedPath)) return true
    } else {
      if (normalizedPath === pattern || normalizedPath.endsWith(`/${pattern}`)) return true
    }
  }

  return false
}
