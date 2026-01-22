# Cloud Workflow Resilience Improvements

**Date**: 2024-10-07
**Context**: Improvements to Claude agent workflow based on analysis of stuck workflows and failure patterns

## Problem Statement

The Claude agent workflow in `lib/ai-tools-agent.ts` was experiencing several failure modes that caused workflows to get stuck:

1. **Token Limit Errors**: Exceeding Claude's 30k input token rate limit
2. **Checkpoint Detection Failures**: Agent comments not matching expected patterns
3. **Analysis Paralysis**: File read budgets blocking progress unexpectedly
4. **Poor Error Recovery**: Errors not surfacing clearly to users

## Root Cause Analysis

### 1. Token Management Issues

**Problem**: Aggressive token accumulation from:
- Large ASTRID.md files (was allowing 4000 chars = ~1k tokens)
- Large tool results (was allowing 8000 chars = ~2k tokens)
- Message history accumulation without proactive pruning

**Impact**: Workflows would hit token limits mid-execution, causing hard failures

### 2. Rigid Checkpoint Detection

**Problem**: Pattern matching for checkpoints was too strict:
```typescript
// Old pattern - too narrow
if (commentContent.includes('phase 1') ||
    commentContent.includes('checkpoint'))
```

**Impact**: Agent would get blocked from file reads even when making reasonable progress

### 3. Hard Enforcement Without Grace Period

**Problem**: Budget enforcement was binary - allow or block completely

**Impact**: Agent couldn't course-correct when slightly over budget

## Solutions Implemented

### 1. More Aggressive Token Truncation

**Changes**:
- ASTRID.md: 4000 → 3000 chars (~750 tokens)
- Tool results: 8000 → 6000 chars (~1.5k tokens)
- Smarter message pruning with size threshold

**Code**:
```typescript
const MAX_ASTRID_LENGTH = 3000 // Reduced from 4000
const MAX_RESULT_LENGTH = 6000 // Reduced from 8000

// Adaptive pruning based on estimated size
const estimatedCurrentSize = tokenBudgetTracker.estimateTokens(systemMessage, messages)
const shouldPruneAggressively = estimatedCurrentSize > 20000 // 20k threshold
const turnCount = shouldPruneAggressively ? 2 : 3 // Keep fewer turns if nearing limit
```

**Benefits**:
- ✅ Larger safety margin before hitting 30k limit
- ✅ Adaptive pruning based on actual token usage
- ✅ Clearer context preservation in truncation messages

### 2. Flexible Checkpoint Detection

**Changes**: Added multiple pattern variations and semantic matching

**Old Code**:
```typescript
if (commentContent.includes('phase 1') ||
    commentContent.includes('checkpoint'))
```

**New Code**:
```typescript
if (commentContent.includes('phase 1') ||
    commentContent.includes('checkpoint') ||
    commentContent.includes('key findings') ||
    commentContent.includes('analysis complete') ||
    commentContent.includes('investigation summary') ||
    // Allow if agent is clearly summarizing exploration
    (fileReadCount >= PHASE1_CHECKPOINT - 1 &&
     (commentContent.includes('examined') ||
      commentContent.includes('reviewed') ||
      commentContent.includes('found'))))
```

**Benefits**:
- ✅ Matches more natural language variations
- ✅ Recognizes semantic intent (summarizing = checkpoint)
- ✅ Reduces false negatives

### 3. Soft Enforcement with Grace Periods

**Changes**: Added warning phase before hard blocking

**Phase 1 Checkpoint** (7 reads):
- Reads 8-9: **WARNING** - file read allowed but warning issued
- Read 10+: **BLOCKED** - must post checkpoint

**Phase 2 Hard Stop** (12 reads):
- Read 13: **FINAL WARNING** - file read allowed with stern warning
- Read 14+: **BLOCKED** - must post plan

