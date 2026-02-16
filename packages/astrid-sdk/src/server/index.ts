/**
 * Astrid SDK Server - DEPRECATED
 *
 * Built-in AI executors have been removed. Astrid now dispatches to external
 * agent runtimes (OpenClaw, Claude Code Remote) via webhooks and SSE.
 *
 * This module is kept as a stub for backward compatibility.
 */

export function createServer() {
  throw new Error(
    'astrid-sdk server is deprecated. Use external agent runtimes (OpenClaw, Claude Code Remote) instead.'
  )
}
