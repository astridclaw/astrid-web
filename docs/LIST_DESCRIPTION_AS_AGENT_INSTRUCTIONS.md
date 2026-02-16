# List Description as Agent Instructions

## Summary

Each Astrid list's `description` field becomes a markdown instruction file for AI agents working on tasks in that list — like `claude.md` or `AGENTS.md` gives project-level guidance to coding agents.

## How It Works

1. User creates a list (e.g., "Code Reviews", "Research Tasks", "Content Writing")
2. User writes a markdown description:
   ```markdown
   You're reviewing pull requests. Focus on:
   - Security vulnerabilities
   - Test coverage gaps
   - Code style consistency
   
   Post findings as task comments. Mark complete when review is done.
   ```
3. When an agent picks up a task from that list, the list description is included as context instructions
4. Agent follows those instructions + task-specific details

## What Changes

### 1. `buildPrompt()` in `assistant-workflow/route.ts`

Currently hardcodes a generic system prompt. Change to:

```
If list has a description → use it as the primary instruction context
If no description → fall back to a minimal default
```

The list description replaces the hardcoded "You are a helpful AI assistant integrated into a task management app called Astrid" preamble.

### 2. `contextInstructions` in webhook payload (`ai-agent-webhook-service.ts`)

Currently hardcoded. Change to use `list.description` when available:

```typescript
contextInstructions: list.description || defaultInstructions
```

### 3. Task query in `assistant-workflow/route.ts`

Already includes `lists` with `name` — needs to also select `description`.

### 4. OpenClaw hook payload

The `message` sent to OpenClaw gateways should include list description as context.

## Prompt Structure

```
## List Instructions
{list.description}   ← from the list's description field (markdown)

## Task
**{task.title}**
{task.description}
Priority: {priority}
Due: {dueDate}

## Conversation
{recent comments}

## User's Latest Comment    ← only for comment responses
{userComment}
```

When no list description exists, use a minimal fallback:
```
You've been assigned a task in Astrid. Read the task details and help complete it.
Post progress updates as comments. Mark complete when done.
```

## Benefits

- **No hardcoded workflows** — users define agent behavior per list
- **Works across all agents** — same description guides Claude, OpenAI, Gemini, OpenClaw
- **Easy to iterate** — edit description, change behavior. No deploys.
- **Multi-list = multi-role** — same agent handles research in one list, code review in another
- **Backward compatible** — lists without descriptions get the default prompt

## UI Notes

- List description editor should hint: "This description will be shown to AI agents working on tasks in this list. Use markdown."
- Could add a "Preview as agent sees it" toggle later
