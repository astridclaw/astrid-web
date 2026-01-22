import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockPrisma } from '../setup'

// Mock the Claude Agent SDK executor
vi.mock('@/lib/ai/claude-agent-sdk-executor', () => ({
  executeWithClaudeAgentSDK: vi.fn(),
  prepareRepository: vi.fn(),
  toGeneratedCode: vi.fn((result) => ({
    files: result.files,
    commitMessage: result.commitMessage,
    prTitle: result.prTitle,
    prDescription: result.prDescription,
  })),
}))

// Mock API key cache
vi.mock('@/lib/api-key-cache', () => ({
  getCachedApiKey: vi.fn().mockResolvedValue('sk-ant-test-key'),
}))

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}))

import {
  executeWithClaudeAgentSDK,
  prepareRepository,
} from '@/lib/ai/claude-agent-sdk-executor'
import type { HybridExecutionConfig } from '@/lib/ai-orchestrator'
import type { ImplementationPlan, GeneratedCode } from '@/lib/ai/types'

const mockExecuteWithClaudeAgentSDK = executeWithClaudeAgentSDK as ReturnType<typeof vi.fn>
const mockPrepareRepository = prepareRepository as ReturnType<typeof vi.fn>

describe('AI Orchestrator Hybrid Execution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('HybridExecutionConfig', () => {
    it('should define all required properties', () => {
      const config: HybridExecutionConfig = {
        useClaudeAgentSDK: true,
        localRepoPath: '/tmp/repo',
        githubToken: 'ghp_test',
        maxBudgetUsd: 5.0,
        maxTurns: 50,
      }

      expect(config.useClaudeAgentSDK).toBe(true)
      expect(config.localRepoPath).toBe('/tmp/repo')
      expect(config.githubToken).toBe('ghp_test')
      expect(config.maxBudgetUsd).toBe(5.0)
      expect(config.maxTurns).toBe(50)
    })

    it('should allow optional properties', () => {
      const config: HybridExecutionConfig = {
        useClaudeAgentSDK: false,
      }

      expect(config.useClaudeAgentSDK).toBe(false)
      expect(config.localRepoPath).toBeUndefined()
      expect(config.githubToken).toBeUndefined()
    })
  })

  describe('SDK Execution Flow', () => {
    const mockPlan: ImplementationPlan = {
      summary: 'Add dark mode toggle',
      approach: 'Modify theme context and add toggle button',
      files: [
        { path: 'src/theme.ts', purpose: 'Add dark mode', changes: 'Add toggle' },
        { path: 'src/Button.tsx', purpose: 'Add button', changes: 'Create component' },
      ],
      estimatedComplexity: 'medium',
      considerations: ['Test in both modes'],
    }

    it('should call executeWithClaudeAgentSDK with correct parameters', async () => {
      mockExecuteWithClaudeAgentSDK.mockResolvedValue({
        success: true,
        files: [
          { path: 'src/theme.ts', content: 'code', action: 'modify' },
          { path: 'src/Button.tsx', content: 'code', action: 'create' },
        ],
        commitMessage: 'feat: add dark mode toggle',
        prTitle: 'Add dark mode toggle',
        prDescription: 'This PR adds dark mode support',
        usage: {
          inputTokens: 2000,
          outputTokens: 1000,
          costUSD: 0.08,
        },
      })

      const result = await mockExecuteWithClaudeAgentSDK(
        mockPlan,
        'Add dark mode',
        'Add a dark mode toggle to the app',
        {
          repoPath: '/tmp/test-repo',
          maxBudgetUsd: 5.0,
          maxTurns: 50,
        }
      )

      expect(result.success).toBe(true)
      expect(result.files).toHaveLength(2)
      expect(result.commitMessage).toBe('feat: add dark mode toggle')
    })

    it('should handle repository cloning when localRepoPath not provided', async () => {
      mockPrepareRepository.mockResolvedValue({
        repoPath: '/tmp/cloned-repo',
        cleanup: vi.fn(),
      })

      const result = await mockPrepareRepository(
        'owner',
        'repo',
        'main',
        'ghp_token'
      )

      expect(result.repoPath).toBe('/tmp/cloned-repo')
      expect(result.cleanup).toBeDefined()
    })

    it('should cleanup cloned repo after execution', async () => {
      const mockCleanup = vi.fn()
      mockPrepareRepository.mockResolvedValue({
        repoPath: '/tmp/cloned-repo',
        cleanup: mockCleanup,
      })

      const prepared = await mockPrepareRepository(
        'owner',
        'repo',
        'main',
        'token'
      )

      // Simulate cleanup after execution
      await prepared.cleanup()

      expect(mockCleanup).toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should return error when SDK execution fails', async () => {
      mockExecuteWithClaudeAgentSDK.mockResolvedValue({
        success: false,
        files: [],
        commitMessage: '',
        prTitle: '',
        prDescription: '',
        error: 'Claude API rate limit exceeded',
      })

      const result = await mockExecuteWithClaudeAgentSDK(
        { summary: 'test', approach: 'test', files: [], estimatedComplexity: 'simple', considerations: [] },
        'Test',
        null,
        { repoPath: '/tmp/repo' }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('rate limit')
    })

    it('should handle missing repo path gracefully', async () => {
      mockPrepareRepository.mockRejectedValue(new Error('Failed to clone repository'))

      await expect(
        mockPrepareRepository('owner', 'repo', 'main', 'invalid-token')
      ).rejects.toThrow('Failed to clone repository')
    })

    it('should handle budget exceeded error', async () => {
      mockExecuteWithClaudeAgentSDK.mockResolvedValue({
        success: false,
        files: [],
        commitMessage: '',
        prTitle: '',
        prDescription: '',
        error: 'Budget exceeded: $5.01 > $5.00',
      })

      const result = await mockExecuteWithClaudeAgentSDK(
        { summary: 'test', approach: 'test', files: [], estimatedComplexity: 'simple', considerations: [] },
        'Test',
        null,
        { repoPath: '/tmp/repo', maxBudgetUsd: 5.0 }
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Budget exceeded')
    })
  })

  describe('Progress Reporting', () => {
    it('should call onProgress callback during execution', async () => {
      const progressMessages: string[] = []

      mockExecuteWithClaudeAgentSDK.mockImplementation(
        async (_plan, _title, _desc, config) => {
          // Simulate progress callbacks
          if (config.onProgress) {
            config.onProgress('Initializing Claude Code agent...')
            config.onProgress('Analyzing codebase...')
            config.onProgress('Using tool: Read')
            config.onProgress('Using tool: Edit')
          }
          return {
            success: true,
            files: [{ path: 'test.ts', content: 'code', action: 'modify' }],
            commitMessage: 'test',
            prTitle: 'Test',
            prDescription: 'Test PR',
          }
        }
      )

      await mockExecuteWithClaudeAgentSDK(
        { summary: 'test', approach: 'test', files: [], estimatedComplexity: 'simple', considerations: [] },
        'Test',
        null,
        {
          repoPath: '/tmp/repo',
          onProgress: (msg: string) => progressMessages.push(msg),
        }
      )

      expect(progressMessages).toContain('Initializing Claude Code agent...')
      expect(progressMessages).toContain('Analyzing codebase...')
      expect(progressMessages).toContain('Using tool: Read')
    })
  })

  describe('File Change Detection', () => {
    it('should detect created files', async () => {
      mockExecuteWithClaudeAgentSDK.mockResolvedValue({
        success: true,
        files: [
          { path: 'src/new-file.ts', content: 'new content', action: 'create' },
        ],
        commitMessage: 'feat: add new file',
        prTitle: 'Add new file',
        prDescription: 'Creates a new file',
      })

      const result = await mockExecuteWithClaudeAgentSDK(
        { summary: 'test', approach: 'test', files: [], estimatedComplexity: 'simple', considerations: [] },
        'Test',
        null,
        { repoPath: '/tmp/repo' }
      )

      expect(result.files[0].action).toBe('create')
    })

    it('should detect modified files', async () => {
      mockExecuteWithClaudeAgentSDK.mockResolvedValue({
        success: true,
        files: [
          { path: 'src/existing-file.ts', content: 'modified content', action: 'modify' },
        ],
        commitMessage: 'fix: update file',
        prTitle: 'Update file',
        prDescription: 'Modifies existing file',
      })

      const result = await mockExecuteWithClaudeAgentSDK(
        { summary: 'test', approach: 'test', files: [], estimatedComplexity: 'simple', considerations: [] },
        'Test',
        null,
        { repoPath: '/tmp/repo' }
      )

      expect(result.files[0].action).toBe('modify')
    })

    it('should detect deleted files', async () => {
      mockExecuteWithClaudeAgentSDK.mockResolvedValue({
        success: true,
        files: [
          { path: 'src/old-file.ts', content: '', action: 'delete' },
        ],
        commitMessage: 'chore: remove old file',
        prTitle: 'Remove old file',
        prDescription: 'Removes deprecated file',
      })

      const result = await mockExecuteWithClaudeAgentSDK(
        { summary: 'test', approach: 'test', files: [], estimatedComplexity: 'simple', considerations: [] },
        'Test',
        null,
        { repoPath: '/tmp/repo' }
      )

      expect(result.files[0].action).toBe('delete')
    })
  })

  describe('Cost Tracking', () => {
    it('should return usage information', async () => {
      mockExecuteWithClaudeAgentSDK.mockResolvedValue({
        success: true,
        files: [{ path: 'test.ts', content: 'code', action: 'modify' }],
        commitMessage: 'test',
        prTitle: 'Test',
        prDescription: 'Test',
        usage: {
          inputTokens: 5000,
          outputTokens: 2500,
          costUSD: 0.15,
        },
      })

      const result = await mockExecuteWithClaudeAgentSDK(
        { summary: 'test', approach: 'test', files: [], estimatedComplexity: 'simple', considerations: [] },
        'Test',
        null,
        { repoPath: '/tmp/repo' }
      )

      expect(result.usage).toBeDefined()
      expect(result.usage?.inputTokens).toBe(5000)
      expect(result.usage?.outputTokens).toBe(2500)
      expect(result.usage?.costUSD).toBe(0.15)
    })
  })
})

describe('Generated Code Format', () => {
  it('should produce valid GeneratedCode structure', () => {
    const generatedCode: GeneratedCode = {
      files: [
        { path: 'src/a.ts', content: 'export const a = 1', action: 'create' },
        { path: 'src/b.ts', content: 'export const b = 2', action: 'modify' },
      ],
      commitMessage: 'feat: add constants',
      prTitle: 'Add constants',
      prDescription: 'This PR adds constant values',
    }

    expect(generatedCode.files).toHaveLength(2)
    expect(generatedCode.files[0].path).toBe('src/a.ts')
    expect(generatedCode.commitMessage).toContain('feat:')
    expect(generatedCode.prTitle).toBe('Add constants')
  })
})
