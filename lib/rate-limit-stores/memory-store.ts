import { RateLimitEntry, RateLimitStore } from './types'

/**
 * In-memory rate limit store
 *
 * Best for:
 * - Single-instance deployments
 * - Development environments
 * - When Redis is not available
 *
 * Limitations:
 * - Not shared across multiple server instances
 * - Lost on server restart
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, RateLimitEntry>()
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    // Cleanup old entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 5 * 60 * 1000)
  }

  async get(key: string): Promise<RateLimitEntry | null> {
    const entry = this.store.get(key)
    if (!entry) {
      return null
    }

    // Check if entry has expired
    if (Date.now() > entry.resetTime) {
      this.store.delete(key)
      return null
    }

    return entry
  }

  async increment(key: string, windowMs: number): Promise<RateLimitEntry> {
    const now = Date.now()
    let entry = this.store.get(key)

    // Reset if window has expired or entry doesn't exist
    if (!entry || now > entry.resetTime) {
      entry = {
        count: 1,
        resetTime: now + windowMs
      }
    } else {
      entry.count++
    }

    this.store.set(key, entry)
    return entry
  }

  async isAvailable(): Promise<boolean> {
    return true
  }

  async cleanup(): Promise<void> {
    const now = Date.now()
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key)
      }
    }
  }

  /**
   * Destroy the store and cleanup interval
   * Call this when shutting down the server
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.store.clear()
  }

  /**
   * Get current store size (for monitoring)
   */
  size(): number {
    return this.store.size
  }
}

// Singleton instance for global use
let globalMemoryStore: MemoryRateLimitStore | null = null

export function getMemoryStore(): MemoryRateLimitStore {
  if (!globalMemoryStore) {
    globalMemoryStore = new MemoryRateLimitStore()
  }
  return globalMemoryStore
}
