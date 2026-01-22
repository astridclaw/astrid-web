/**
 * Client-side image cache for profile photos
 *
 * Preloads and caches images in memory for instant rendering on subsequent views.
 * Works alongside browser cache for a two-tier caching strategy.
 */

// In-memory cache of preloaded image URLs
const preloadedImages = new Set<string>()

// Cache of Image objects for instant access
const imageCache = new Map<string, HTMLImageElement>()

/**
 * Preload an image URL into browser memory
 * Returns a promise that resolves when the image is loaded
 */
export function preloadImage(url: string): Promise<void> {
  if (!url || preloadedImages.has(url)) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      preloadedImages.add(url)
      imageCache.set(url, img)
      resolve()
    }
    img.onerror = () => {
      // Don't cache failed images, but don't block
      resolve()
    }
    img.src = url
  })
}

/**
 * Check if an image URL is already cached
 */
export function isImageCached(url: string): boolean {
  return preloadedImages.has(url)
}

/**
 * Get cached image element if available
 */
export function getCachedImage(url: string): HTMLImageElement | undefined {
  return imageCache.get(url)
}

/**
 * Preload multiple images in parallel
 */
export function preloadImages(urls: (string | null | undefined)[]): Promise<void[]> {
  const validUrls = urls.filter((url): url is string => !!url)
  return Promise.all(validUrls.map(preloadImage))
}

/**
 * Preload user avatar images from user objects
 */
export function preloadUserAvatars(users: Array<{ image?: string | null }>): void {
  const urls = users
    .map(user => user.image)
    .filter((url): url is string => !!url)

  // Preload in background, don't block
  preloadImages(urls)
}

/**
 * Clear the image cache (useful for memory management)
 */
export function clearImageCache(): void {
  preloadedImages.clear()
  imageCache.clear()
}

/**
 * Get cache statistics for debugging
 */
export function getImageCacheStats(): { count: number; urls: string[] } {
  return {
    count: preloadedImages.size,
    urls: Array.from(preloadedImages)
  }
}
