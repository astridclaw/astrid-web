#!/usr/bin/env node
/**
 * astrid-agent CLI - DEPRECATED
 *
 * Built-in AI executors have been removed. Astrid now dispatches to external
 * agent runtimes (OpenClaw, Claude Code Remote) via webhooks and SSE.
 *
 * For coding tasks, use:
 *   - OpenClaw Gateway (openclaw.com)
 *   - Claude Code Remote (packages/claude-code-remote)
 *
 * This CLI stub remains for backward compatibility.
 */

console.error(`
⚠️  astrid-agent CLI is deprecated.

Built-in AI executors have been removed. Astrid now dispatches to external
agent runtimes (OpenClaw, Claude Code Remote) via webhooks and SSE.

For coding tasks, use:
  - OpenClaw Gateway: https://openclaw.com
  - Claude Code Remote: packages/claude-code-remote

See docs/AGENT_ARCHITECTURE_SIMPLIFICATION.md for details.
`)

process.exit(1)
