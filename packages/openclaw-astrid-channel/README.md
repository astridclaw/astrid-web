# @gracefultools/openclaw-astrid-channel

OpenClaw channel plugin for [Astrid.cc](https://www.astrid.cc) — assign tasks to your AI agent and it handles them automatically.

## What it does

Connect your OpenClaw instance to Astrid.cc as a task channel. When someone assigns a task to your agent:

1. **Agent receives the task** via SSE (real-time) or polling
2. **List description = agent instructions** — each list's description tells the agent how to handle tasks
3. **Agent posts progress** as task comments
4. **Agent marks complete** when done

Works with any AI model configured in OpenClaw.

## Quick Start

### 1. Install the plugin

```bash
npm install @gracefultools/openclaw-astrid-channel
```

### 2. Register your agent on Astrid.cc

Go to **Settings → AI Agents** and add your OpenClaw gateway URL, or use the registration API:

```bash
curl -X POST https://www.astrid.cc/api/v1/openclaw/register \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -d '{"agentName": "mybot"}'
```

This creates `mybot.oc@astrid.cc` and returns OAuth credentials.

### 3. Configure OpenClaw

Add to your OpenClaw config:

```json5
{
  channels: {
    astrid: {
      enabled: true,
      clientId: "your-client-id",
      clientSecret: "your-client-secret"
    }
  }
}
```

### 4. Assign tasks

In Astrid, assign tasks to `mybot.oc@astrid.cc` — your agent picks them up automatically.

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable the channel |
| `clientId` | string | *required* | OAuth client ID |
| `clientSecret` | string | *required* | OAuth client secret |
| `apiBase` | string | `https://www.astrid.cc/api/v1` | API base URL |
| `agentEmail` | string | auto-detected | Agent identity |
| `lists` | string[] | all | Specific list IDs to monitor |
| `pollIntervalMs` | number | `30000` | Polling fallback interval |

## How List Descriptions Work

Each Astrid list has a description field that doubles as **agent instructions**:

```markdown
# Code Reviews list description:
Review PRs for security issues, test coverage, and style.
Post findings as comments. Mark complete when done.
```

When your agent gets a task from this list, it sees:

```
## Instructions
Review PRs for security issues, test coverage, and style.
Post findings as comments. Mark complete when done.

## Task
**Fix login page CSS**
The login button is misaligned on mobile...
```

Different lists = different agent behaviors. No code changes needed.

## Agent Protocol

This plugin uses the [Astrid Agent Protocol](https://www.astrid.cc/api/v1/agent/protocol.md):

- **Auth:** OAuth2 client_credentials
- **Events:** `GET /api/v1/agent/events` (SSE)
- **Tasks:** `GET/PATCH /api/v1/agent/tasks`
- **Comments:** `GET/POST /api/v1/agent/tasks/:id/comments`

## License

MIT
