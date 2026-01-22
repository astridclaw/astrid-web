/**
 * Repository Context Loader
 *
 * Handles loading repository context files (ASTRID.md, CLAUDE.md, ARCHITECTURE.md)
 * and generating repository structure trees.
 *
 * When no ASTRID.md is found, applies default coding workflow instructions.
 * Users can override by creating their own ASTRID.md in their repository.
 */

import { buildFileTree, renderFileTree } from './file-path-utils'
import { DEFAULT_CODING_WORKFLOW } from './prompts'
import type { RepositoryContextLogger } from './types/logger'

// Re-export for backward compatibility
export type { RepositoryContextLogger }

/**
 * GitHub client interface for repository context operations
 */
export interface RepositoryContextGitHubClient {
  getFile(repository: string, path: string, ref?: string): Promise<string>
  listFiles(repository: string, path: string, ref?: string): Promise<Array<{ path: string; type: string }>>
}

/**
 * Dependencies for repository context loading
 */
export interface RepositoryContextDependencies {
  repositoryId: string
  userId: string
  logger?: RepositoryContextLogger
}

/**
 * Result of loading ASTRID.md or CLAUDE.md
 */
export interface GuidelinesResult {
  content: string
  source: 'ASTRID.md' | 'CLAUDE.md' | 'default' | null
}

/**
 * Load ASTRID.md or CLAUDE.md from repository
 * Returns content and source file name
 */
export async function loadRepositoryGuidelines(
  deps: RepositoryContextDependencies,
  getGitHubClient: (userId: string) => Promise<RepositoryContextGitHubClient>
): Promise<GuidelinesResult> {
  const { repositoryId, userId, logger } = deps

  if (!repositoryId) {
    logger?.('info', 'No repository ID, skipping guidelines load')
    return { content: '', source: null }
  }

  try {
    const githubClient = await getGitHubClient(userId)

    // Try ASTRID.md first
    try {
      const content = await githubClient.getFile(repositoryId, 'ASTRID.md')
      logger?.('info', 'Loaded ASTRID.md for progressive caching', {
        size: content.length,
        tokensEstimate: Math.ceil(content.length / 4)
      })
      return { content, source: 'ASTRID.md' }
    } catch (err) {
      // Try CLAUDE.md as fallback
      try {
        const content = await githubClient.getFile(repositoryId, 'CLAUDE.md')
        logger?.('info', 'Loaded CLAUDE.md for progressive caching', {
          size: content.length,
          tokensEstimate: Math.ceil(content.length / 4)
        })
        return { content, source: 'CLAUDE.md' }
      } catch (err2) {
        // No custom guidelines found - return default coding workflow
        logger?.('info', 'No ASTRID.md or CLAUDE.md found - using default coding workflow')
        return { content: DEFAULT_CODING_WORKFLOW, source: 'default' }
      }
    }
  } catch (error) {
    logger?.('error', 'Failed to load repository guidelines', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    return { content: '', source: null }
  }
}

/**
 * Load full repository context including guidelines and architecture docs
 */
export async function loadRepositoryContext(
  deps: RepositoryContextDependencies,
  getGitHubClient: (userId: string) => Promise<RepositoryContextGitHubClient>
): Promise<string> {
  const { repositoryId, userId, logger } = deps

  if (!repositoryId) {
    return ''
  }

  let context = ''

  try {
    const githubClient = await getGitHubClient(userId)

    // Try to read ASTRID.md
    try {
      const astridMd = await githubClient.getFile(repositoryId, 'ASTRID.md')
      context += `\n\n## 📋 Repository-Specific Instructions (ASTRID.md)\n\n${astridMd}\n`
      logger?.('info', 'Loaded ASTRID.md from repository', {
        size: astridMd.length
      })
    } catch (err) {
      // Try CLAUDE.md as fallback
      try {
        const claudeMd = await githubClient.getFile(repositoryId, 'CLAUDE.md')
        context += `\n\n## 📋 Repository-Specific Instructions (CLAUDE.md)\n\n${claudeMd}\n`
        logger?.('info', 'Loaded CLAUDE.md from repository', {
          size: claudeMd.length
        })
      } catch (err2) {
        // No custom guidelines - use default coding workflow
        context += `\n\n## 📋 Default Coding Workflow\n\n${DEFAULT_CODING_WORKFLOW}\n`
        logger?.('info', 'No ASTRID.md or CLAUDE.md found - using default coding workflow')
      }
    }

    // Try to read ARCHITECTURE.md
    try {
      const architectureMd = await githubClient.getFile(repositoryId, 'docs/ARCHITECTURE.md')
      // Only include first 5000 chars to avoid context bloat
      const preview = architectureMd.substring(0, 5000)
      context += `\n\n## 🏗️ Architecture Reference (Preview)\n\n${preview}${architectureMd.length > 5000 ? '\n\n_(Truncated for context - full file available in repository)_' : ''}\n`
      logger?.('info', 'Loaded ARCHITECTURE.md preview from repository')
    } catch (err) {
      logger?.('info', 'No ARCHITECTURE.md found (optional)')
    }

  } catch (error) {
    logger?.('error', 'Failed to load repository context', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }

  return context
}

/**
 * Generate repository structure tree string
 */
export async function loadRepositoryStructure(
  deps: RepositoryContextDependencies,
  getGitHubClient: (userId: string) => Promise<RepositoryContextGitHubClient>
): Promise<string> {
  const { repositoryId, userId, logger } = deps

  if (!repositoryId) {
    return ''
  }

  try {
    const githubClient = await getGitHubClient(userId)

    // Get top-level structure
    const files = await githubClient.listFiles(repositoryId, '', undefined)

    // Build simplified tree using extracted utilities
    const tree = buildFileTree(files)
    const treeString = renderFileTree(tree, 0, 3) // Max depth 3

    logger?.('info', 'Generated repository structure', {
      totalFiles: files.length
    })

    return `\n\n## 📁 Repository Structure\n\n\`\`\`\n${treeString}\n\`\`\`\n`

  } catch (err) {
    logger?.('warn', 'Failed to get repository structure', {
      error: err instanceof Error ? err.message : 'Unknown error'
    })
    return ''
  }
}
