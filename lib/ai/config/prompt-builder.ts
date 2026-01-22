/**
 * Prompt Builder
 *
 * Builds system prompts from templates with variable substitution.
 */

import type { PromptTemplate, ResolvedAstridConfig, PlatformDetection } from './schema'
import type { ImplementationPlan } from '../types'
import { generateStructurePrompt, generatePlatformHints } from './index'

// ============================================================================
// TEMPLATE VARIABLE SUBSTITUTION
// ============================================================================

/**
 * Substitute {{variable}} placeholders in a template
 */
export function substituteVariables(
  template: string,
  variables: Record<string, string | undefined>
): string {
  let result = template

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`
    result = result.split(placeholder).join(value || '')
  }

  // Remove any remaining unsubstituted variables
  result = result.replace(/\{\{[^}]+\}\}/g, '')

  // Clean up multiple blank lines
  result = result.replace(/\n{3,}/g, '\n\n')

  return result.trim()
}

/**
 * Build prompt from a PromptTemplate
 */
export function buildPromptFromTemplate(
  template: PromptTemplate,
  variables: Record<string, string | undefined>
): string {
  // Merge template variables with provided variables
  const allVariables = {
    ...template.variables,
    ...variables,
  }

  return substituteVariables(template.template, allVariables)
}

// ============================================================================
// PLANNING PROMPT BUILDER
// ============================================================================

export interface PlanningPromptContext {
  taskTitle: string
  taskDescription: string | null
  previousContext?: {
    hasBeenProcessedBefore: boolean
    previousAttempts: Array<{
      planSummary?: string
      filesModified?: string[]
      prUrl?: string
      outcome?: string
    }>
    userFeedback: string[]
    systemUnderstanding?: string
  }
}

/**
 * Build the full system prompt for planning phase
 */
export function buildPlanningPrompt(
  config: ResolvedAstridConfig,
  context: PlanningPromptContext,
  platform: PlatformDetection | null
): string {
  // Build variable values
  const structurePrompt = generateStructurePrompt(config)
  const platformHints = generatePlatformHints(platform)

  // Build planning rules with variable substitution
  const planningRules = config.prompts.planningRules
    .map(rule => substituteVariables(rule, {
      maxFilesPerPlan: String(config.validation.maxFilesPerPlan),
    }))
    .map(rule => `- ${rule}`)
    .join('\n')

  // Build previous context section if applicable
  let previousContextSection = ''
  if (context.previousContext?.hasBeenProcessedBefore) {
    previousContextSection = buildPreviousContextSection(context.previousContext)
  }

  // Build the full prompt
  const variables: Record<string, string | undefined> = {
    structurePrompt,
    platformHints,
    customInstructions: config.customInstructions || undefined,
    taskTitle: context.taskTitle,
    taskDescription: context.taskDescription ? `\nDetails: ${context.taskDescription}` : '',
    planningRules,
    previousContext: previousContextSection,
    workflowInstructions: config.prompts.workflowInstructions || undefined,
  }

  return buildPromptFromTemplate(config.prompts.planningSystemPrompt, variables)
}

/**
 * Build section about previous attempts
 */
function buildPreviousContextSection(previousContext: NonNullable<PlanningPromptContext['previousContext']>): string {
  const lines = [
    '\n## Previous Attempts',
    '',
    'This task has been attempted before. Consider the previous feedback:',
    '',
  ]

  if (previousContext.previousAttempts.length > 0) {
    for (let i = 0; i < previousContext.previousAttempts.length; i++) {
      const attempt = previousContext.previousAttempts[i]
      lines.push(`### Attempt ${i + 1}`)
      if (attempt.planSummary) lines.push(`- Plan: ${attempt.planSummary}`)
      if (attempt.filesModified?.length) lines.push(`- Files: ${attempt.filesModified.slice(0, 5).join(', ')}`)
      if (attempt.prUrl) lines.push(`- PR: ${attempt.prUrl}`)
      if (attempt.outcome) lines.push(`- Outcome: ${attempt.outcome}`)
      lines.push('')
    }
  }

  if (previousContext.userFeedback.length > 0) {
    lines.push('### User Feedback')
    previousContext.userFeedback.forEach(fb => lines.push(`- ${fb}`))
    lines.push('')
  }

  if (previousContext.systemUnderstanding) {
    lines.push('### System Understanding')
    lines.push(previousContext.systemUnderstanding)
    lines.push('')
  }

  return lines.join('\n')
}

