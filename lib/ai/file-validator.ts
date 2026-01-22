/**
 * File Validator
 *
 * Validates and prepares files for code generation.
 * Handles plan deduplication, file size validation, and direct file loading.
 */

import { generateFilePathVariations } from './file-path-utils'
import type { ImplementationPlan } from './types'
import type { FileValidatorLogger } from './types/logger'

// Re-export for backward compatibility
export type { FileValidatorLogger }

/**
 * GitHub client interface for file validation
 */
export interface FileValidatorGitHubClient {
  getFile(repository: string, path: string, ref?: string): Promise<string>
}

/**
 * Dependencies for file validation
 */
export interface FileValidatorDependencies {
  repositoryId: string
  userId: string
  logger?: FileValidatorLogger
}

/**
 * Result of plan validation
 */
export interface PlanValidationResult {
  success: boolean
  plan: ImplementationPlan
  error?: string
}

/**
 * Explored file data
 */
export interface ExploredFile {
  path: string
  content: string
  relevance?: string
}

/**
 * Planning context with explored files
 */
export interface PlanningContextFiles {
  exploredFiles: ExploredFile[]
}

/**
 * File size limits for validation
 */
export const FILE_SIZE_LIMITS = {
  /** Maximum file size for modifications (60KB ~1500 lines) */
  MAX_MODIFICATION_SIZE: 60000,
  /** Maximum file size for direct loading (100KB) */
  MAX_DIRECT_LOAD_SIZE: 100000,
}

/**
 * Validate and deduplicate plan files before code generation
 * Auto-deduplicates files if AI listed them multiple times
 */
export function validateAndDeduplicatePlan(
  plan: ImplementationPlan,
  logger?: FileValidatorLogger
): PlanValidationResult {
  const uniquePaths = new Set(plan.files.map(f => f.path))
  const totalFiles = plan.files.length
  const uniqueFiles = uniquePaths.size

  // Auto-deduplicate files if AI listed them multiple times (merge changes)
  if (totalFiles > uniqueFiles) {
    const duplicates = plan.files.filter((file, index) =>
      plan.files.findIndex(f => f.path === file.path) !== index
    )

    logger?.('warn', 'Plan contains duplicate files - auto-deduplicating and merging changes', {
      totalFiles,
      uniqueFiles,
      duplicates: duplicates.map(d => d.path)
    })

    // Merge duplicate entries by combining their changes
    const deduplicatedFiles = Array.from(uniquePaths).map(path => {
      const filesForPath = plan.files.filter(f => f.path === path)

      // Merge all changes for this file path
      return {
        path,
        purpose: filesForPath.map(f => f.purpose).join(' + '),
        changes: filesForPath.map(f => f.changes).join('\n\n---\n\n')
      }
    })

    // Update the plan with deduplicated files
    plan.files = deduplicatedFiles

    logger?.('info', 'Files deduplicated successfully', {
      originalCount: totalFiles,
      deduplicatedCount: deduplicatedFiles.length,
      files: deduplicatedFiles.map(f => f.path)
    })
  }

  // Check for overly complex plans (too many files at once)
  if (uniqueFiles > 3) {
    logger?.('warn', 'Plan modifies many files - may cause JSON format issues', {
      fileCount: uniqueFiles,
      files: Array.from(uniquePaths)
    })
    return {
      success: false,
      plan,
      error: `Plan modifies ${uniqueFiles} files at once. This is too complex for a single implementation. ` +
        `Please break this into smaller tasks (1-3 files per task). ` +
        `Files in plan: ${Array.from(uniquePaths).join(', ')}`
    }
  }

  logger?.('info', 'Plan validation passed', {
    fileCount: uniqueFiles,
    files: Array.from(uniquePaths)
  })

  return { success: true, plan }
}

/**
 * Validate file sizes in the plan and mark large files for partial content
 */