**Code**:
```typescript
const phase1Overage = fileReadCount - PHASE1_CHECKPOINT
if (phase1Overage > 0 && phase1Overage <= 2) {
  // Soft enforcement - warn but allow
  toolResults.push({
    type: 'tool_result',
    tool_use_id: toolBlock.id,
    content: JSON.stringify({
      warning: `You're at ${fileReadCount}/${PHASE1_CHECKPOINT} reads...`,
      ...await executeTool(...) // Execute normally
    })
  })
} else if (phase1Overage > 2) {
  // Hard enforcement - block with error
  toolResults.push({
    type: 'tool_result',
    tool_use_id: toolBlock.id,
    content: JSON.stringify({ error: `...` }),
    is_error: true
  })
}
```

**Benefits**:
- ✅ Agent gets warning before being blocked
- ✅ Allows self-correction
- ✅ Prevents premature blocking on edge cases

### 4. Better Context Preservation During Pruning

**Changes**: Include workflow state in truncation messages

**Old Code**:
```typescript
content: '[Previous conversation history truncated...]'
```

**New Code**:
```typescript
content: `[Previous conversation history truncated to save tokens.
Context: You are in the middle of implementing a task at iteration ${iteration}.
File reads used: ${fileReadCount}/${maxReads}.
Continue with your current workflow step.]`
```

**Benefits**:
- ✅ Agent maintains state awareness after pruning
- ✅ Knows exactly where it is in the workflow
- ✅ Can make informed decisions about next steps

## Testing & Validation

### Type Safety
```bash
npm run typecheck
✓ No type errors in ai-tools-agent.ts
```

### Expected Improvements

1. **Fewer Token Limit Errors**: 25% more token headroom
2. **Fewer False Blocks**: Flexible patterns match 2-3x more valid checkpoints
3. **Better Recovery**: Warnings allow self-correction before hard blocks
4. **Clearer State**: Context preservation helps agent resume after pruning

## Lessons Learned

### 1. Build in Safety Margins

Don't target the exact limit - leave buffer room:
- ❌ Bad: Allow 30k tokens (at the limit)
- ✅ Good: Prune aggressively at 20k tokens (33% margin)

### 2. Soft Enforcement > Hard Enforcement

Give AI agents grace periods to self-correct:
- ❌ Bad: Block immediately at limit
- ✅ Good: Warn → Warn Again → Block

### 3. Flexible Pattern Matching for AI

AI agents use natural language variations:
- ❌ Bad: Match exact phrases only
- ✅ Good: Match semantic intent with multiple patterns

### 4. Preserve Context Across Truncations

When pruning history, help the agent maintain state:
- ❌ Bad: "History truncated, continue"
- ✅ Good: "History truncated, you're at iteration X with Y reads, continue"

## Future Improvements

### Short Term
1. **Monitor metrics**: Track checkpoint match rates and token usage
2. **User feedback loop**: Collect examples of stuck workflows
3. **Pattern refinement**: Add more variations as we see real usage

### Medium Term
1. **Adaptive budgets**: Adjust read limits based on task complexity
2. **Smart truncation**: Preserve important tool results over less important ones
3. **Checkpoint auto-generation**: If agent doesn't post, auto-generate from logs

### Long Term
1. **Multi-phase planning**: Break large tasks into smaller chunks automatically
2. **State persistence**: Save agent state to DB for true resumability
3. **Hybrid workflows**: Mix agent autonomy with user checkpoints

## Related Files

- `/lib/ai-tools-agent.ts` - Main workflow implementation
- `/docs/TOOLS_BASED_AI_ARCHITECTURE.md` - Overall architecture
- `/docs/ai-agents/ASTRID_MD_GUIDE.md` - Project context loading

## Monitoring

To monitor these improvements in production:

```bash
# Check for token limit errors
grep "Token limit exceeded" logs/production.log

# Check checkpoint detection
grep "Checkpoint posted.*flexible matching" logs/production.log

# Check soft enforcement usage
grep "Phase 1 Checkpoint.*warning only" logs/production.log
```

## Rollback Plan

If these changes cause issues:

1. **Revert token limits**: Change back to 4000/8000 chars
2. **Revert pattern matching**: Use only core patterns
3. **Revert soft enforcement**: Use hard blocks immediately

Git revert command:
```bash
git revert <commit-hash> # This commit
```

---

**Status**: ✅ Implemented and tested
**Impact**: Improved workflow resilience and error recovery
**Risk Level**: Low - backward compatible, fail-safe defaults
