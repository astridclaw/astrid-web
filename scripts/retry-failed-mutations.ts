import { OfflineSyncManager } from '../lib/offline-sync'

async function retryFailedMutations() {
  try {
    console.log('🔄 Retrying all failed mutations...\n')

    // Get stats before
    const statsBefore = await OfflineSyncManager.getMutationStats()
    console.log('📊 Before:')
    console.log(`   Failed: ${statsBefore.failed}`)
    console.log(`   Pending: ${statsBefore.pending}`)

    // Retry failed mutations
    await OfflineSyncManager.retryFailedMutations()

    // Get stats after
    const statsAfter = await OfflineSyncManager.getMutationStats()
    console.log('\n📊 After:')
    console.log(`   Failed: ${statsAfter.failed}`)
    console.log(`   Pending: ${statsAfter.pending}`)
    console.log(`   Completed: ${statsAfter.completed}`)

    if (statsAfter.failed === 0) {
      console.log('\n✅ All mutations retried successfully!')
    } else {
      console.log(`\n⚠️  ${statsAfter.failed} mutations still failed. Check errors with:`)
      console.log('   npx tsx scripts/check-offline-mutations.ts')
    }

  } catch (error) {
    console.error('❌ Error retrying mutations:', error)
  } finally {
    process.exit(0)
  }
}

retryFailedMutations()
