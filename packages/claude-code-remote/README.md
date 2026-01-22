# Code Remote Server

> **DEPRECATED**: This package has been consolidated into `@gracefultools/astrid-sdk`.
>
> **Migration:**
> ```bash
> # Install the SDK
> npm install -g @gracefultools/astrid-sdk
>
> # Polling mode (local devices, no permanent IP needed)
> npx astrid-agent
>
> # Webhook mode (always-on servers)
> npx astrid-agent serve --port=3001
> ```
>
> The SDK provides the same capabilities with a simpler setup. See [@gracefultools/astrid-sdk](../astrid-sdk/README.md).

---

Self-hosted server that executes AI coding agents (Claude, OpenAI, Gemini) from Astrid task assignments.

## Overview

This package creates a bridge between Astrid's task management and multiple AI providers. When you assign a task to an AI agent in Astrid, the task is sent to your self-hosted server where the appropriate AI provider executes with full tool access.

## Features

- **Multi-Provider Support**: Claude Code CLI, OpenAI, and Gemini
- **Automatic Routing**: Tasks routed based on agent email (claude@, openai@, gemini@)
- **Session Continuity**: Claude Code supports `--resume` for multi-turn conversations
- **Full Tool Access**: Bash, file editing, git - everything the AI can do
- **Secure Communication**: HMAC-SHA256 signed webhooks
- **Project Mapping**: Route tasks to different project directories
- **Status Updates**: Progress notifications sent back to Astrid

## Quick Start

### 1. Prerequisites

