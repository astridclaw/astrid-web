# @gracefultools/astrid-sdk

AI agent SDK for automated coding tasks with Claude, OpenAI, and Gemini.

## Installation

```bash
npm install -g @gracefultools/astrid-sdk
```

## Quick Start

### Three Execution Modes

| Mode | Command | Best For |
|------|---------|----------|
| **API** | `npx astrid-agent` | Cloud execution via Claude Agent SDK API |
| **Terminal** | `npx astrid-agent --terminal` | Local Claude Code CLI (remote control) |
| **Webhook** | `npx astrid-agent serve` | Always-on servers (fly.io, VPS, AWS) |

### Terminal Mode (Remote Control Your Local Claude Code)

Uses your local Claude Code CLI to process tasks. Enables remote control of your local Claude Code from Astrid.

```bash
# Prerequisites: Install Claude Code CLI
npm install -g @anthropic-ai/claude-code

# Set up environment
export ANTHROPIC_API_KEY=sk-ant-...
export ASTRID_OAUTH_CLIENT_ID=your_client_id
export ASTRID_OAUTH_CLIENT_SECRET=your_client_secret
export ASTRID_OAUTH_LIST_ID=your_list_id

# Start in terminal mode
cd /your/project
npx astrid-agent --terminal

# With options
npx astrid-agent --terminal --model=sonnet --cwd=/path/to/project --max-turns=100

# Or via environment variable
ASTRID_TERMINAL_MODE=true npx astrid-agent
```

**How it works:**
1. Agent polls Astrid for tasks assigned to AI agents
2. When a task is found, it spawns the local Claude Code CLI with `--print`
3. Claude Code executes in your project directory
4. Results are posted back to Astrid as comments
5. Session IDs are stored for resumption support

### API Mode (Default)

Uses Claude Agent SDK API for cloud execution. Best for CI/CD and servers.

```bash
# Set up environment
export ANTHROPIC_API_KEY=sk-ant-...
export ASTRID_OAUTH_CLIENT_ID=your_client_id
export ASTRID_OAUTH_CLIENT_SECRET=your_client_secret
export ASTRID_OAUTH_LIST_ID=your_list_id

# Start polling for tasks (API mode)
npx astrid-agent
```

### Webhook Mode (For Always-On Servers)

Receives instant task notifications via webhook. Requires a permanent IP or domain.

```bash
# Set up environment
export ANTHROPIC_API_KEY=sk-ant-...
export ASTRID_WEBHOOK_SECRET=your_webhook_secret

# Start webhook server
npx astrid-agent serve --port=3001

# Optional: Install express for the server
npm install express
```

Then configure your webhook URL in Astrid Settings.

## Environment Variables

