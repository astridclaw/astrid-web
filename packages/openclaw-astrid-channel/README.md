# @gracefultools/openclaw-astrid-channel

OpenClaw channel plugin for [Astrid.cc](https://www.astrid.cc) task management.

## Installation

```bash
npm install @gracefultools/openclaw-astrid-channel
```

## Configuration

Add to your `openclaw.json`:

```json
{
  "channels": {
    "astrid": {
      "enabled": true,
      "clientId": "your_client_id",
      "clientSecret": "your_client_secret"
    }
  }
}
```

### Options

| Option | Default | Description |
|---|---|---|
| `clientId` | *required* | OAuth client ID from Astrid |
| `clientSecret` | *required* | OAuth client secret |
| `apiBase` | `https://www.astrid.cc/api/v1` | Astrid API base URL |
| `agentEmail` | auto-detected | Agent email (`name.oc@astrid.cc`) |
| `lists` | all | List IDs to monitor |
| `pollIntervalMs` | `30000` | Polling fallback interval |

## How it works

1. Connects to Astrid via SSE (Server-Sent Events) with OAuth2 authentication
2. Receives task assignments and comments in real-time
3. Maps each task to an OpenClaw session
4. Posts agent responses as task comments

## Setup

1. Go to **Settings → AI Agents → OpenClaw** in Astrid
2. Create an agent — you'll get a `clientId` and `clientSecret`
3. Add them to your OpenClaw config
4. Start OpenClaw — tasks assigned to your agent will create sessions automatically

## Protocol

See [Agent Protocol](https://www.astrid.cc/api/v1/agent/protocol.md) for the full API specification.