- Node.js 18+
- At least one AI provider configured:
  - **Claude**: Claude Code CLI (`npm install -g @anthropic-ai/claude-code`)
  - **OpenAI**: API key from [platform.openai.com](https://platform.openai.com/api-keys)
  - **Gemini**: API key from [aistudio.google.com](https://aistudio.google.com/apikey)
- An Astrid account

### 2. Installation

```bash
cd packages/claude-code-remote
npm install
```

### 3. Configure Astrid

1. Go to **Settings → Webhook Settings** in Astrid
2. Set your webhook URL: `http://your-server:3001/webhook`
3. Copy the generated webhook secret

### 4. Configure the Server

```bash
cp .env.example .env
```

Edit `.env`:
```bash
# Required
ASTRID_WEBHOOK_SECRET=<your-webhook-secret>
ASTRID_CALLBACK_URL=https://astrid.cc/api/remote-servers/callback

# Configure at least one provider:
# Claude (install CLI first)
CLAUDE_MODEL=claude-sonnet-4-20250514

# OpenAI (optional)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5

# Gemini (optional)
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3-pro

# Project settings
DEFAULT_PROJECT_PATH=/path/to/your/projects
```

### 5. Start the Server

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## Provider Routing

Tasks are automatically routed based on the AI agent email:

| Agent Email | Provider | Implementation |
|-------------|----------|----------------|
| `claude@astrid.cc` | Claude | Claude Code CLI with `--print` |
| `openai@astrid.cc` | OpenAI | GPT-4o with function calling |
| `gemini@astrid.cc` | Gemini | Gemini 1.5 Pro with function calling |

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ASTRID_WEBHOOK_SECRET` | Secret for verifying Astrid webhooks | Required |
| `ASTRID_CALLBACK_URL` | Astrid's callback endpoint | Required |
| **Claude** |||
| `CLAUDE_MODEL` | Claude model to use | `claude-sonnet-4-20250514` |
| `CLAUDE_MAX_TURNS` | Max turns per interaction | `10` |
| `CLAUDE_TIMEOUT` | Execution timeout (ms) | `900000` |
| **OpenAI** |||
| `OPENAI_API_KEY` | OpenAI API key | Optional |
| `OPENAI_MODEL` | OpenAI model to use | `gpt-5` |
| `OPENAI_MAX_ITERATIONS` | Max tool use iterations | `50` |
| **Gemini** |||
| `GEMINI_API_KEY` | Gemini API key | Optional |
| `GEMINI_MODEL` | Gemini model to use | `gemini-3-pro` |
| `GEMINI_MAX_ITERATIONS` | Max tool use iterations | `50` |
| **Server** |||
| `PORT` | Server port | `3001` |
| `DEFAULT_PROJECT_PATH` | Default working directory | Current directory |
| `GITHUB_TOKEN` | For cloning repos and creating PRs | Optional |

### Project Mapping

Map Astrid lists to project directories:

**Option 1: Environment Variables**
```bash
PROJECT_PATH_ABC123_DEF456=/home/user/projects/my-app
```

**Option 2: JSON File**
```json
// data/projects.json
{
  "abc123-def456": {
    "path": "/home/user/projects/my-app",
    "defaultBranch": "main"
  }
}
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook` | POST | Receives webhooks from Astrid |
| `/health` | GET | Health check with provider status |
| `/sessions` | GET | List active sessions |

## How It Works

```
┌──────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│   Astrid     │────▶│   Code Remote Server │────▶│  Claude/OpenAI/  │
│   (Phone)    │     │     (Your VPS)       │     │     Gemini       │
└──────────────┘     └──────────────────────┘     └──────────────────┘
       ▲                       │
       │                       │
       └───────────────────────┘
              Status Updates
```

1. Assign task to AI agent in Astrid (e.g., claude@astrid.cc)
2. Astrid sends signed webhook to your server
3. Server detects provider from agent email
4. Provider executes task (file edits, git, etc.)
5. Server sends progress/completion back to Astrid
6. You see updates in Astrid task comments

## Session Management

Sessions are automatically managed:
- **New task**: Creates new session with appropriate provider
- **Comment**: Resumes existing session (Claude uses `--resume`, others get context)
- **Interrupted**: Recovers on server restart
- **Cleanup**: Old sessions removed after 24 hours

## Provider Capabilities

| Capability | Claude | OpenAI | Gemini |
|------------|--------|--------|--------|
| File reading | ✅ Native | ✅ Function | ✅ Function |
| File writing | ✅ Native | ✅ Function | ✅ Function |
| File editing | ✅ Native | ✅ Function | ✅ Function |
| Bash commands | ✅ Native | ✅ Function | ✅ Function |
| Git operations | ✅ Native | ✅ Via bash | ✅ Via bash |
| Session resume | ✅ `--resume` | ⚠️ Context only | ⚠️ Context only |
| PR creation | ✅ Via `gh` | ✅ Via `gh` | ✅ Via `gh` |

## Deployment

### Docker

```dockerfile
FROM node:20-slim
RUN npm install -g @anthropic-ai/claude-code
WORKDIR /app
COPY . .
RUN npm install && npm run build
CMD ["npm", "start"]
```

### PM2

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'code-remote',
    script: 'dist/server.js',
    instances: 1,
    autorestart: true,
    env: {
      NODE_ENV: 'production'
    }
  }]
};
```

### Systemd

```ini
[Unit]
Description=Code Remote Server
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/code-remote
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
EnvironmentFile=/path/to/code-remote/.env

[Install]
WantedBy=multi-user.target
```

## Security

- All webhooks are signed with HMAC-SHA256
- Timestamp validation prevents replay attacks
- Dangerous bash commands are blocked
- Secrets are never logged or exposed
- Use HTTPS in production (via reverse proxy)

## Troubleshooting

### No providers available
```bash
# Check health endpoint
curl http://localhost:3001/health

# Install Claude CLI
npm install -g @anthropic-ai/claude-code

# Or set API keys for OpenAI/Gemini
export OPENAI_API_KEY=sk-...
export GEMINI_API_KEY=...
```

### Webhook signature invalid
- Verify `ASTRID_WEBHOOK_SECRET` matches Astrid settings
- Check system clock is synchronized

### Sessions not persisting
- Check write permissions to `data/sessions.json`
- Verify `SESSION_MAP_PATH` directory exists

### PR creation fails
- Ensure `gh` CLI is installed and authenticated
- Or set `GITHUB_TOKEN` environment variable

## License

MIT
