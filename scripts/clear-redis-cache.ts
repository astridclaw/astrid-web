#!/usr/bin/env tsx
/**
 * Clear Redis cache after migration
 * Run this after schema changes to ensure fresh data is loaded
 */
// @ts-nocheck - Script may reference deprecated cache methods
import { RedisCache } from '../lib/redis'

async function clearCache() {
  console.log('🧹 Clearing Redis cache after migration...')

  try {
    // Note: clearAll() method may not exist - this is a legacy script
    // If RedisCache doesn't have clearAll, you may need to manually clear Redis:
    // redis-cli FLUSHDB
    if (typeof RedisCache.clearAll === 'function') {
      await RedisCache.clearAll()
      console.log('✅ Redis cache cleared successfully')
    } else {
      console.log('⚠️  RedisCache.clearAll() not available')
      console.log('   Run: redis-cli FLUSHDB')
    }
  } catch (error) {
    console.error('❌ Error clearing cache:', error)
    if (error instanceof Error) {
      console.error('Error message:', error.message)
    }
  }
}

clearCache()
