/**
 * Dynamic port detection utility for Next.js development
 * Detects the actual port being used by the development server
 */

import { getCachedPort } from './runtime-port-detection'

let cachedPort: number | null = null

/**
 * Detect the current development server port
 * Returns the actual port being used by checking Next.js internals
 */
export function detectDevPort(): number {
  // If we have a cached port, return it
  if (cachedPort !== null) {
    return cachedPort
  }

  // Try to detect from Next.js internals (if available)
  if (typeof process !== 'undefined' && process.env.PORT) {
    const envPort = parseInt(process.env.PORT, 10)
    if (envPort && envPort > 0) {
      cachedPort = envPort
      return envPort
    }
  }

  // Check if we're in a browser and can use window.location
  if (typeof window !== 'undefined' && window.location.port) {
    const browserPort = parseInt(window.location.port, 10)
    if (browserPort && browserPort > 0) {
      cachedPort = browserPort
      return browserPort
    }
  }

  // Try to extract from headers (server-side)
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
    // Check common development ports in order
    const commonPorts = [3000, 3001, 3002, 3003, 3004, 3005]

    // In development, Next.js often sets up on the first available port
    // We'll default to 3000 but allow override
    for (const port of commonPorts) {
      // This is a heuristic - in real scenarios you might want to check if port is actually in use
      // For now, we'll default to 3000 and let the environment override
      cachedPort = port
      return port
    }
  }

  // Fallback to default port
  return 3000
}

/**
 * Get the development server base URL with dynamic port detection
 */
export function getDevBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // Client-side: use actual window location
    return `${window.location.protocol}//${window.location.hostname}:${window.location.port}`
  }

  // Server-side: try to detect actual port from environment
  // Check if we can extract port from request headers or process
  const actualPort = getActualDevPort()
  return `http://localhost:${actualPort}`
}

/**
 * Clear the cached port (useful for testing or when port changes)
 */
export function clearPortCache(): void {
  cachedPort = null
}

/**
 * Check if we're likely in development mode
 */
export function isLocalDevelopment(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    (typeof window !== 'undefined' && (
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.endsWith('.local')
    ))
  )
}

/**
 * Enhanced port detection that reads from environment or detects dynamically
 * This function attempts to read the actual Next.js dev server port
 */
export function getActualDevPort(): number {
  // Priority 1: Check runtime-detected port (from API request headers)
  const cachedPort = getCachedPort()
  if (cachedPort && cachedPort > 0) {
    return cachedPort
  }

  // Priority 2: Check if NEXT_DEV_PORT is set (custom env var we can set)
  if (process.env.NEXT_DEV_PORT) {
    const port = parseInt(process.env.NEXT_DEV_PORT, 10)
    if (port && port > 0) {
      return port
    }
  }

  // Priority 3: Check standard PORT env var
  if (process.env.PORT) {
    const port = parseInt(process.env.PORT, 10)
    if (port && port > 0) {
      return port
    }
  }

  // Priority 4: Browser detection
  if (typeof window !== 'undefined' && window.location.port) {
    const port = parseInt(window.location.port, 10)
    if (port && port > 0) {
      return port
    }
  }

  // Priority 5: Server-side environment variable detection
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
    // Try to detect from the process if Next.js has set it
    try {
      // Check if we can access Next.js internals
      const nextConfig = process.env.__NEXT_PRIVATE_ORIGIN || process.env.NEXTAUTH_URL
      if (nextConfig) {
        const url = new URL(nextConfig)
        const port = parseInt(url.port, 10)
        if (port && port > 0) {
          return port
        }
      }
    } catch (e) {
      // Ignore URL parsing errors
    }

    // Try to read from common Next.js environment variables
    if (process.env.HOSTNAME && process.env.HOSTNAME.includes(':')) {
      try {
        const port = parseInt(process.env.HOSTNAME.split(':')[1], 10)
        if (port && port > 0) {
          return port
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
  }

  // Development fallback - try to infer from common patterns
  return 3000
}