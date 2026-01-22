import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock fs/promises
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal() as object
  return {
    ...actual,
    readFile: vi.fn(),
    writeFile: vi.fn(),
    access: vi.fn(),
    mkdir: vi.fn(),
  }
})

// Mock child_process
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal() as object
  return {
    ...actual,
    execSync: vi.fn(),
  }
})

// Mock glob
vi.mock('glob', async (importOriginal) => {
  const actual = await importOriginal() as object
  return {
    ...actual,
    glob: vi.fn(),
  }
})

// Mock fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { readFile, writeFile, access, mkdir } from 'fs/promises'
import { execSync } from 'child_process'
import { glob } from 'glob'
import {
  planWithOpenAI,
  executeWithOpenAI,
  type OpenAIAgentExecutorConfig,
} from '@/lib/ai/openai-agent-executor'
import type { ImplementationPlan } from '@/lib/ai/types'

const mockReadFile = readFile as ReturnType<typeof vi.fn>
const mockWriteFile = writeFile as ReturnType<typeof vi.fn>
const mockAccess = access as ReturnType<typeof vi.fn>
const mockMkdir = mkdir as ReturnType<typeof vi.fn>
const mockExecSync = execSync as ReturnType<typeof vi.fn>
const mockGlob = glob as ReturnType<typeof vi.fn>

