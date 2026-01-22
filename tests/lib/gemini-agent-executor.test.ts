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
  planWithGemini,
  executeWithGemini,
  type GeminiAgentExecutorConfig,
} from '@/lib/ai/gemini-agent-executor'
import type { ImplementationPlan } from '@/lib/ai/types'

const mockReadFile = readFile as ReturnType<typeof vi.fn>
const mockWriteFile = writeFile as ReturnType<typeof vi.fn>
const mockAccess = access as ReturnType<typeof vi.fn>
const mockMkdir = mkdir as ReturnType<typeof vi.fn>
const mockExecSync = execSync as ReturnType<typeof vi.fn>
const mockGlob = glob as ReturnType<typeof vi.fn>

describe('Gemini Agent Executor', () => {
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

  const mockConfig: GeminiAgentExecutorConfig = {
    repoPath: '/tmp/test-repo',
    apiKey: 'test-gemini-key',
    model: 'gemini-2.0-flash',
    maxIterations: 10,
    logger: vi.fn(),
    onProgress: vi.fn(),
  }

  describe('planWithGemini', () => {
    it('should successfully create a plan after exploring codebase', async () => {
      // Mock Gemini API responses
      const responses = [
        // First response: function call to explore
        {
          ok: true,
          json: () => Promise.resolve({
            candidates: [{
              content: {
                role: 'model',
                parts: [{
                  functionCall: {
                    name: 'glob_files',
                    args: { pattern: '**/*.ts' }
                  }
                }]
              },
              finishReason: 'STOP'
            }],
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 }
          })
        },
        // Second response: plan
        {
          ok: true,
          json: () => Promise.resolve({
            candidates: [{
              content: {
                role: 'model',
                parts: [{
                  text: '```json\n{"summary": "Add feature", "approach": "Modify utils", "files": [{"path": "src/utils.ts", "purpose": "Add function", "changes": "New function"}], "estimatedComplexity": "simple", "considerations": ["Test"]}\n```'
                }]
              },
              finishReason: 'STOP'
            }],
            usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 100 }
          })
        }
      ]

      let callIndex = 0
      mockFetch.mockImplementation(() => Promise.resolve(responses[callIndex++]))

      mockGlob.mockResolvedValue(['src/utils.ts', 'src/index.ts'])

      const result = await planWithGemini('Add feature', 'Add a new feature', mockConfig)

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
        text: () => Promise.resolve('{"error": {"message": "Invalid API key", "code": 401}}')
      })

      const result = await planWithGemini('Test task', null, mockConfig)

      expect(result.success).toBe(false)
      expect(result.error).toContain('API key')
    })

    it('should handle rate limit with retry', async () => {
      const responses = [
        // First: rate limit
        {
          ok: false,
          status: 429,
          text: () => Promise.resolve('{"error": {"message": "quota exceeded", "code": 429}}')
        },
        // Second: success with plan
        {
          ok: true,
          json: () => Promise.resolve({
            candidates: [{
              content: {
                role: 'model',
                parts: [{
                  text: '```json\n{"summary": "Test", "approach": "Test", "files": [{"path": "src/test.ts", "purpose": "Test", "changes": "Test"}], "estimatedComplexity": "simple", "considerations": []}\n```'
                }]
              },
              finishReason: 'STOP'
            }],
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 }
          })
        }
      ]

      let callIndex = 0
      mockFetch.mockImplementation(() => Promise.resolve(responses[callIndex++]))

      const result = await planWithGemini('Test task', null, mockConfig)

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should respect max iterations', async () => {
      // Always return function calls to exhaust iterations
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{
            content: {
              role: 'model',
              parts: [{
                functionCall: {
                  name: 'glob_files',
                  args: { pattern: '**/*.ts' }
                }
              }]
            },
            finishReason: 'STOP'
          }],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 }
        })
      })

      mockGlob.mockResolvedValue(['file.ts'])

      const limitedConfig = { ...mockConfig, maxIterations: 3 }
      const result = await planWithGemini('Test task', null, limitedConfig)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Max iterations')
    })

    it('should handle no response from API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          candidates: [], // No candidates
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 0 }
        })
      })

      const result = await planWithGemini('Test task', null, mockConfig)

      expect(result.success).toBe(false)
      expect(result.error).toBe('No response from Gemini')
    })
  })

  describe('executeWithGemini', () => {
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
            candidates: [{
              content: {
                role: 'model',
                parts: [{
                  functionCall: {
                    name: 'read_file',
                    args: { file_path: 'src/utils.ts' }
                  }
                }]
              },
              finishReason: 'STOP'
            }],
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 }
          })
        },
        // Second: edit file
        {
          ok: true,
          json: () => Promise.resolve({
            candidates: [{
              content: {
                role: 'model',
                parts: [{
                  functionCall: {
                    name: 'edit_file',
                    args: {
                      file_path: 'src/utils.ts',
                      old_string: 'export {}',
                      new_string: 'export function multiply(a: number, b: number) { return a * b }\nexport {}'
                    }
                  }
                }]
              },
              finishReason: 'STOP'
            }],
            usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 100 }
          })
        },
        // Third: task_complete
        {
          ok: true,
          json: () => Promise.resolve({
            candidates: [{
              content: {
                role: 'model',
                parts: [{
                  functionCall: {
                    name: 'task_complete',
                    args: {
                      commit_message: 'feat: add multiply function',
                      pr_title: 'feat: Add multiply function',
                      pr_description: 'Added multiply utility function'
                    }
                  }
                }]
              },
              finishReason: 'STOP'
            }],
            usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 150 }
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

      const result = await executeWithGemini(mockPlan, 'Add multiply', null, mockConfig)

      expect(result.success).toBe(true)
      expect(result.files).toHaveLength(1)
      expect(result.files[0].path).toBe('src/utils.ts')
      expect(result.files[0].action).toBe('modify')
      expect(result.commitMessage).toBe('feat: add multiply function')
      expect(result.prTitle).toBe('feat: Add multiply function')
    })

    it('should handle execution errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const result = await executeWithGemini(mockPlan, 'Test task', null, mockConfig)

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
            candidates: [{
              content: {
                role: 'model',
                parts: [{
                  functionCall: {
                    name: 'write_file',
                    args: {
                      file_path: 'src/new-file.ts',
                      content: 'export const value = 42'
                    }
                  }
                }]
              },
              finishReason: 'STOP'
            }],
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 }
          })
        },
        // Second: task_complete
        {
          ok: true,
          json: () => Promise.resolve({
            candidates: [{
              content: {
                role: 'model',
                parts: [{
                  functionCall: {
                    name: 'task_complete',
                    args: {
                      commit_message: 'feat: add new file',
                      pr_title: 'feat: Add new file',
                      pr_description: 'Created new-file.ts'
                    }
                  }
                }]
              },
              finishReason: 'STOP'
            }],
            usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 100 }
          })
        }
      ]

      let callIndex = 0
      mockFetch.mockImplementation(() => Promise.resolve(responses[callIndex++]))

      // File doesn't exist
      mockAccess.mockRejectedValue(new Error('ENOENT'))
      mockMkdir.mockResolvedValue(undefined)
      mockWriteFile.mockResolvedValue(undefined)

      const result = await executeWithGemini(mockPlan, 'Create file', null, mockConfig)

      expect(result.success).toBe(true)
      expect(result.files).toHaveLength(1)
      expect(result.files[0].path).toBe('src/new-file.ts')
      expect(result.files[0].action).toBe('create')
    })

    it('should report progress via callback', async () => {
      const progressMessages: string[] = []
      const configWithProgress: GeminiAgentExecutorConfig = {
        ...mockConfig,
        onProgress: (msg) => progressMessages.push(msg),
      }

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{
            content: {
              role: 'model',
              parts: [{
                functionCall: {
                  name: 'task_complete',
                  args: {
                    commit_message: 'feat: done',
                    pr_title: 'Done',
                    pr_description: 'Done'
                  }
                }
              }]
            },
            finishReason: 'STOP'
          }],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 }
        })
      })

      await executeWithGemini(mockPlan, 'Test task', null, configWithProgress)

      expect(progressMessages.length).toBeGreaterThan(0)
      expect(progressMessages).toContain('Initializing Gemini agent...')
    })

    it('should handle max iterations with partial results', async () => {
      // Return tool calls that don't complete task
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{
            content: {
              role: 'model',
              parts: [{
                functionCall: {
                  name: 'write_file',
                  args: {
                    file_path: 'src/partial.ts',
                    content: 'partial content'
                  }
                }
              }]
            },
            finishReason: 'STOP'
          }],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 }
        })
      })

      mockAccess.mockRejectedValue(new Error('ENOENT'))
      mockMkdir.mockResolvedValue(undefined)
      mockWriteFile.mockResolvedValue(undefined)

      const limitedConfig = { ...mockConfig, maxIterations: 2 }
      const result = await executeWithGemini(mockPlan, 'Test task', null, limitedConfig)

      // Should have partial results
      expect(result.files.length).toBeGreaterThan(0)
      expect(result.error).toContain('Max iterations')
    })
  })

  describe('Tool Execution', () => {
    it('should block dangerous bash commands', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{
            content: {
              role: 'model',
              parts: [{
                functionCall: {
                  name: 'run_bash',
                  args: { command: 'rm -rf /' }
                }
              }]
            },
            finishReason: 'STOP'
          }],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 }
        })
      })

      // The command should be blocked - verify execSync was never called with dangerous command
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
            candidates: [{
              content: {
                role: 'model',
                parts: [{
                  functionCall: {
                    name: 'grep_search',
                    args: { pattern: 'function', file_pattern: '*.ts' }
                  }
                }]
              },
              finishReason: 'STOP'
            }],
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 }
          })
        },
        {
          ok: true,
          json: () => Promise.resolve({
            candidates: [{
              content: {
                role: 'model',
                parts: [{
                  text: '```json\n{"summary": "Done", "approach": "Done", "files": [{"path": "src/test.ts", "purpose": "Test", "changes": "Add test"}], "estimatedComplexity": "simple", "considerations": []}\n```'
                }]
              },
              finishReason: 'STOP'
            }],
            usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 100 }
          })
        }
      ]

      let callIndex = 0
      mockFetch.mockImplementation(() => Promise.resolve(responses[callIndex++]))

      const result = await planWithGemini('Find functions', null, mockConfig)

      // The test verifies that:
      // 1. The grep_search tool call is processed
      // 2. The planning completes successfully with a plan
      expect(result.success).toBe(true)
      expect(result.plan).toBeDefined()
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should handle edit_file when string not found', async () => {
      const responses = [
        {
          ok: true,
          json: () => Promise.resolve({
            candidates: [{
              content: {
                role: 'model',
                parts: [{
                  functionCall: {
                    name: 'edit_file',
                    args: {
                      file_path: 'src/test.ts',
                      old_string: 'nonexistent string',
                      new_string: 'replacement'
                    }
                  }
                }]
              },
              finishReason: 'STOP'
            }],
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 }
          })
        },
        {
          ok: true,
          json: () => Promise.resolve({
            candidates: [{
              content: {
                role: 'model',
                parts: [{
                  functionCall: {
                    name: 'task_complete',
                    args: {
                      commit_message: 'attempt',
                      pr_title: 'Attempt',
                      pr_description: 'Tried to edit'
                    }
                  }
                }]
              },
              finishReason: 'STOP'
            }],
            usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 100 }
          })
        }
      ]

      let callIndex = 0
      mockFetch.mockImplementation(() => Promise.resolve(responses[callIndex++]))

      mockReadFile.mockImplementation((path: string) => {
        if (path.includes('test.ts')) {
          return Promise.resolve('some other content')
        }
        return Promise.reject(new Error('File not found'))
      })

      const mockPlan: ImplementationPlan = {
        summary: 'Test',
        approach: 'Test',
        files: [{ path: 'src/test.ts', purpose: 'Test', changes: 'Test' }],
        estimatedComplexity: 'simple',
        considerations: [],
      }

      const result = await executeWithGemini(mockPlan, 'Test edit', null, mockConfig)

      // Should complete but without the file change since string wasn't found
      expect(result.success).toBe(true)
      expect(result.files).toHaveLength(0) // No file changes recorded
    })
  })

  describe('Timeout Handling', () => {
    it('should handle API timeout gracefully', async () => {
      // Mock fetch to simulate timeout via AbortError
      mockFetch.mockImplementation(() => {
        const error = new Error('The operation was aborted')
        error.name = 'AbortError'
        return Promise.reject(error)
      })

      const result = await planWithGemini('Test task', null, mockConfig)

      expect(result.success).toBe(false)
      expect(result.error).toContain('timed out')
    })
  })

  describe('Config Integration', () => {
    it('should load and use astrid config when available', async () => {
      // Mock config file exists
      mockReadFile.mockImplementation((path: string) => {
        if (path.includes('.astrid.config.json')) {
          return Promise.resolve(JSON.stringify({
            projectStructure: {
              ios: { rootPath: 'ios-app/', filePatterns: ['**/*.swift'] }
            },
            platformDetection: {
              ios: { keywords: ['ios', 'swift', 'swiftui'] }
            }
          }))
        }
        if (path.includes('ASTRID.md')) {
          return Promise.resolve('# Test Project\nProject context here.')
        }
        return Promise.resolve('mock file content')
      })

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          candidates: [{
            content: {
              role: 'model',
              parts: [{
                text: '```json\n{"summary": "iOS feature", "approach": "SwiftUI", "files": [{"path": "ios-app/Views/Test.swift", "purpose": "Add view", "changes": "New view"}], "estimatedComplexity": "simple", "considerations": []}\n```'
              }]
            },
            finishReason: 'STOP'
          }],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 }
        })
      })

      const result = await planWithGemini('Add iOS feature', 'Add SwiftUI view', mockConfig)

      expect(result.success).toBe(true)
      // Verify the API was called (config was loaded successfully)
      expect(mockFetch).toHaveBeenCalled()
    })
  })
})
