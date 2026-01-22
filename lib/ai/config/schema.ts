/**
 * Astrid Config Schema v2.0
 *
 * Defines the full configuration schema for AI agent behavior.
 * All fields are optional with sensible defaults.
 */

// ============================================================================
// PROJECT STRUCTURE (unchanged from v1)
// ============================================================================

export interface ProjectStructure {
  name: string
  description?: string
  rootPath: string
  filePatterns: string[]
  keyDirectories?: string[]
  conventions?: string[]
}

export interface PlatformDetection {
  name: string
  keywords: string[]
  filePatterns: string[]
  hints?: string[]
}

// ============================================================================
// MODEL PARAMETERS
// ============================================================================

export interface ModelParameters {
  /** Temperature (0.0 - 1.0). Lower = more deterministic. */
  temperature?: number
  /** Maximum tokens for response */
  maxTokens?: number
  /** Top P (nucleus sampling) */
  topP?: number
}

// ============================================================================
// AGENT CONFIGURATION
// ============================================================================

export interface AgentConfig {
  /** Planning phase timeout in minutes (default: 10) */
  planningTimeoutMinutes?: number
  /** Execution phase timeout in minutes (default: 15) */
  executionTimeoutMinutes?: number
  /** Max iterations during planning (default: 30) */
  maxPlanningIterations?: number
  /** Max iterations during execution (default: 50) */
  maxExecutionIterations?: number
  /** Additional context to include in prompts */
  additionalContext?: string
  /** Model parameters per phase */
  modelParameters?: {
    planning?: ModelParameters
    execution?: ModelParameters
  }
}

// ============================================================================
// PROMPT CONFIGURATION
// ============================================================================

export interface PromptTemplate {
  /** Template text with {{variable}} placeholders */
  template: string
  /** Additional variables for substitution */
  variables?: Record<string, string>
}

export interface PromptsConfig {
  /** Custom system prompt for planning phase (appended to base) */
  planningSystemPrompt?: PromptTemplate
  /** Custom system prompt for execution phase (appended to base) */
  executionSystemPrompt?: PromptTemplate
  /** Rules appended to planning prompts */
  planningRules?: string[]
  /** Rules appended to execution prompts */
  executionRules?: string[]
  /** Custom workflow instructions */
  workflowInstructions?: string
}

// ============================================================================
// TOOL CONFIGURATION
// ============================================================================

export interface ToolConfig {
  /** Tool name (e.g., "Read", "read_file") */
  name: string
  /** Whether tool is enabled (default: true) */
  enabled?: boolean
  /** Tool-specific configuration */
  config?: Record<string, unknown>
}

export interface ToolsConfig {
  /** Tools available during planning (read-only) */
  planning?: ToolConfig[]
  /** Tools available during execution (read-write) */
  execution?: ToolConfig[]
  /** Bash commands/patterns to block */
  blockedCommands?: string[]
  /** Bash commands/patterns to explicitly allow (overrides blocked) */
  allowedCommands?: string[]
}

// ============================================================================
// VALIDATION CONFIGURATION
// ============================================================================

export interface ValidationConfig {
  /** Maximum files in a single plan (default: 5) */
  maxFilesPerPlan?: number
  /** Minimum files required in plan (default: 1) */
  minFilesPerPlan?: number
  /** Reject plans with no files (default: true) */
  rejectEmptyPlans?: boolean
  /** Maximum file size for modifications in bytes (default: 60000) */
  maxModificationSize?: number
  /** Maximum file size for direct loading in bytes (default: 100000) */
  maxDirectLoadSize?: number
  /** Context file truncation length in chars (default: 8000) */
  contextTruncationLength?: number
  /** Require test files for bug fix tasks (default: false) */
  requireTestsForBugFixes?: boolean
  /** Glob results limit (default: 100) */
  maxGlobResults?: number
}

// ============================================================================
// SAFETY CONFIGURATION
// ============================================================================

export interface SafetyConfig {
  /** Bash command patterns to block */
  blockedBashPatterns?: string[]
  /** Require explicit plan approval before execution (default: false) */
  requirePlanApproval?: boolean
  /** Auto-reject plans modifying protected paths (default: true) */
  enforceProtectedPaths?: boolean
  /** Maximum budget per task in USD (default: 5.0) */
  maxBudgetPerTask?: number
  /** Maximum cost per API call in USD (default: 1.0) */
  maxCostPerCall?: number
}

// ============================================================================
// RETRY CONFIGURATION
// ============================================================================

export interface RetryConfig {
  /** Maximum retries on rate limit (default: 3) */
  maxRetries?: number
  /** Initial backoff in ms (default: 2000) */
  initialBackoffMs?: number
  /** Maximum backoff in ms (default: 30000) */
  maxBackoffMs?: number
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number
  /** Timeout per API call in ms (default: 120000) */
  apiTimeoutMs?: number
}

// ============================================================================
// OUTPUT CONFIGURATION
// ============================================================================

