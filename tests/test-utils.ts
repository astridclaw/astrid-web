/**
 * Test utilities for dynamic port handling
 */

/**
 * Get the test base URL from environment or fallback
 */
export function getTestBaseUrl(): string {
  return process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
}

/**
 * Create a test URL with the correct base
 */
export function createTestUrl(path: string): string {
  const baseUrl = getTestBaseUrl()
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * Create a Request object with the correct test URL
 */
export function createTestRequest(path: string, options?: RequestInit): Request {
  return new Request(createTestUrl(path), options)
}

/**
 * Get the port from the test base URL
 */
export function getTestPort(): number {
  const baseUrl = getTestBaseUrl()
  const url = new URL(baseUrl)
  return parseInt(url.port || '3000', 10)
}