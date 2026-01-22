#!/usr/bin/env tsx
/**
 * List all active worktrees with their details
 *
 * Usage: npm run work:list
 *
 * Shows:
 * - Task ID
 * - Worktree path
 * - Branch name
 * - Port assignment
 * - Database name
 * - Git status (clean/dirty)
 */

import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

interface WorktreeInfo {
  taskId: string
  path: string
  branch: string
  port: number
  databaseUrl: string
}

function getWorktreeStatus(path: string): string {
  try {
    const status = execSync('git status --porcelain', {
      cwd: path,
      encoding: 'utf-8'
    })
    return status.trim() ? '⚠️  Uncommitted changes' : '✅ Clean'
  } catch (error) {
    return '❓ Unknown'
  }
}

function listWorktrees() {
  console.log(`\n🌳 Active Worktrees\n`)

  // Get all worktrees from git
  const worktreeList = execSync('git worktree list --porcelain', { encoding: 'utf-8' })
  const worktrees = worktreeList.split('\n\n').filter(w => w.includes('www-task-'))

  if (worktrees.length === 0) {
    console.log('📭 No active worktrees found.')
    console.log('\n💡 Start parallel work with: npm run work:start <taskId> [description]\n')
    return
  }

  const worktreeInfos: Array<WorktreeInfo & { status: string }> = []

  for (const worktree of worktrees) {
    const pathMatch = worktree.match(/worktree (.+)/)
    const branchMatch = worktree.match(/branch refs\/heads\/(.+)/)

    if (pathMatch) {
      const wtPath = pathMatch[1]
      const infoPath = join(wtPath, '.worktree-info.json')

      if (existsSync(infoPath)) {
        const info: WorktreeInfo = JSON.parse(readFileSync(infoPath, 'utf-8'))
        const status = getWorktreeStatus(wtPath)

        worktreeInfos.push({ ...info, status })
      } else {
        // Fallback if .worktree-info.json doesn't exist
        const taskIdMatch = wtPath.match(/www-task-(\d+)/)
        if (taskIdMatch) {
          worktreeInfos.push({
            taskId: taskIdMatch[1],
            path: wtPath,
            branch: branchMatch ? branchMatch[1] : 'unknown',
            port: 0,
            databaseUrl: 'unknown',
            status: getWorktreeStatus(wtPath)
          })
        }
      }
    }
  }

  // Display table
  console.log('┌────────┬──────────────────────────┬────────┬───────────────────────┐')
  console.log('│ Task # │ Branch                   │ Port   │ Status                │')
  console.log('├────────┼──────────────────────────┼────────┼───────────────────────┤')

  for (const info of worktreeInfos) {
    const taskId = info.taskId.padEnd(6)
    const branch = info.branch.slice(0, 24).padEnd(24)
    const port = info.port ? info.port.toString().padEnd(6) : 'N/A   '
    const status = info.status.padEnd(21)

    console.log(`│ ${taskId} │ ${branch} │ ${port} │ ${status} │`)
  }

  console.log('└────────┴──────────────────────────┴────────┴───────────────────────┘')

  console.log('\n📂 Paths:')
  for (const info of worktreeInfos) {
    console.log(`   Task #${info.taskId}: ${info.path}`)
  }

  console.log('\n🗄️  Databases:')
  for (const info of worktreeInfos) {
    const dbName = info.databaseUrl.split('/').pop()
    console.log(`   Task #${info.taskId}: ${dbName}`)
  }

  console.log('\n🔧 Commands:')
  console.log('   npm run work:start <taskId> [description]  - Start new parallel work')
  console.log('   npm run work:done <taskId>                 - Clean up completed work')
  console.log('   npm run work:list                          - Show this list\n')
}

// Main execution
listWorktrees()