export async function validateFileSizes(
  plan: ImplementationPlan,
  deps: FileValidatorDependencies,
  getGitHubClient: (userId: string) => Promise<FileValidatorGitHubClient>
): Promise<void> {
  const { repositoryId, userId, logger } = deps
  const maxFileSize = FILE_SIZE_LIMITS.MAX_MODIFICATION_SIZE

  logger?.('info', 'Validating file sizes for planned modifications', {
    maxFileSize,
    filesInPlan: plan.files.length
  })

  try {
    const githubClient = await getGitHubClient(userId)

    for (const file of plan.files) {
      if (!file.path) continue

      try {
        const pathVariations = generateFilePathVariations(file.path)
        let fileContent: string | null = null
        let successfulPath: string | null = null

        // Try to load the file to check its size
        for (const pathVariation of pathVariations) {
          try {
            fileContent = await githubClient.getFile(repositoryId, pathVariation)
            successfulPath = pathVariation
            break // Found the file
          } catch (e) {
            // Try next variation
            continue
          }
        }

        // If we found the file, check its size
        if (fileContent && successfulPath) {
          const estimatedLines = Math.round(fileContent.length / 40)
          if (fileContent.length > maxFileSize) {
            // WARN about large files but allow partial modifications
            logger?.('warn', 'Plan includes large file - will require partial content only', {
              path: file.path,
              actualPath: successfulPath,
              size: fileContent.length,
              maxSize: maxFileSize,
              estimatedLines,
              note: 'AI must use isPartial: true and only include changed functions'
            })
            // Mark this file as requiring partial content in the plan
            file.requiresPartialContent = true
            file.fileSize = fileContent.length
            file.estimatedLines = estimatedLines
          } else {
            logger?.('info', 'File size validated', {
              path: successfulPath,
              size: fileContent.length,
              estimatedLines
            })
          }
        } else {
          // File not found - might be a new file, which is OK
          logger?.('info', 'File not found during validation - assuming new file', {
            path: file.path
          })
        }
      } catch (error) {
        // If it's our size error, re-throw it
        if (error instanceof Error && error.message.includes('too large to modify')) {
          throw error
        }
        // Otherwise, log warning but continue - file might be new
        logger?.('warn', 'Could not validate file size', {
          path: file.path,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    logger?.('info', 'File size validation completed successfully')
  } catch (error) {
    // If it's our validation error, re-throw it
    if (error instanceof Error && error.message.includes('too large to modify')) {
      throw error
    }
    // Otherwise, log error but continue - validation is best-effort
    logger?.('error', 'File size validation failed', {
      error: error instanceof Error ? error.message : String(error)
    })
    // Don't block on validation failures - continue with implementation
  }
}

/**
 * Load files directly for implementation when planning context is incomplete
 * Only loads files under the size limit
 */
export async function loadFilesDirectly(
  plan: ImplementationPlan,
  planningContext: PlanningContextFiles | null,
  deps: FileValidatorDependencies,
  getGitHubClient: (userId: string) => Promise<FileValidatorGitHubClient>
): Promise<PlanningContextFiles> {
  const { repositoryId, userId, logger } = deps
  const maxFileSize = FILE_SIZE_LIMITS.MAX_DIRECT_LOAD_SIZE

  // Initialize context if needed
  if (!planningContext) {
    planningContext = { exploredFiles: [] }
  }

  // Skip if we already have explored files
  if (planningContext.exploredFiles && planningContext.exploredFiles.length > 0) {
    return planningContext
  }

  logger?.('warn', 'Planning context incomplete, attempting to load files directly (small files only)')

  try {
    const githubClient = await getGitHubClient(userId)

    // Try to load each file from the approved plan
    for (const file of plan.files) {
      if (file.path) {
        try {
          // Try with path variations
          const pathVariations = generateFilePathVariations(file.path)
          let fileContent: string | null = null
          let successfulPath: string | null = null

          for (const pathVariation of pathVariations) {
            try {
              fileContent = await githubClient.getFile(repositoryId, pathVariation)
              successfulPath = pathVariation

              // Check file size before including
              if (fileContent.length > maxFileSize) {
                logger?.('warn', 'File too large for direct loading, skipping', {
                  path: successfulPath,
                  size: fileContent.length,
                  maxSize: maxFileSize
                })
                fileContent = null
                successfulPath = null
                break // Stop trying variations for this file
              }

              logger?.('info', 'Successfully loaded file directly for implementation', {
                originalPath: file.path,
                successfulPath,
                size: fileContent.length
              })
              break // Success!
            } catch (error) {
              // Continue to next variation
            }
          }

          // Add to planning context if successful and within size limit
          if (fileContent && successfulPath) {
            planningContext.exploredFiles.push({
              path: successfulPath,
              content: fileContent,
              relevance: 'Loaded directly for implementation (small file)'
            })
          }
        } catch (error) {
          logger?.('warn', 'Failed to load file directly for implementation', {
            path: file.path,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
          // Continue with other files - partial context is better than none
        }
      }
    }

    if (planningContext.exploredFiles.length > 0) {
      logger?.('info', 'Successfully loaded files directly for implementation', {
        filesLoaded: planningContext.exploredFiles.length,
        totalSize: planningContext.exploredFiles.reduce((sum, f) => sum + f.content.length, 0)
      })
    }
  } catch (error) {
    logger?.('error', 'Failed to load files directly for implementation', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    // Continue anyway - let AI work with whatever context we have
  }

  return planningContext
}

/**
 * Filter generated code to only include files from the approved plan
 */
export function filterGeneratedCode<T extends { path: string }>(
  generatedFiles: T[],
  plannedPaths: Set<string>,
  logger?: FileValidatorLogger
): T[] {
  const generatedPaths = generatedFiles.map(f => f.path)
  const unexpectedFiles = generatedPaths.filter(p => !plannedPaths.has(p))

  if (unexpectedFiles.length > 0) {
    logger?.('error', 'AI generated files NOT in the approved plan - filtering them out', {
      planned: Array.from(plannedPaths),
      generated: generatedPaths,
      unexpected: unexpectedFiles
    })

    // Filter out unexpected files to prevent disruptive changes
    const filtered = generatedFiles.filter(f => plannedPaths.has(f.path))

    logger?.('info', 'Filtered generated code to only include planned files', {
      filesAfterFilter: filtered.length,
      paths: filtered.map(f => f.path)
    })

    return filtered
  }

  return generatedFiles
}