| Variable | Mode | Description |
|----------|------|-------------|
| **AI Providers** | All | |
| `ANTHROPIC_API_KEY` | All | Anthropic API key (for Claude) |
| `OPENAI_API_KEY` | All | OpenAI API key |
| `GEMINI_API_KEY` | All | Google Gemini API key |
| **Polling/Terminal Mode** | Polling, Terminal | |
| `ASTRID_OAUTH_CLIENT_ID` | Polling, Terminal | OAuth client ID from Astrid |
| `ASTRID_OAUTH_CLIENT_SECRET` | Polling, Terminal | OAuth client secret |
| `ASTRID_OAUTH_LIST_ID` | Polling, Terminal | List ID to monitor for tasks |
| **Terminal Mode** | Terminal | |
| `ASTRID_TERMINAL_MODE` | Terminal | Enable terminal mode (or use --terminal flag) |
| `CLAUDE_MODEL` | Terminal | Model to use (default: opus) |
| `CLAUDE_MAX_TURNS` | Terminal | Max turns per execution (default: 50) |
| `DEFAULT_PROJECT_PATH` | Terminal | Project directory (default: current dir) |
| **Webhook Mode** | Webhook | |
| `ASTRID_WEBHOOK_SECRET` | Webhook | Secret from Astrid webhook settings |
| `ASTRID_CALLBACK_URL` | Webhook | Optional callback URL |
| **Other** | All | |
| `GITHUB_TOKEN` | All | GitHub token for cloning private repos |
| `POLL_INTERVAL_MS` | Polling, Terminal | Poll interval (default: 30000) |
| `MAX_BUDGET_USD` | API | Max budget per task (default: 10.0) |
| **Agent Workflow** | Terminal | |
| `ASTRID_AGENT_CREATE_BRANCH` | Terminal | Create feature branches (default: true) |
| `ASTRID_AGENT_CREATE_PR` | Terminal | Create pull requests (default: true) |
| `ASTRID_AGENT_BRANCH_PREFIX` | Terminal | Branch name prefix (default: "task/") |
| `ASTRID_AGENT_RUN_TESTS` | Terminal | Run tests before committing (default: true) |
| `ASTRID_AGENT_TEST_COMMAND` | Terminal | Test command (default: "npm run predeploy") |
| **Vercel Deployment** | Terminal | |
| `ASTRID_AGENT_VERCEL_DEPLOY` | Terminal | Trigger Vercel preview deployment (default: true) |
| `ASTRID_AGENT_VERCEL_USE_API` | Terminal | Use Vercel API instead of CLI (default: false) |
| `ASTRID_AGENT_PREVIEW_DOMAIN` | Terminal | Domain for preview aliases (e.g., "astrid.cc") |
| `ASTRID_AGENT_PREVIEW_PATTERN` | Terminal | Subdomain pattern (default: "{branch}") |
| `VERCEL_TOKEN` | Terminal | Vercel API token for deployments |
| `VERCEL_PROJECT_NAME` | Terminal | Vercel project name (auto-detected) |
| `VERCEL_TEAM_ID` | Terminal | Vercel team ID (optional) |

## Agent Workflow Configuration

Control how AI agents create branches, PRs, and preview deployments via environment variables. No package update needed to change behavior.

### Example: Full PR + Preview Workflow (Recommended)

```bash
# Git workflow
export ASTRID_AGENT_CREATE_BRANCH=true    # Create feature branches
export ASTRID_AGENT_CREATE_PR=true        # Create pull requests
export ASTRID_AGENT_RUN_TESTS=true        # Run tests before commit

# Vercel preview deployment
export ASTRID_AGENT_VERCEL_DEPLOY=true    # Deploy to Vercel
export ASTRID_AGENT_PREVIEW_DOMAIN=astrid.cc  # Custom subdomain (for passkey support)
export VERCEL_TOKEN=your-vercel-token     # Required for deployment
export GITHUB_TOKEN=your-github-token     # Required for PR creation
```

### Example: Direct to Main (No PR)

```bash
export ASTRID_AGENT_CREATE_BRANCH=false
export ASTRID_AGENT_CREATE_PR=false
export ASTRID_AGENT_VERCEL_DEPLOY=false
```

### Preview URL Configuration

When `ASTRID_AGENT_PREVIEW_DOMAIN` is set (e.g., `astrid.cc`), preview URLs are aliased to subdomains:

- Branch: `task/abc12345` → Preview URL: `https://task-abc12345.astrid.cc`

This is required for features that need same-origin (passkeys, Google OAuth cookies).

### Programmatic Configuration

```typescript
import {
  getAgentWorkflowConfig,
  validateWorkflowConfig,
  logWorkflowConfig,
  deployToVercel,
} from '@gracefultools/astrid-sdk'

// Get current config (reads from env)
const config = getAgentWorkflowConfig()

// Validate config
const { valid, errors, warnings } = validateWorkflowConfig()
if (!valid) {
  console.error('Config errors:', errors)
}

// Log config for debugging
logWorkflowConfig()

// Deploy to Vercel manually
const result = await deployToVercel('task/abc12345', '/path/to/project')
console.log('Preview URL:', result.previewUrl)
```

