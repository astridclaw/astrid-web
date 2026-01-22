/**
 * Plan Validator
 *
 * Config-driven validation for plans and execution results.
 */

import type { ResolvedAstridConfig } from '../config/schema'
import type { ImplementationPlan } from '../types'
import { isProtectedPath } from '../config'

// File change type for execution results
export interface FileChange {
  path: string
  content?: string
  action: 'create' | 'modify' | 'delete'
}

// ============================================================================
// VALIDATION RESULT TYPES
// ============================================================================

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface PlanValidationResult extends ValidationResult {
  plan?: ImplementationPlan
}

export interface ExecutionValidationResult extends ValidationResult {
  files?: FileChange[]
}

// ============================================================================
// PLAN VALIDATION
// ============================================================================

/**
 * Validate an implementation plan against config rules
 */
export function validatePlan(
  plan: ImplementationPlan | null | undefined,
  config: ResolvedAstridConfig
): PlanValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Check if plan exists
  if (!plan) {
    return {
      valid: false,
      errors: ['No plan provided'],
      warnings: [],
    }
  }

  // Check required fields
  if (!plan.summary) {
    errors.push('Plan missing summary')
  }

  if (!plan.files || !Array.isArray(plan.files)) {
    errors.push('Plan missing files array')
    return { valid: false, errors, warnings }
  }

  // Check empty plans
  if (config.validation.rejectEmptyPlans && plan.files.length === 0) {
    errors.push('Plan has no files to modify (config: rejectEmptyPlans=true)')
  }

  // Check minimum files
  if (plan.files.length < config.validation.minFilesPerPlan) {
    errors.push(`Plan has ${plan.files.length} files, minimum is ${config.validation.minFilesPerPlan}`)
  }

  // Check maximum files
  if (plan.files.length > config.validation.maxFilesPerPlan) {
    errors.push(`Plan has ${plan.files.length} files, maximum is ${config.validation.maxFilesPerPlan}`)
  }

  // Check protected paths
  if (config.safety.enforceProtectedPaths) {
    for (const file of plan.files) {
      if (isProtectedPath(file.path, config)) {
        errors.push(`Plan modifies protected path: ${file.path}`)
      }
    }
  }

  // Check for valid file entries
  for (const file of plan.files) {
    if (!file.path) {
      errors.push('Plan contains file entry without path')
    }
    if (!file.purpose && !file.changes) {
      warnings.push(`File ${file.path} has no purpose or changes description`)
    }
  }

  // Validate complexity if present
  const validComplexities = ['simple', 'medium', 'complex']
  if (plan.estimatedComplexity && !validComplexities.includes(plan.estimatedComplexity)) {
    warnings.push(`Unknown complexity level: ${plan.estimatedComplexity}`)
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    plan: errors.length === 0 ? plan : undefined,
  }
}

// ============================================================================
// PLAN PARSING
// ============================================================================

/**
 * Parse a plan from model output text
 */
export function parsePlanFromText(
  text: string,
  config: ResolvedAstridConfig
): PlanValidationResult {
  // Try to extract JSON block
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/)

  if (!jsonMatch) {
    return {
      valid: false,
      errors: ['No JSON block found in response'],
      warnings: [],
    }
  }

  try {
    const parsed = JSON.parse(jsonMatch[1])

    // Build plan from parsed JSON
    const plan: ImplementationPlan = {
      summary: parsed.summary || '',
      approach: parsed.approach || parsed.summary || '',
      files: Array.isArray(parsed.files)
        ? parsed.files.map((f: { path: string; purpose?: string; changes?: string }) => ({
            path: f.path,
            purpose: f.purpose || 'Implementation',
            changes: f.changes || 'See plan',
          }))
        : [],
      estimatedComplexity: parsed.estimatedComplexity || 'medium',
      considerations: parsed.considerations || [],
    }

    // Validate the parsed plan
    return validatePlan(plan, config)
  } catch (error) {
    return {
      valid: false,
      errors: [`Failed to parse plan JSON: ${error instanceof Error ? error.message : String(error)}`],
      warnings: [],
    }
  }
}

// ============================================================================
// EXECUTION RESULT VALIDATION
// ============================================================================

/**
 * Validate execution results against config rules
 */
export function validateExecutionResult(
  files: FileChange[],
  plan: ImplementationPlan,
  config: ResolvedAstridConfig
): ExecutionValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Check if any files were modified
  if (files.length === 0) {
    warnings.push('No files were modified during execution')
  }

  // Check for protected path modifications
  if (config.safety.enforceProtectedPaths) {
    for (const file of files) {
      if (isProtectedPath(file.path, config)) {
        errors.push(`Modified protected path: ${file.path}`)
      }
    }
  }

  // Check file sizes
  for (const file of files) {
    if (file.content && file.content.length > config.validation.maxModificationSize) {
      errors.push(`File ${file.path} exceeds max size (${config.validation.maxModificationSize} bytes)`)
    }
  }

  // Check for files not in plan
  const plannedPaths = new Set(plan.files.map(f => f.path))
  for (const file of files) {
    if (!plannedPaths.has(file.path)) {
      warnings.push(`Modified file not in plan: ${file.path}`)
    }
  }

  // Check for planned files not modified
  const modifiedPaths = new Set(files.map(f => f.path))
  for (const plannedFile of plan.files) {
    if (!modifiedPaths.has(plannedFile.path)) {
      warnings.push(`Planned file not modified: ${plannedFile.path}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    files: errors.length === 0 ? files : undefined,
  }
}

// ============================================================================
// COMPLETION RESULT PARSING
// ============================================================================

export interface CompletionResult {
  commitMessage: string
  prTitle: string
  prDescription: string
}

/**
 * Parse task_complete result
 */
export function parseCompletionResult(result: string): CompletionResult | null {
  try {
    const parsed = JSON.parse(result)
    return {
      commitMessage: parsed.commitMessage || parsed.commit_message || '',
      prTitle: parsed.prTitle || parsed.pr_title || '',
      prDescription: parsed.prDescription || parsed.pr_description || '',
    }
  } catch {
    return null
  }
}

// ============================================================================
// BUDGET VALIDATION
// ============================================================================

export interface UsageInfo {
  inputTokens: number
  outputTokens: number
  costUSD: number
}

/**
 * Check if usage exceeds budget
 */
export function checkBudget(
  usage: UsageInfo,
  config: ResolvedAstridConfig,
  totalCostSoFar: number = 0
): { exceeded: boolean; message?: string } {
  const totalCost = totalCostSoFar + usage.costUSD

  if (totalCost > config.safety.maxBudgetPerTask) {
    return {
      exceeded: true,
      message: `Budget exceeded: $${totalCost.toFixed(4)} > $${config.safety.maxBudgetPerTask}`,
    }
  }

  if (usage.costUSD > config.safety.maxCostPerCall) {
    return {
      exceeded: true,
      message: `Single call cost exceeded: $${usage.costUSD.toFixed(4)} > $${config.safety.maxCostPerCall}`,
    }
  }

  return { exceeded: false }
}
