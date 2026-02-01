/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the RPC client
vi.mock('@/lib/ai/openclaw-rpc-client', () => ({
  createOpenClawClient: vi.fn(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    sendTask: vi.fn().mockResolvedValue({ sessionId: 'test-session-123' }),
    subscribe: vi.fn(() => vi.fn()),
    listSessions: vi.fn().mockResolvedValue([]),
  })),
  testOpenClawConnection: vi.fn().mockResolvedValue({
    success: true,
    latencyMs: 50,
    version: '1.0.0',
  }),
}))

// Mock fs/promises for Node environment
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockImplementation((filePath: string) => {
    if (filePath.includes('ASTRID.md')) {
      return Promise.resolve('# Test Project\n\nThis is a test project.')
    }
    if (filePath.includes('.astrid.config.json')) {
      return Promise.reject(new Error('File not found'))
    }
    return Promise.resolve('mock file content')
  }),
  writeFile: vi.fn(),
  access: vi.fn().mockRejectedValue(new Error('Not found')),
  mkdir: vi.fn(),
}))

import {
  planWithOpenClaw,
  executeWithOpenClaw,
  formatWorkflowSuggestionsAsTaskDescriptions,
  type OpenClawExecutorConfig,
  type WorkflowSuggestion,
} from '@/lib/ai/openclaw-executor'
import type { ImplementationPlan } from '@/lib/ai/types'
import { createOpenClawClient } from '@/lib/ai/openclaw-rpc-client'

describe('OpenClaw Executor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockConfig: OpenClawExecutorConfig = {
    repoPath: '/tmp/test-repo',
    gatewayUrl: 'ws://localhost:18789',
    authToken: 'test-token',
    model: 'anthropic/claude-opus-4-5',
    maxTurns: 25,
    logger: vi.fn(),
    onProgress: vi.fn(),
  }

  describe('planWithOpenClaw', () => {
    it('should connect to the gateway and send a planning task', async () => {
      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn(),
        sendTask: vi.fn().mockResolvedValue({ sessionId: 'test-session-123' }),
        subscribe: vi.fn(() => vi.fn()),
        listSessions: vi.fn().mockResolvedValue([
          { id: 'test-session-123', status: 'completed' },
        ]),
        getSessionHistory: vi.fn().mockResolvedValue({
          sessionId: 'test-session-123',
          messages: [
            {
              role: 'assistant',
              content: `Here's the implementation plan:

\`\`\`json
{
  "summary": "Add new feature",
  "approach": "Modify existing files",
  "files": [
    {"path": "src/app.ts", "purpose": "modify", "changes": "Add new function"}
  ],
  "estimatedComplexity": "medium",
  "considerations": ["Consider edge cases"]
}
\`\`\``,
              timestamp: Date.now(),
            },
          ],
        }),
      }

      vi.mocked(createOpenClawClient).mockReturnValue(mockClient as any)

      const result = await planWithOpenClaw(
        'Add new feature',
        'We need to add a new feature to the app',
        mockConfig
      )

      expect(mockClient.connect).toHaveBeenCalled()
      expect(mockClient.sendTask).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('Add new feature'),
          model: 'anthropic/claude-opus-4-5',
          maxTurns: 25,
        })
      )
      expect(mockClient.disconnect).toHaveBeenCalled()
    })

    it('should return error if connection fails', async () => {
      const mockClient = {
        connect: vi.fn().mockRejectedValue(new Error('Connection refused')),
        disconnect: vi.fn(),
      }

      vi.mocked(createOpenClawClient).mockReturnValue(mockClient as any)

      const result = await planWithOpenClaw(
        'Test task',
        null,
        mockConfig
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Connection refused')
    })
  })

  describe('executeWithOpenClaw', () => {
    it('should connect to the gateway and send an execution task', async () => {
      const mockPlan: ImplementationPlan = {
        summary: 'Add new feature',
        approach: 'Modify existing files',
        files: [
          { path: 'src/app.ts', purpose: 'modify', changes: 'Add new function' },
        ],
        estimatedComplexity: 'medium',
        considerations: ['Consider edge cases'],
      }

      const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn(),
        sendTask: vi.fn().mockResolvedValue({ sessionId: 'test-session-456' }),
        subscribe: vi.fn(() => vi.fn()),
        listSessions: vi.fn().mockResolvedValue([
          { id: 'test-session-456', status: 'completed' },
        ]),
        getSessionHistory: vi.fn().mockResolvedValue({
          sessionId: 'test-session-456',
          messages: [
            {
              role: 'assistant',
              content: 'Completed implementation. Created PR at https://github.com/test/test/pull/123',
              timestamp: Date.now(),
            },
          ],
        }),
      }

      vi.mocked(createOpenClawClient).mockReturnValue(mockClient as any)

      const result = await executeWithOpenClaw(
        mockPlan,
        'Add new feature',
        'We need to add a new feature',
        mockConfig
      )

      expect(mockClient.connect).toHaveBeenCalled()
      expect(mockClient.sendTask).toHaveBeenCalled()
      const sendTaskCall = mockClient.sendTask.mock.calls[0][0]
      expect(sendTaskCall.prompt).toContain('Add new feature')
      expect(sendTaskCall.model).toBe('anthropic/claude-opus-4-5')
      expect(mockClient.disconnect).toHaveBeenCalled()
    })
  })

  describe('formatWorkflowSuggestionsAsTaskDescriptions', () => {
    it('should format suggestions into task descriptions', () => {
      const suggestions: WorkflowSuggestion[] = [
        {
          type: 'automation',
          title: 'Add automated tests',
          description: 'Consider adding integration tests for the new feature',
          priority: 'high',
        },
        {
          type: 'optimization',
          title: 'Cache API responses',
          description: 'The API calls could benefit from caching',
          priority: 'medium',
        },
      ]

      const tasks = formatWorkflowSuggestionsAsTaskDescriptions(
        suggestions,
        'Original Task Title'
      )

      expect(tasks).toHaveLength(2)
      expect(tasks[0].title).toBe('[Workflow Suggestion] Add automated tests')
      expect(tasks[0].description).toContain('automation')
      expect(tasks[0].description).toContain('high')
      expect(tasks[0].description).toContain('Original Task Title')
      expect(tasks[1].title).toBe('[Workflow Suggestion] Cache API responses')
    })

    it('should return empty array for no suggestions', () => {
      const tasks = formatWorkflowSuggestionsAsTaskDescriptions([], 'Task')
      expect(tasks).toHaveLength(0)
    })
  })
})

