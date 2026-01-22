/**
 * AI Module
 * Centralized exports for AI-related functionality
 */

// Agent configuration
export {
  AI_AGENT_CONFIG,
  type AIAgentConfig,
  type AIService,
  getAgentConfig,
  getAgentService,
  getAgentModel,
  getAgentContextFile,
  isRegisteredAgent,
  getRegisteredAgentEmails,
  getAllAgentConfigs,
} from './agent-config'

// Types
export type {
  CodeGenerationRequest,
  GeneratedCode,
  ImplementationPlan,
  PlanningContext,
  RepositoryContextCache,
} from './types'

// Shared Logger Types
export type {
  AILogger,
  AILogLevel,
} from './types/logger'
export { noopLogger, createConsoleLogger } from './types/logger'

// AI Clients
export {
  callOpenAI,
  callGemini,
  type OpenAIClientOptions,
  type OpenAIResponse,
  type GeminiClientOptions,
  type GeminiResponse,
} from './clients'

// File Path Utilities
export {
  generateFilePathVariations,
  kebabToCamel,
  kebabToPascal,
  buildFileTree,
  renderFileTree,
} from './file-path-utils'

// Prompt Templates
export {
  PLANNING_CORE_INSTRUCTIONS,
  IMPLEMENTATION_CORE_INSTRUCTIONS,
  PLANNING_MODE_INSTRUCTIONS,
  IMPLEMENTATION_MODE_INSTRUCTIONS,
  PLANNING_RULES,
  EFFICIENT_WORKFLOW_GUIDE,
  IMPLEMENTATION_FORBIDDEN,
  IMPLEMENTATION_REQUIRED,
  PLAN_RESPONSE_FORMAT,
  buildMinimalPlanningPrompt,
  formatRepositoryGuidelines,
  buildCodeGenerationPrompt,
} from './prompts'

// Response Parser Utilities
export {
  extractBalancedJson,
  countBraceBalance,
  extractSection,
  assessComplexity,
  extractConsiderations,
  extractFilePaths,
  mapToKnownPath,
  extractCodeFromMarkdown,
  parseGeneratedCode,
  type ExtractedCodeFile,
  type ParseLogger,
  type GeneratedCodeResponse,
} from './response-parser'

// Workflow Comment Utilities
export {
  formatStatusComment,
  formatPlanComment,
  formatPlanSummary,
  formatImplementationComment,
  formatCompletionSummary,
  parseWorkflowSteps,
  getEstimatedTime,
  DEFAULT_WORKFLOW_STEPS,
  MINIMAL_WORKFLOW_STEPS,
  type ImplementationDetails,
} from './workflow-comments'

// GitHub Workflow Service
export {
  createGitHubImplementation,
  resolveTargetRepository,
  waitForGitHubChecks,
  generateBranchName,
  type GitHubWorkflowDependencies,
  type GitHubImplementationResult,
  type WorkflowLogger,
  type CommentPoster,
  type ImplementationCommentPoster,
} from './github-workflow-service'

// MCP Tool Executor
export {
  executeMCPTool,
  executeGetFile,
  executeListFiles,
  type MCPToolLogger,
  type MCPToolDependencies,
  type MCPToolResult,
  type MCPGitHubClient,
  type ExploredFileCache,
} from './mcp-tool-executor'

// Repository Context Loader
export {
  loadRepositoryGuidelines,
  loadRepositoryContext,
  loadRepositoryStructure,
  type RepositoryContextLogger,
  type RepositoryContextGitHubClient,
  type RepositoryContextDependencies,
  type GuidelinesResult,
} from './repository-context-loader'

// System Blocks Builder
export {
  buildSystemBlocks,
  buildPlanningInsights,
  type SystemBlock,
  type PlanningContextData,
} from './system-blocks-builder'

// File Validator
export {
  validateAndDeduplicatePlan,
  validateFileSizes,
  loadFilesDirectly,
  filterGeneratedCode,
  FILE_SIZE_LIMITS,
  type FileValidatorLogger,
  type FileValidatorGitHubClient,
  type FileValidatorDependencies,
  type PlanValidationResult,
  type ExploredFile,
  type PlanningContextFiles,
} from './file-validator'
