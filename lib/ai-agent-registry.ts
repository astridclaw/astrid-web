/**
 * AI Agent Detection Utilities
 *
 * Simple utilities to detect AI agents in the system.
 * AI agents are identified by the `isAIAgent` database flag.
 */

/**
 * Check if a database user object represents an AI agent
 */
export function isDatabaseUserAIAgent(user: {
  isAIAgent?: boolean | null
}): boolean {
  return user.isAIAgent === true
}

/**
 * Check if a session user represents an AI agent
 * Note: Sessions are for human users only. AI agents don't use sessions.
 * This function exists for backward compatibility but should rarely return true.
 */
export function isSessionUserAIAgent(sessionUser: {
  id?: string | null
  email?: string | null
}): boolean {
  // Human sessions should never be AI agents
  // AI agents interact via direct database/API calls, not sessions
  return false
}