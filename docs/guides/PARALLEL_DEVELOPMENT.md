# Parallel Development with Git Worktrees

**Complete guide to working on multiple tasks simultaneously**

## Overview

The worktree system allows you to work on multiple tasks in parallel without conflicts. Each worktree is a complete, isolated development environment with its own:
- Directory (sibling to main repo)
- Git branch
- Development server port
- Database instance
- Environment configuration

## Quick Start

### Start New Parallel Work

```bash
# Syntax: npm run work:start <taskId> [description]
npm run work:start 123 "fix search clear"
```

**What happens automatically:**
1. Creates worktree at `../www-task-123`
2. Creates branch `task/123-fix-search-clear` from main
3. Finds next available port (3001, 3002, etc.)
4. Creates fresh database `astrid_dev_task123`
5. Copies and customizes `.env.local`
6. Syncs database schema

### Complete Your Work

```bash
npm run work:done 123
```

**Cleanup process:**
1. Checks for uncommitted changes (warns if found)
2. Removes worktree directory
3. Drops task database
4. Asks if you want to delete the branch

### View Active Worktrees

```bash
npm run work:list
```

**Shows:**
- Task numbers and branches
- Assigned ports
- Git status (clean/uncommitted changes)
- Database names
- Full paths

## Use Cases

### Use Case 1: Multiple Bug Fixes

You have 3 bugs to fix and want to work on them simultaneously:

```bash
# Start all three
npm run work:start 101 "fix header layout"
npm run work:start 102 "fix search performance"
npm run work:start 103 "fix mobile menu"

# Open each in separate Cursor window
# Work independently on each
```

**Benefits:**
- No context switching
- Can test each fix independently
- No git branch conflicts
- Each has own dev server running

### Use Case 2: Testing Different Approaches

Unsure which approach is best? Try both in parallel:

```bash
npm run work:start 200 "approach A state management"
npm run work:start 201 "approach B context pattern"

# Implement both, test side-by-side
# Keep the better one, discard the other
```

### Use Case 3: Multiple AI Assistants

Want to use different AI tools on different tasks:

```bash
# Terminal 1: Claude Code in Cursor
cd /path/to/www
npm run work:start 301 "refactor auth"
cd ../www-task-301
# Use Claude to implement

# Terminal 2: OpenAI Codex in different Cursor window
cd /path/to/www
npm run work:start 302 "optimize queries"
cd ../www-task-302
# Use GPT-4 to implement

# Terminal 3: Gemini in third window
cd /path/to/www
npm run work:start 303 "add analytics"
cd ../www-task-303
# Use Gemini to implement
```

### Use Case 4: Experiment Without Breaking Main

Want to try something risky without affecting main development:

```bash
npm run work:start 400 "experimental feature"
cd ../www-task-400

# Experiment freely
# If it works: commit and merge
# If it fails: npm run work:done 400 (no harm done)
```

## Workflow Integration

### Traditional Single-Task Workflow

```bash
# On main branch
git checkout main
git pull origin main

# Make changes
# ... edit files ...

# Commit
git add .
git commit -m "fix: resolve issue"
git push origin main
```

### Parallel Multi-Task Workflow

```bash
# Start Task A
npm run work:start 501 "fix A"
cd ../www-task-501
npm run dev  # Port 3001

# In new terminal/window: Start Task B
cd /path/to/www
npm run work:start 502 "fix B"
cd ../www-task-502
npm run dev  # Port 3002

# Work on both simultaneously
# Commit in each worktree independently

# When Task A is done
cd /path/to/www-task-501
git push origin task/501-fix-a
npm run work:done 501

# When Task B is done
cd /path/to/www-task-502
git push origin task/502-fix-b
npm run work:done 502

# Merge via GitHub PRs or directly to main
```

## Technical Details

### Directory Structure

```
/Users/you/projects/
├── www/                    # Main repository (port 3000)
├── www-task-123/          # Worktree for task 123 (port 3001)
├── www-task-456/          # Worktree for task 456 (port 3002)
└── www-task-789/          # Worktree for task 789 (port 3003)
```

### Port Assignment

Ports are automatically assigned starting from 3001:
- Main repo: `PORT=3000` (default)
- First worktree: `PORT=3001`
- Second worktree: `PORT=3002`
- And so on...

Script checks existing worktrees to avoid port conflicts.

### Database Isolation

Each worktree gets a fresh database:
- Main repo: `astrid_dev` (preserved)
- Task 123: `astrid_dev_task123` (temporary)
- Task 456: `astrid_dev_task456` (temporary)
- Task 789: `astrid_dev_task789` (temporary)

**Database lifecycle:**
1. Created with schema from main
2. Available for development/testing
3. Dropped on cleanup (`npm run work:done`)

**Important:** Main database is NEVER modified or dropped.

### Environment Configuration

Each worktree has custom `.env.local`:
```env
# Copied from main, then modified:
DATABASE_URL="postgresql://postgres:password@localhost:5432/astrid_dev_task123"
PORT=3001

# Worktree marker
WORKTREE_TASK_ID=123
```

All other env vars (API keys, etc.) are copied from main `.env.local`.

### Branch Naming

Auto-generated from task ID and description:
- Input: `npm run work:start 123 "fix search clear"`
- Branch: `task/123-fix-search-clear`

