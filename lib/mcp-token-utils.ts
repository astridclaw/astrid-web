import crypto from 'crypto'

/**
 * Generate a secure MCP token
 * Format: astrid_mcp_<random_hex>
 */
export function generateMCPToken(): string {
  const randomBytes = crypto.randomBytes(32)
  const token = `astrid_mcp_${randomBytes.toString('hex')}`
  return token
}

/**
 * Validate MCP token format
 */
export function isValidMCPTokenFormat(token: string): boolean {
  return /^astrid_mcp_[a-f0-9]{64}$/.test(token)
}
