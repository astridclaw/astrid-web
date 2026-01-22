/**
 * Workflow Comment Formatting Utilities
 *
 * Pure functions for formatting AI workflow comments.
 * Used by the AI Orchestrator to post structured updates to tasks.
 */

import type { ImplementationPlan } from './types'

/**
 * Format a status comment for posting to a task.
 */
export function formatStatusComment(title: string, message: string): string {
  return `${title}\n\n${message}`
}

/**
 * Get estimated time based on complexity.
 */
export function getEstimatedTime(complexity: 'simple' | 'medium' | 'complex'): string {
  switch (complexity) {
    case 'simple': return '10-15 minutes'
    case 'medium': return '20-30 minutes'
    case 'complex': return '30-45 minutes'
  }
}

/**
 * Format a plan comment for posting to a task.
 */
export function formatPlanComment(plan: ImplementationPlan): string {
  const estimatedTime = getEstimatedTime(plan.estimatedComplexity)

  const filesSection = plan.files.map(file => `- \`${file.path}\`: ${file.purpose}`).join('\n')

  const dependenciesSection = plan.dependencies && plan.dependencies.length > 0
    ? `## 📦 Dependencies\n${plan.dependencies.map(dep => `- ${dep}`).join('\n')}\n\n`
    : ''

  const considerationsSection = plan.considerations.length > 0
    ? `**Considerations:** ${plan.considerations.join(', ')}\n\n`
    : ''

  return `📋 **Plan Created - Starting Implementation**

## 🎯 What I'll Do
${plan.summary}

${plan.approach}

## 📁 Files to Modify
${filesSection}

${dependenciesSection}**Complexity:** ${plan.estimatedComplexity} (~${estimatedTime})

${considerationsSection}Starting implementation now. Will update when ready for testing.`
}

/**
 * Format a plan summary for MCP posting.
 */
export function formatPlanSummary(plan: ImplementationPlan): string {
  const estimatedTime = getEstimatedTime(plan.estimatedComplexity)
  const filePaths = plan.files.map(f => f.path).join(', ')

  return `Fix plan: ${plan.approach}

Files to modify: ${filePaths}

Complexity: ${plan.estimatedComplexity}
Estimated time: ${estimatedTime}`
}

/**
 * Implementation details for comment formatting.
 */
export interface ImplementationDetails {
  branchName: string
  prNumber: number
  prUrl: string
  repository: string
  deploymentUrl?: string
  deploymentState?: string
  checksStatus?: string
  checksSummary?: string
}

/**
 * Format an implementation complete comment for posting to a task.
 */
export function formatImplementationComment(details: ImplementationDetails): string {
  const deploymentStatus = details.deploymentUrl
    ? details.deploymentState === 'READY'
      ? '✅ Ready'
      : '🔄 Building'
    : ''

  const previewLine = details.deploymentUrl
    ? `- **Preview**: [${details.deploymentUrl}](${details.deploymentUrl}) ${deploymentStatus}`
    : ''

  // Show different instructions based on whether a preview URL is available
  const testingInstructions = details.deploymentUrl
    ? 'Test the preview link and reply **"ship it"** when ready to deploy.'
    : 'Test the changes in the PR and reply **"ship it"** when ready to deploy.'

  return `✅ **Implementation Complete - Ready for Testing**

## 📋 Summary
- **PR**: [#${details.prNumber}](${details.prUrl})
- **Branch**: \`${details.branchName}\`
${previewLine}

${details.checksSummary || '⏳ Checks running'}

${testingInstructions}`
}

/**
 * Format an implementation completion summary for MCP posting.
 */
export function formatCompletionSummary(details: ImplementationDetails): string {
  const stagingLine = details.deploymentUrl
    ? `Staging: ${details.deploymentUrl}`
    : 'No deployment URL'

  return `Fix completed and committed

## Changes Summary
- Repository: ${details.repository}
- Branch: ${details.branchName}
- Pull Request: #${details.prNumber}
- ${stagingLine}

## Quality Gates Passed
- TypeScript compilation successful
- ESLint checks passed
- Regression tests created and passing
- Code follows established patterns

Ready for single approval point review.`
}

/**
 * Parse workflow steps from ASTRID.md content.
 *
 * @param astridMdContent - The content of ASTRID.md
 * @param logger - Optional logger function for debugging
 * @returns Array of workflow step strings
 */
