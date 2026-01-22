#!/usr/bin/env npx tsx
/**
 * Deploy to Production via GitHub Actions
 *
 * This script triggers the production deployment workflow from local CLI
 * Works for both local development and cloud AI agent workflows
 *
 * Usage:
 *   npx tsx scripts/deploy-production.ts
 *   npm run deploy:production
 */

import { execSync } from 'child_process'

interface DeploymentOptions {
  skipTests?: boolean
  environment?: 'production' | 'staging'
}

async function deployToProduction(options: DeploymentOptions = {}) {
  const { skipTests = false, environment = 'production' } = options

  console.log('🚀 Triggering Production Deployment via GitHub Actions')
  console.log('======================================================')
  console.log('')

  // Check git status
  console.log('📋 Checking git status...')
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8' })
    if (status.trim()) {
      console.log('⚠️  Warning: You have uncommitted changes:')
      console.log(status)
      console.log('')

      const readline = await import('readline')
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      })

      const answer = await new Promise<string>(resolve => {
        rl.question('Continue anyway? (y/N): ', resolve)
      })
      rl.close()

      if (answer.toLowerCase() !== 'y') {
        console.log('❌ Deployment cancelled. Commit your changes first.')
        process.exit(1)
      }
    }
  } catch (error) {
    console.error('❌ Failed to check git status:', error)
    process.exit(1)
  }

  // Get current branch
  const currentBranch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim()
  console.log(`📍 Current branch: ${currentBranch}`)

  if (currentBranch !== 'main' && environment === 'production') {
    console.log('')
    console.log('⚠️  Warning: You are not on the main branch.')
    console.log('   Production deployments typically deploy from main.')
    console.log('')

    const readline = await import('readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })

    const answer = await new Promise<string>(resolve => {
      rl.question('Continue from current branch? (y/N): ', resolve)
    })
    rl.close()

    if (answer.toLowerCase() !== 'y') {
      console.log('💡 Switch to main with: git checkout main')
      process.exit(1)
    }
  }

  // Push current branch to ensure remote is up to date
  console.log('')
  console.log('📤 Pushing to remote...')
  try {
    execSync(`git push origin ${currentBranch}`, { stdio: 'inherit' })
  } catch (error) {
    console.error('❌ Failed to push to remote')
    process.exit(1)
  }

  // If on main, the push will trigger the workflow automatically
  if (currentBranch === 'main') {
    console.log('')
    console.log('✅ Push to main completed!')
    console.log('   GitHub Actions will automatically deploy to production.')
    console.log('')
    console.log('🔗 Monitor deployment at:')
    console.log('   https://github.com/Graceful-Tools/astrid-res-www/actions/workflows/production-deployment.yml')
    console.log('')
    console.log('🌐 Production URL: https://astrid.cc')
    return
  }

  // For non-main branches, we can trigger the workflow manually
  console.log('')
  console.log('📋 Triggering workflow dispatch...')

  try {
    // Check if gh CLI is available
    execSync('which gh', { encoding: 'utf-8' })

    const skipTestsFlag = skipTests ? 'true' : 'false'
    const cmd = `gh workflow run production-deployment.yml -f deploy_environment=${environment} -f skip_tests=${skipTestsFlag}`

    console.log(`Running: ${cmd}`)
    execSync(cmd, { stdio: 'inherit' })

    console.log('')
    console.log('✅ Workflow triggered successfully!')
    console.log('')
    console.log('🔗 Monitor deployment at:')
    console.log('   https://github.com/Graceful-Tools/astrid-res-www/actions/workflows/production-deployment.yml')

  } catch (error) {
    console.log('')
    console.log('ℹ️  GitHub CLI (gh) not available for workflow dispatch.')
    console.log('   Push to main branch to trigger automatic deployment:')
    console.log('')
    console.log('   git checkout main')
    console.log('   git merge ' + currentBranch)
    console.log('   git push origin main')
    console.log('')
    console.log('   Or trigger manually at:')
    console.log('   https://github.com/Graceful-Tools/astrid-res-www/actions/workflows/production-deployment.yml')
  }
}

// Parse command line arguments
const args = process.argv.slice(2)
const options: DeploymentOptions = {
  skipTests: args.includes('--skip-tests'),
  environment: args.includes('--staging') ? 'staging' : 'production'
}

deployToProduction(options).catch(console.error)
