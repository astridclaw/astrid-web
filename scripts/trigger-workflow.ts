#!/usr/bin/env npx tsx
/**
 * Trigger GitHub Actions Workflow
 *
 * This script can trigger any GitHub Actions workflow, useful for:
 * - Local CLI deployment triggers
 * - Cloud AI agent deployment triggers
 * - Manual workflow dispatch
 *
 * Usage:
 *   npx tsx scripts/trigger-workflow.ts production-deployment
 *   npx tsx scripts/trigger-workflow.ts preview-deployment
 *   npx tsx scripts/trigger-workflow.ts astrid-coding-agent --task-id <taskId>
 */

import { execSync } from 'child_process'

interface WorkflowConfig {
  name: string
  file: string
  inputs?: Record<string, string>
  description: string
}

const WORKFLOWS: Record<string, WorkflowConfig> = {
  'production': {
    name: 'Production Deployment',
    file: 'production-deployment.yml',
    description: 'Deploy to production (astrid.cc)'
  },
  'staging': {
    name: 'Staging Deployment',
    file: 'staging-deployment.yml',
    description: 'Deploy to staging environment'
  },
  'preview': {
    name: 'Preview Deployment',
    file: 'preview-deployment.yml',
    description: 'Create preview deployment for current branch'
  },
  'ai-agent': {
    name: 'Astrid AI Coding Agent',
    file: 'astrid-coding-agent.yml',
    inputs: { task_id: '' },
    description: 'Trigger AI coding agent for a task'
  },
  'monitor': {
    name: 'Monitor Deployments',
    file: 'monitor-deployments.yml',
    description: 'Run deployment monitoring'
  }
}

async function triggerWorkflow(workflowKey: string, customInputs: Record<string, string> = {}) {
  const workflow = WORKFLOWS[workflowKey]

  if (!workflow) {
    console.error(`❌ Unknown workflow: ${workflowKey}`)
    console.log('')
    console.log('Available workflows:')
    for (const [key, config] of Object.entries(WORKFLOWS)) {
      console.log(`  ${key.padEnd(15)} - ${config.description}`)
    }
    process.exit(1)
  }

  console.log(`🚀 Triggering: ${workflow.name}`)
  console.log(`   File: ${workflow.file}`)
  console.log('')

  // Build inputs string
  const allInputs = { ...workflow.inputs, ...customInputs }
  const inputFlags = Object.entries(allInputs)
    .filter(([_, value]) => value !== '')
    .map(([key, value]) => `-f ${key}=${value}`)
    .join(' ')

  try {
    // Check if gh CLI is available
    execSync('which gh', { encoding: 'utf-8' })

    const cmd = `gh workflow run ${workflow.file} ${inputFlags}`.trim()
    console.log(`Running: ${cmd}`)
    console.log('')

    execSync(cmd, { stdio: 'inherit' })

    console.log('')
    console.log('✅ Workflow triggered successfully!')
    console.log('')
    console.log('🔗 Monitor at:')
    console.log(`   https://github.com/Graceful-Tools/astrid-res-www/actions/workflows/${workflow.file}`)

  } catch (error) {
    if ((error as any).message?.includes('command not found')) {
      console.log('❌ GitHub CLI (gh) is not installed.')
      console.log('   Install with: brew install gh')
      console.log('   Then run: gh auth login')
      console.log('')
      console.log('   Or trigger manually at:')
      console.log(`   https://github.com/Graceful-Tools/astrid-res-www/actions/workflows/${workflow.file}`)
    } else {
      console.error('❌ Failed to trigger workflow:', error)
    }
    process.exit(1)
  }
}

// Parse arguments
const args = process.argv.slice(2)

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log('Usage: npx tsx scripts/trigger-workflow.ts <workflow> [options]')
  console.log('')
  console.log('Workflows:')
  for (const [key, config] of Object.entries(WORKFLOWS)) {
    console.log(`  ${key.padEnd(15)} - ${config.description}`)
  }
  console.log('')
  console.log('Options:')
  console.log('  --task-id <id>    Task ID for AI agent workflow')
  console.log('')
  console.log('Examples:')
  console.log('  npx tsx scripts/trigger-workflow.ts production')
  console.log('  npx tsx scripts/trigger-workflow.ts ai-agent --task-id abc123')
  process.exit(0)
}

const workflowKey = args[0]
const customInputs: Record<string, string> = {}

// Parse additional inputs
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--task-id' && args[i + 1]) {
    customInputs.task_id = args[++i]
  }
}

triggerWorkflow(workflowKey, customInputs).catch(console.error)
