/**
 * Terminal Executors Unit Tests
 *
 * Simple tests that verify the terminal executor implementations
 * without making actual API calls or burning tokens.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TerminalClaudeExecutor } from './terminal-claude.js'
import { TerminalOpenAIExecutor } from './terminal-openai.js'
import { TerminalGeminiExecutor } from './terminal-gemini.js'
import {
  extractPrUrl,
  formatCommentHistory,
  buildDefaultPrompt,
  createParserState,
  parseOutputChunk,
  formatContentAsComment,
  type DetectedContent,
  type OutputParserState,
} from './terminal-base.js'

// ============================================================================
// HELPER FUNCTION TESTS
// ============================================================================

describe('terminal-base helpers', () => {
  describe('extractPrUrl', () => {
    it('extracts PR URL from text', () => {
      const output = 'Created PR at https://github.com/owner/repo/pull/123'
      expect(extractPrUrl(output)).toBe('https://github.com/owner/repo/pull/123')
    })

    it('extracts PR URL with "PR URL:" prefix', () => {
      const output = 'PR URL: https://github.com/owner/repo/pull/456'
      expect(extractPrUrl(output)).toBe('https://github.com/owner/repo/pull/456')
    })

    it('returns undefined when no PR URL found', () => {
      const output = 'No PR created in this output'
      expect(extractPrUrl(output)).toBeUndefined()
    })

    it('extracts first PR URL when multiple present', () => {
      const output = `
        First PR: https://github.com/owner/repo/pull/100
        Second PR: https://github.com/owner/repo/pull/200
      `
      expect(extractPrUrl(output)).toBe('https://github.com/owner/repo/pull/100')
    })
  })

  describe('formatCommentHistory', () => {
    it('returns empty string for undefined comments', () => {
      expect(formatCommentHistory(undefined)).toBe('')
    })

    it('returns empty string for empty array', () => {
      expect(formatCommentHistory([])).toBe('')
    })

    it('formats single comment', () => {
      const comments = [{
        authorName: 'User',
        content: 'Please fix the bug',
        createdAt: '2024-01-01T12:00:00Z'
      }]
      const result = formatCommentHistory(comments)
      expect(result).toContain('**User**')
      expect(result).toContain('Please fix the bug')
      expect(result).toContain('## Previous Discussion')
    })

    it('limits to last 10 comments', () => {
      const comments = Array.from({ length: 15 }, (_, i) => ({
        authorName: `User${i}`,
        content: `Comment ${i}`,
        createdAt: new Date(2024, 0, i + 1).toISOString()
      }))
      const result = formatCommentHistory(comments)
      // Should contain last 10 comments (5-14)
      expect(result).toContain('User5')
      expect(result).toContain('User14')
      // Should NOT contain first 5 comments
      expect(result).not.toContain('User0')
      expect(result).not.toContain('User4')
    })
  })

  describe('buildDefaultPrompt', () => {
    it('builds prompt with title and description', () => {
      const session = {
        id: 'test-id',
        taskId: 'test-id',
        title: 'Fix the login bug',
        description: 'Users cannot log in with email',
        projectPath: '/project',
        provider: 'claude' as const,
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageCount: 0,
      }
      const prompt = buildDefaultPrompt(session)
      expect(prompt).toContain('Fix the login bug')
      expect(prompt).toContain('Users cannot log in with email')
    })

    it('builds prompt without description', () => {
      const session = {
        id: 'test-id',
        taskId: 'test-id',
        title: 'Simple task',
        description: '',
        projectPath: '/project',
        provider: 'claude' as const,
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageCount: 0,
      }
      const prompt = buildDefaultPrompt(session)
      expect(prompt).toContain('Simple task')
    })
  })
})

// ============================================================================
// EXECUTOR INSTANTIATION TESTS
// ============================================================================

describe('TerminalClaudeExecutor', () => {
  it('instantiates with default options', () => {
    const executor = new TerminalClaudeExecutor()
    expect(executor).toBeInstanceOf(TerminalClaudeExecutor)
  })

  it('instantiates with custom options', () => {
    const executor = new TerminalClaudeExecutor({
      model: 'sonnet',
      maxTurns: 25,
      timeout: 300000
    })
    expect(executor).toBeInstanceOf(TerminalClaudeExecutor)
  })

  describe('parseOutput', () => {
    it('extracts PR URL from output', () => {
      const executor = new TerminalClaudeExecutor()
      const output = 'PR created: https://github.com/owner/repo/pull/123'
      const parsed = executor.parseOutput(output)
      expect(parsed.prUrl).toBe('https://github.com/owner/repo/pull/123')
    })

    it('extracts modified files from output', () => {
      const executor = new TerminalClaudeExecutor()
      const output = `
        modified: src/index.ts
        created: src/new-file.ts
        edited: src/utils.ts
      `
      const parsed = executor.parseOutput(output)
      expect(parsed.files).toContain('src/index.ts')
      expect(parsed.files).toContain('src/new-file.ts')
      expect(parsed.files).toContain('src/utils.ts')
    })

    it('extracts error messages', () => {
      const executor = new TerminalClaudeExecutor()
      const output = 'Error: Failed to compile TypeScript'
      const parsed = executor.parseOutput(output)
      expect(parsed.error).toContain('Error: Failed to compile TypeScript')
    })

    it('extracts summary from output', () => {
      const executor = new TerminalClaudeExecutor()
      const output = `
        Some initial text.

        This is a substantial paragraph that contains more than fifty characters and should be extracted as the summary.
      `
      const parsed = executor.parseOutput(output)
      expect(parsed.summary).toBeDefined()
      expect(parsed.summary!.length).toBeGreaterThan(0)
    })
  })
})

describe('TerminalOpenAIExecutor', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('instantiates with default options', () => {
    const executor = new TerminalOpenAIExecutor()
    expect(executor).toBeInstanceOf(TerminalOpenAIExecutor)
  })

  it('instantiates with custom options', () => {
    const executor = new TerminalOpenAIExecutor({
      apiKey: 'test-key',
      model: 'gpt-4-turbo',
      maxTurns: 30
    })
    expect(executor).toBeInstanceOf(TerminalOpenAIExecutor)
  })

  describe('checkAvailable', () => {
    it('returns true when OPENAI_API_KEY is set', async () => {
      const executor = new TerminalOpenAIExecutor({ apiKey: 'sk-test-key' })
      const available = await executor.checkAvailable()
      expect(available).toBe(true)
    })

    it('returns false when no API key', async () => {
      delete process.env.OPENAI_API_KEY
      const executor = new TerminalOpenAIExecutor({ apiKey: '' })
      const available = await executor.checkAvailable()
      expect(available).toBe(false)
    })
  })

  describe('parseOutput', () => {
    it('extracts task complete summary', () => {
      const executor = new TerminalOpenAIExecutor()
      const output = '[Task Complete]\nSummary: Fixed the login bug by updating the auth middleware'
      const parsed = executor.parseOutput(output)
      expect(parsed.summary).toBe('Fixed the login bug by updating the auth middleware')
    })

    it('extracts PR URL', () => {
      const executor = new TerminalOpenAIExecutor()
      const output = 'Created https://github.com/owner/repo/pull/789'
      const parsed = executor.parseOutput(output)
      expect(parsed.prUrl).toBe('https://github.com/owner/repo/pull/789')
    })
  })
})

describe('TerminalGeminiExecutor', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('instantiates with default options', () => {
    const executor = new TerminalGeminiExecutor()
    expect(executor).toBeInstanceOf(TerminalGeminiExecutor)
  })

  it('instantiates with custom options', () => {
    const executor = new TerminalGeminiExecutor({
      apiKey: 'test-key',
      model: 'gemini-1.5-pro',
      maxTurns: 40
    })
    expect(executor).toBeInstanceOf(TerminalGeminiExecutor)
  })

  describe('checkAvailable', () => {
    it('returns true when GEMINI_API_KEY is set', async () => {
      const executor = new TerminalGeminiExecutor({ apiKey: 'AIza-test-key' })
      const available = await executor.checkAvailable()
      expect(available).toBe(true)
    })

    it('returns false when no API key', async () => {
      delete process.env.GEMINI_API_KEY
      const executor = new TerminalGeminiExecutor({ apiKey: '' })
      const available = await executor.checkAvailable()
      expect(available).toBe(false)
    })
  })

  describe('parseOutput', () => {
    it('extracts task complete summary', () => {
      const executor = new TerminalGeminiExecutor()
      const output = '[Task Complete]\nSummary: Implemented the new feature'
      const parsed = executor.parseOutput(output)
      expect(parsed.summary).toBe('Implemented the new feature')
    })

    it('extracts modified files', () => {
      const executor = new TerminalGeminiExecutor()
      const output = `
        wrote: src/feature.ts
        modified: src/index.ts
      `
      const parsed = executor.parseOutput(output)
      expect(parsed.files).toContain('src/feature.ts')
      expect(parsed.files).toContain('src/index.ts')
    })
  })
})

// ============================================================================
// OUTPUT PARSING TESTS
// ============================================================================

describe('Output parsing for plans and questions', () => {
  describe('createParserState', () => {
    it('creates a fresh parser state', () => {
      const state = createParserState()
      expect(state.buffer).toBe('')
      expect(state.lastPlanPosted).toBe(0)
      expect(state.lastProgressPosted).toBe(0)
      expect(state.lastQuestionPosted).toBe(0)
      expect(state.postedPlans.size).toBe(0)
      expect(state.postedQuestions.size).toBe(0)
    })
  })

  describe('parseOutputChunk', () => {
    it('detects plan headers in output', () => {
      const state = createParserState()
      const output = `## Implementation Plan

1. First, I'll analyze the codebase
2. Then, I'll make the necessary changes
3. Finally, I'll run the tests

`
      const detected = parseOutputChunk(output, state)
      expect(detected.length).toBeGreaterThan(0)
      expect(detected.some(d => d.type === 'plan')).toBe(true)
    })

    it('detects questions in output', () => {
      const state = createParserState()
      const output = `Before I proceed, I have a question.

Do you want me to use the existing database schema or create a new one?

`
      const detected = parseOutputChunk(output, state)
      expect(detected.some(d => d.type === 'question')).toBe(true)
    })

    it('detects progress updates in output', () => {
      const state = createParserState()
      const output = `Creating file src/components/Button.tsx

`
      const detected = parseOutputChunk(output, state)
      expect(detected.some(d => d.type === 'progress')).toBe(true)
    })

    it('detects PR created in output', () => {
      const state = createParserState()
      const output = `PR created at https://github.com/owner/repo/pull/123

`
      const detected = parseOutputChunk(output, state)
      expect(detected.some(d => d.type === 'pr_created')).toBe(true)
      const prItem = detected.find(d => d.type === 'pr_created')
      expect(prItem?.content).toBe('https://github.com/owner/repo/pull/123')
    })

    it('ignores short chunks', () => {
      const state = createParserState()
      const output = `OK

`
      const detected = parseOutputChunk(output, state)
      expect(detected.length).toBe(0)
    })

    it('deduplicates repeated plans', () => {
      const state = createParserState()
      const plan = `## Implementation Plan

Here is my implementation plan for this task.

`
      // First call should detect the plan
      const first = parseOutputChunk(plan, state)
      expect(first.some(d => d.type === 'plan')).toBe(true)

      // Second call with same content should not duplicate
      const second = parseOutputChunk(plan, state)
      expect(second.filter(d => d.type === 'plan').length).toBe(0)
    })

    it('accumulates partial chunks in buffer', () => {
      const state = createParserState()

      // Partial chunk (no double newline)
      parseOutputChunk('## Plan\nThis is the start of a plan', state)
      expect(state.buffer.length).toBeGreaterThan(0)

      // Complete the chunk
      const detected = parseOutputChunk(' and here is the rest with enough content.\n\n', state)
      // Buffer should be processed
      expect(state.buffer).toBe('')
    })

    it('respects rate limiting for progress', () => {
      const state = createParserState()
      state.lastProgressPosted = Date.now() // Just posted

      const output = `Creating file src/test.ts

`
      const detected = parseOutputChunk(output, state)
      // Should not detect progress because of rate limit
      expect(detected.filter(d => d.type === 'progress').length).toBe(0)
    })
  })

  describe('formatContentAsComment', () => {
    it('formats plan content', () => {
      const content: DetectedContent = {
        type: 'plan',
        content: 'My implementation plan here',
      }
      const comment = formatContentAsComment(content, 'Claude')
      expect(comment).toContain("**Claude's Plan**")
      expect(comment).toContain('My implementation plan here')
      expect(comment).toContain('Planning in progress')
    })

    it('formats question content', () => {
      const content: DetectedContent = {
        type: 'question',
        content: 'Do you want me to use TypeScript?',
      }
      const comment = formatContentAsComment(content, 'OpenAI')
      expect(comment).toContain('**OpenAI has a question**')
      expect(comment).toContain('Do you want me to use TypeScript?')
      expect(comment).toContain('reply to this comment')
    })

    it('formats progress content', () => {
      const content: DetectedContent = {
        type: 'progress',
        content: 'Running tests...',
      }
      const comment = formatContentAsComment(content, 'Gemini')
      expect(comment).toContain('**Progress Update**')
      expect(comment).toContain('Running tests...')
    })

    it('formats PR created content', () => {
      const content: DetectedContent = {
        type: 'pr_created',
        content: 'https://github.com/owner/repo/pull/123',
      }
      const comment = formatContentAsComment(content)
      expect(comment).toContain('**Pull Request Created**')
      expect(comment).toContain('https://github.com/owner/repo/pull/123')
    })
  })
})

// ============================================================================
// INTERFACE COMPLIANCE TESTS
// ============================================================================

describe('TerminalExecutor interface compliance', () => {
  it('all executors have required methods', () => {
    const claude = new TerminalClaudeExecutor()
    const openai = new TerminalOpenAIExecutor()
    const gemini = new TerminalGeminiExecutor()

    // Check all required methods exist
    for (const executor of [claude, openai, gemini]) {
      expect(typeof executor.checkAvailable).toBe('function')
      expect(typeof executor.startSession).toBe('function')
      expect(typeof executor.resumeSession).toBe('function')
      expect(typeof executor.parseOutput).toBe('function')
    }
  })
})

// ============================================================================
// GIT WORKTREE TESTS
// ============================================================================

import {
  getWorktreeConfig,
  shouldUseWorktree,
} from './terminal-base.js'

describe('Git worktree configuration', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('getWorktreeConfig', () => {
    it('returns default config when no env vars set', () => {
      delete process.env.ASTRID_AGENT_WORKTREE
      delete process.env.ASTRID_AGENT_WORKTREE_DIR
      delete process.env.ASTRID_AGENT_WORKTREE_CLEANUP

      const config = getWorktreeConfig()
      expect(config.enabled).toBe(true) // Default is enabled
      expect(config.baseDir).toBe('/tmp/astrid-worktrees')
      expect(config.autoCleanup).toBe(true)
    })

    it('respects ASTRID_AGENT_WORKTREE=false to disable', () => {
      process.env.ASTRID_AGENT_WORKTREE = 'false'

      const config = getWorktreeConfig()
      expect(config.enabled).toBe(false)
    })

    it('respects custom worktree directory', () => {
      process.env.ASTRID_AGENT_WORKTREE_DIR = '/custom/worktrees'

      const config = getWorktreeConfig()
      expect(config.baseDir).toBe('/custom/worktrees')
    })

    it('respects cleanup setting', () => {
      process.env.ASTRID_AGENT_WORKTREE_CLEANUP = 'false'

      const config = getWorktreeConfig()
      expect(config.autoCleanup).toBe(false)
    })
  })

  describe('shouldUseWorktree', () => {
    it('returns true by default', () => {
      delete process.env.ASTRID_AGENT_WORKTREE

      expect(shouldUseWorktree()).toBe(true)
    })

    it('returns false when disabled via env var', () => {
      process.env.ASTRID_AGENT_WORKTREE = 'false'

      expect(shouldUseWorktree()).toBe(false)
    })
  })
})
