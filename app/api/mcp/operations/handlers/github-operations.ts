/**
 * GitHub repository operations for MCP API
 */

import { prisma } from "@/lib/prisma"
import { getErrorMessage, getErrorStack } from "@/lib/error-utils"
import { validateMCPToken } from "./shared"

/**
 * Find the appropriate user for GitHub operations
 * If the authenticated user is an AI agent, find the human user who should provide GitHub access
 */
export async function getGitHubUserForRepository(
  authenticatedUserId: string,
  repository: string
): Promise<string> {
  console.log(`[MCP] getGitHubUserForRepository called:`, {
    authenticatedUserId,
    repository
  })

  // Check if authenticated user is an AI agent
  const authenticatedUser = await prisma.user.findUnique({
    where: { id: authenticatedUserId },
    select: { isAIAgent: true, aiAgentType: true }
  })

  console.log(`[MCP] Authenticated user check:`, {
    isAIAgent: authenticatedUser?.isAIAgent,
    aiAgentType: authenticatedUser?.aiAgentType
  })

  // If not an AI agent, use the authenticated user's GitHub integration
  if (!authenticatedUser?.isAIAgent) {
    console.log(`[MCP] User is not an AI agent, using authenticated user ID: ${authenticatedUserId}`)
    return authenticatedUserId
  }

  // For AI agents: Find the human user who configured the AI agent for lists using this repository
  const listWithRepo = await prisma.taskList.findFirst({
    where: {
      githubRepositoryId: repository,
      aiAgentConfiguredBy: { not: null }
    },
    select: {
      aiAgentConfiguredBy: true,
      owner: { select: { id: true } }
    }
  })

  console.log(`[MCP] List with repository check:`, {
    found: !!listWithRepo,
    aiAgentConfiguredBy: listWithRepo?.aiAgentConfiguredBy,
    ownerId: listWithRepo?.owner?.id
  })

  if (listWithRepo?.aiAgentConfiguredBy) {
    console.log(`[MCP] Using GitHub integration from user who configured AI agent: ${listWithRepo.aiAgentConfiguredBy}`)
    return listWithRepo.aiAgentConfiguredBy
  }

  // Fallback: use list owner
  if (listWithRepo?.owner?.id) {
    console.log(`[MCP] Using GitHub integration from list owner: ${listWithRepo.owner.id}`)
    return listWithRepo.owner.id
  }

  // Last fallback: try to find any user with GitHub integration for this repository
  // Note: repositories is stored as JSON array, need to search within it
  const allIntegrations = await prisma.gitHubIntegration.findMany({
    select: { userId: true, repositories: true }
  })

  console.log(`[MCP] Checking ${allIntegrations.length} GitHub integrations for repository access`)

  const integration = allIntegrations.find(int => {
    const repos = int.repositories as any[]
    return repos?.some(repo => repo.fullName === repository)
  })

  if (integration) {
    console.log(`[MCP] Using GitHub integration from user with repository access: ${integration.userId}`)
    return integration.userId
  }

  // If all else fails, return the authenticated user ID (will likely fail with helpful error)
  console.warn(`[MCP] Could not find appropriate GitHub user for repository ${repository}, using authenticated user: ${authenticatedUserId}`)
  console.warn(`[MCP] This will likely fail when trying to access GitHub. Check:`)
  console.warn(`[MCP] 1. List has githubRepositoryId set to: ${repository}`)
  console.warn(`[MCP] 2. List has aiAgentConfiguredBy set to a valid user ID`)
  console.warn(`[MCP] 3. That user has GitHub integration configured`)
  return authenticatedUserId
}

export async function getRepositoryFile(
  accessToken: string,
  repository: string,
  path: string,
  ref: string | undefined,
  userId: string
) {
  const mcpToken = await validateMCPToken(accessToken)

  // Import GitHubClient
  const { GitHubClient } = await import('@/lib/github-client')

  try {
    // Find the appropriate user for GitHub operations (handles AI agents)
    const githubUserId = await getGitHubUserForRepository(userId, repository)

    // Create GitHub client for the appropriate user
    const githubClient = await GitHubClient.forUser(githubUserId)

    // Get file contents
    const content = await githubClient.getFile(repository, path, ref)

    return {
      success: true,
      repository,
      path,
      content,
      ref: ref || 'default'
    }
  } catch (error: unknown) {
    console.error(`[MCP] Failed to get repository file ${repository}/${path}:`, error)

    // Check if it's a GitHub integration issue
    const errorMsg = getErrorMessage(error)
    if (errorMsg.includes('No GitHub integration found')) {
      throw new Error(`GitHub integration not configured. Please connect your GitHub account in Settings -> Coding Integration.`)
    }

    throw new Error(`Failed to read file ${path} from ${repository}: ${errorMsg}`)
  }
}

