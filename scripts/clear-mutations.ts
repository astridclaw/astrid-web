import { OfflineSyncManager } from '../lib/offline-sync'
import { offlineDB } from '../lib/offline-db'

async function clearMutations() {
  try {
    // Get stats before
    const statsBefore = await OfflineSyncManager.getMutationStats()
    const total = statsBefore.pending + statsBefore.failed + statsBefore.completed

    console.log('🗑️  Clearing mutation queue...\n')
    console.log('📊 Current Status:')
    console.log(`   Pending: ${statsBefore.pending}`)
    console.log(`   Failed: ${statsBefore.failed}`)
    console.log(`   Completed: ${statsBefore.completed}`)
    console.log(`   Total: ${total}`)

    // Confirm
    console.log('\n⚠️  WARNING: This will clear ALL mutations (pending, failed, and completed)')
    console.log('   Any unsynced changes will be lost!')

    // Clear all mutations
    await OfflineSyncManager.clearAllMutations()

    // Verify
    const statsAfter = await OfflineSyncManager.getMutationStats()
    const remaining = statsAfter.pending + statsAfter.failed + statsAfter.completed

    console.log('\n✅ Mutation queue cleared!')
    console.log(`   Removed: ${total} mutations`)
    console.log(`   Remaining: ${remaining}`)

  } catch (error) {
    console.error('❌ Error clearing mutations:', error)
  } finally {
    process.exit(0)
  }
}

clearMutations()