describe('OpenClaw Agent Config', () => {
  it('should have openclaw in AI_AGENT_CONFIG', async () => {
    const { AI_AGENT_CONFIG, getAgentConfig } = await import('@/lib/ai/agent-config')

    expect(AI_AGENT_CONFIG['openclaw@astrid.cc']).toBeDefined()
    expect(AI_AGENT_CONFIG['openclaw@astrid.cc'].service).toBe('openclaw')
    expect(AI_AGENT_CONFIG['openclaw@astrid.cc'].displayName).toBe('OpenClaw Worker')
  })

  it('should have openclaw in SUGGESTED_MODELS', async () => {
    const { SUGGESTED_MODELS } = await import('@/lib/ai/agent-config')

    expect(SUGGESTED_MODELS.openclaw).toBeDefined()
    expect(SUGGESTED_MODELS.openclaw).toContain('anthropic/claude-opus-4-5')
  })

  it('should have openclaw in DEFAULT_MODELS', async () => {
    const { DEFAULT_MODELS } = await import('@/lib/ai/agent-config')

    expect(DEFAULT_MODELS.openclaw).toBe('anthropic/claude-opus-4-5')
  })

  it('should recognize openclaw@astrid.cc as a registered agent', async () => {
    const { isRegisteredAgent, getAgentService } = await import('@/lib/ai/agent-config')

    expect(isRegisteredAgent('openclaw@astrid.cc')).toBe(true)
    expect(getAgentService('openclaw@astrid.cc')).toBe('openclaw')
  })
})
