# Multi-File Refactor Template

## Refactor Scope
- **Objective**: What architectural or structural changes are we making?
- **Impact**: Which parts of the system will be affected?
- **Benefits**: What improvements will this refactor provide?

## File Analysis

### Current Structure
- **Files to Modify**: List exact paths that need changes
- **Dependencies**: What other files depend on these changes?
- **Breaking Changes**: Will this affect existing APIs or interfaces?

### Target Structure
- **New Organization**: How should files be reorganized?
- **Interface Changes**: What new contracts or types are needed?
- **Migration Path**: How do we transition without breaking existing code?

## Implementation Strategy

### Phase 1: Core Changes
- **Primary Files**: Start with the most fundamental changes
- **Examples**: `lib/database-utils.ts`, `types/index.ts`, `lib/auth-config.ts`
- **Touch Only**: `app/api/lists/route.ts`, `components/list-detail.tsx`

### Phase 2: Dependent Updates
- **Cascading Changes**: Update files that depend on core changes
- **Examples**: `hooks/use-lists.ts`, `components/list-members-manager.tsx`
- **Touch Only**: `tests/api/lists.test.ts`, `tests/components/list-detail.test.tsx`

### Phase 3: Integration & Testing
- **End-to-End**: Ensure all pieces work together
- **Test Updates**: Update or add tests for changed functionality
- **Documentation**: Update relevant documentation

## Development Rules

### Code Quality
- **Diff Limit**: Keep changes ≤ 120 lines per file
- **Atomic Changes**: Each file change should be self-contained
- **Type Safety**: Maintain full TypeScript coverage

### Testing Requirements
- **Test Commands**: `npm run test:run` for full test suite
- **Coverage**: `npm run test:coverage` to verify test coverage
- **Specific Tests**: `npm run test:rate-limit` for focused testing

### File Boundaries
- **Touch Only**: Specify exact paths to modify
- **Examples**: `app/api/tasks/route.ts`, `components/task-form.tsx`, `lib/date-utils.ts`
- **Preserve**: Don't change unrelated files

### Documentation
- **Cite file:line before changing code**
- **Update API contracts** if endpoints change
- **Update tests** for new functionality

## Pre-Refactor Checklist
- [ ] Impact analysis complete
- [ ] File boundaries defined
- [ ] Migration strategy planned
- [ ] Test coverage assessed
- [ ] Rollback plan ready