export interface OutputConfig {
  /** PR title prefix pattern. Use ${type} for commit type. (default: "${type}: ") */
  prTitlePrefix?: string
  /** Commit message prefix pattern */
  commitMessagePrefix?: string
  /** Include cost breakdown in PR description (default: true) */
  includeCostInPR?: boolean
  /** Include files changed in PR description (default: true) */
  includeFilesInPR?: boolean
}

// ============================================================================
// PREVIEW CONFIGURATION
// ============================================================================

export interface PreviewWebConfig {
  /** Enable web previews (default: true) */
  enabled?: boolean
  /** Preview provider: 'vercel', 'netlify', 'custom' (default: 'vercel') */
  provider?: 'vercel' | 'netlify' | 'custom'
  /** Custom URL template. Use ${branch} for branch name. e.g., "https://${branch}.preview.example.com" */
  urlTemplate?: string
}

export interface PreviewIOSConfig {
  /** Enable iOS previews (default: true) */
  enabled?: boolean
  /** Static TestFlight link. Overrides TESTFLIGHT_PUBLIC_LINK env var. */
  testflightLink?: string
  /** Show Xcode Cloud build status in comments (default: true) */
  showBuildStatus?: boolean
}

export interface PreviewConfig {
  /** Enable preview workflow (default: true) */
  enabled?: boolean
  /** Wait for preview to be ready before continuing workflow (default: false) */
  waitForReady?: boolean
  /** Require preview link before user can approve (default: false) */
  requiredForApproval?: boolean
  /** Polling interval for checking preview status in ms (default: 10000) */
  pollingIntervalMs?: number
  /** Maximum time to wait for preview in ms (default: 360000 = 6 min) */
  maxWaitMs?: number
  /** Web preview configuration */
  web?: PreviewWebConfig
  /** iOS preview configuration */
  ios?: PreviewIOSConfig
  /** Custom comment template. Use ${previewUrl}, ${branch}, ${prNumber} variables. */
  commentTemplate?: string
}

// ============================================================================
// MAIN CONFIG INTERFACE
// ============================================================================

export interface AstridConfig {
  /** Schema version. Use "2.0" for full features. */
  version: string

  /** Project name for context */
  projectName?: string

  /** Project description */
  description?: string

  /** Project structure definitions by area (web, ios, api, etc.) */
  structure?: Record<string, ProjectStructure>

  /** Platform detection rules */
  platforms?: PlatformDetection[]

  /** Paths/patterns to never modify */
  protectedPaths?: string[]

  /** Custom instructions appended to all prompts */
  customInstructions?: string

  /** Agent behavior configuration */
  agent?: AgentConfig

  /** Prompt templates and rules */
  prompts?: PromptsConfig

  /** Tool availability and configuration */
  tools?: ToolsConfig

  /** Plan and result validation rules */
  validation?: ValidationConfig

  /** Safety policies */
  safety?: SafetyConfig

  /** Retry and timeout configuration */
  retry?: RetryConfig

  /** Output formatting configuration */
  output?: OutputConfig

  /** Preview/staging workflow configuration */
  preview?: PreviewConfig
}

// ============================================================================
// RESOLVED CONFIG (with all defaults applied)
// ============================================================================

export interface ResolvedAgentConfig extends Required<AgentConfig> {
  modelParameters: {
    planning: Required<ModelParameters>
    execution: Required<ModelParameters>
  }
}

export interface ResolvedPreviewWebConfig {
  enabled: boolean
  provider: 'vercel' | 'netlify' | 'custom'
  urlTemplate?: string
}

export interface ResolvedPreviewIOSConfig {
  enabled: boolean
  testflightLink?: string
  showBuildStatus: boolean
}

export interface ResolvedPreviewConfig {
  enabled: boolean
  waitForReady: boolean
  requiredForApproval: boolean
  pollingIntervalMs: number
  maxWaitMs: number
  web: ResolvedPreviewWebConfig
  ios: ResolvedPreviewIOSConfig
  commentTemplate?: string
}

export interface ResolvedAstridConfig extends Omit<AstridConfig, 'agent' | 'validation' | 'safety' | 'retry' | 'tools' | 'prompts' | 'output' | 'preview'> {
  version: string
  agent: ResolvedAgentConfig
  validation: Required<ValidationConfig>
  safety: Required<SafetyConfig>
  retry: Required<RetryConfig>
  tools: Required<ToolsConfig>
  prompts: Required<PromptsConfig>
  output: Required<OutputConfig>
  preview: ResolvedPreviewConfig
  protectedPaths: string[]
  customInstructions: string
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isV2Config(config: AstridConfig): boolean {
  return config.version === '2.0'
}

export function hasPromptsConfig(config: AstridConfig): config is AstridConfig & { prompts: PromptsConfig } {
  return config.prompts !== undefined
}

export function hasToolsConfig(config: AstridConfig): config is AstridConfig & { tools: ToolsConfig } {
  return config.tools !== undefined
}
