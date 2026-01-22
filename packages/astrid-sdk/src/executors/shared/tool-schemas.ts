/**
 * Shared Tool Schemas
 *
 * Common tool definitions used by all AI executors (OpenAI, Gemini).
 * This eliminates duplication across executor implementations.
 */

// ============================================================================
// TOOL SCHEMA DEFINITIONS
// ============================================================================

/**
 * Base tool definition (generic format)
 */
export interface BaseToolSchema {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, { type: string; description: string }>
    required: string[]
  }
}

/**
 * Common tools available to all executors
 */
export const COMMON_TOOLS: BaseToolSchema[] = [
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
        file_pattern: { type: 'string', description: 'Optional glob pattern to filter files' }
      },
      required: ['pattern']
    }
  },
  {
    name: 'task_complete',
    description: 'Signal that the task is complete',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Summary of what was done' },
        commit_message: { type: 'string', description: 'Git commit message' },
        pr_title: { type: 'string', description: 'PR title' },
        pr_description: { type: 'string', description: 'PR description' }
      },
      required: ['summary']
    }
  }
]

// ============================================================================
// PROVIDER-SPECIFIC FORMATTERS
// ============================================================================

/**
 * OpenAI function calling format
 */
export interface OpenAITool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: BaseToolSchema['parameters']
  }
}

/**
 * Convert common tools to OpenAI format
 */
export function toOpenAIFormat(tools: BaseToolSchema[] = COMMON_TOOLS): OpenAITool[] {
  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }))
}

/**
 * Gemini function declaration format
 */
export interface GeminiToolDeclaration {
  name: string
  description: string
  parameters: BaseToolSchema['parameters']
}

/**
 * Convert common tools to Gemini format
 */
export function toGeminiFormat(tools: BaseToolSchema[] = COMMON_TOOLS): GeminiToolDeclaration[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }))
}

// ============================================================================
// PRE-FORMATTED EXPORTS
// ============================================================================

/**
 * OpenAI-formatted tools (cached for performance)
 */
export const OPENAI_TOOLS = toOpenAIFormat()

/**
 * Gemini-formatted tools (cached for performance)
 */
export const GEMINI_TOOL_DECLARATIONS = toGeminiFormat()