export function parseWorkflowSteps(
  astridMdContent: string,
  logger?: (level: 'info' | 'warn', message: string, meta?: any) => void
): string[] {
  const steps: string[] = []

  // Look for the "Workflow Overview" section
  const workflowMatch = astridMdContent.match(
    /When you start a task, you will follow these steps:\s*\n+([\s\S]*?)(?:\n\n|\*\*This workflow)/i
  )

  if (workflowMatch) {
    const workflowSection = workflowMatch[1]
    const lines = workflowSection.split('\n')

    logger?.('info', 'Parsing workflow steps', {
      sectionLength: workflowSection.length,
      lineCount: lines.length
    })

    for (const line of lines) {
      // Match: 1. **📊 Analysis** - Explore codebase
      const stepMatch = line.match(/^\d+\.\s+\*\*(.+?)\*\*\s+-\s+(.+)/)
      if (stepMatch) {
        const [, emoji, description] = stepMatch
        steps.push(`${emoji.trim()} - ${description.trim()}`)
      }
    }
  } else {
    logger?.('warn', 'Could not find workflow section in ASTRID.md', {
      contentLength: astridMdContent.length,
      hasWorkflowText: astridMdContent.includes('When you start a task')
    })
  }

  return steps
}

/**
 * Default workflow steps when ASTRID.md is not available.
 */
export const DEFAULT_WORKFLOW_STEPS = [
  '📊 Analysis - Explore codebase, understand requirements',
  '📝 Planning - Create implementation plan, get your approval',
  '🌿 Branch - Create feature branch from main',
  '⚙️ Implement - Generate code following project patterns',
  '✅ Quality Gates - Wait for TypeScript, ESLint, Tests to pass',
  '🔀 Pull Request - Create PR with comprehensive description',
  '🚀 Deploy - Share Vercel preview link for testing',
  '👀 Review - You test and approve ("ship it")'
]

/**
 * Minimal default workflow steps when even repository access fails.
 */
export const MINIMAL_WORKFLOW_STEPS = [
  '📊 Analysis',
  '📝 Planning',
  '⚙️ Implementation',
  '✅ Quality Gates',
  '🚀 Deployment'
]

/**
 * Format a staging URL ready comment for posting to a task.
 * This is posted as a follow-up after the initial implementation comment
 * when the Vercel deployment becomes ready.
 */
export function formatStagingUrlComment(deploymentUrl: string): string {
  return `🚀 **Staging Deployment Ready**

Your preview deployment is now live and ready for testing:

**Preview URL**: [${deploymentUrl}](${deploymentUrl})

Please test the changes on the staging environment and reply **"ship it"** when ready to deploy to production.`
}

/**
 * Context for preview comment template substitution.
 */
export interface PreviewCommentContext {
  previewUrl: string
  branch?: string
  prNumber?: number
  iosTestflightLink?: string
  iosBuildStatus?: string
}

/**
 * Format a preview comment with optional custom template.
 * Supports variable substitution: ${previewUrl}, ${branch}, ${prNumber}, ${iosLink}, ${iosBuildStatus}
 */
export function formatPreviewComment(
  context: PreviewCommentContext,
  customTemplate?: string
): string {
  if (customTemplate) {
    // Replace template variables
    return customTemplate
      .replace(/\$\{previewUrl\}/g, context.previewUrl)
      .replace(/\$\{branch\}/g, context.branch || '')
      .replace(/\$\{prNumber\}/g, String(context.prNumber || ''))
      .replace(/\$\{iosLink\}/g, context.iosTestflightLink || '')
      .replace(/\$\{iosBuildStatus\}/g, context.iosBuildStatus || '')
      // Handle escaped newlines in JSON config
      .replace(/\\n/g, '\n')
  }

  // Default template - prominently feature preview URL
  let comment = `🚀 **Preview Ready for Testing**

**Preview URL:** [${context.previewUrl}](${context.previewUrl})`

  if (context.branch) {
    comment += `\n**Branch:** \`${context.branch}\``
  }

  if (context.prNumber) {
    comment += `\n**PR:** #${context.prNumber}`
  }

  if (context.iosTestflightLink) {
    comment += `\n\n📱 **iOS TestFlight:** [${context.iosTestflightLink}](${context.iosTestflightLink})`
    if (context.iosBuildStatus) {
      comment += ` (${context.iosBuildStatus})`
    }
  }

  comment += `

---
**Please test the preview** and reply:
- **"approve"** to approve the plan (if approval required)
- **"ship it"** to deploy to production`

  return comment
}