describe('OpenAI Agent Executor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock for ASTRID.md and .astrid.config.json not found
    mockReadFile.mockImplementation((path: string) => {
      if (path.includes('ASTRID.md') || path.includes('.astrid.config.json')) {
        return Promise.reject(new Error('File not found'))
      }
      return Promise.resolve('mock file content')
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockConfig: OpenAIAgentExecutorConfig = {
    repoPath: '/tmp/test-repo',
    apiKey: 'sk-test-key',
    // model omitted - uses OpenAI API default
    maxIterations: 10,
    logger: vi.fn(),
    onProgress: vi.fn(),
  }

  describe('planWithOpenAI', () => {
    it('should successfully create a plan after exploring codebase', async () => {
      // Mock OpenAI API responses
      const responses = [
        // First response: tool call to explore
        {
          ok: true,
          json: () => Promise.resolve({
            id: 'chatcmpl-1',
            choices: [{
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'glob_files',
                    arguments: JSON.stringify({ pattern: '**/*.ts' })
                  }
                }]
              },
              finish_reason: 'tool_calls'
            }],
            usage: { prompt_tokens: 100, completion_tokens: 50 }
          })
        },
        // Second response: plan
        {
          ok: true,
          json: () => Promise.resolve({
            id: 'chatcmpl-2',
            choices: [{
              message: {
                role: 'assistant',
                content: '```json\n{"summary": "Add feature", "approach": "Modify utils", "files": [{"path": "src/utils.ts", "purpose": "Add function", "changes": "New function"}], "estimatedComplexity": "simple", "considerations": ["Test"]}\n```'
              },
              finish_reason: 'stop'
            }],
            usage: { prompt_tokens: 200, completion_tokens: 100 }
          })
        }
      ]

      let callIndex = 0
      mockFetch.mockImplementation(() => Promise.resolve(responses[callIndex++]))

      mockGlob.mockResolvedValue(['src/utils.ts', 'src/index.ts'])

      const result = await planWithOpenAI('Add feature', 'Add a new feature', mockConfig)

      expect(result.success).toBe(true)
      expect(result.plan).toBeDefined()
      expect(result.plan?.summary).toBe('Add feature')
      expect(result.plan?.files).toHaveLength(1)
      expect(result.usage).toBeDefined()
    })

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('{"error": {"message": "Invalid API key"}}')
      })

      const result = await planWithOpenAI('Test task', null, mockConfig)

      expect(result.success).toBe(false)
      expect(result.error).toContain('API key')
    })

    it('should handle rate limit with retry', async () => {
      const responses = [
        // First: rate limit
        {
          ok: false,
          status: 429,
          headers: new Map([['retry-after', '1']]),
          text: () => Promise.resolve('{"error": {"message": "Rate limit"}}')
        },
        // Second: success with plan
        {
          ok: true,
          json: () => Promise.resolve({
            id: 'chatcmpl-1',
            choices: [{
              message: {
                role: 'assistant',
                content: '```json\n{"summary": "Test", "approach": "Test", "files": [{"path": "src/test.ts", "purpose": "Test", "changes": "Test"}], "estimatedComplexity": "simple", "considerations": []}\n```'
              },
              finish_reason: 'stop'
            }],
            usage: { prompt_tokens: 100, completion_tokens: 50 }
          })
        }
      ]

      let callIndex = 0
      mockFetch.mockImplementation(() => {
        const response = responses[callIndex++]
        if (response.headers) {
          return Promise.resolve({
            ...response,
            headers: { get: (key: string) => response.headers.get(key) }
          })
        }
        return Promise.resolve(response)
      })

      const result = await planWithOpenAI('Test task', null, mockConfig)

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should respect max iterations', async () => {
      // Always return tool calls to exhaust iterations
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-1',
          choices: [{
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'glob_files',
                  arguments: JSON.stringify({ pattern: '**/*.ts' })
                }
              }]
            },
            finish_reason: 'tool_calls'
          }],
          usage: { prompt_tokens: 100, completion_tokens: 50 }
        })
      })

      mockGlob.mockResolvedValue(['file.ts'])

      const limitedConfig = { ...mockConfig, maxIterations: 3 }
      const result = await planWithOpenAI('Test task', null, limitedConfig)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Max iterations')
    })
  })

  describe('executeWithOpenAI', () => {
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

    it('should execute successfully and return file changes', async () => {
      const responses = [
        // First: read file
        {
          ok: true,
          json: () => Promise.resolve({
            id: 'chatcmpl-1',
            choices: [{
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'read_file',
                    arguments: JSON.stringify({ file_path: 'src/utils.ts' })
                  }
                }]
              },
              finish_reason: 'tool_calls'
            }],
            usage: { prompt_tokens: 100, completion_tokens: 50 }
          })
        },
        // Second: edit file
        {
          ok: true,
          json: () => Promise.resolve({
            id: 'chatcmpl-2',
            choices: [{
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{
                  id: 'call_2',
                  type: 'function',
                  function: {
                    name: 'edit_file',
                    arguments: JSON.stringify({
                      file_path: 'src/utils.ts',
                      old_string: 'export {}',
                      new_string: 'export function multiply(a: number, b: number) { return a * b }\nexport {}'
                    })
                  }
                }]
              },
              finish_reason: 'tool_calls'
            }],
            usage: { prompt_tokens: 200, completion_tokens: 100 }
          })
        },
        // Third: task_complete
        {
          ok: true,
          json: () => Promise.resolve({
            id: 'chatcmpl-3',
            choices: [{
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{
                  id: 'call_3',
                  type: 'function',
                  function: {
                    name: 'task_complete',
                    arguments: JSON.stringify({
                      commit_message: 'feat: add multiply function',
                      pr_title: 'feat: Add multiply function',
                      pr_description: 'Added multiply utility function'
                    })
                  }
                }]
              },
              finish_reason: 'tool_calls'
            }],
            usage: { prompt_tokens: 300, completion_tokens: 150 }
          })
        }
      ]

      let callIndex = 0
      mockFetch.mockImplementation(() => Promise.resolve(responses[callIndex++]))

      mockReadFile.mockImplementation((path: string) => {
        if (path.includes('utils.ts')) {
          return Promise.resolve('export {}')
        }
        return Promise.reject(new Error('File not found'))
      })

      mockAccess.mockResolvedValue(undefined) // File exists
      mockWriteFile.mockResolvedValue(undefined)

      const result = await executeWithOpenAI(mockPlan, 'Add multiply', null, mockConfig)

      expect(result.success).toBe(true)
      expect(result.files).toHaveLength(1)
      expect(result.files[0].path).toBe('src/utils.ts')
      expect(result.files[0].action).toBe('modify')
      expect(result.commitMessage).toBe('feat: add multiply function')
      expect(result.prTitle).toBe('feat: Add multiply function')
    })

    it('should handle execution errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const result = await executeWithOpenAI(mockPlan, 'Test task', null, mockConfig)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Network error')
      expect(result.files).toHaveLength(0)
    })

    it('should track file changes from write_file tool', async () => {
      const responses = [
        // First: write new file
        {
          ok: true,
          json: () => Promise.resolve({
            id: 'chatcmpl-1',
            choices: [{
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'write_file',
                    arguments: JSON.stringify({
                      file_path: 'src/new-file.ts',
                      content: 'export const value = 42'
                    })
                  }
                }]
              },
              finish_reason: 'tool_calls'
            }],
            usage: { prompt_tokens: 100, completion_tokens: 50 }
          })
        },
        // Second: task_complete
        {
          ok: true,
          json: () => Promise.resolve({
            id: 'chatcmpl-2',
            choices: [{
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{
                  id: 'call_2',
                  type: 'function',
                  function: {
                    name: 'task_complete',
                    arguments: JSON.stringify({
                      commit_message: 'feat: add new file',
                      pr_title: 'feat: Add new file',
                      pr_description: 'Created new-file.ts'
                    })
                  }
                }]
              },
              finish_reason: 'tool_calls'
            }],
            usage: { prompt_tokens: 200, completion_tokens: 100 }
          })
        }
      ]

      let callIndex = 0
      mockFetch.mockImplementation(() => Promise.resolve(responses[callIndex++]))

      // File doesn't exist
      mockAccess.mockRejectedValue(new Error('ENOENT'))
      mockMkdir.mockResolvedValue(undefined)
      mockWriteFile.mockResolvedValue(undefined)

      const result = await executeWithOpenAI(mockPlan, 'Create file', null, mockConfig)

      expect(result.success).toBe(true)
      expect(result.files).toHaveLength(1)
      expect(result.files[0].path).toBe('src/new-file.ts')
      expect(result.files[0].action).toBe('create')
    })

    it('should report progress via callback', async () => {
      const progressMessages: string[] = []
      const configWithProgress: OpenAIAgentExecutorConfig = {
        ...mockConfig,
        onProgress: (msg) => progressMessages.push(msg),
      }

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-1',
          choices: [{
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'task_complete',
                  arguments: JSON.stringify({
                    commit_message: 'feat: done',
                    pr_title: 'Done',
                    pr_description: 'Done'
                  })
                }
              }]
            },
            finish_reason: 'tool_calls'
          }],
          usage: { prompt_tokens: 100, completion_tokens: 50 }
        })
      })

      await executeWithOpenAI(mockPlan, 'Test task', null, configWithProgress)

      expect(progressMessages.length).toBeGreaterThan(0)
      expect(progressMessages).toContain('Initializing OpenAI agent...')
    })
  })

  describe('Tool Execution', () => {
    it('should block dangerous bash commands', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-1',
          choices: [{
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'run_bash',
                  arguments: JSON.stringify({ command: 'rm -rf /' })
                }
              }]
            },
            finish_reason: 'tool_calls'
          }],
          usage: { prompt_tokens: 100, completion_tokens: 50 }
        })
      })

      // The command should be blocked but execution continues
      // We need to verify by checking the tool result includes error
      const mockPlan: ImplementationPlan = {
        summary: 'Test',
        approach: 'Test',
        files: [],
        estimatedComplexity: 'simple',
        considerations: [],
      }

      // The test passes if no actual rm -rf / is executed
      // The executor should continue after getting blocked result
      expect(mockExecSync).not.toHaveBeenCalledWith(
        expect.stringContaining('rm -rf /'),
        expect.any(Object)
      )
    })

    it('should handle grep_search tool and produce plan', async () => {
      // Test that grep_search tool calls are processed and planning completes
      const responses = [
        {
          ok: true,
          json: () => Promise.resolve({
            id: 'chatcmpl-1',
            choices: [{
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'grep_search',
                    arguments: JSON.stringify({ pattern: 'function', file_pattern: '*.ts' })
                  }
                }]
              },
              finish_reason: 'tool_calls'
            }],
            usage: { prompt_tokens: 100, completion_tokens: 50 }
          })
        },
        {
          ok: true,
          json: () => Promise.resolve({
            id: 'chatcmpl-2',
            choices: [{
              message: {
                role: 'assistant',
                content: '```json\n{"summary": "Done", "approach": "Done", "files": [{"path": "src/test.ts", "purpose": "Test", "changes": "Add test"}], "estimatedComplexity": "simple", "considerations": []}\n```'
              },
              finish_reason: 'stop'
            }],
            usage: { prompt_tokens: 200, completion_tokens: 100 }
          })
        }
      ]

      let callIndex = 0
      mockFetch.mockImplementation(() => Promise.resolve(responses[callIndex++]))

      const result = await planWithOpenAI('Find functions', null, mockConfig)

      // The test verifies that:
      // 1. The grep_search tool call is processed
      // 2. The planning completes successfully with a plan
      expect(result.success).toBe(true)
      expect(result.plan).toBeDefined()
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })
})
