# AI Agent Migration Plan

## Current State
- AI agents are fake users in the `User` table with `isAIAgent: true`
- Tasks assigned via `assigneeId` pointing to fake user records
- Manual setup required for each environment
- Pollutes user table with system entities

## Target State
- Dedicated `AIAgent` table separate from users
- Tasks can be assigned to either users OR AI agents (mutually exclusive)
- Automatic seeding of AI agents on deployment
- Clean data model with preserved assignment UX

## Migration Strategy (5 Phases)

### Phase 1: Create AIAgent Table ✨
**Goal**: Add new table without breaking existing functionality
**Risk**: Low (additive only)

```sql
-- Migration: add_ai_agent_table.sql
CREATE TABLE ai_agents (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    service TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    config JSONB,
    webhook_url TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE UNIQUE INDEX ai_agents_service_type_idx ON ai_agents(service, agent_type);
CREATE INDEX ai_agents_active_idx ON ai_agents(is_active);
```

### Phase 2: Add AI Assignment to Tasks ✨
**Goal**: Allow tasks to be assigned to AI agents while preserving user assignments
**Risk**: Low (additive only)

```sql
-- Migration: add_task_ai_assignment.sql
ALTER TABLE "Task" ADD COLUMN ai_agent_id TEXT;
ALTER TABLE "Task" ADD CONSTRAINT fk_task_ai_agent
    FOREIGN KEY (ai_agent_id) REFERENCES ai_agents(id);

-- Constraint: exactly one assignee type (user XOR ai_agent)
ALTER TABLE "Task" ADD CONSTRAINT chk_single_assignee
    CHECK ((assignee_id IS NULL) != (ai_agent_id IS NULL));

CREATE INDEX task_ai_agent_idx ON "Task"(ai_agent_id);
```

### Phase 3: Seed AI Agents ✨
**Goal**: Create proper AI agent records
**Risk**: Low (data only)

```typescript
// Automated seeding in migration or runtime
const defaultAgents = [
  {
    name: 'Claude Code Agent',
    service: 'claude',
    agentType: 'coding',
    description: 'AI coding assistant powered by Anthropic Claude',
    webhookUrl: `${baseUrl}/api/ai-agent/webhook`
  },
  {
    name: 'OpenAI Code Agent',
    service: 'openai',
    agentType: 'coding',
    description: 'AI coding assistant powered by OpenAI GPT-4',
    webhookUrl: `${baseUrl}/api/ai-agent/webhook`
  }
]
```

### Phase 4: Update Application Logic ⚠️
**Goal**: Update assignment logic to handle both types
**Risk**: Medium (logic changes)

**Files to update:**
- Task assignment API endpoints
- UI assignment dropdowns
- Webhook notification system
- AIOrchestrator lookup logic
- Assignment validation

**Assignment Logic Pattern:**
```typescript
interface AssignmentTarget {
  type: 'user' | 'ai_agent'
  id: string
}

async function assignTask(taskId: string, target: AssignmentTarget) {
  if (target.type === 'user') {
    return prisma.task.update({
      where: { id: taskId },
      data: { assigneeId: target.id, aiAgentId: null }
    })
  } else {
    return prisma.task.update({
      where: { id: taskId },
      data: { assigneeId: null, aiAgentId: target.id }
    })
  }
}
```

### Phase 5: Data Migration & Cleanup 🚨
**Goal**: Migrate existing fake user assignments to AI agents
**Risk**: High (data transformation)

```typescript
// Migration script
async function migrateFakeUserAssignments() {
  // 1. Find all fake AI agent users
  const fakeAgents = await prisma.user.findMany({
    where: { isAIAgent: true }
  })

  // 2. Create mapping to new AI agents
  const agentMapping = new Map()
  for (const fakeAgent of fakeAgents) {
    const newAgent = await prisma.aiAgent.findFirst({
      where: {
        service: mapEmailToService(fakeAgent.email),
        agentType: fakeAgent.aiAgentType || 'coding'
      }
    })
    agentMapping.set(fakeAgent.id, newAgent.id)
  }

  // 3. Update task assignments
  for (const [oldUserId, newAgentId] of agentMapping) {
    await prisma.task.updateMany({
      where: { assigneeId: oldUserId },
      data: { assigneeId: null, aiAgentId: newAgentId }
    })
  }

  // 4. Remove fake users (after confirming migration success)
  await prisma.user.deleteMany({
    where: { isAIAgent: true }
  })
}
```

## Implementation Order

### Immediate (Safe to implement now)
1. ✅ Create AIAgent table migration
2. ✅ Add AI assignment fields to Task table
3. ✅ Seed default AI agents
4. ✅ Update assignment logic (backward compatible)

### After Testing
5. ⚠️ Update UI to show both user and AI agent options
6. ⚠️ Update webhook system for AI agents
7. 🚨 Migrate existing fake user assignments
8. 🚨 Remove fake users

## Rollback Strategy

Each phase can be rolled back independently:
- **Phase 1-3**: Drop new tables/columns
- **Phase 4**: Revert application logic changes
- **Phase 5**: Restore fake users from backup if needed

## Testing Strategy

1. **Unit tests**: Assignment logic with both user and AI agent types
2. **Integration tests**: Full assignment workflow end-to-end
3. **Migration tests**: Data migration scripts on copy of production data
4. **UI tests**: Assignment dropdown shows correct options

## Benefits After Migration

1. ✅ **Clean Data Model**: No fake users polluting user table
2. ✅ **Zero Manual Setup**: AI agents created automatically
3. ✅ **Preserved UX**: Users still "assign to Claude Agent"
4. ✅ **Efficient Queries**: Direct relationships, no fake user joins
5. ✅ **Type Safety**: Database constraints prevent invalid assignments
6. ✅ **Scalable**: Easy to add new AI services
7. ✅ **Maintainable**: Clear separation between users and AI agents

## Estimated Timeline

- **Phase 1-3**: 1-2 hours (database changes + seeding)
- **Phase 4**: 4-6 hours (application logic updates)
- **Phase 5**: 2-3 hours (data migration + testing)
- **Total**: 1-2 days for complete migration

This migration will transform the AI agent system from a hacky fake-user approach to a clean, production-ready architecture while preserving the familiar assignment UX.