/**
 * GitHub Workflow Service
 *
 * Handles GitHub-related workflow operations:
 * - Branch creation
 * - Committing changes
 * - Creating PRs
 * - Vercel deployment
 * - Waiting for checks
 */

import { prisma } from '@/lib/prisma'
import type { GeneratedCode } from './types'
import type { ImplementationDetails } from './workflow-comments'
import type { ResolvedPreviewConfig } from './config/schema'
import type { WorkflowLogger } from './types/logger'

// Re-export for backward compatibility
export type { WorkflowLogger }

/**
 * Comment poster callback for status updates
 */
export type CommentPoster = (taskId: string, title: string, message: string) => Promise<void>

/**
 * Implementation comment poster callback
 */
export type ImplementationCommentPoster = (taskId: string, details: ImplementationDetails) => Promise<void>

/**
 * Dependencies required by GitHubWorkflowService
 */
export interface GitHubWorkflowDependencies {
  userId: string
  logger: WorkflowLogger
  postStatusComment: CommentPoster
  postImplementationComment: ImplementationCommentPoster
  /** Preview configuration from .astrid.config.json */
  previewConfig?: ResolvedPreviewConfig
}

/**
 * Result of creating a GitHub implementation
 */
export interface GitHubImplementationResult {
  branchName: string
  prNumber: number
  prUrl: string
  repository: string
  commitSha: string
  deploymentUrl?: string
  deploymentState?: string
  checksStatus: string
  checksSummary: string
}

/**
 * Generate a branch name from a task title
 */
export function generateBranchName(taskTitle: string): string {
  return `astrid-code-assistant/${Date.now()}-${taskTitle
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 30)}`
}

/**
 * Resolve target repository from task with list information
 */
export async function resolveTargetRepository(
  taskWithList: any,
  logger?: WorkflowLogger
): Promise<string> {
  // Priority 1: Find first list that has a GitHub repository configured
  if (taskWithList.lists && Array.isArray(taskWithList.lists)) {
    const listWithRepo = taskWithList.lists.find((list: any) => list.githubRepositoryId)
    if (listWithRepo?.githubRepositoryId) {
      logger?.('info', 'Using first list with configured repository', {
        repository: listWithRepo.githubRepositoryId,
        listName: listWithRepo.name
      })
      return listWithRepo.githubRepositoryId
    }
  }

  // Priority 2: User's first connected repository (fallback)
  const firstIntegration = taskWithList.creator?.githubIntegrations?.[0]
  const userRepos = firstIntegration?.repositories as any[] | undefined
  if (userRepos && userRepos.length > 0) {
    const firstRepo = userRepos[0]?.fullName
    if (firstRepo) {
      logger?.('info', 'Using first repository from GitHub integration', {
        repository: firstRepo
      })
      return firstRepo
    }
  }

  throw new Error(
    `No target repository found for task.\n\n` +
    `None of the task's lists have a GitHub repository configured, ` +
    `and the task creator has no GitHub repositories connected.\n\n` +
    `Please configure a GitHub repository in at least one of the task's list settings or ` +
    `connect a GitHub repository to your account.\n\n` +
    `The AI agent needs a target repository to create branches and pull requests.`
  )
}

/**
 * Wait for GitHub checks to complete on a commit
 */