## Supported AI Providers

The SDK automatically routes tasks to the correct provider based on the assignee email:

| Agent Email | Provider | Model |
|-------------|----------|-------|
| `claude@astrid.cc` | Claude | claude-sonnet-4 |
| `openai@astrid.cc` | OpenAI | gpt-4o |
| `gemini@astrid.cc` | Gemini | gemini-2.0-flash |

## Deployment Examples

### Fly.io (Webhook Mode)

```toml
# fly.toml
app = "astrid-agent"
primary_region = "iad"

[http_service]
  internal_port = 3001

[env]
  PORT = "3001"
```

```bash
fly secrets set ANTHROPIC_API_KEY=sk-ant-...
fly secrets set ASTRID_WEBHOOK_SECRET=...
fly deploy
```

### Docker (Webhook Mode)

```dockerfile
FROM node:20-slim
RUN npm install -g @gracefultools/astrid-sdk express
WORKDIR /app
EXPOSE 3001
CMD ["npx", "astrid-agent", "serve", "--port=3001"]
```

### PM2 (Polling Mode)

```bash
# ecosystem.config.js
module.exports = {
  apps: [{
    name: 'astrid-agent',
    script: 'npx',
    args: 'astrid-agent',
    env: {
      ANTHROPIC_API_KEY: 'sk-ant-...',
      ASTRID_OAUTH_CLIENT_ID: '...',
      ASTRID_OAUTH_CLIENT_SECRET: '...',
      ASTRID_OAUTH_LIST_ID: '...'
    }
  }]
}
```

## Programmatic Usage

```typescript
import {
  planWithClaude,
  executeWithClaude,
  AstridOAuthClient,
} from '@gracefultools/astrid-sdk'

// Connect to Astrid
const client = new AstridOAuthClient({
  clientId: process.env.ASTRID_OAUTH_CLIENT_ID,
  clientSecret: process.env.ASTRID_OAUTH_CLIENT_SECRET,
})

// Get tasks
const tasks = await client.getTasks(listId)

// Plan implementation
const planResult = await planWithClaude(
  task.title,
  task.description,
  {
    repoPath: '/path/to/repo',
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxBudgetUsd: 5.0,
    logger: console.log,
    onProgress: (msg) => console.log(msg),
  }
)

// Execute the plan
if (planResult.success && planResult.plan) {
  const execResult = await executeWithClaude(
    planResult.plan,
    task.title,
    task.description,
    config
  )

  console.log('Files modified:', execResult.files.length)
}
```

## CLI Reference

```bash
# Show help
npx astrid-agent --help

# API mode (default - cloud execution)
npx astrid-agent

# Terminal mode (local Claude Code CLI)
npx astrid-agent --terminal
npx astrid-agent --terminal --model=sonnet --cwd=/path/to/project

# Process a specific task
npx astrid-agent <taskId>
npx astrid-agent --terminal <taskId>

# Webhook mode
npx astrid-agent serve --port=3001
```

## Comparison: Terminal vs API vs Webhook

| Feature | Terminal | API | Webhook |
|---------|----------|-----|---------|
| Execution | Local CLI | Cloud API | Cloud API |
| Requires Claude Code CLI | Yes | No | No |
| Permanent IP needed | No | No | Yes |
| Works behind NAT | Yes | Yes | No |
| Session resume | Yes | No | No |
| Task notification | ~30s poll | ~30s poll | Instant |
| Best for | Local dev | CI/CD, servers | Always-on servers |
| Project access | Local files | Clones repo | Clones repo |

## Updating

```bash
# Update to latest version
npm update -g @gracefultools/astrid-sdk
```

## License

MIT

## Links

- [Astrid](https://astrid.cc)
- [Documentation](https://astrid.cc/docs)
- [GitHub](https://github.com/Graceful-Tools/astrid-res-www)