// ============================================================================
// EXECUTION PROMPT BUILDER
// ============================================================================

export interface ExecutionPromptContext {
  taskTitle: string
  taskDescription: string | null
  plan: ImplementationPlan
}

/**
 * Build the full system prompt for execution phase
 */
export function buildExecutionPrompt(
  config: ResolvedAstridConfig,
  context: ExecutionPromptContext,
  platform: PlatformDetection | null
): string {
  // Build variable values
  const structurePrompt = generateStructurePrompt(config)
  const platformHints = generatePlatformHints(platform)

  // Build execution rules
  const executionRules = config.prompts.executionRules
    .map(rule => `- ${rule}`)
    .join('\n')

  // Build plan summary
  const planSummary = `**Summary:** ${context.plan.summary}\n**Approach:** ${context.plan.approach}`

  // Build files list
  const planFiles = context.plan.files
    .map(f => `- \`${f.path}\`: ${f.purpose}\n  Changes: ${f.changes}`)
    .join('\n')

  // Build the full prompt
  const variables: Record<string, string | undefined> = {
    structurePrompt,
    platformHints,
    customInstructions: config.customInstructions || undefined,
    taskTitle: context.taskTitle,
    taskDescription: context.taskDescription ? `\nDetails: ${context.taskDescription}` : '',
    executionRules,
    planSummary,
    planFiles,
    workflowInstructions: config.prompts.workflowInstructions || undefined,
  }

  return buildPromptFromTemplate(config.prompts.executionSystemPrompt, variables)
}

// ============================================================================
// USER MESSAGE BUILDERS
// ============================================================================

/**
 * Build the initial user message for planning
 */
export function buildPlanningUserMessage(
  taskTitle: string,
  platform: PlatformDetection | null,
  initialPattern: string
): string {
  if (platform) {
    return `Start by calling glob_files with pattern "${initialPattern}" to find relevant ${platform.name} files, then create an implementation plan for: ${taskTitle}`
  }
  return `Start by calling glob_files with pattern "${initialPattern}" to find relevant files, then create an implementation plan for: ${taskTitle}`
}

/**
 * Build the initial user message for execution
 */
export function buildExecutionUserMessage(
  taskTitle: string,
  plan: ImplementationPlan
): string {
  const filesList = plan.files.map(f => f.path).join(', ')
  return `Implement the approved plan for: ${taskTitle}\n\nFiles to modify: ${filesList}\n\nStart by reading each file, then make the necessary changes.`
}

// ============================================================================
// RECOVERY PROMPTS
// ============================================================================

/**
 * Prompt to ask model to use tools when it outputs text instead
 */
export function buildUseToolsPrompt(): string {
  return 'You must use the function calling tools to explore the codebase. Please call glob_files with an appropriate pattern to find relevant files. Do not describe what you will do - actually invoke the function.'
}

/**
 * Prompt when plan has no files
 */
export function buildEmptyPlanRecoveryPrompt(): string {
  return 'Your plan has no files to modify. This is not valid. You MUST use the glob_files and read_file tools to explore the codebase first, then provide a plan with specific files to modify. Please call glob_files now to find relevant files.'
}

/**
 * Prompt to request plan output
 */
export function buildRequestPlanPrompt(): string {
  return 'Please provide the implementation plan as a JSON block with at least one file to modify.'
}

/**
 * Prompt to request task completion
 */
export function buildRequestCompletionPrompt(): string {
  return 'Please call task_complete to finalize your changes with a commit message and PR details.'
}
