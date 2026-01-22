/**
 * Runtime port detection for Next.js development server
 * Detects the actual port being used by checking request headers
 */

import { NextRequest } from 'next/server'

let detectedPort: number | null = null

/**
 * Extract port from Next.js request headers
 * This should be called from API routes to capture the actual port
 */
export function detectPortFromRequest(request: NextRequest): number | null {
  try {
    // Extract from host header
    const host = request.headers.get('host')
    if (host && host.includes(':')) {
      const port = parseInt(host.split(':')[1], 10)
      if (port && port > 0) {
        // Cache the detected port for other functions to use
        detectedPort = port
        return port
      }
    }

    // Extract from x-forwarded-host if behind proxy
    const forwardedHost = request.headers.get('x-forwarded-host')
    if (forwardedHost && forwardedHost.includes(':')) {
      const port = parseInt(forwardedHost.split(':')[1], 10)
      if (port && port > 0) {
        detectedPort = port
        return port
      }
    }

    // Extract from URL
    const url = new URL(request.url)
    if (url.port) {
      const port = parseInt(url.port, 10)
      if (port && port > 0) {
        detectedPort = port
        return port
      }
    }

    return null
  } catch (error) {
    return null
  }
}

/**
 * Get the cached detected port
 */
export function getCachedPort(): number | null {
  return detectedPort
}

/**
 * Set the port manually (for testing or when detected elsewhere)
 */
export function setDetectedPort(port: number): void {
  detectedPort = port
}

/**
 * Clear the cached port
 */
export function clearDetectedPort(): void {
  detectedPort = null
}