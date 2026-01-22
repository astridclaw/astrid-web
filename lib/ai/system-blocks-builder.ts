/**
 * System Blocks Builder
 *
 * Builds progressive system blocks with caching for AI context.
 * Creates layered context that can be cached and reused across phases.
 */

import {
  PLANNING_CORE_INSTRUCTIONS,
  IMPLEMENTATION_CORE_INSTRUCTIONS,
  PLANNING_MODE_INSTRUCTIONS,
  IMPLEMENTATION_MODE_INSTRUCTIONS,
  formatRepositoryGuidelines,
} from './prompts'

/**
 * System block type for Claude API
 */
export interface SystemBlock {
  type: string
  text: string
  cache_control?: { type: string }
}

/**
 * Planning context passed from planning to implementation phase
 */
export interface PlanningContextData {
  plan?: {
    summary?: string
    approach?: string
    files?: Array<{ path: string; changes?: string }>
    estimatedComplexity?: string
    considerations?: string[]
  }
  exploredFiles?: Array<{
    path: string
    content: string
    relevance?: string
  }>
  astridMdContent?: string
}

/**
 * Build progressive system blocks with caching
 * Creates layered context that can be cached and reused across phases
 *
 * @param mode - 'planning' or 'implementation'
 * @param astridMdContent - Optional ASTRID.md content
 * @param planningContext - Optional planning context (for implementation phase)
 * @returns Array of system blocks for Claude API
 */
export function buildSystemBlocks(
  mode: 'planning' | 'implementation',
  astridMdContent?: string,
  planningContext?: PlanningContextData
): SystemBlock[] {
  const blocks: SystemBlock[] = []

  // LAYER 1: Core Instructions (ALWAYS cached, ~2k tokens)
  blocks.push({
    type: 'text',
    text: mode === 'planning' ? PLANNING_CORE_INSTRUCTIONS : IMPLEMENTATION_CORE_INSTRUCTIONS,
    cache_control: { type: 'ephemeral' }
  })

  // LAYER 2: ASTRID.md or default workflow (ALWAYS cached, ~8k tokens)
  if (astridMdContent) {
    blocks.push({
      type: 'text',
      text: formatRepositoryGuidelines(astridMdContent, 'ASTRID.md'),
      cache_control: { type: 'ephemeral' }
    })
  }

  // LAYER 3: Planning Context (only for implementation, ~5k tokens)
  if (mode === 'implementation' && planningContext) {
    blocks.push({
      type: 'text',
      text: buildPlanningInsights(planningContext),
      cache_control: { type: 'ephemeral' }
    })
  }

  // LAYER 4: Mode-Specific Instructions (NOT cached, ~500 tokens)
  blocks.push({
    type: 'text',
    text: mode === 'planning' ? PLANNING_MODE_INSTRUCTIONS : IMPLEMENTATION_MODE_INSTRUCTIONS
    // NO cache_control - this layer varies
  })

  return blocks
}

/**
 * Build planning insights summary from planning phase context
 * Synthesizes everything learned during planning into concise guidance
 *
 * CRITICAL: Does NOT include full file content - it causes AI to mimic and exceed token limits
 * Instead, just lists file paths and sizes
 */
export function buildPlanningInsights(planningContext: PlanningContextData): string {
  const plan = planningContext?.plan
  const exploredFiles = planningContext?.exploredFiles || []

  const exploredFilesSummary = exploredFiles
    .map((f) => `- ${f.path}: ${f.relevance || 'Analyzed during planning'}`)
    .join('\n')

  // CRITICAL: Do NOT include full file content - it causes AI to mimic and exceed token limits
  // Instead, just list file paths and sizes
  const filesToModify = plan?.files
    ? exploredFiles
        .filter((f) => plan.files!.some((pf) => pf.path === f.path))
        .map((f) => {
          const sizeKB = Math.round(f.content.length / 1024)
          return `- \`${f.path}\` (${sizeKB}KB) - ${plan.files!.find((pf) => pf.path === f.path)?.changes || 'modify'}`
        })
        .join('\n')
    : exploredFiles
        .map((f) => {
          const sizeKB = Math.round(f.content.length / 1024)
          return `- \`${f.path}\` (${sizeKB}KB) - modify`
        })
        .join('\n')

  const planSummary = plan ? JSON.stringify({
    summary: plan.summary || 'No summary available',
    approach: plan.approach || 'No approach available',
    files: plan.files || [],
    complexity: plan.estimatedComplexity || 'unknown',
    considerations: plan.considerations || []
  }, null, 2) : 'No plan available - files loaded directly for implementation'

  const constraints = plan?.considerations
    ? plan.considerations.map((c) => `- ${c}`).join('\n')
    : '- Follow existing code patterns'

  return `## 📊 PLANNING PHASE INSIGHTS

### Approved Implementation Plan:
${planSummary}

### Files Explored During Planning:
${exploredFilesSummary || 'Files loaded directly for implementation'}

### Files to Modify:
${filesToModify || 'See explored files above'}

### Key Constraints:
${constraints}

**IMPORTANT**:
- For files >60KB (~1500 lines), you MUST use partial updates (isPartial: true) with only the changed sections
- Follow the patterns observed during planning
- Maintain existing code style and conventions`
}