export async function waitForGitHubChecks(
  githubClient: any,
  repository: string,
  commitSha: string,
  timeout: number = 180000 // 3 minutes default
): Promise<{ conclusion: string; summary: string; totalChecks: number; passedChecks: number }> {
  const startTime = Date.now()
  const [owner, repo] = repository.split('/')

  while (Date.now() - startTime < timeout) {
    try {
      // Get check runs for this commit
      const checks = await githubClient.octokit.checks.listForRef({
        owner,
        repo,
        ref: commitSha
      })

      if (checks.data.total_count === 0) {
        // No checks have started yet, wait a bit
        await new Promise(resolve => setTimeout(resolve, 5000))
        continue
      }

      // Count completed checks
      const allChecks = checks.data.check_runs
      const completedChecks = allChecks.filter((c: any) => c.status === 'completed')

      if (completedChecks.length === allChecks.length) {
        // All checks completed
        const failedChecks = completedChecks.filter((c: any) => c.conclusion === 'failure')
        const conclusion = failedChecks.length === 0 ? 'success' : 'failure'

        const summary = allChecks.map((c: any) => {
          const emoji = c.conclusion === 'success' ? '✅' : c.conclusion === 'failure' ? '❌' : '⏳'
          return `${emoji} ${c.name}: ${c.conclusion || c.status}`
        }).join('\n')

        return {
          conclusion,
          summary: `## GitHub Checks\n${summary}`,
          totalChecks: allChecks.length,
          passedChecks: allChecks.length - failedChecks.length
        }
      }

      // Still running, wait a bit
      await new Promise(resolve => setTimeout(resolve, 10000)) // Check every 10 seconds
    } catch (error) {
      // API error, wait and retry
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
  }

  // Timeout reached
  return {
    conclusion: 'pending',
    summary: '⏳ Checks are still running (timeout reached)',
    totalChecks: 0,
    passedChecks: 0
  }
}

/**
 * Monitor Vercel deployment in the background and post staging URL when ready
 */
async function monitorDeploymentAndPostUrl(
  deploymentId: string,
  taskId: string,
  logger: WorkflowLogger,
  previewConfig?: ResolvedPreviewConfig,
  context?: { branch?: string; prNumber?: number }
): Promise<void> {
  try {
    const { VercelClient } = await import('../vercel-client')
    const { createAIAgentComment } = await import('../ai-agent-comment-service')
    const { formatPreviewComment, formatStagingUrlComment } = await import('./workflow-comments')

    const vercelClient = new VercelClient()

    // Use config values or defaults
    const pollingInterval = previewConfig?.pollingIntervalMs ?? 10000
    const maxWaitMs = previewConfig?.maxWaitMs ?? 360000 // 6 minutes default
    const maxAttempts = Math.ceil(maxWaitMs / pollingInterval)
    let attempts = 0

    logger('info', 'Starting background deployment monitoring', {
      deploymentId,
      taskId,
      pollingInterval,
      maxWaitMs,
      maxAttempts
    })

    while (attempts < maxAttempts) {
      attempts++

      // Wait before checking
      await new Promise(resolve => setTimeout(resolve, pollingInterval))

      try {
        const deployment = await vercelClient.getDeployment(deploymentId)

        if (!deployment) {
          logger('warn', 'Deployment not found during monitoring', { deploymentId })
          break
        }

        if (deployment.readyState === 'READY') {
          // Deployment is ready! Post the staging URL comment
          logger('info', 'Deployment ready, posting staging URL comment', {
            deploymentId,
            url: deployment.url,
            taskId
          })

          // Use custom template if configured, otherwise use default
          let commentContent: string
          if (previewConfig?.commentTemplate) {
            commentContent = formatPreviewComment(
              {
                previewUrl: deployment.url,
                branch: context?.branch,
                prNumber: context?.prNumber,
              },
              previewConfig.commentTemplate
            )
          } else {
            // Use default prominent preview comment
            commentContent = formatPreviewComment({
              previewUrl: deployment.url,
              branch: context?.branch,
              prNumber: context?.prNumber,
            })
          }

          const result = await createAIAgentComment(taskId, commentContent, 'MARKDOWN')

          if (result.success) {
            logger('info', 'Staging URL comment posted successfully', {
              taskId,
              commentId: result.comment?.id
            })
          } else {
            logger('error', 'Failed to post staging URL comment', {
              taskId,
              error: result.error
            })
          }

          break
        } else if (deployment.readyState === 'ERROR' || deployment.readyState === 'CANCELED') {
          logger('warn', 'Deployment failed or was canceled', {
            deploymentId,
            state: deployment.readyState
          })
          break
        }

        // Still building, continue monitoring
        logger('info', 'Deployment still building', {
          deploymentId,
          state: deployment.readyState,
          attempt: attempts,
          maxAttempts
        })
      } catch (error) {
        logger('error', 'Error checking deployment status', {
          deploymentId,
          attempt: attempts,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        // Continue monitoring despite errors
      }
    }

    if (attempts >= maxAttempts) {
      logger('warn', 'Deployment monitoring timeout reached', {
        deploymentId,
        taskId,
        duration: `${maxWaitMs / 1000} seconds`
      })
    }
  } catch (error) {
    logger('error', 'Fatal error in deployment monitoring', {
      deploymentId,
      taskId,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

/**
 * Create GitHub implementation (branch, commit, PR, deployment)
 */
export async function createGitHubImplementation(
  workflow: any,
  generatedCode: GeneratedCode,
  deps: GitHubWorkflowDependencies
): Promise<GitHubImplementationResult> {
  const { userId, logger, postStatusComment, postImplementationComment } = deps

  // Get task with list information for repository resolution
  const taskWithList = await prisma.task.findUnique({
    where: { id: workflow.taskId },
    include: {
      lists: {
        select: {
          githubRepositoryId: true,
          name: true
        }
      },
      creator: {
        select: {
          githubIntegrations: {
            select: {
              repositories: true
            }
          }
        }
      }
    }
  })

  if (!taskWithList) {
    throw new Error('Task not found for GitHub implementation')
  }

  // Resolve target repository
  const repository = await resolveTargetRepository(taskWithList, logger)

  // Get GitHub client
  const { GitHubClient } = await import('../github-client')
  const githubClient = await GitHubClient.forUser(userId)

  // Get repository info to determine the default branch
  const repoInfo = await githubClient.getRepository(repository)
  const defaultBranch = repoInfo.defaultBranch || 'main'
  logger('info', 'Repository default branch', { repository, defaultBranch })

  // Reuse existing branch or create new one
  let branchName = workflow.workingBranch

  if (!branchName) {
    branchName = generateBranchName(workflow.task.title)
    logger('info', 'Creating new branch for workflow', { branchName, baseBranch: defaultBranch })
    await githubClient.createBranch(repository, defaultBranch, branchName)

    // Store branch name in workflow
    await prisma.codingTaskWorkflow.update({
      where: { id: workflow.id },
      data: { workingBranch: branchName }
    })
  } else {
    logger('info', 'Reusing existing workflow branch', { branchName })
  }

  // Commit changes
  const commitInfo = await githubClient.commitChanges(
    repository,
    branchName,
    generatedCode.files.map(file => ({
      path: file.path,
      content: file.content,
      mode: file.action === 'create' ? 'create' : 'update'
    })),
    generatedCode.commitMessage
  )

  logger('info', 'Code committed to branch', {
    repository,
    branch: branchName,
    sha: commitInfo.sha,
    filesChanged: generatedCode.files.length
  })

  // Post status update
  await postStatusComment(
    workflow.taskId,
    '🔄 **Creating PR**',
    `Committed ${generatedCode.files.length} file${generatedCode.files.length === 1 ? '' : 's'} to \`${branchName}\`. Creating PR...`
  )

  // Create pull request
  const prInfo = await githubClient.createPullRequest(
    repository,
    branchName,
    defaultBranch,
    generatedCode.prTitle,
    generatedCode.prDescription
  )

  logger('info', 'Pull request created', {
    number: prInfo.number,
    url: prInfo.url
  })

  // Deploy to Vercel
  let vercelDeployment = null
  try {
    const { VercelClient } = await import('../vercel-client')
    const vercelClient = new VercelClient()
    const deploymentResult = await vercelClient.deployPRBranch(
      repository,
      branchName,
      commitInfo.sha
    )

    if (deploymentResult) {
      vercelDeployment = deploymentResult.deployment

      // Wait for deployment (with timeout)
      try {
        const readyDeployment = await vercelClient.waitForDeployment(
          vercelDeployment.id,
          120000 // 2 minutes
        )
        if (readyDeployment) {
          vercelDeployment = readyDeployment
        }
      } catch {
        // Continue with current deployment info
      }
    }
  } catch {
    // Continue without Vercel
  }

  // Wait for GitHub checks
  logger('info', 'Waiting for GitHub checks to complete')
  let checksStatus = 'pending'
  let checksSummary = ''

  try {
    const checkResult = await waitForGitHubChecks(
      githubClient,
      repository,
      commitInfo.sha,
      180000
    )
    checksStatus = checkResult.conclusion
    checksSummary = checkResult.summary
    logger('info', 'GitHub checks completed', {
      status: checksStatus,
      checksRun: checkResult.totalChecks,
      checksPassed: checkResult.passedChecks
    })
  } catch (checkError: any) {
    logger('warn', 'Could not verify GitHub checks', { error: checkError.message })
    checksSummary = '⏳ Checks are running - please monitor PR for results'
  }

  // Update workflow
  await prisma.codingTaskWorkflow.update({
    where: { id: workflow.id },
    data: {
      workingBranch: branchName,
      pullRequestNumber: prInfo.number,
      repositoryId: repository,
      status: checksStatus === 'success' ? 'TESTING' : 'FAILED',
      deploymentUrl: vercelDeployment?.url,
      metadata: {
        ...workflow.metadata as any,
        deploymentId: vercelDeployment?.id,
        deploymentState: vercelDeployment?.readyState,
        prCreatedAt: new Date().toISOString(),
        checksStatus,
        checksSummary
      }
    }
  })

  // Post implementation comment
  await postImplementationComment(workflow.task.id, {
    branchName,
    prNumber: prInfo.number,
    prUrl: prInfo.htmlUrl,
    repository,
    deploymentUrl: vercelDeployment?.url,
    deploymentState: vercelDeployment?.readyState,
    checksStatus,
    checksSummary
  })

  // Start background monitoring for deployment if it exists but is not yet READY
  if (vercelDeployment && vercelDeployment.readyState !== 'READY') {
    logger('info', 'Starting background monitoring for Vercel deployment', {
      deploymentId: vercelDeployment.id,
      currentState: vercelDeployment.readyState,
      taskId: workflow.task.id
    })

    // Run monitoring in the background (don't await)
    monitorDeploymentAndPostUrl(
      vercelDeployment.id,
      workflow.task.id,
      logger,
      deps.previewConfig,
      { branch: branchName, prNumber: prInfo.number }
    ).catch(error => {
      logger('error', 'Background deployment monitoring failed', {
        deploymentId: vercelDeployment.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    })
  } else if (vercelDeployment?.readyState === 'READY') {
    logger('info', 'Deployment already ready, no monitoring needed', {
      deploymentId: vercelDeployment.id,
      url: vercelDeployment.url
    })
  }

  return {
    branchName,
    prNumber: prInfo.number,
    prUrl: prInfo.htmlUrl,
    repository,
    commitSha: commitInfo.sha,
    deploymentUrl: vercelDeployment?.url,
    deploymentState: vercelDeployment?.readyState,
    checksStatus,
    checksSummary
  }
}
