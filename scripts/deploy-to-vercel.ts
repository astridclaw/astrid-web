#!/usr/bin/env tsx

/**
 * Complete deployment script for Vercel
 * This script handles database migration and Vercel deployment
 */

import { execSync } from 'child_process'
import * as readline from 'readline'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, resolve)
  })
}

async function main() {
  console.log('🚀 Astrid Task Manager - Vercel Deployment Script')
  console.log('================================================\n')

  try {
    // 1. Pre-deployment checks
    console.log('📋 Running pre-deployment checks...')
    
    // Check if we have the production DB URL
    try {
      execSync('npm run db:migrate-production -- --dry-run', { stdio: 'ignore' })
      console.log('✅ Production database URL found')
    } catch {
      console.error('❌ DATABASE_URL_PROD not found in .env.local')
      console.log('Please add your production database URL to .env.local as DATABASE_URL_PROD')
      process.exit(1)
    }

    // Check if vercel CLI is installed
    try {
      execSync('vercel --version', { stdio: 'ignore' })
      console.log('✅ Vercel CLI found')
    } catch {
      console.error('❌ Vercel CLI not found')
      console.log('Install it with: npm install -g vercel')
      process.exit(1)
    }

    // 2. Ask user for deployment preferences
    const migrateDb = await ask('🗄️  Run production database migration? (y/n): ')
    const deployType = await ask('🚀 Deploy to production? (y for prod, n for preview): ')
    
    rl.close()

    // 3. Run database migration if requested
    if (migrateDb.toLowerCase() === 'y') {
      console.log('\n📊 Migrating production database...')
      execSync('npm run db:migrate-production', { stdio: 'inherit' })
      console.log('✅ Database migration completed')
    } else {
      console.log('⏭️  Skipping database migration')
    }

    // 4. Run build tests
    console.log('\n🔧 Running build tests...')
    execSync('npm run predeploy:essential', { stdio: 'inherit' })
    console.log('✅ Build tests passed')

    // 5. Deploy to Vercel
    console.log('\n🚀 Deploying to Vercel...')
    const deployCommand = deployType.toLowerCase() === 'y' ? 'vercel --prod' : 'vercel'
    
    console.log(`Running: ${deployCommand}`)
    execSync(deployCommand, { stdio: 'inherit' })

    // 6. Post-deployment instructions
    console.log('\n✅ Deployment completed successfully!')
    console.log('\n📋 Post-deployment checklist:')
    console.log('1. ✅ Database migrated (if selected)')
    console.log('2. ✅ Application deployed to Vercel')
    console.log('\n🔧 Next steps:')
    console.log('1. Set environment variables in Vercel dashboard:')
    console.log('   - DATABASE_URL (your production database URL)')
    console.log('   - NEXTAUTH_SECRET (generate with: openssl rand -base64 32)')
    console.log('   - NEXTAUTH_URL (your Vercel app URL)')
    console.log('   - Other environment variables as needed')
    console.log('\n2. Test your deployment:')
    console.log('   - Visit your app URL')
    console.log('   - Test authentication')
    console.log('   - Create a task list')
    console.log('   - Send an invitation')
    console.log('\n3. Monitor your deployment:')
    console.log('   - Check /api/health for health status')
    console.log('   - Monitor Vercel function logs')
    console.log('   - Run database optimization checks')

  } catch (error) {
    console.error('\n❌ Deployment failed:', error)
    process.exit(1)
  }
}

// Run the deployment if called directly
if (require.main === module) {
  main().catch(console.error)
}

export { main as deployToVercel }