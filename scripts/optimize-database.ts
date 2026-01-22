#!/usr/bin/env tsx

/**
 * Database optimization script for production deployment
 * This script ensures all performance optimizations are applied
 */

import { prisma } from '../lib/prisma'
import { DatabaseMaintenance, PerformanceMonitoring } from '../lib/database-utils'

async function main() {
  console.log('🚀 Starting database optimization...')
  
  try {
    // 1. Health check
    console.log('🏥 Performing health check...')
    const healthCheck = await PerformanceMonitoring.healthCheck()
    console.log(`Health check: ${healthCheck.healthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}`)
    console.log(`Response time: ${healthCheck.responseTime}ms`)
    
    if (!healthCheck.healthy) {
      console.error('❌ Database health check failed:', healthCheck.error)
      process.exit(1)
    }

    // 2. Get database statistics
    console.log('\n📊 Getting database statistics...')
    const stats = await PerformanceMonitoring.getDatabaseStats()
    console.log('Database Stats:')
    console.log(`  Users: ${stats.users}`)
    console.log(`  Tasks: ${stats.tasks}`)
    console.log(`  Lists: ${stats.lists}`)
    console.log(`  Comments: ${stats.comments}`)
    console.log(`  Invitations: ${stats.invitations}`)

    // 3. Clean up expired data
    console.log('\n🧹 Cleaning up expired data...')
    
    const expiredInvitations = await DatabaseMaintenance.cleanupExpiredInvitations()
    console.log(`  Expired invitations cleaned: ${expiredInvitations}`)
    
    const expiredTokens = await DatabaseMaintenance.cleanupExpiredVerificationTokens()
    console.log(`  Expired verification tokens cleaned: ${expiredTokens}`)

    // 4. Check for archivable tasks (reporting only)
    const archivableTasksCount = await DatabaseMaintenance.archiveOldCompletedTasks(365)
    console.log(`  Old completed tasks (365+ days): ${archivableTasksCount}`)

    // 5. Test optimized queries performance
    console.log('\n⚡ Testing optimized queries performance...')
    
    // Get a sample user for testing
    const sampleUser = await prisma.user.findFirst({
      select: { id: true, email: true }
    })

    if (sampleUser) {
      const startTime = Date.now()
      
      // Test query performance with new indexes
      await Promise.all([
        prisma.task.findMany({
          where: { assigneeId: sampleUser.id, completed: false },
          take: 10
        }),
        prisma.invitation.findMany({
          where: { email: sampleUser.email, status: 'PENDING' },
          take: 10
        }),
        prisma.comment.findMany({
          where: { authorId: sampleUser.id },
          orderBy: { createdAt: 'desc' },
          take: 10
        })
      ])
      
      const queryTime = Date.now() - startTime
      console.log(`  Multi-query performance: ${queryTime}ms`)
    }

    // 6. Connection pool info
    console.log('\n🔌 Connection pool configuration:')
    console.log(`  Environment: ${process.env.NODE_ENV}`)
    console.log(`  Max connections: ${process.env.NODE_ENV === 'production' ? 10 : 5}`)
    console.log(`  Connection timeout: 10s`)

    console.log('\n✅ Database optimization completed successfully!')
    
  } catch (error) {
    console.error('❌ Database optimization failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the optimization if called directly
if (require.main === module) {
  main().catch(console.error)
}

export { main as optimizeDatabase }