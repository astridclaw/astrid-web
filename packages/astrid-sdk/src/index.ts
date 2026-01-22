/**
 * @gracefultools/astrid-sdk
 *
 * AI agent SDK for automated coding tasks with Claude, OpenAI, and Gemini
 */

// Types
export type {
  CodeGenerationRequest,
  GeneratedCode,
  ImplementationPlan,
  ExecutionResult,
  PlanningResult,
  AIService,
  AIAgentConfig,
  LogLevel,
  Logger,
  ProgressCallback,
  AstridTask,
  AstridList,
  PreviousTaskContext,
  RepositoryContextCache,
} from './types/index.js'

// Configuration
export {
  loadAstridConfig,
  clearConfigCache,
  detectPlatform,
  generateStructurePrompt,
  generatePlatformHints,
  getInitialGlobPattern,
  isBlockedCommand,
  isProtectedPath,
  CONFIG_DEFAULTS,
  type AstridConfig,
  type ResolvedAstridConfig,
  type ProjectStructure,
  type PlatformDetection,
  type AgentConfig,
  type ValidationConfig,
  type SafetyConfig,
  type RetryConfig,
} from './config/index.js'

// Agent Configuration
export {
  AI_AGENT_CONFIG,
  SUGGESTED_MODELS,
  DEFAULT_MODELS,
  getAgentConfig,
  getAgentService,
  getAgentModel,
  getAgentContextFile,
  isRegisteredAgent,
  getRegisteredAgentEmails,
  getAllAgentConfigs,
} from './utils/agent-config.js'

// Claude Executor
export {
  planWithClaude,
  executeWithClaude,
  prepareRepository,
  getGitHubUser,
  type ClaudeExecutorConfig,
} from './executors/claude.js'

// OpenAI Executor
export {
  planWithOpenAI,
  executeWithOpenAI,
  type OpenAIExecutorConfig,
} from './executors/openai.js'

// Gemini Executor
export {
  planWithGemini,
  executeWithGemini,
  type GeminiExecutorConfig,
} from './executors/gemini.js'

// Astrid OAuth Client
export {
  AstridOAuthClient,
  type AstridOAuthConfig,
  type APIResponse,
  type Comment,
  type CreateTaskData,
  type UpdateTaskData,
} from './adapters/astrid-oauth.js'

// Agent Workflow Configuration
export {
  getAgentWorkflowConfig,
  generateBranchName,
  generatePreviewSubdomain,
  generatePreviewUrl,
  buildWorkflowInstructions,
  validateWorkflowConfig,
  logWorkflowConfig,
  type AgentWorkflowConfig,
} from './config/agent-workflow.js'

// Vercel Deployment
export {
  deployToVercel,
  isVercelConfigured,
  type VercelDeployResult,
} from './deploy/vercel.js'

// Terminal Executors
export type {
  TerminalExecutor,
  TerminalExecutionResult,
  TerminalTaskContext,
  TerminalProgressCallback,
  ParsedOutput,
} from './executors/terminal-base.js'

export {
  extractPrUrl,
  formatCommentHistory,
  captureGitBaseline,
  captureGitChanges,
  buildDefaultPrompt,
} from './executors/terminal-base.js'

export {
  TerminalClaudeExecutor,
  terminalSessionStore,
  type TerminalClaudeOptions,
} from './executors/terminal-claude.js'

export {
  TerminalOpenAIExecutor,
  terminalOpenAIExecutor,
  type TerminalOpenAIOptions,
} from './executors/terminal-openai.js'

export {
  TerminalGeminiExecutor,
  terminalGeminiExecutor,
  type TerminalGeminiOptions,
} from './executors/terminal-gemini.js'