export async function listRepositoryFiles(
  accessToken: string,
  repository: string,
  path: string | undefined,
  ref: string | undefined,
  userId: string
) {
  const mcpToken = await validateMCPToken(accessToken)

  // Import GitHubClient
  const { GitHubClient } = await import('@/lib/github-client')

  try {
    const githubUserId = await getGitHubUserForRepository(userId, repository)
    const githubClient = await GitHubClient.forUser(githubUserId)

    // List files in directory
    const files = await githubClient.listFiles(repository, path || '', ref)

    return {
      success: true,
      repository,
      path: path || '/',
      files,
      ref: ref || 'default'
    }
  } catch (error: unknown) {
    console.error(`[MCP] Failed to list repository files ${repository}/${path}:`, error)

    // Check if it's a GitHub integration issue
    if (getErrorMessage(error).includes('No GitHub integration found')) {
      throw new Error(`GitHub integration not configured. Please connect your GitHub account in Settings -> Coding Integration.`)
    }

    throw new Error(`Failed to list files in ${path || '/'} from ${repository}: ${getErrorMessage(error)}`)
  }
}

export async function createBranch(
  accessToken: string,
  repository: string,
  baseBranch: string,
  newBranch: string,
  userId: string
) {
  const mcpToken = await validateMCPToken(accessToken)

  // Import GitHubClient
  const { GitHubClient } = await import('@/lib/github-client')

  try {
    // Create GitHub client for the user
    const githubUserId = await getGitHubUserForRepository(userId, repository)
    const githubClient = await GitHubClient.forUser(githubUserId)

    // Create the branch
    await githubClient.createBranch(repository, baseBranch, newBranch)

    return {
      success: true,
      repository,
      baseBranch,
      newBranch,
      message: `Branch ${newBranch} created successfully from ${baseBranch}`
    }
  } catch (error: unknown) {
    console.error(`[MCP] Failed to create branch ${newBranch} in ${repository}:`, error)

    if (getErrorMessage(error).includes('No GitHub integration found')) {
      throw new Error(`GitHub integration not configured. Please connect your GitHub account in Settings -> Coding Integration.`)
    }

    throw new Error(`Failed to create branch ${newBranch}: ${getErrorMessage(error)}`)
  }
}

export async function commitChanges(
  accessToken: string,
  repository: string,
  branch: string,
  changes: Array<{ path: string; content: string; mode?: 'create' | 'update' | 'delete' }>,
  commitMessage: string,
  userId: string
) {
  const mcpToken = await validateMCPToken(accessToken)

  // Import GitHubClient
  const { GitHubClient } = await import('@/lib/github-client')

  try {
    // Create GitHub client for the user
    const githubUserId = await getGitHubUserForRepository(userId, repository)
    const githubClient = await GitHubClient.forUser(githubUserId)

    // Commit the changes
    const commitInfo = await githubClient.commitChanges(repository, branch, changes, commitMessage)

    return {
      success: true,
      repository,
      branch,
      commitSha: commitInfo.sha,
      commitUrl: commitInfo.url,
      message: `Committed ${changes.length} file(s) to ${branch}`
    }
  } catch (error: unknown) {
    console.error(`[MCP] Failed to commit changes to ${repository}/${branch}:`, error)

    if (getErrorMessage(error).includes('No GitHub integration found')) {
      throw new Error(`GitHub integration not configured. Please connect your GitHub account in Settings -> Coding Integration.`)
    }

    throw new Error(`Failed to commit changes to ${branch}: ${getErrorMessage(error)}`)
  }
}

export async function createPullRequest(
  accessToken: string,
  repository: string,
  headBranch: string,
  baseBranch: string,
  title: string,
  body: string,
  userId: string
) {
  const mcpToken = await validateMCPToken(accessToken)

  // Import GitHubClient
  const { GitHubClient } = await import('@/lib/github-client')

  try {
    console.log(`[MCP] Creating pull request:`, {
      repository,
      headBranch,
      baseBranch,
      title: title?.substring(0, 50),
      userId
    })

    // Create GitHub client for the user
    const githubUserId = await getGitHubUserForRepository(userId, repository)
    console.log(`[MCP] Using GitHub integration from user: ${githubUserId}`)

    const githubClient = await GitHubClient.forUser(githubUserId)

    // Create the pull request
    const prInfo = await githubClient.createPullRequest(repository, headBranch, baseBranch, title, body)

    console.log(`[MCP] Pull request created successfully: #${prInfo.number}`)

    return {
      success: true,
      repository,
      pullRequest: {
        number: prInfo.number,
        url: prInfo.htmlUrl,
        title: prInfo.title,
        headBranch: prInfo.head.ref,
        baseBranch: prInfo.base.ref
      },
      message: `Pull request #${prInfo.number} created successfully`
    }
  } catch (error: unknown) {
    console.error(`[MCP] Failed to create pull request in ${repository}:`, error)
    console.error(`   Head branch: ${headBranch}`)
    console.error(`   Base branch: ${baseBranch}`)
    console.error(`   User ID: ${userId}`)
    console.error(`   Error stack:`, getErrorStack(error))

    if (getErrorMessage(error).includes('No GitHub integration found')) {
      throw new Error(`GitHub integration not configured. Please connect your GitHub account in Settings -> Coding Integration.`)
    }

    // Preserve the detailed error message from GitHubClient
    throw new Error(getErrorMessage(error) || `Failed to create pull request`)
  }
}

