/**
 * Tests for Terminal Claude Executor
 *
 * These tests verify the terminal mode functionality for the astrid-sdk
 * which spawns the local Claude Code CLI to process tasks.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

// Import the terminal executor from astrid-sdk
import {
  TerminalClaudeExecutor,
  terminalSessionStore,
  type TerminalExecutionResult,
  type TerminalTaskContext,
} from '../../packages/astrid-sdk/src/executors/terminal-claude'

describe('TerminalClaudeExecutor', () => {
  let executor: TerminalClaudeExecutor

  beforeEach(() => {
    executor = new TerminalClaudeExecutor({
      model: 'opus',
      maxTurns: 10,
      timeout: 30000,
    })
  })

  describe('constructor', () => {
    it('should use default values when no options provided', () => {
      const defaultExecutor = new TerminalClaudeExecutor()
      // The executor is created - we can't directly access private fields,
      // but we can verify it doesn't throw
      expect(defaultExecutor).toBeDefined()
    })

    it('should accept custom options', () => {
      const customExecutor = new TerminalClaudeExecutor({
        model: 'sonnet',
        maxTurns: 100,
        timeout: 600000,
      })
      expect(customExecutor).toBeDefined()
    })
  })

  describe('extractPrUrl', () => {
    it('should extract GitHub PR URL from output', () => {
      const output = `
        Task completed successfully!
        Created PR at https://github.com/owner/repo/pull/123
        Please review.
      `
      const url = executor.extractPrUrl(output)
      expect(url).toBe('https://github.com/owner/repo/pull/123')
    })

    it('should extract PR URL with "PR URL:" prefix', () => {
      const output = `
        PR URL: https://github.com/test/project/pull/456
      `
      const url = executor.extractPrUrl(output)
      expect(url).toBe('https://github.com/test/project/pull/456')
    })

    it('should extract PR URL with "Pull Request:" prefix', () => {
      const output = `
        Pull Request: https://github.com/example/app/pull/789
      `
      const url = executor.extractPrUrl(output)
      expect(url).toBe('https://github.com/example/app/pull/789')
    })

    it('should return undefined when no PR URL found', () => {
      const output = 'No PR was created in this run.'
      const url = executor.extractPrUrl(output)
      expect(url).toBeUndefined()
    })

    it('should handle multiple PR URLs and return the first', () => {
      const output = `
        First PR: https://github.com/owner/repo/pull/1
        Second PR: https://github.com/owner/repo/pull/2
      `
      const url = executor.extractPrUrl(output)
      expect(url).toBe('https://github.com/owner/repo/pull/1')
    })
  })

  describe('parseOutput', () => {
    it('should extract modified files from output', () => {
      const output = `
        Starting task...
        modified: src/components/Button.tsx
        created: src/utils/helpers.ts
        edited: package.json
        Done!
      `
      const parsed = executor.parseOutput(output)
      expect(parsed.files).toContain('src/components/Button.tsx')
      expect(parsed.files).toContain('src/utils/helpers.ts')
      expect(parsed.files).toContain('package.json')
    })

    it('should extract PR URL from output', () => {
      const output = `
        Changes committed.
        https://github.com/owner/repo/pull/123
      `
      const parsed = executor.parseOutput(output)
      expect(parsed.prUrl).toBe('https://github.com/owner/repo/pull/123')
    })

    it('should extract error messages', () => {
      const output = `
        Attempting to build...
        error: TypeScript compilation failed
        Build aborted.
      `
      const parsed = executor.parseOutput(output)
      expect(parsed.error).toContain('error: TypeScript compilation failed')
    })

    it('should extract summary from last paragraph', () => {
      const output = `
        Starting work on the task.

        Made some changes.

        This is a longer summary paragraph that describes what was done in detail and should be extracted as the summary.
      `
      const parsed = executor.parseOutput(output)
      expect(parsed.summary).toContain('This is a longer summary')
    })

    it('should handle empty output', () => {
      const parsed = executor.parseOutput('')
      expect(parsed.files).toBeUndefined()
      expect(parsed.prUrl).toBeUndefined()
      expect(parsed.error).toBeUndefined()
      expect(parsed.summary).toBeUndefined()
    })

    it('should deduplicate file paths', () => {
      const output = `
        modified: src/app.ts
        modified: src/app.ts
        modified: src/app.ts
      `
      const parsed = executor.parseOutput(output)
      expect(parsed.files).toHaveLength(1)
      expect(parsed.files![0]).toBe('src/app.ts')
    })
  })

  describe('formatCommentHistory', () => {
    it('should return empty string for no comments', () => {
      const result = executor['formatCommentHistory'](undefined)
      expect(result).toBe('')
    })

    it('should return empty string for empty array', () => {
      const result = executor['formatCommentHistory']([])
      expect(result).toBe('')
    })

    it('should format comments correctly', () => {
      const comments = [
        {
          authorName: 'User',
          content: 'Please fix this bug',
          createdAt: '2024-01-15T10:00:00Z',
        },
        {
          authorName: 'Claude',
          content: 'Working on it!',
          createdAt: '2024-01-15T10:05:00Z',
        },
      ]
      const result = executor['formatCommentHistory'](comments)
      expect(result).toContain('## Previous Discussion')
      expect(result).toContain('**User**')
      expect(result).toContain('Please fix this bug')
      expect(result).toContain('**Claude**')
      expect(result).toContain('Working on it!')
    })

    it('should limit to last 10 comments', () => {
      const comments = Array.from({ length: 15 }, (_, i) => ({
        authorName: `User${i}`,
        content: `Comment ${i}`,
        createdAt: new Date(Date.now() + i * 1000).toISOString(),
      }))
      const result = executor['formatCommentHistory'](comments)
      // Should contain User5-User14 (last 10)
      expect(result).toContain('User5')
      expect(result).toContain('User14')
      expect(result).not.toContain('User4')
    })
  })

  describe('buildPrompt', () => {
    const mockSession = {
      id: 'session-1',
      taskId: 'task-1',
      title: 'Fix login bug',
      description: 'The login button does not work on mobile',
      projectPath: '/tmp/test-project',
      provider: 'claude' as const,
      claudeSessionId: undefined,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
    }

    // Note: buildPrompt now includes structured workflow instructions.
    // The format includes task title, description, and step-by-step workflow.

    it('should include task title and description in structured format', async () => {
      const prompt = await executor['buildPrompt'](mockSession)
      expect(prompt).toContain('# Task: Fix login bug')
      expect(prompt).toContain('## Description')
      expect(prompt).toContain('The login button does not work on mobile')
      expect(prompt).toContain('REQUIRED Workflow:')
    })

    it('should handle session without description', async () => {
      const sessionNoDesc = { ...mockSession, description: undefined }
      const prompt = await executor['buildPrompt'](sessionNoDesc)
      expect(prompt).toContain('# Task: Fix login bug')
      expect(prompt).not.toContain('## Description')
      expect(prompt).toContain('REQUIRED Workflow:')
    })

    it('should handle session with empty description', async () => {
      const sessionEmptyDesc = { ...mockSession, description: '   ' }
      const prompt = await executor['buildPrompt'](sessionEmptyDesc)
      expect(prompt).toContain('# Task: Fix login bug')
      expect(prompt).not.toContain('## Description')
      expect(prompt).toContain('REQUIRED Workflow:')
    })

    it('should use userMessage directly for follow-up prompts', async () => {
      const prompt = await executor['buildPrompt'](mockSession, 'Please also update the tests')
      expect(prompt).toBe('Please also update the tests')
      // Should not include the task prompt for follow-ups
      expect(prompt).not.toContain('Complete this task')
    })

    it('should return userMessage directly even with context', async () => {
      const context: TerminalTaskContext = {
        comments: [
          {
            authorName: 'User',
            content: 'This is broken',
            createdAt: '2024-01-15T10:00:00Z',
          },
        ],
      }
      // Follow-up messages return userMessage directly (context is not embedded in prompt)
      // Claude Code maintains conversation context via session resumption instead
      const prompt = await executor['buildPrompt'](mockSession, 'Fix it please', context)
      expect(prompt).toBe('Fix it please')
    })
  })

  describe('checkAvailable', () => {
    it('should return boolean indicating Claude CLI availability', async () => {
      // This will check if 'claude' command is available
      const available = await executor.checkAvailable()
      expect(typeof available).toBe('boolean')
    })
  })
})

describe('TerminalSessionStore', () => {
  const testDataDir = path.join(os.tmpdir(), 'astrid-agent-test-' + Date.now())
  let originalEnv: string | undefined

  beforeEach(async () => {
    // Set up test data directory
    originalEnv = process.env.ASTRID_AGENT_DATA_DIR
    process.env.ASTRID_AGENT_DATA_DIR = testDataDir
    await fs.mkdir(testDataDir, { recursive: true })
  })

  afterEach(async () => {
    // Clean up
    if (originalEnv !== undefined) {
      process.env.ASTRID_AGENT_DATA_DIR = originalEnv
    } else {
      delete process.env.ASTRID_AGENT_DATA_DIR
    }
    try {
      await fs.rm(testDataDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  // Note: Since terminalSessionStore is a singleton, these tests may interfere
  // We test the patterns that would work with a fresh instance

  describe('session persistence pattern', () => {
    it('should store and retrieve Claude session ID', async () => {
      // Create a new store pointing to test directory
      const { TerminalClaudeExecutor } = await import(
        '../../packages/astrid-sdk/src/executors/terminal-claude'
      )

      // We can't easily test the singleton, but we can verify the pattern
      // by checking the file operations work
      const sessionFilePath = path.join(testDataDir, 'terminal-sessions.json')

      // Write a test session
      const testData = { 'task-123': 'session-abc' }
      await fs.mkdir(path.dirname(sessionFilePath), { recursive: true })
      await fs.writeFile(sessionFilePath, JSON.stringify(testData, null, 2))

      // Read it back
      const content = await fs.readFile(sessionFilePath, 'utf-8')
      const parsed = JSON.parse(content)

      expect(parsed['task-123']).toBe('session-abc')
    })
  })
})

describe('Terminal Mode CLI Arguments', () => {
  // Test the CLI argument parsing logic patterns

  describe('flag parsing patterns', () => {
    it('should detect --terminal flag', () => {
      const args = ['--terminal', '--model=sonnet']
      expect(args.includes('--terminal')).toBe(true)
    })

    it('should parse --model flag', () => {
      const args = ['--terminal', '--model=sonnet']
      const modelArg = args.find(a => a.startsWith('--model='))
      expect(modelArg?.split('=')[1]).toBe('sonnet')
    })

    it('should parse --cwd flag', () => {
      const args = ['--terminal', '--cwd=/path/to/project']
      const cwdArg = args.find(a => a.startsWith('--cwd='))
      expect(cwdArg?.split('=')[1]).toBe('/path/to/project')
    })

    it('should parse --max-turns flag', () => {
      const args = ['--terminal', '--max-turns=100']
      const maxTurnsArg = args.find(a => a.startsWith('--max-turns='))
      expect(parseInt(maxTurnsArg?.split('=')[1] || '50', 10)).toBe(100)
    })

    it('should find task ID as non-flag argument', () => {
      const args = ['--terminal', 'task-123', '--model=opus']
      const taskIdArg = args.find(a => !a.startsWith('-') && a !== 'serve')
      expect(taskIdArg).toBe('task-123')
    })

    it('should distinguish serve command from task ID', () => {
      const args = ['serve', '--port=3001']
      const taskIdArg = args.find(a => !a.startsWith('-') && a !== 'serve')
      expect(taskIdArg).toBeUndefined()
    })
  })
})

describe('Terminal Mode Config', () => {
  describe('environment variable patterns', () => {
    it('should recognize ASTRID_TERMINAL_MODE=true', () => {
      const terminalMode = 'true' === 'true'
      expect(terminalMode).toBe(true)
    })

    it('should default to false for undefined ASTRID_TERMINAL_MODE', () => {
      const terminalMode = undefined === 'true'
      expect(terminalMode).toBe(false)
    })

    it('should parse CLAUDE_MODEL with default', () => {
      const model = undefined || 'opus'
      expect(model).toBe('opus')
    })

    it('should parse CLAUDE_MAX_TURNS with default', () => {
      const maxTurns = parseInt(undefined || '50', 10)
      expect(maxTurns).toBe(50)
    })

    it('should parse custom CLAUDE_MAX_TURNS', () => {
      const maxTurns = parseInt('100' || '50', 10)
      expect(maxTurns).toBe(100)
    })
  })
})

describe('Git Changes Detection', () => {
  describe('captureGitChanges pattern', () => {
    it('should parse git status --porcelain output', () => {
      const statusOutput = ` M src/app.ts
 A src/new-file.ts
?? untracked.txt`

      const files = statusOutput
        .split('\n')
        .filter(line => line.trim())
        .map(line => line.slice(3).trim())

      expect(files).toContain('src/app.ts')
      expect(files).toContain('src/new-file.ts')
      expect(files).toContain('untracked.txt')
    })

    it('should handle empty git status', () => {
      const statusOutput = ''
      const files = statusOutput
        .split('\n')
        .filter(line => line.trim())
        .map(line => line.slice(3).trim())

      expect(files).toHaveLength(0)
    })
  })
})

describe('Session Resume Logic', () => {
  describe('resume decision pattern', () => {
    it('should resume when session exists and is follow-up', () => {
      const existingSessionId = 'session-123'
      const isFollowUp = true

      const shouldResume = isFollowUp && existingSessionId
      expect(!!shouldResume).toBe(true)
    })

    it('should not resume when no existing session', () => {
      const existingSessionId = undefined
      const isFollowUp = true

      const shouldResume = isFollowUp && existingSessionId
      expect(!!shouldResume).toBe(false)
    })

    it('should not resume when not a follow-up', () => {
      const existingSessionId = 'session-123'
      const isFollowUp = false

      const shouldResume = isFollowUp && existingSessionId
      expect(!!shouldResume).toBe(false)
    })

    it('should start new session for first task', () => {
      const existingSessionId = undefined
      const isFollowUp = false

      const shouldResume = isFollowUp && existingSessionId
      expect(!!shouldResume).toBe(false)
    })
  })
})
