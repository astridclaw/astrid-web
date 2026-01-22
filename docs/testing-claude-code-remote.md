# Testing Claude Code Remote Integration

This guide explains how to manually test the Claude Code Remote integration.

## Prerequisites

1. Database with `UserWebhookConfig` table (run migration)
2. Local Astrid server running
3. (Optional) Claude Code Remote server for full E2E testing

## Test Scenarios

### 1. Webhook Settings API

#### Test: Create webhook configuration

```bash
# Login and get session cookie first, then:
curl -X PUT http://localhost:3000/api/user/webhook-settings \
  -H "Cookie: YOUR_SESSION_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{
    "webhookUrl": "http://localhost:3001/webhook"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "webhookSecret": "abc123...",  // Only shown once!
  "message": "Webhook configured successfully. Save this secret - it will not be shown again!"
}
```

#### Test: Get webhook configuration

```bash
curl http://localhost:3000/api/user/webhook-settings \
  -H "Cookie: YOUR_SESSION_COOKIE"
```

**Expected Response:**
```json
{
  "configured": true,
  "enabled": true,
  "events": ["task.assigned", "comment.created"],
  "webhookUrl": "http://localhost:3001/webhook",
  "hasSecret": true,
  "failureCount": 0
}
```

#### Test: Test webhook

```bash
curl -X POST http://localhost:3000/api/user/webhook-settings \
  -H "Cookie: YOUR_SESSION_COOKIE"
```

**Expected Response (success):**
```json
{
  "success": true,
  "message": "Test webhook sent successfully!",
  "responseTime": 123,
  "statusCode": 200
}
```

**Expected Response (failure):**
```json
{
  "success": false,
  "message": "Failed to reach webhook: ECONNREFUSED",
  "responseTime": 5000,
  "error": "ECONNREFUSED"
}
```

### 2. Callback Endpoint

#### Test: Valid callback signature

```bash
# Generate signature (use the webhook-signature test as reference)
PAYLOAD='{"event":"session.completed","sessionId":"test-123","taskId":"YOUR_TASK_ID","timestamp":"2024-01-15T00:00:00Z"}'
TIMESTAMP=$(date +%s000)
SECRET="your-webhook-secret"

# Calculate signature (you can use Node.js):
# const crypto = require('crypto')
# const sig = crypto.createHmac('sha256', SECRET).update(TIMESTAMP + '.' + PAYLOAD).digest('hex')

curl -X POST http://localhost:3000/api/remote-servers/callback \
  -H "Content-Type: application/json" \
  -H "X-Astrid-Signature: sha256=CALCULATED_SIGNATURE" \
  -H "X-Astrid-Timestamp: $TIMESTAMP" \
  -d "$PAYLOAD"
```

**Expected Response:**
```json
{
  "success": true,
  "event": "session.completed",
  "taskId": "YOUR_TASK_ID"
}
```

#### Test: Invalid signature

```bash
curl -X POST http://localhost:3000/api/remote-servers/callback \
  -H "Content-Type: application/json" \
  -H "X-Astrid-Signature: sha256=invalid" \
  -H "X-Astrid-Timestamp: 1704067200000" \
  -d '{"event":"session.completed","taskId":"task-1"}'
```

**Expected Response:**
```json
{
  "error": "Signature mismatch"
}
```
(Status: 401)

### 3. Task Assignment Webhook Flow

#### Setup mock webhook receiver

```bash
# Terminal 1: Start a simple webhook receiver
npx http-echo-server 3001
# or use https://webhook.site for a public URL
```

#### Configure webhook

```bash
curl -X PUT http://localhost:3000/api/user/webhook-settings \
  -H "Cookie: YOUR_SESSION_COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl": "http://localhost:3001"}'
```

#### Create task assigned to AI agent

Use the Astrid UI to:
1. Create a new task
2. Assign it to `claude@astrid.cc`

#### Verify webhook was sent

Check your webhook receiver logs. You should see:
- `X-Astrid-Signature` header with `sha256=...`
- `X-Astrid-Timestamp` header
- `X-Astrid-Event: task.assigned`
- JSON body with task details

### 4. Full E2E Test with Claude Code Remote

#### Start Claude Code Remote server

```bash
cd packages/claude-code-remote
cp .env.example .env
# Edit .env with:
# - ASTRID_WEBHOOK_SECRET from your webhook config
# - ASTRID_CALLBACK_URL=http://localhost:3000/api/remote-servers/callback
# - DEFAULT_PROJECT_PATH=/path/to/test/project

npm run dev
```

#### Configure Astrid webhook

Point to your local Claude Code Remote server:

```bash
curl -X PUT http://localhost:3000/api/user/webhook-settings \
  -H "Cookie: YOUR_SESSION_COOKIE" \
  -d '{"webhookUrl": "http://localhost:3001/webhook"}'
```

#### Create test task

1. In Astrid UI, create task: "Create a hello.txt file with 'Hello World'"
2. Assign to `claude@astrid.cc`

#### Observe the flow

1. **Astrid** sends webhook to Claude Code Remote
2. **Claude Code Remote** receives webhook, verifies signature
3. **Claude Code Remote** executes `claude --print -p "Create a hello.txt..."`
4. **Claude Code** creates the file
5. **Claude Code Remote** sends callback to Astrid
6. **Astrid** creates comment on task with completion summary

## Automated Tests

Run the test suite:

```bash
# Webhook signature tests (29 tests)
npm test -- tests/lib/webhook-signature.test.ts

# Integration tests (13 tests)
npm test -- tests/api/claude-code-remote-webhooks.test.ts

# All tests
npm test
```

## Troubleshooting

### Webhook not received

1. Check `failureCount` in webhook settings - may be disabled after failures
2. Verify URL is reachable from Astrid server
3. Check for firewall/network issues

### Signature verification fails

1. Ensure webhook secret matches on both sides
2. Check clock sync - timestamp must be within 5 minutes
3. Verify payload hasn't been modified in transit

### Claude Code Remote not executing

1. Check Claude Code CLI is installed: `claude --version`
2. Verify ANTHROPIC_API_KEY is set
3. Check project path exists and is accessible

## Environment Variables Reference

**Astrid (server):**
- `ENCRYPTION_KEY` - Required for encrypting webhook secrets

**Claude Code Remote:**
- `ASTRID_WEBHOOK_SECRET` - From webhook configuration
- `ASTRID_CALLBACK_URL` - Astrid callback endpoint
- `CLAUDE_MODEL` - Claude model to use (default: claude-sonnet-4-20250514)
- `DEFAULT_PROJECT_PATH` - Working directory for Claude Code
