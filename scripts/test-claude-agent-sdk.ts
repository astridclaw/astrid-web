#!/usr/bin/env npx tsx
/**
 * Test script for Claude Agent SDK hybrid execution mode
 *
 * This demonstrates how to use the Claude Agent SDK for code generation
 * instead of the standard API-based approach.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=your-key npx tsx scripts/test-claude-agent-sdk.ts
 *
 * Or with a local repo:
 *   ANTHROPIC_API_KEY=your-key REPO_PATH=/path/to/repo npx tsx scripts/test-claude-agent-sdk.ts
 */

import {
  executeWithClaudeAgentSDK,
  type ClaudeAgentExecutorConfig,
} from '../lib/ai/claude-agent-sdk-executor'
import type { ImplementationPlan } from '../lib/ai/types'
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { execSync } from 'child_process'

async function main() {
  console.log('🧪 Testing Claude Agent SDK Hybrid Execution\n')

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY environment variable required')
    console.log('\nUsage:')
    console.log('  ANTHROPIC_API_KEY=your-key npx tsx scripts/test-claude-agent-sdk.ts')
    process.exit(1)
  }

  // Use provided repo path or create a test repo
  let repoPath = process.env.REPO_PATH
  let cleanup: (() => Promise<void>) | null = null

  if (!repoPath) {
    console.log('📁 Creating test repository...')
    repoPath = await mkdtemp(join(tmpdir(), 'claude-sdk-test-'))
    cleanup = async () => {
      console.log('🧹 Cleaning up test repository...')
      await rm(repoPath!, { recursive: true, force: true })
    }

    // Initialize git repo
    execSync('git init', { cwd: repoPath })
    execSync('git config user.email "test@example.com"', { cwd: repoPath })
    execSync('git config user.name "Test User"', { cwd: repoPath })

    // Create a simple TypeScript file to modify
    await mkdir(join(repoPath, 'src'), { recursive: true })
    await writeFile(
      join(repoPath, 'src', 'utils.ts'),
      `// Utility functions

export function add(a: number, b: number): number {
  return a + b
}

export function subtract(a: number, b: number): number {
  return a - b
}
`
    )

    // Create package.json
    await writeFile(
      join(repoPath, 'package.json'),
      JSON.stringify(
        {
          name: 'test-project',
          version: '1.0.0',
          type: 'module',
          scripts: {
            test: 'echo "No tests configured"',
          },
        },
        null,
        2
      )
    )

    // Initial commit
    execSync('git add .', { cwd: repoPath })
    execSync('git commit -m "Initial commit"', { cwd: repoPath })

    console.log(`📁 Test repository created at: ${repoPath}\n`)
  } else {
    console.log(`📁 Using existing repository: ${repoPath}\n`)
  }

  // Create a simple test plan
  const testPlan: ImplementationPlan = {
    summary: 'Add multiply and divide functions to utils.ts',
    approach:
      'Extend the existing utils.ts file with two new mathematical functions',
    files: [
      {
        path: 'src/utils.ts',
        purpose: 'Add multiply and divide utility functions',
        changes:
          'Add multiply() and divide() functions following the existing pattern',
      },
    ],
    estimatedComplexity: 'simple',
    considerations: [
      'Follow existing code style',
      'Handle division by zero',
      'Add JSDoc comments',
    ],
  }

  console.log('📋 Test Plan:')
  console.log(`   Summary: ${testPlan.summary}`)
  console.log(`   Files: ${testPlan.files.map((f) => f.path).join(', ')}`)
  console.log(`   Complexity: ${testPlan.estimatedComplexity}\n`)

  // Configure executor
  const config: ClaudeAgentExecutorConfig = {
    repoPath,
    maxBudgetUsd: 1.0, // Low budget for testing
    maxTurns: 20,
    logger: (level, message, meta) => {
      const icon =
        level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️'
      console.log(`${icon} [${level.toUpperCase()}] ${message}`)
      if (meta && Object.keys(meta).length > 0) {
        console.log(`   ${JSON.stringify(meta)}`)
      }
    },
    onProgress: (message) => {
      console.log(`🔄 ${message}`)
    },
  }

  console.log('🚀 Starting Claude Agent SDK execution...\n')

  try {
    const result = await executeWithClaudeAgentSDK(
      testPlan,
      'Add math utility functions',
      'Add multiply and divide functions to the utils module',
      config
    )

    console.log('\n📊 Execution Result:')
    console.log(`   Success: ${result.success}`)
    console.log(`   Files modified: ${result.files.length}`)

    if (result.files.length > 0) {
      console.log('\n📝 Modified files:')
      for (const file of result.files) {
        console.log(`   - ${file.path} (${file.action})`)
        if (file.action !== 'delete') {
          console.log(`     Preview: ${file.content.substring(0, 200)}...`)
        }
      }
    }

    if (result.usage) {
      console.log('\n💰 Usage:')
      console.log(`   Input tokens: ${result.usage.inputTokens}`)
      console.log(`   Output tokens: ${result.usage.outputTokens}`)
      console.log(`   Cost: $${result.usage.costUSD.toFixed(4)}`)
    }

    if (result.commitMessage) {
      console.log('\n📝 Generated metadata:')
      console.log(`   Commit message: ${result.commitMessage}`)
      console.log(`   PR title: ${result.prTitle}`)
    }

    if (result.error) {
      console.log(`\n❌ Error: ${result.error}`)
    }
  } catch (error) {
    console.error('\n❌ Execution failed:', error)
  } finally {
    if (cleanup) {
      await cleanup()
    }
  }

  console.log('\n✅ Test complete!')
}

main().catch(console.error)
