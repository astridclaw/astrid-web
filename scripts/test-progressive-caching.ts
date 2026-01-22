/**
 * Test script to verify progressive caching in AI orchestrator
 *
 * This script simulates a planning phase workflow to demonstrate:
 * 1. Initial cache creation on system prompt
 * 2. Progressive cache building as Claude reads files
 * 3. Cache reuse on subsequent calls
 *
 * Usage:
 *   DATABASE_URL="your-db-url" npx tsx scripts/test-progressive-caching.ts
 *
 * Or with development database:
 *   DATABASE_URL="postgresql://postgres:password@localhost:5432/astrid_dev" \
 *   npx tsx scripts/test-progressive-caching.ts
 *
 * Expected behavior:
 * - Iteration 1: High cacheCreation, low cacheRead
 * - Iteration 3,6,9: Additional cacheCreation for tool results
 * - Later iterations: High cacheRead, low new tokens
 */

import { AIOrchestrator } from '../lib/ai-orchestrator'

async function testProgressiveCaching() {
  // Check for required environment variables
  if (!process.env.DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL environment variable is required')
    console.log('\n💡 Run with:')
    console.log('   DATABASE_URL="postgresql://postgres:password@localhost:5432/astrid_dev" \\')
    console.log('   npx tsx scripts/test-progressive-caching.ts')
    process.exit(1)
  }

  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    console.error('❌ Error: ANTHROPIC_API_KEY or OPENAI_API_KEY is required')
    console.log('\n💡 Set one of these environment variables:')
    console.log('   export ANTHROPIC_API_KEY="your-key"')
    console.log('   export OPENAI_API_KEY="your-key"')
    process.exit(1)
  }

  console.log('🧪 Testing Progressive Caching in AI Orchestrator\n')

  // Create test orchestrator
  const orchestrator = new AIOrchestrator('claude', 'test-user-id', 'test-repo-id')

  console.log('📋 Configuration:')
  console.log('- Model: Claude Sonnet 4.5')
  console.log('- Phase: Planning')
  console.log('- Max iterations: 12')
  console.log('- Cache strategy: Every 3rd iteration\n')

  console.log('🚀 Starting planning phase...\n')
  console.log('Expected cache behavior:')
  console.log('✅ Iteration 1: Cache system prompt (~4k tokens)')
  console.log('✅ Iteration 3,6,9: Cache accumulated file reads')
  console.log('✅ Later iterations: Reuse cached content (high cacheRead)\n')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  try {
    const result = await orchestrator.generateImplementationPlan({
      taskTitle: 'Create a simple button component with hover effects',
      taskDescription: 'Use Tailwind CSS and follow existing component patterns. Make it reusable and accessible.',
      repositoryContext: 'This is a Next.js project with TypeScript and Tailwind CSS',
      targetFramework: 'Next.js'
    })

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('\n✅ Planning phase completed!')
    console.log('\n📊 Implementation Plan:')
    console.log('Summary:', result.summary)
    console.log('Approach:', result.approach)
    console.log('Files to modify:', result.files?.length || 0)
    console.log('Complexity:', result.estimatedComplexity)
    console.log('Considerations:', result.considerations?.length || 0)

  } catch (error: any) {
    console.error('\n❌ Error:', error.message)
    console.error(error.stack)

    if (error.message.includes('API key')) {
      console.log('\n💡 Tip: Make sure ANTHROPIC_API_KEY is set in your environment')
    }
  }
}

// Run the test
testProgressiveCaching().catch(console.error)
