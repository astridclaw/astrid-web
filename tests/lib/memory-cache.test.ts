import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryCache, CollectionCache, CACHE_TTL, CACHE_SIZES } from '@/lib/memory-cache'

describe('MemoryCache', () => {
  let cache: MemoryCache<{ id: string; name: string }>

  beforeEach(() => {
    cache = new MemoryCache({
      maxSize: 5,
      defaultTTL: 1000, // 1 second
      name: 'TestCache'
    })
  })

  afterEach(() => {
    cache.clear()
  })

  describe('basic operations', () => {
    it('should set and get items', () => {
      cache.set('1', { id: '1', name: 'Item 1' })
      const result = cache.get('1')
      expect(result).toEqual({ id: '1', name: 'Item 1' })
    })

    it('should return undefined for missing items', () => {
      const result = cache.get('nonexistent')
      expect(result).toBeUndefined()
    })

    it('should check if item exists', () => {
      cache.set('1', { id: '1', name: 'Item 1' })
      expect(cache.has('1')).toBe(true)
      expect(cache.has('2')).toBe(false)
    })

    it('should delete items', () => {
      cache.set('1', { id: '1', name: 'Item 1' })
      expect(cache.has('1')).toBe(true)

      cache.delete('1')
      expect(cache.has('1')).toBe(false)
    })

    it('should clear all items', () => {
      cache.set('1', { id: '1', name: 'Item 1' })
      cache.set('2', { id: '2', name: 'Item 2' })

      cache.clear()

      expect(cache.size()).toBe(0)
    })
  })

  describe('TTL expiration', () => {
    it('should expire items after TTL', async () => {
      vi.useFakeTimers()

      cache.set('1', { id: '1', name: 'Item 1' }, 100) // 100ms TTL

      expect(cache.get('1')).toBeDefined()

      vi.advanceTimersByTime(150)

      expect(cache.get('1')).toBeUndefined()

      vi.useRealTimers()
    })

    it('should invalidate items', () => {
      cache.set('1', { id: '1', name: 'Item 1' })
      cache.invalidate('1')

      expect(cache.get('1')).toBeUndefined()
    })

    it('should invalidate all items', () => {
      cache.set('1', { id: '1', name: 'Item 1' })
      cache.set('2', { id: '2', name: 'Item 2' })

      cache.invalidateAll()

      expect(cache.get('1')).toBeUndefined()
      expect(cache.get('2')).toBeUndefined()
    })
  })

  describe('LRU eviction', () => {
    it('should evict least recently used item when at max size', () => {
      // Fill cache to max
      cache.set('1', { id: '1', name: 'Item 1' })
      cache.set('2', { id: '2', name: 'Item 2' })
      cache.set('3', { id: '3', name: 'Item 3' })
      cache.set('4', { id: '4', name: 'Item 4' })
      cache.set('5', { id: '5', name: 'Item 5' })

      expect(cache.size()).toBe(5)

      // Add one more item, should evict oldest
      cache.set('6', { id: '6', name: 'Item 6' })

      expect(cache.size()).toBe(5)
      expect(cache.get('1')).toBeUndefined() // First item should be evicted
      expect(cache.get('6')).toBeDefined()
    })

    it('should update access time on get', async () => {
      vi.useFakeTimers()

      cache.set('1', { id: '1', name: 'Item 1' })
      vi.advanceTimersByTime(10)
      cache.set('2', { id: '2', name: 'Item 2' })
      vi.advanceTimersByTime(10)
      cache.set('3', { id: '3', name: 'Item 3' })
      vi.advanceTimersByTime(10)
      cache.set('4', { id: '4', name: 'Item 4' })
      vi.advanceTimersByTime(10)
      cache.set('5', { id: '5', name: 'Item 5' })
      vi.advanceTimersByTime(10)

      // Access item 1 to update its access time
      cache.get('1')
      vi.advanceTimersByTime(10)

      // Add new item, should evict item 2 (oldest after 1 was accessed)
      cache.set('6', { id: '6', name: 'Item 6' })

      expect(cache.get('1')).toBeDefined()
      expect(cache.get('2')).toBeUndefined()

      vi.useRealTimers()
    })
  })

  describe('bulk operations', () => {
    it('should get all values', () => {
      cache.set('1', { id: '1', name: 'Item 1' })
      cache.set('2', { id: '2', name: 'Item 2' })

      const values = cache.values()

      expect(values).toHaveLength(2)
      expect(values).toContainEqual({ id: '1', name: 'Item 1' })
      expect(values).toContainEqual({ id: '2', name: 'Item 2' })
    })

    it('should get all entries', () => {
      cache.set('1', { id: '1', name: 'Item 1' })
      cache.set('2', { id: '2', name: 'Item 2' })

      const entries = cache.entries()

      expect(entries).toHaveLength(2)
      expect(entries).toContainEqual(['1', { id: '1', name: 'Item 1' }])
    })

    it('should delete items matching predicate', () => {
      cache.set('1', { id: '1', name: 'Item 1' })
      cache.set('2', { id: '2', name: 'Item 2' })
      cache.set('3', { id: '3', name: 'Item 3' })

      const deleted = cache.deleteWhere((key) => parseInt(key) > 1)

      expect(deleted).toBe(2)
      expect(cache.get('1')).toBeDefined()
      expect(cache.get('2')).toBeUndefined()
    })
  })

  describe('stats', () => {
    it('should return cache stats', () => {
      cache.set('1', { id: '1', name: 'Item 1' })
      cache.set('2', { id: '2', name: 'Item 2' })

      const stats = cache.getStats()

      expect(stats.name).toBe('TestCache')
      expect(stats.totalSize).toBe(2)
      expect(stats.validCount).toBe(2)
      expect(stats.expiredCount).toBe(0)
      expect(stats.maxSize).toBe(5)
    })
  })
})

