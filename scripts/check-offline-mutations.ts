import { offlineDB } from '../lib/offline-db'

async function checkMutations() {
  try {
    // Get all mutations by status
    const pending = await offlineDB.mutations.where('status').equals('pending').toArray()
    const failed = await offlineDB.mutations.where('status').equals('failed').toArray()
    const completed = await offlineDB.mutations.where('status').equals('completed').toArray()

    console.log('\n📊 Mutation Queue Status:')
    console.log('========================')
    console.log(`✅ Completed: ${completed.length}`)
    console.log(`⏳ Pending: ${pending.length}`)
    console.log(`❌ Failed: ${failed.length}`)

    if (failed.length > 0) {
      console.log('\n❌ Failed Mutations:')
      console.log('===================')
      failed.forEach((mutation, index) => {
        console.log(`\n${index + 1}. ${mutation.type.toUpperCase()} ${mutation.entity}`)
        console.log(`   ID: ${mutation.entityId}`)
        console.log(`   Endpoint: ${mutation.endpoint}`)
        console.log(`   Retries: ${mutation.retryCount}`)
        console.log(`   Error: ${mutation.lastError || 'Unknown'}`)
        console.log(`   Timestamp: ${new Date(mutation.timestamp).toLocaleString()}`)
      })
    }

    if (pending.length > 0) {
      console.log('\n⏳ Pending Mutations:')
      console.log('===================')
      pending.forEach((mutation, index) => {
        console.log(`\n${index + 1}. ${mutation.type.toUpperCase()} ${mutation.entity}`)
        console.log(`   ID: ${mutation.entityId}`)
        console.log(`   Endpoint: ${mutation.endpoint}`)
        console.log(`   Timestamp: ${new Date(mutation.timestamp).toLocaleString()}`)
      })
    }

    console.log('\n💡 Actions Available:')
    console.log('===================')
    console.log('1. Retry failed mutations: npx tsx scripts/retry-failed-mutations.ts')
    console.log('2. Clear all mutations: npx tsx scripts/clear-mutations.ts')
    console.log('3. Manually sync: Open browser console and run: OfflineSyncManager.syncPendingMutations()')

  } catch (error) {
    console.error('❌ Error checking mutations:', error)
  } finally {
    process.exit(0)
  }
}

checkMutations()
