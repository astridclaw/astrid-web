/**
 * Rate limit store interface for pluggable storage backends
 */
export interface RateLimitEntry {
  count: number
  resetTime: number
}

export interface RateLimitStore {
  /**
   * Get the current rate limit entry for a key
   */
  get(key: string): Promise<RateLimitEntry | null>

  /**
   * Increment the counter for a key and return the updated entry
   * Should create the entry if it doesn't exist
   */
  increment(key: string, windowMs: number): Promise<RateLimitEntry>

  /**
   * Check if the store is available/connected
   */
  isAvailable(): Promise<boolean>

  /**
   * Clean up expired entries (optional, some stores handle this automatically)
   */
  cleanup?(): Promise<void>
}
