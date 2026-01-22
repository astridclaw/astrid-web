import pino from "pino"

/**
 * Centralized logging utility for the Astrid application.
 *
 * Uses pino for high-performance structured logging.
 *
 * Log levels (in order of severity):
 * - trace: Very detailed debugging information
 * - debug: Debugging information
 * - info: General operational information
 * - warn: Warning conditions
 * - error: Error conditions
 * - fatal: Fatal errors that require immediate attention
 *
 * In production (NODE_ENV=production), only 'info' and above are logged.
 * In development, 'debug' and above are logged.
 */

const isProduction = process.env.NODE_ENV === "production"
const isTest = process.env.NODE_ENV === "test"

// Determine log level based on environment
function getLogLevel(): string {
  if (process.env.LOG_LEVEL) {
    return process.env.LOG_LEVEL
  }
  if (isTest) {
    return "silent"
  }
  if (isProduction) {
    return "info"
  }
  return "debug"
}

// Create the base logger
const logger = pino({
  level: getLogLevel(),
  // In production, use standard JSON output
  // In development, use pretty printing (handled by pino-pretty if installed)
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      }),
})

/**
 * Create a child logger with a specific context/module name.
 *
 * @param name - The module or context name (e.g., "GitHubClient", "SSE")
 * @returns A child logger with the context attached
 *
 * @example
 * const log = createLogger("GitHubClient")
 * log.info({ userId: "123" }, "Authenticating user")
 * log.error({ error }, "Authentication failed")
 */
export function createLogger(name: string) {
  return logger.child({ module: name })
}

// Export the base logger as well
export default logger
