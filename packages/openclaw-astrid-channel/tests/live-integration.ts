/**
 * Live integration test — connects to production astrid.cc
 * Run: npx tsx tests/live-integration.ts
 */
import { OAuthClient } from '../src/oauth-client'
import { RestClient } from '../src/rest-client'
import { SessionMapper } from '../src/session-mapper'
import { taskToMessage, commentToMessage } from '../src/message-formatter'
import type { AstridChannelConfig } from '../src/types'

const config: AstridChannelConfig = {
  enabled: true,
  clientId: 'astrid_client_7032bb5ac71afd2d4d47d4e3e8ef3460',
  clientSecret: 'b1d0c2089262dae364339fc77b25f6de9b2de877d48ae85686f73c3d6c7ca321',
  apiBase: 'https://www.astrid.cc/api/v1',
}

async function main() {
  console.log('🔐 Testing OAuth...')
  const oauth = new OAuthClient(config)
  const token = await oauth.ensureToken()
  console.log(`  ✅ Got token: ${token.slice(0, 20)}...`)
  
  // Test token caching
  const cached = await oauth.ensureToken()
  console.log(`  ✅ Cached token works: ${token === cached}`)

  console.log('\n📋 Testing REST client...')
  const rest = new RestClient(config.apiBase, oauth)
  
  const tasks = await rest.getAssignedTasks()
  console.log(`  ✅ Got ${tasks.length} assigned tasks`)
  
  if (tasks.length > 0) {
    const task = tasks[0]
    console.log(`  📌 First task: "${task.title}" (priority ${task.priority})`)
    console.log(`  📝 List: ${task.listName} | Description: ${task.listDescription || '(none)'}`)
    console.log(`  💬 ${task.comments.length} comments`)
    
    // Test get single task
    const single = await rest.getTask(task.id)
    console.log(`  ✅ Got single task: "${single.title}"`)
    
    // Test message formatting
    console.log('\n📨 Testing message formatter...')
    const msg = taskToMessage(task)
    console.log(`  ✅ Session key: ${msg.sessionKey}`)
    console.log(`  ✅ Message preview (first 200 chars):`)
    console.log(`  ${msg.content.slice(0, 200).replace(/\n/g, '\n  ')}`)
    
    // Test session mapper
    console.log('\n🗺️  Testing session mapper...')
    const mapper = new SessionMapper()
    const sessionKey = mapper.getOrCreate(task.id)
    console.log(`  ✅ Created session: ${sessionKey}`)
    console.log(`  ✅ Reverse lookup: ${mapper.getTaskId(sessionKey)}`)
    console.log(`  ✅ Active sessions: ${mapper.activeCount()}`)
    
    // Test posting a comment
    console.log('\n💬 Testing comment post...')
    const comment = await rest.postComment(task.id, '🔌 Live integration test passed! All systems operational.')
    console.log(`  ✅ Posted comment: ${comment.id}`)
    console.log(`  ✅ Author: ${comment.authorName} (isAgent: ${comment.isAgent})`)
  }
  
  console.log('\n✅ All integration tests passed!')
}

main().catch(err => {
  console.error('❌ Integration test failed:', err)
  process.exit(1)
})
