/**
 * AI Orchestration Types
 * Shared type definitions for AI agent workflows
 */

export interface CodeGenerationRequest {
  taskTitle: string
  taskDescription: string
  repositoryContext?: string
  existingFiles?: string[]
  targetFramework?: string
}

export interface GeneratedCode {
  files: Array<{
    path: string
    content: string
    action: 'create' | 'modify' | 'delete'
  }>
  commitMessage: string
  prTitle: string
  prDescription: string
}

export interface ImplementationPlan {
  summary: string
  approach: string
  files: Array<{
    path: string
    purpose: string
    changes: string
    /** Set during validation if file is too large for complete content */
    requiresPartialContent?: boolean
    /** File size in bytes (set during validation) */
    fileSize?: number
    /** Estimated line count (set during validation) */
    estimatedLines?: number
  }>
  dependencies?: string[]
  estimatedComplexity: 'simple' | 'medium' | 'complex'
  considerations: string[]
  /** Files explored during planning phase */
  exploredFiles?: Array<{
    path: string
    content: string
    relevance: string
  }>
  /** Analysis summary for implementation phase */
  analysisNotes?: string
  /** Raw AI response from planning - preserved for error reporting */
  rawPlanningResponse?: string
}

/**
 * Planning context preserved between phases
 */
export interface PlanningContext {
  plan: ImplementationPlan
  exploredFiles: Array<{
    path: string
    content: string
    timestamp: number
  }>
  astridMdContent?: string
  timestamp: number
}

/**
 * Repository context cache entry
 */
export interface RepositoryContextCache {
  context: string
  structure: string
  timestamp: number
}