describe('CollectionCache', () => {
  let cache: CollectionCache<{ id: string; name: string }>

  beforeEach(() => {
    cache = new CollectionCache({
      maxSize: 3,
      defaultTTL: 1000,
      name: 'TestCollectionCache'
    })
  })

  afterEach(() => {
    cache.clear()
  })

  describe('collection operations', () => {
    it('should set and get collections', () => {
      const items = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' }
      ]

      cache.set('collection1', items)
      const result = cache.get('collection1')

      expect(result).toEqual(items)
    })

    it('should add item to collection', () => {
      cache.set('collection1', [{ id: '1', name: 'Item 1' }])

      cache.addToCollection('collection1', { id: '2', name: 'Item 2' }, (item) => item.id)

      const result = cache.get('collection1')
      expect(result).toHaveLength(2)
    })

    it('should update existing item in collection', () => {
      cache.set('collection1', [{ id: '1', name: 'Item 1' }])

      cache.addToCollection('collection1', { id: '1', name: 'Updated Item 1' }, (item) => item.id)

      const result = cache.get('collection1')
      expect(result).toHaveLength(1)
      expect(result?.[0].name).toBe('Updated Item 1')
    })

    it('should remove item from collection', () => {
      cache.set('collection1', [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' }
      ])

      const removed = cache.removeFromCollection('collection1', '1', (item) => item.id)

      expect(removed).toBe(true)
      const result = cache.get('collection1')
      expect(result).toHaveLength(1)
      expect(result?.[0].id).toBe('2')
    })

    it('should update item in collection', () => {
      cache.set('collection1', [{ id: '1', name: 'Item 1' }])

      const updated = cache.updateInCollection(
        'collection1',
        '1',
        (item) => ({ ...item, name: 'Updated' }),
        (item) => item.id
      )

      expect(updated).toBe(true)
      const result = cache.get('collection1')
      expect(result?.[0].name).toBe('Updated')
    })
  })
})

describe('Cache Constants', () => {
  it('should have reasonable TTL values', () => {
    expect(CACHE_TTL.TASKS).toBe(5 * 60 * 1000) // 5 minutes
    expect(CACHE_TTL.LISTS).toBe(15 * 60 * 1000) // 15 minutes
    expect(CACHE_TTL.COMMENTS).toBe(10 * 60 * 1000) // 10 minutes
    expect(CACHE_TTL.USERS).toBe(60 * 60 * 1000) // 1 hour
  })

  it('should have reasonable size limits', () => {
    expect(CACHE_SIZES.TASKS).toBe(500)
    expect(CACHE_SIZES.LISTS).toBe(100)
    expect(CACHE_SIZES.COMMENTS).toBe(1000)
    expect(CACHE_SIZES.USERS).toBe(200)
  })
})
