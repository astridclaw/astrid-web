# Claude Code Configuration

This directory contains Claude Code configuration and helper scripts.

## Quick Start

**Before every Claude Code session, run:**
```bash
npm run validate:settings:fix
```

## Files

### `settings.local.json` (Main Configuration)
- **Purpose**: Controls what commands Claude Code can run automatically
- **Format**: Valid JSON (NO comments allowed!)
- **Sections**:
  - `allow`: Commands that run without asking
  - `deny`: Commands that are blocked
  - `ask`: Commands that require user confirmation

### `settings.json.example` (Template)
- Example configuration file
- Copy and customize to create your own settings

### `validate-settings.ts` (Validation Script)
- Validates `settings.local.json` syntax and structure
- Auto-fixes common issues (comments, trailing commas)
- Creates backups before making changes

### `test-permissions.md` (Documentation)
- Complete guide to permissions system
- Testing examples and troubleshooting

## Common Commands

```bash
# Validate settings (check only)
npm run validate:settings

# Validate and auto-fix issues
npm run validate:settings:fix

# View current permissions summary
npm run validate:settings | grep "📊" -A 3
```

## Key Rules

1. **NO COMMENTS**: JSON does not support `//` or `/* */` comments
2. **NO TRAILING COMMAS**: Remove commas before `]` or `}`
3. **VALID JSON**: Use a JSON validator or the validation script
4. **RESTART REQUIRED**: Claude Code needs restart to pick up changes
5. **WILDCARDS**: Use `*` for pattern matching (e.g., `Bash(npm run *)`)

## Common Issues

### Issue: "Asked for permission on every command"
**Cause**: Invalid JSON in `settings.local.json`
**Fix**: Run `npm run validate:settings:fix`

### Issue: "Comments in JSON file"
**Cause**: JSON doesn't support comments
**Fix**: Run `npm run validate:settings:fix` (auto-removes comments)

### Issue: "Pattern not matching"
**Cause**: Pattern too specific or wildcards not working
**Fix**: Use broader patterns with `*` wildcard

## Pattern Matching Examples

```json
{
  "permissions": {
    "allow": [
      "Bash(pwd)",                    // Exact match only
      "Bash(npm run *)",              // Matches: npm run dev, npm run build, etc.
      "Bash(git *)",                  // Matches: all git commands
      "Bash(npx tsx scripts/*)",      // Matches: npx tsx scripts/anything.ts
    ]
  }
}
```

## Validation Script Features

✅ Checks file existence
✅ Validates JSON syntax
✅ Removes comments automatically
✅ Fixes trailing commas
✅ Verifies structure
✅ Creates backups before changes
✅ Shows permissions summary

## Troubleshooting

1. **Run validation first**: `npm run validate:settings:fix`
2. **Check backup**: `.claude/settings.local.json.backup`
3. **Restart Claude Code**: Reload window to pick up changes
4. **Test specific command**: Ask Claude to run it and observe behavior
5. **Check pattern**: Ensure wildcards and escaping are correct

## Best Practices

- ✅ Validate settings at session start
- ✅ Use wildcards for flexibility
- ✅ Keep deny list for dangerous operations
- ✅ Use ask list for destructive operations
- ✅ Regular pattern review and cleanup

## Support

- [test-permissions.md](./test-permissions.md) - Detailed testing guide
- [validate-settings.ts](./validate-settings.ts) - Validation script source
- `/CLAUDE.md` - Full development workflow documentation