export async function mergePullRequest(
  accessToken: string,
  repository: string,
  prNumber: number,
  mergeMethod: 'merge' | 'squash' | 'rebase' = 'squash',
  userId: string
) {
  const mcpToken = await validateMCPToken(accessToken)

  // Import GitHubClient
  const { GitHubClient } = await import('@/lib/github-client')

  try {
    // Create GitHub client for the user
    const githubUserId = await getGitHubUserForRepository(userId, repository)
    const githubClient = await GitHubClient.forUser(githubUserId)

    // Merge the pull request
    await githubClient.mergePullRequest(repository, prNumber, mergeMethod)

    return {
      success: true,
      repository,
      prNumber,
      mergeMethod,
      message: `Pull request #${prNumber} merged successfully using ${mergeMethod} method`
    }
  } catch (error: unknown) {
    console.error(`[MCP] Failed to merge pull request #${prNumber} in ${repository}:`, error)

    if (getErrorMessage(error).includes('No GitHub integration found')) {
      throw new Error(`GitHub integration not configured. Please connect your GitHub account in Settings -> Coding Integration.`)
    }

    throw new Error(`Failed to merge pull request #${prNumber}: ${getErrorMessage(error)}`)
  }
}

export async function addPullRequestComment(
  accessToken: string,
  repository: string,
  prNumber: number,
  comment: string,
  userId: string
) {
  const mcpToken = await validateMCPToken(accessToken)

  // Import GitHubClient
  const { GitHubClient } = await import('@/lib/github-client')

  try {
    // Create GitHub client for the user
    const githubUserId = await getGitHubUserForRepository(userId, repository)
    const githubClient = await GitHubClient.forUser(githubUserId)

    // Add the comment
    await githubClient.addPullRequestComment(repository, prNumber, comment)

    return {
      success: true,
      repository,
      prNumber,
      message: `Comment added to pull request #${prNumber} successfully`
    }
  } catch (error: unknown) {
    console.error(`[MCP] Failed to add comment to pull request #${prNumber} in ${repository}:`, error)

    if (getErrorMessage(error).includes('No GitHub integration found')) {
      throw new Error(`GitHub integration not configured. Please connect your GitHub account in Settings -> Coding Integration.`)
    }

    throw new Error(`Failed to add comment to pull request #${prNumber}: ${getErrorMessage(error)}`)
  }
}

export async function getPullRequestComments(
  accessToken: string,
  repository: string,
  prNumber: number,
  userId: string
) {
  const mcpToken = await validateMCPToken(accessToken)

  // Import GitHubClient
  const { GitHubClient } = await import('@/lib/github-client')

  try {
    // Create GitHub client for the user
    const githubUserId = await getGitHubUserForRepository(userId, repository)
    const githubClient = await GitHubClient.forUser(githubUserId)

    if (!githubClient) {
      throw new Error('Failed to initialize GitHub client')
    }

    // Get PR comments
    const comments = await githubClient.getPullRequestComments(repository, prNumber)

    return {
      success: true,
      repository,
      prNumber,
      comments: comments.map(c => ({
        id: c.id,
        user: c.user.login,
        userType: c.user.type,
        body: c.body,
        createdAt: c.created_at,
        updatedAt: c.updated_at
      }))
    }
  } catch (error: unknown) {
    console.error(`[MCP] Failed to get comments from PR #${prNumber} in ${repository}:`, error)

    if (getErrorMessage(error).includes('No GitHub integration found')) {
      throw new Error(`GitHub integration not configured. Please connect your GitHub account in Settings -> Coding Integration.`)
    }

    throw new Error(`Failed to get PR comments #${prNumber}: ${getErrorMessage(error)}`)
  }
}

export async function getRepositoryInfo(
  accessToken: string,
  repository: string,
  userId: string
) {
  const mcpToken = await validateMCPToken(accessToken)

  // Import GitHubClient
  const { GitHubClient } = await import('@/lib/github-client')

  try {
    // Create GitHub client for the user
    const githubUserId = await getGitHubUserForRepository(userId, repository)
    const githubClient = await GitHubClient.forUser(githubUserId)

    // Get repository info
    const repoInfo = await githubClient.getRepository(repository)

    return {
      success: true,
      repository: repoInfo
    }
  } catch (error: unknown) {
    console.error(`[MCP] Failed to get repository info for ${repository}:`, error)

    if (getErrorMessage(error).includes('No GitHub integration found')) {
      throw new Error(`GitHub integration not configured. Please connect your GitHub account in Settings -> Coding Integration.`)
    }

    throw new Error(`Failed to get repository info: ${getErrorMessage(error)}`)
  }
}
