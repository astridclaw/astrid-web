# Proposed AI Agent Data Model

## Core Concept
Separate AI agents from users entirely - dedicated table for AI agents that supports the assignment UX without fake users.

## Schema Design

```prisma
model AIAgent {
  id          String   @id @default(cuid())
  name        String   // "Claude Code Agent"
  service     String   // "claude", "openai"
  agentType   String   // "coding", "analysis", "creative"
  description String?
  isActive    Boolean  @default(true)
  config      Json?    // Service-specific config
  webhookUrl  String?  // For notifications
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // Relations
  assignedTasks Task[]

  @@unique([service, agentType])
  @@map("ai_agents")
}

// Update Task model for hybrid assignment
model Task {
  // ... existing fields

  // EITHER user OR AI agent (mutually exclusive)
  assigneeId   String?
  assignee     User?    @relation("TaskAssignee", fields: [assigneeId], references: [id])

  aiAgentId    String?
  aiAgent      AIAgent? @relation(fields: [aiAgentId], references: [id])

  // Database constraint: exactly one assignee type
  @@check("single_assignee", "(assigneeId IS NULL) != (aiAgentId IS NULL)")
}
```

## Assignment Logic

```typescript
interface TaskAssignment {
  type: 'user' | 'ai_agent'
  id: string
  name: string
}

// Unified assignment function
async function assignTask(taskId: string, assignment: TaskAssignment) {
  if (assignment.type === 'user') {
    return prisma.task.update({
      where: { id: taskId },
      data: {
        assigneeId: assignment.id,
        aiAgentId: null
      }
    })
  } else {
    return prisma.task.update({
      where: { id: taskId },
      data: {
        assigneeId: null,
        aiAgentId: assignment.id
      }
    })
  }
}
```

## UI Integration

```typescript
// Assignment dropdown combines both types
const getAssignmentOptions = async () => {
  const [users, aiAgents] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true } }),
    prisma.aiAgent.findMany({ where: { isActive: true } })
  ])

  return [
    ...users.map(u => ({ type: 'user', id: u.id, name: u.name, icon: '👤' })),
    ...aiAgents.map(a => ({ type: 'ai_agent', id: a.id, name: a.name, icon: '🤖' }))
  ]
}
```

## Benefits

1. **Clean Separation**: No fake users polluting user table
2. **Preserved UX**: Users still "assign to Claude Agent"
3. **Efficient Queries**: Direct relationships, no fake user joins
4. **Easy Seeding**: AI agents created automatically on deployment
5. **Metadata Support**: Store AI-specific config per agent
6. **Type Safety**: Database constraints ensure valid assignments
7. **Scalable**: Easy to add new AI services

## Migration Strategy

1. Create AIAgent table
2. Seed default agents (Claude, OpenAI)
3. Update assignment logic to handle both types
4. Update UI components for hybrid dropdown
5. Migrate existing fake user assignments to AI agents
6. Remove fake users from user table
7. Update webhook system to use AI agent IDs

## Default AI Agents

```sql
INSERT INTO ai_agents (name, service, agentType, description, isActive) VALUES
('Claude Code Agent', 'claude', 'coding', 'AI coding assistant powered by Anthropic Claude', true),
('OpenAI Code Agent', 'openai', 'coding', 'AI coding assistant powered by OpenAI GPT-4', true),
('Claude Analyst', 'claude', 'analysis', 'AI analyst for data analysis and insights', true);
```