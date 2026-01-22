# Claude Code Permissions Testing Guide

## ⚠️ CRITICAL: Validate Settings Before Starting

**ALWAYS run this at the start of every Claude Code session:**
```bash
npm run validate:settings:fix
```

This will:
- ✅ Check if `.claude/settings.local.json` exists
- ✅ Validate JSON syntax (comments are NOT allowed in JSON!)
- ✅ Remove comments automatically if present
- ✅ Verify structure (permissions.allow, permissions.deny, permissions.ask)
- ✅ Create backup before making changes
- ✅ Display permissions summary

**Why is this critical?**
- Standard JSON does NOT support `//` or `/* */` comments
- If your settings file has invalid JSON, Claude Code **silently ignores it**
- You'll be asked for permission on EVERY command (very annoying!)
- The validation script auto-fixes common issues

## Current Configuration

Your `.claude/settings.local.json` is properly configured and working!

## Shell Information
- **Shell Type**: zsh (macOS default)
- **Tool Name**: Claude Code uses "Bash" tool name for all shell commands (bash, zsh, sh, etc.)
- **Permissions File**: `.claude/settings.local.json`

## How Permissions Work

### 1. **Allow List** (Auto-approved)
Commands that match these patterns run immediately without asking:
- `Bash(npm run *)` - All npm scripts
- `Bash(npx *)` - All npx commands
- `Bash(git *)` - All git operations
- `Bash(ls *)`, `Bash(cat *)`, `Bash(grep *)` - File operations
- Full list in lines 3-88 of `.claude/settings.local.json`

### 2. **Ask List** (User Confirmation Required)
Commands that match these patterns require your approval:
- `Bash(npm publish *)` - Publishing packages
- `Bash(git push origin main)` - Pushing to main branch
- `Bash(git push origin master)` - Pushing to master branch
- `Bash(npx prisma migrate reset *)` - Destructive database operations
- Full list in lines 97-104 of `.claude/settings.local.json`

### 3. **Deny List** (Blocked)
Commands that match these patterns are blocked:
- `Bash(rm -rf /)` - System destruction
- `Bash(sudo *)` - Sudo operations
- `Bash(su *)` - User switching
- `Bash(chmod 777 *)` - Overly permissive permissions
- `Bash(dd *)` - Disk operations
- Full list in lines 89-96 of `.claude/settings.local.json`

## Pattern Matching Rules

1. **Exact Match**: `Bash(pwd)` only matches `pwd`
2. **Wildcard**: `Bash(npm run *)` matches `npm run dev`, `npm run build`, etc.
3. **Prefix Match**: `Bash(git *)` matches any git command
4. **Case Sensitive**: Patterns are case-sensitive

## Testing Your Permissions

### Test 1: Allowed Command (Should run without asking)
```bash
npm run predeploy:quick
```
✅ This matches `Bash(npm run *)` in allow list

### Test 2: Ask Command (Should require confirmation)
```bash
git push origin main
```
⚠️ This matches `Bash(git push origin main)` in ask list

### Test 3: Denied Command (Should be blocked)
```bash
sudo rm -rf /tmp/test
```
❌ This matches `Bash(sudo *)` in deny list

## Common Issues & Solutions

### Issue 1: "Command not in allow list"
**Problem**: Claude asks for permission even though command seems allowed
**Solution**: Check exact pattern matching
- `Bash(npm test)` ≠ `Bash(npm run test)`
- Add specific pattern to allow list

### Issue 2: "Too many permission prompts"
**Problem**: Being asked for every command
**Solution**: Add broader patterns to allow list
```json
"allow": [
  "Bash(npm *)",     // Allows all npm commands
  "Bash(npx *)",     // Allows all npx commands
]
```

### Issue 3: "Permissions not working"
**Problem**: Settings seem ignored
**Solution**:
1. Check file location: `.claude/settings.local.json` (not `settings.json`)
2. Validate JSON syntax (no trailing commas, proper quotes)
3. Restart Claude Code
4. Check for typos in tool name (must be `Bash`, not `bash`)

## Debugging Commands

### Check your shell
```bash
echo $SHELL                    # Shows default shell
ps -p $$ -o comm=             # Shows current running shell
```

### View current permissions
```bash
cat .claude/settings.local.json | grep -A 5 '"allow"'
```

### Test a specific pattern
Ask Claude to run a command and observe behavior:
- If it runs immediately → matched allow list
- If it asks for permission → matched ask list or not in any list
- If it refuses → matched deny list

## Customizing Permissions

### Add New Allowed Command
Edit `.claude/settings.local.json`:
```json
"allow": [
  "Bash(your-command *)",
  // ... other patterns
]
```

### Make Command Require Confirmation
Edit `.claude/settings.local.json`:
```json
"ask": [
  "Bash(dangerous-command *)",
  // ... other patterns
]
```

### Block a Command
Edit `.claude/settings.local.json`:
```json
"deny": [
  "Bash(never-run-this *)",
  // ... other patterns
]
```

## Best Practices

1. **Start Restrictive**: Use ask list first, move to allow list when confident
2. **Use Wildcards Carefully**: `Bash(*)` allows everything - be specific
3. **Test Before Production**: Test permission changes in development first
4. **Document Changes**: Add comments explaining why patterns were added
5. **Review Regularly**: Audit permissions periodically

## Example Workflow

For a new script `scripts/my-new-script.ts`:

1. **First Run** (not in permissions):
   ```bash
   npx tsx scripts/my-new-script.ts
   ```
   Claude will ask for permission (not in any list)

2. **Add to Ask List** (test phase):
   ```json
   "ask": [
     "Bash(npx tsx scripts/my-new-script.ts)"
   ]
   ```

3. **Move to Allow List** (after testing):
   ```json
   "allow": [
     "Bash(npx tsx scripts/my-new-script.ts)"
   ]
   ```

4. **Use Wildcard** (if script family is safe):
   ```json
   "allow": [
     "Bash(npx tsx scripts/*)"  // Already in your config!
   ]
   ```

## Your Current Setup is Working! ✅

Your permissions are properly configured. Claude Code:
- ✅ Uses zsh (your default macOS shell)
- ✅ Respects `.claude/settings.local.json` patterns
- ✅ Auto-approves safe development commands
- ✅ Asks for confirmation on destructive operations
- ✅ Blocks dangerous system operations

No changes needed unless you want to add more specific permissions!
