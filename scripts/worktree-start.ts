#!/usr/bin/env tsx
/**
 * Start parallel development work in a new Git worktree
 *
 * Usage: npm run work:start <taskSlug> [optional-description]
 * Example: npm run work:start "fix-search-clear"
 * Example: npm run work:start 123 "fix search clear" (legacy numeric ID)
 *
 * Creates:
 * - New worktree at ../www-task-<slug>
 * - New branch: task/<slug>
 * - SHARED database (same as main repo)
 * - Custom PORT assignment (3001, 3002, etc.)
 * - .env.local copied from main (with updated PORT)
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

interface WorktreeInfo {
  taskSlug: string
  taskId?: string // Optional for legacy numeric IDs or UUIDs
  path: string
  branch: string
  port: number
  databaseUrl: string
}

function findNextAvailablePort(): number {
  const basePort = 3000
  const worktreesDir = join(process.cwd(), '..')

  // Find all worktree directories
  const existingWorktrees = execSync('git worktree list --porcelain', { encoding: 'utf-8' })
    .split('\n\n')
    .filter(w => w.includes('www-task-'))

  // Check ports in use
  const portsInUse = new Set<number>([basePort]) // Main repo uses 3000

  for (const worktree of existingWorktrees) {
    const pathMatch = worktree.match(/worktree (.+)/)
    if (pathMatch) {
      const wtPath = pathMatch[1]
      const envPath = join(wtPath, '.env.local')
      if (existsSync(envPath)) {
        const envContent = readFileSync(envPath, 'utf-8')
        const portMatch = envContent.match(/PORT=(\d+)/)
        if (portMatch) {
          portsInUse.add(parseInt(portMatch[1]))
        }
      }
    }
  }

  // Find next available port
  let port = basePort + 1
  while (portsInUse.has(port)) {
    port++
  }

  return port
}

function createWorktree(taskIdentifier: string, description?: string): WorktreeInfo {
  console.log(`\n🌳 Creating worktree for task: ${taskIdentifier}...`)

  // Determine if taskIdentifier is numeric (legacy) or slug
  const isNumeric = /^\d+$/.test(taskIdentifier)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(taskIdentifier)

  let taskSlug: string
  let taskId: string | undefined

  if (isNumeric) {
    // Legacy numeric ID
    taskId = taskIdentifier
    taskSlug = description
      ? description.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      : taskIdentifier
  } else if (isUUID) {
    // UUID-based task ID (Astrid format)
    taskId = taskIdentifier
    taskSlug = description
      ? description.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      : taskIdentifier.slice(0, 8) // Use first 8 chars of UUID
  } else {
    // Slug provided directly
    taskSlug = taskIdentifier.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    taskId = description // Description can be used as task ID if needed
  }

  const branch = `task/${taskSlug}`

  // Worktree path (sibling directory)
  const worktreePath = join(process.cwd(), '..', `www-task-${taskSlug}`)

  // Check if worktree already exists
  if (existsSync(worktreePath)) {
    console.error(`❌ Worktree already exists at: ${worktreePath}`)
    console.error('   Use: npm run work:cleanup <taskId> to remove it first')
    process.exit(1)
  }

  // Create worktree and branch
  console.log(`📝 Creating branch: ${branch}`)
  try {
    execSync(`git worktree add -b ${branch} "${worktreePath}" main`, {
      stdio: 'inherit'
    })
  } catch (error) {
    console.error(`❌ Failed to create worktree`)
    process.exit(1)
  }

  // Find next available port
  const port = findNextAvailablePort()
  console.log(`🔌 Assigned port: ${port}`)

  // Copy main .env.local to worktree (SHARED database, just different PORT)
  const mainEnvPath = join(process.cwd(), '.env.local')
  const wtEnvPath = join(worktreePath, '.env.local')

  // Get the main DATABASE_URL to reuse
  let sharedDatabaseUrl = 'postgresql://postgres:password@localhost:5432/astrid_dev' // fallback

  if (existsSync(mainEnvPath)) {
    const mainEnvContent = readFileSync(mainEnvPath, 'utf-8')
    const dbMatch = mainEnvContent.match(/DATABASE_URL=(.+)/)
    if (dbMatch) {
      sharedDatabaseUrl = dbMatch[1].replace(/["']/g, '').trim()
    }
    console.log(`📦 Using shared database: ${sharedDatabaseUrl.split('/').pop()}`)

    let envContent = mainEnvContent

    // Add or update PORT (ONLY change)
    if (envContent.includes('PORT=')) {
      envContent = envContent.replace(/PORT=\d+/, `PORT=${port}`)
    } else {
      envContent += `\nPORT=${port}\n`
    }

    // Add worktree marker at the end
    envContent += `\n# Worktree for task: ${taskSlug}\n`
    if (taskId) {
      envContent += `WORKTREE_TASK_ID=${taskId}\n`
    }
    envContent += `WORKTREE_TASK_SLUG=${taskSlug}\n`

    writeFileSync(wtEnvPath, envContent)
    console.log(`✅ Copied .env.local with custom port ${port}`)
    console.log(`   ℹ️  Database is SHARED across all worktrees`)
  } else {
    console.error(`⚠️  No .env.local found in main repo, worktree may not work correctly`)
  }

  // Copy .claude/settings.local.json to worktree
  const mainClaudeDir = join(process.cwd(), '.claude')
  const mainSettingsPath = join(mainClaudeDir, 'settings.local.json')
  const wtClaudeDir = join(worktreePath, '.claude')
  const wtSettingsPath = join(wtClaudeDir, 'settings.local.json')

  if (existsSync(mainSettingsPath)) {
    // Ensure .claude directory exists in worktree
    if (!existsSync(wtClaudeDir)) {
      mkdirSync(wtClaudeDir, { recursive: true })
    }

    const settingsContent = readFileSync(mainSettingsPath, 'utf-8')
    writeFileSync(wtSettingsPath, settingsContent)
    console.log(`✅ Copied .claude/settings.local.json to worktree`)
  } else {
    console.warn(`⚠️  No .claude/settings.local.json found in main repo`)
    console.warn(`   Worktree will not have Claude Code permissions configured`)
  }

  // Configure git to ignore CLAUDE.md changes in worktree
  // This prevents worktrees from committing changes to the shared CLAUDE.md file
  // Worktrees store their info in .git/worktrees/<name>/info/exclude
  const worktreeName = `www-task-${taskSlug}`
  const mainGitDir = join(process.cwd(), '.git')
  const gitInfoPath = join(mainGitDir, 'worktrees', worktreeName, 'info')
  const gitExcludePath = join(gitInfoPath, 'exclude')

  try {
    // Ensure .git/worktrees/<name>/info directory exists
    if (!existsSync(gitInfoPath)) {
      mkdirSync(gitInfoPath, { recursive: true })
    }

    // Read existing exclude file or create new content
    let excludeContent = existsSync(gitExcludePath)
      ? readFileSync(gitExcludePath, 'utf-8')
      : '# git ls-files --others --exclude-from=.git/info/exclude\n# Lines that start with \'#\' are comments.\n'

    // Add CLAUDE.md to exclude if not already present
    if (!excludeContent.includes('CLAUDE.md')) {
      excludeContent += '\n# Worktree: Ignore CLAUDE.md changes (managed in main repo only)\nCLAUDE.md\n'
      writeFileSync(gitExcludePath, excludeContent)
      console.log(`✅ Configured git to ignore CLAUDE.md changes in worktree`)
    }
  } catch (error) {
    console.warn(`⚠️  Could not configure git exclude for CLAUDE.md:`, error)
  }

  // Create worktree info file
  const infoPath = join(worktreePath, '.worktree-info.json')
  const info: WorktreeInfo = {
    taskSlug,
    taskId,
    path: worktreePath,
    branch,
    port,
    databaseUrl: sharedDatabaseUrl // Store the shared database URL
  }
  writeFileSync(infoPath, JSON.stringify(info, null, 2))

  // Create human-readable context file for Claude
  const contextPath = join(worktreePath, '.worktree-context.md')
  const taskDisplay = taskId ? `${taskSlug} (ID: ${taskId})` : taskSlug
  const contextContent = `# Worktree Context

This is an isolated worktree for **Task: ${taskDisplay}**.

## Task Information
- **Task Slug:** ${taskSlug}
${taskId ? `- **Task ID:** ${taskId}` : ''}
- **Branch:** ${branch}
- **Port:** ${port}
- **Database:** SHARED with main repo

## What This Means
- ✅ Task has already been selected (${taskSlug})
- ✅ Worktree environment is set up
- ✅ You should continue with implementation
- ❌ Do NOT run "Let's fix stuff" workflow again
- ❌ Do NOT create another worktree

## Next Steps
1. Validate AI permissions: \`npm run validate:settings:fix\`
2. Review the task requirements
3. Implement the fix/feature
4. Write tests
5. Run quality checks: \`npm run predeploy:quick\`
6. When done: \`npm run work:done ${taskSlug}\`

## Commands
- Validate permissions: \`npm run validate:settings:fix\`
- Start dev server: \`npm run dev\` (runs on port ${port})
- Run tests: \`npm test\`
- View all worktrees: \`npm run work:list\`
- Clean up: \`npm run work:done ${taskSlug}\`
`
  writeFileSync(contextPath, contextContent)

  // Install dependencies in worktree
  console.log(`\n📦 Installing dependencies in worktree...`)
  console.log(`   This may take a minute...`)
  try {
    execSync('npm install', {
      cwd: worktreePath,
      stdio: 'inherit'
    })
    console.log(`✅ Dependencies installed`)
  } catch (error) {
    console.error(`❌ Failed to install dependencies`)
    console.error(`   Run manually: cd ${worktreePath} && npm install`)
  }

  // Auto-open in editor (optional - can fail gracefully)
  console.log(`\n🚀 Opening worktree in new editor window...`)
  try {
    execSync(`code "${worktreePath}"`, {
      stdio: 'pipe' // Suppress output
    })
    console.log(`✅ Opened in new Cursor window`)
  } catch (error) {
    console.warn(`⚠️  Could not auto-open editor`)
    console.warn(`   Open manually: code "${worktreePath}"`)
  }

  return info
}

function printInstructions(info: WorktreeInfo) {
  const taskDisplay = info.taskId ? `${info.taskSlug} (ID: ${info.taskId})` : info.taskSlug
  console.log(`\n✨ Worktree ready for task: ${taskDisplay}!`)
  console.log(`\n📂 Location: ${info.path}`)
  console.log(`🌿 Branch: ${info.branch}`)
  console.log(`🔌 Port: ${info.port}`)
  console.log(`🗄️  Database: ${info.databaseUrl.split('/').pop()} (SHARED)`)
  console.log(`\n✅ Dependencies installed`)
  console.log(`✅ Editor window opened`)
  console.log(`\n📝 Next steps in the new editor window:`)
  console.log(`   1. Run: npm run dev`)
  console.log(`   2. Access at: http://localhost:${info.port}`)
  console.log(`   3. When done: npm run work:done ${info.taskSlug}\n`)
}

// Main execution
const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage: npm run work:start <task-slug-or-id> [optional-description]')
  console.error('Example: npm run work:start "fix-search-clear"')
  console.error('Example: npm run work:start "add-sounds-to-actions"')
  console.error('Example: npm run work:start ee562552-8516-44d4-a5a9-215ecb734faa "add sounds"')
  console.error('Example: npm run work:start 123 "fix search clear" (legacy numeric)')
  process.exit(1)
}

const [taskIdentifier, ...descriptionParts] = args
const description = descriptionParts.join(' ')

if (!taskIdentifier || taskIdentifier.trim() === '') {
  console.error('❌ Task identifier (slug, UUID, or numeric ID) is required')
  process.exit(1)
}

const info = createWorktree(taskIdentifier, description)
printInstructions(info)