Description is slugified (lowercase, hyphens, no special chars).

## Best Practices

### 1. Clean Up When Done

Always run cleanup when finished:
```bash
npm run work:done <taskId>
```

**Don't leave orphaned worktrees** - they consume disk space and database resources.

### 2. Commit Frequently

Each worktree is independent, so commit often:
```bash
cd /path/to/www-task-123
git add .
git commit -m "wip: implementing fix"
```

No risk of breaking other worktrees or main branch.

### 3. Use Descriptive Task Descriptions

Good:
```bash
npm run work:start 123 "fix mobile search clear button"
```

Bad:
```bash
npm run work:start 123 "fix"
```

Helps identify branches later.

### 4. Check Status Regularly

```bash
npm run work:list
```

See which worktrees have uncommitted changes.

### 5. Test in Isolation

Each worktree has its own database, so test data doesn't pollute main:
```bash
cd /path/to/www-task-123
npm run dev
# Test thoroughly in isolated environment
```

### 6. Merge or Rebase Before Cleanup

Decide merge strategy before cleanup:

**Option A: Merge to Main**
```bash
cd /path/to/www-task-123
git checkout main
git merge task/123-fix-search
git push origin main
cd /path/to/www
npm run work:done 123
```

**Option B: Create PR**
```bash
cd /path/to/www-task-123
git push origin task/123-fix-search
# Create PR on GitHub
# After PR merged:
cd /path/to/www
npm run work:done 123
```

## Troubleshooting

### Port Already in Use

```bash
# Check what's using the port
lsof -i :3001

# Kill process if needed
kill -9 <PID>

# Or change port in .env.local
```

### Database Connection Issues

```bash
# Check if database exists
psql -U postgres -l | grep astrid_dev_task123

# Recreate if needed
cd /path/to/www-task-123
npm run db:push
```

### Worktree Won't Remove

```bash
# Force remove
git worktree remove ../www-task-123 --force

# Clean up git metadata
git worktree prune

# Manually delete directory if needed
rm -rf ../www-task-123
```

### Uncommitted Changes Warning

When cleaning up, you'll be warned:
```
⚠️  Uncommitted changes detected:
M lib/some-file.ts

Continue with cleanup? Changes will be lost! (yes/no):
```

**Options:**
- `no` - Cancel cleanup, commit your changes first
- `yes` - Proceed and lose changes (use with caution)

### Branch Conflicts

If branch already exists:
```bash
# Delete old branch first
git branch -D task/123-fix-search

# Or use different task ID
npm run work:start 123b "fix search"
```

### Database Already Exists

If database wasn't cleaned up:
```bash
# Drop manually
psql -U postgres -c "DROP DATABASE astrid_dev_task123;"

# Then retry
npm run work:start 123 "fix search"
```

## Advanced Usage

### Sharing Work Between Worktrees

Worktrees share git objects, so you can:

```bash
# In worktree A
cd /path/to/www-task-123
git commit -m "implement helper function"

# In worktree B (cherry-pick from A)
cd /path/to/www-task-456
git cherry-pick <commit-hash-from-task-123>
```

### Custom Database Configuration

Edit `.env.local` in worktree to use different database:
```bash
cd /path/to/www-task-123
# Edit .env.local
DATABASE_URL="postgresql://postgres:password@localhost:5432/my_custom_db"
```

### Working on Existing Branch

Want to use worktree with existing branch?

```bash
# Manual worktree creation
git worktree add -b existing-branch ../www-task-999 existing-branch

# Then manually setup port and database
```

### Sharing Code Between Main and Worktree

```bash
# From main, fetch worktree changes
git fetch origin task/123-fix-search

# Cherry-pick or merge specific commits
git cherry-pick <commit>
```

## FAQ

**Q: Can I have multiple worktrees for the same task?**
A: No, task IDs must be unique. Use different IDs (e.g., 123a, 123b).

**Q: Do worktrees share node_modules?**
A: No, each worktree needs its own `npm install`. This ensures dependency isolation.

**Q: Can I use worktrees with Docker?**
A: Yes, but each worktree needs separate ports for Docker services too.

**Q: What happens to my data when I cleanup?**
A: The database is dropped. Main database (`astrid_dev`) is untouched.

**Q: Can I merge worktree changes back to main?**
A: Yes! That's the point. Commit in worktree, then merge/PR to main.

**Q: How many worktrees can I have?**
A: No hard limit, but each uses disk space, RAM, and ports. Practical limit ~5-10.

**Q: Do worktrees work with the "Let's fix stuff" workflow?**
A: Yes! Start worktree, work on task, cleanup. Compatible with all workflows.

## Commands Reference

| Command | Description |
|---------|-------------|
| `npm run work:start <id> [desc]` | Create new worktree for parallel work |
| `npm run work:done <id>` | Clean up worktree and database |
| `npm run work:list` | Show all active worktrees |
| `git worktree list` | Low-level: list all worktrees |
| `git worktree remove <path>` | Low-level: remove worktree |
| `git worktree prune` | Low-level: clean up worktree metadata |

## See Also

- [Git Worktree Documentation](https://git-scm.com/docs/git-worktree)
- [Development Guidelines](./development-guidelines.md)
- [Quick Reference](../context/quick-reference.md)
- [CLAUDE.md](../../CLAUDE.md) - AI assistant workflow integration
