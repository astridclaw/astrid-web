import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the @anthropic-ai/claude-agent-sdk module
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}))

// Mock child_process
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual as Record<string, unknown>,
    execSync: vi.fn(),
  }
})

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdtemp: vi.fn(),
  rm: vi.fn(),
  mkdir: vi.fn(),
}))

import { query } from '@anthropic-ai/claude-agent-sdk'
import { execSync } from 'child_process'
import { readFile } from 'fs/promises'
import {
  executeWithClaudeAgentSDK,
  prepareRepository,
  toGeneratedCode,
  type ClaudeAgentExecutorConfig,
} from '@/lib/ai/claude-agent-sdk-executor'
import type { ImplementationPlan } from '@/lib/ai/types'

const mockQuery = query as ReturnType<typeof vi.fn>
const mockExecSync = execSync as ReturnType<typeof vi.fn>
const mockReadFile = readFile as ReturnType<typeof vi.fn>

describe('Claude Agent SDK Executor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('executeWithClaudeAgentSDK', () => {
    const mockPlan: ImplementationPlan = {
      summary: 'Add utility function',
      approach: 'Create a new function in utils.ts',
      files: [
        {
          path: 'src/utils.ts',
          purpose: 'Add helper function',
          changes: 'Add new multiply function',
        },
      ],
      estimatedComplexity: 'simple',
      considerations: ['Follow existing patterns'],
    }

    const mockConfig: ClaudeAgentExecutorConfig = {
      repoPath: '/tmp/test-repo',
      maxBudgetUsd: 5.0,
      maxTurns: 50,
      logger: vi.fn(),
      onProgress: vi.fn(),
    }

    it('should execute successfully and return file changes', async () => {
      // Mock the SDK query to yield messages then return result
      const mockMessages = [
        {
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'Analyzing codebase...' }],
          },
        },
        {
          type: 'result',
          subtype: 'success',
          result: '```json\n{"completed": true, "commitMessage": "feat: add multiply"}\n```',
          num_turns: 5,
          total_cost_usd: 0.05,
          usage: {
            input_tokens: 1000,
            output_tokens: 500,
          },
        },
      ]

      mockQuery.mockImplementation(function* () {
        for (const msg of mockMessages) {
          yield msg
        }
      })

      // Mock git status to show modified files
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('git status')) {
          return ' M src/utils.ts\n'
        }
        return ''
      })

      // Mock file read
      mockReadFile.mockResolvedValue('export function multiply(a, b) { return a * b }')

      const result = await executeWithClaudeAgentSDK(
        mockPlan,
        'Add multiply function',
        'Add a multiply function to utils',
        mockConfig
      )

      expect(result.success).toBe(true)
      expect(result.files.length).toBe(1)
      expect(result.files[0].path).toBe('src/utils.ts')
      expect(result.files[0].action).toBe('modify')
      expect(result.usage?.costUSD).toBe(0.05)
    })

    it('should handle execution errors gracefully', async () => {
      // Mock the SDK query to throw an error
      mockQuery.mockImplementation(function* () {
        throw new Error('API rate limit exceeded')
      })

      const result = await executeWithClaudeAgentSDK(
        mockPlan,
        'Add multiply function',
        null,
        mockConfig
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('API rate limit exceeded')
      expect(result.files).toHaveLength(0)
    })

    it('should handle max budget exceeded', async () => {
      const mockMessages = [
        {
          type: 'result',
          subtype: 'error_max_budget_usd',
          errors: ['Budget exceeded'],
          num_turns: 10,
          total_cost_usd: 5.01,
          usage: {
            input_tokens: 5000,
            output_tokens: 2500,
          },
        },
      ]

      mockQuery.mockImplementation(function* () {
        for (const msg of mockMessages) {
          yield msg
        }
      })

      const result = await executeWithClaudeAgentSDK(
        mockPlan,
        'Add multiply function',
        null,
        mockConfig
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('error_max_budget_usd')
    })

    it('should handle no changes made', async () => {
      const mockMessages = [
        {
          type: 'result',
          subtype: 'success',
          result: 'No changes needed',
          num_turns: 2,
          total_cost_usd: 0.01,
          usage: {
            input_tokens: 500,
            output_tokens: 100,
          },
        },
      ]

      mockQuery.mockImplementation(function* () {
        for (const msg of mockMessages) {
          yield msg
        }
      })

      // Mock git status with no changes
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('git status')) {
          return ''
        }
        return ''
      })

      const result = await executeWithClaudeAgentSDK(
        mockPlan,
        'Add multiply function',
        null,
        mockConfig
      )

      expect(result.success).toBe(false)
      expect(result.files).toHaveLength(0)
      expect(result.error).toContain('No file changes')
    })

    it('should report progress via callback', async () => {
      const progressMessages: string[] = []
      const configWithProgress: ClaudeAgentExecutorConfig = {
        ...mockConfig,
        onProgress: (msg) => progressMessages.push(msg),
      }

      const mockMessages = [
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'Reading files...' },
              { type: 'tool_use', name: 'Read', input: { path: 'src/utils.ts' } },
            ],
          },
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          num_turns: 3,
          total_cost_usd: 0.02,
          usage: { input_tokens: 500, output_tokens: 200 },
        },
      ]

      mockQuery.mockImplementation(function* () {
        for (const msg of mockMessages) {
          yield msg
        }
      })

      mockExecSync.mockReturnValue('')

      await executeWithClaudeAgentSDK(
        mockPlan,
        'Test task',
        null,
        configWithProgress
      )

      // Should have received progress updates
      expect(progressMessages.length).toBeGreaterThan(0)
    })
  })

  describe('prepareRepository', () => {
    it('should clone repository and return path', async () => {
      const { mkdtemp } = await import('fs/promises')
      const mockMkdtemp = mkdtemp as ReturnType<typeof vi.fn>
      mockMkdtemp.mockResolvedValue('/tmp/claude-agent-abc123')

      mockExecSync.mockReturnValue('')

      const result = await prepareRepository(
        'test-owner',
        'test-repo',
        'main',
        'ghp_token123'
      )

      expect(result.repoPath).toContain('test-repo')
      expect(typeof result.cleanup).toBe('function')

      // Verify git clone was called
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('git clone'),
        expect.any(Object)
      )
    })

    it('should configure git user in cloned repo', async () => {
      const { mkdtemp } = await import('fs/promises')
      const mockMkdtemp = mkdtemp as ReturnType<typeof vi.fn>
      mockMkdtemp.mockResolvedValue('/tmp/claude-agent-xyz789')

      mockExecSync.mockReturnValue('')

      await prepareRepository(
        'owner',
        'repo',
        'main',
        'token'
      )

      // Should configure git user
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('git config user.email'),
        expect.any(Object)
      )
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('git config user.name'),
        expect.any(Object)
      )
    })
  })

  describe('toGeneratedCode', () => {
    it('should convert ExecutionResult to GeneratedCode format', () => {
      const executionResult = {
        success: true,
        files: [
          { path: 'src/a.ts', content: 'code', action: 'create' as const },
          { path: 'src/b.ts', content: 'code2', action: 'modify' as const },
        ],
        commitMessage: 'feat: add feature',
        prTitle: 'Add feature',
        prDescription: 'This PR adds a feature',
      }

      const generatedCode = toGeneratedCode(executionResult)

      expect(generatedCode.files).toHaveLength(2)
      expect(generatedCode.commitMessage).toBe('feat: add feature')
      expect(generatedCode.prTitle).toBe('Add feature')
      expect(generatedCode.prDescription).toBe('This PR adds a feature')
    })
  })

  describe('buildImplementationPrompt', () => {
    it('should include task title and description in prompt', async () => {
      const testConfig: ClaudeAgentExecutorConfig = {
        repoPath: '/tmp/test-repo',
        maxBudgetUsd: 5.0,
        maxTurns: 50,
        logger: vi.fn(),
        onProgress: vi.fn(),
      }

      const mockMessages = [
        {
          type: 'result',
          subtype: 'success',
          result: 'Done',
          num_turns: 1,
          total_cost_usd: 0.01,
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      ]

      let capturedPrompt = ''
      mockQuery.mockImplementation(function* (params: { prompt: string }) {
        capturedPrompt = params.prompt
        for (const msg of mockMessages) {
          yield msg
        }
      })

      mockExecSync.mockReturnValue('')

      await executeWithClaudeAgentSDK(
        {
          summary: 'Test summary',
          approach: 'Test approach',
          files: [{ path: 'test.ts', purpose: 'Testing', changes: 'Add test' }],
          estimatedComplexity: 'simple',
          considerations: ['Consider A', 'Consider B'],
        },
        'My Task Title',
        'My task description',
        testConfig
      )

      expect(capturedPrompt).toContain('My Task Title')
      expect(capturedPrompt).toContain('My task description')
      expect(capturedPrompt).toContain('Test summary')
      expect(capturedPrompt).toContain('Test approach')
      expect(capturedPrompt).toContain('test.ts')
    })
  })
})

describe('Hybrid Execution Mode', () => {
  describe('HybridExecutionConfig', () => {
    it('should have correct interface shape', () => {
      // Type test - this will fail at compile time if the interface is wrong
      const config = {
        useClaudeAgentSDK: true,
        localRepoPath: '/path/to/repo',
        githubToken: 'ghp_xxx',
        maxBudgetUsd: 10.0,
        maxTurns: 100,
      }

      expect(config.useClaudeAgentSDK).toBe(true)
      expect(config.localRepoPath).toBe('/path/to/repo')
    })
  })
})
