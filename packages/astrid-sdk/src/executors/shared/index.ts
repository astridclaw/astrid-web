/**
 * Shared Executor Utilities
 *
 * Re-exports common tool schemas and execution logic
 * for use by provider-specific executors.
 */

export {
  // Tool schemas
  type BaseToolSchema,
  type OpenAITool,
  type GeminiToolDeclaration,
  COMMON_TOOLS,
  OPENAI_TOOLS,
  GEMINI_TOOL_DECLARATIONS,
  toOpenAIFormat,
  toGeminiFormat,
} from './tool-schemas.js'

export {
  // Tool execution
  type ToolResult,
  type ToolExecutionConfig,
  executeTool,
  isDangerousCommand,
  truncateOutput,
  getToolNames,
} from './tool-executor.js'
