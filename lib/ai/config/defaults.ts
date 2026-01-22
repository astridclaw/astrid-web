/**
 * Astrid Config Defaults
 *
 * All magic numbers and default values centralized here.
 * These are applied when user config doesn't specify values.
 */

import type {
  ResolvedAstridConfig,
  PromptTemplate,
  ToolConfig,
} from './schema'

// ============================================================================
// DEFAULT PROMPT TEMPLATES
// ============================================================================

export const DEFAULT_PLANNING_PROMPT: PromptTemplate = {
  template: `You are analyzing a codebase to create an implementation plan for a coding task.

{{structurePrompt}}
{{platformHints}}
{{customInstructions}}

## Your Task
Create an implementation plan for: "{{taskTitle}}"
{{taskDescription}}

## How to Work
You have access to function calling tools. You MUST use these tools to explore the codebase:
- glob_files(pattern): Find files by pattern (e.g., "**/*.ts", "**/*.swift")
- grep_search(pattern, file_pattern): Search for text in files
- read_file(file_path): Read a specific file's contents

CRITICAL: You must use ACTUAL FUNCTION CALLS, not text descriptions.
Do NOT write code blocks or text saying "I will call X" - actually invoke the function.

## Workflow
1. FIRST: Call glob_files or grep_search to explore the codebase (REQUIRED)
2. THEN: Call read_file on relevant files you find
3. FINALLY: After exploring, output your plan as JSON

## Planning Rules
{{planningRules}}

## Output Format
After exploring, respond with a JSON block:
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
\`\`\``,
}

export const DEFAULT_EXECUTION_PROMPT: PromptTemplate = {
  template: `You are implementing a coding task from an approved plan.

{{structurePrompt}}
{{platformHints}}
{{customInstructions}}

## Task
Implement: "{{taskTitle}}"
{{taskDescription}}

## Approved Plan
{{planSummary}}

### Files to Modify
{{planFiles}}

## Execution Rules
{{executionRules}}

## Tools Available
- read_file: Read file contents before editing
- write_file: Create new files
- edit_file: Modify existing files (use old_string/new_string)
- run_bash: Run shell commands (limited)
- task_complete: Signal completion with commit message and PR details

## Workflow
1. Read each file in the plan before modifying
2. Make minimal, surgical changes
3. Test your changes if possible
4. Call task_complete when done

## Output
When complete, call task_complete with:
- commit_message: Descriptive commit message
- pr_title: PR title starting with feat:/fix:/etc.
- pr_description: What was changed and why`,
}

// ============================================================================
// DEFAULT RULES
// ============================================================================

export const DEFAULT_PLANNING_RULES = [
  'DO NOT modify any files - this is READ-ONLY exploration',
  'Maximum {{maxFilesPerPlan}} files in the plan',
  'Be SURGICAL: only list files that MUST change',
  'Include specific file paths you discovered',
  'Consider existing patterns in the codebase',
]

export const DEFAULT_EXECUTION_RULES = [
  'Follow the implementation plan exactly',
  'Write complete, working code - no placeholders or TODOs',
  'Make minimal changes - do not refactor unrelated code',
  'Read files before editing to understand context',
  'Do NOT commit changes - just make file edits',
]

// ============================================================================
// DEFAULT TOOL CONFIGURATIONS
// ============================================================================

export const DEFAULT_PLANNING_TOOLS: ToolConfig[] = [
  { name: 'Read', enabled: true },
  { name: 'Glob', enabled: true },
  { name: 'Grep', enabled: true },
  { name: 'Bash', enabled: true }, // Read-only commands only
]

export const DEFAULT_EXECUTION_TOOLS: ToolConfig[] = [
  { name: 'Read', enabled: true },
  { name: 'Write', enabled: true },
  { name: 'Edit', enabled: true },
  { name: 'Glob', enabled: true },
  { name: 'Grep', enabled: true },
  { name: 'Bash', enabled: true },
]

// ============================================================================
// DEFAULT BLOCKED COMMANDS
// ============================================================================

export const DEFAULT_BLOCKED_BASH_PATTERNS = [
  'rm -rf /',
  'rm -rf ~',
  'rm -rf *',
  'sudo',
  '> /dev/',
  'mkfs',
  'dd if=',
  ':(){:|:&};:',  // Fork bomb
  'chmod -R 777 /',
  'wget -O - | sh',
  'curl | sh',
]

// ============================================================================
// DEFAULT PROTECTED PATHS
// ============================================================================

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

// ============================================================================
// FULL DEFAULTS OBJECT
// ============================================================================

export const CONFIG_DEFAULTS: ResolvedAstridConfig = {
  version: '2.0',
  projectName: undefined,
  description: undefined,
  structure: {},
  platforms: [],
  protectedPaths: DEFAULT_PROTECTED_PATHS,
  customInstructions: '',

  agent: {
    planningTimeoutMinutes: 10,
    executionTimeoutMinutes: 15,
    maxPlanningIterations: 30,
    maxExecutionIterations: 50,
    additionalContext: '',
    modelParameters: {
      planning: {
        temperature: 0.7,
        maxTokens: 8192,
        topP: 1.0,
      },
      execution: {
        temperature: 0.2,
        maxTokens: 8192,
        topP: 1.0,
      },
    },
  },

  prompts: {
    planningSystemPrompt: DEFAULT_PLANNING_PROMPT,
    executionSystemPrompt: DEFAULT_EXECUTION_PROMPT,
    planningRules: DEFAULT_PLANNING_RULES,
    executionRules: DEFAULT_EXECUTION_RULES,
    workflowInstructions: '',
  },

  tools: {
    planning: DEFAULT_PLANNING_TOOLS,
    execution: DEFAULT_EXECUTION_TOOLS,
    blockedCommands: DEFAULT_BLOCKED_BASH_PATTERNS,
    allowedCommands: [],
  },

  validation: {
    maxFilesPerPlan: 5,
    minFilesPerPlan: 1,
    rejectEmptyPlans: true,
    maxModificationSize: 60000,
    maxDirectLoadSize: 100000,
    contextTruncationLength: 8000,
    requireTestsForBugFixes: false,
    maxGlobResults: 100,
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

  output: {
    prTitlePrefix: '${type}: ',
    commitMessagePrefix: '${type}: ',
    includeCostInPR: true,
    includeFilesInPR: true,
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
// HELPER TO GET SPECIFIC DEFAULTS
// ============================================================================

export function getDefaultModelParams(phase: 'planning' | 'execution') {
  return CONFIG_DEFAULTS.agent.modelParameters[phase]
}

export function getDefaultTimeout(phase: 'planning' | 'execution'): number {
  return phase === 'planning'
    ? CONFIG_DEFAULTS.agent.planningTimeoutMinutes * 60 * 1000
    : CONFIG_DEFAULTS.agent.executionTimeoutMinutes * 60 * 1000
}

export function getDefaultMaxIterations(phase: 'planning' | 'execution'): number {
  return phase === 'planning'
    ? CONFIG_DEFAULTS.agent.maxPlanningIterations
    : CONFIG_DEFAULTS.agent.maxExecutionIterations
}
