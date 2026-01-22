/**
 * Agent Workflow Configuration
 *
 * All settings are read from environment variables at runtime.
 * This allows users to configure behavior without updating the SDK package.
 *
 * Environment Variables:
 * ----------------------
 * ASTRID_AGENT_CREATE_BRANCH     - Create feature branches (default: true)
 * ASTRID_AGENT_CREATE_PR         - Create pull requests (default: true)
 * ASTRID_AGENT_RUN_TESTS         - Run tests before committing (default: true)
 * ASTRID_AGENT_TEST_COMMAND      - Test command to run (default: "npm run predeploy")
 *
 * ASTRID_AGENT_VERCEL_DEPLOY     - Trigger Vercel preview deployment (default: true)
 * ASTRID_AGENT_VERCEL_USE_API    - Use Vercel API instead of CLI (default: false)
 * ASTRID_AGENT_PREVIEW_DOMAIN    - Domain for preview aliases (default: none, uses Vercel URL)
 * ASTRID_AGENT_PREVIEW_PATTERN   - Subdomain pattern, {branch} is replaced (default: "{branch}")
 *
 * VERCEL_TOKEN                   - Vercel API token (required for deployments)
 * VERCEL_PROJECT_NAME            - Vercel project name (default: auto-detect)
 * VERCEL_TEAM_ID                 - Vercel team ID (optional)
 *
 * GITHUB_TOKEN                   - GitHub token for PR creation (required)
 * GITHUB_REPO                    - Repository in owner/repo format (auto-detected from git)
 */

export interface AgentWorkflowConfig {
  // Git/PR workflow
  createBranch: boolean
  createPR: boolean
  branchPrefix: string

  // Testing
  runTests: boolean
  testCommand: string

  // Vercel deployment
  vercelDeploy: boolean
  vercelUseApi: boolean
  vercelToken: string | null
  vercelProjectName: string | null
  vercelTeamId: string | null

  // Preview URLs
  previewDomain: string | null
  previewSubdomainPattern: string

  // GitHub
  githubToken: string | null
  githubRepo: string | null
}

/**
 * Parse boolean from environment variable
 */
function envBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key]
  if (value === undefined || value === '') return defaultValue
  return value.toLowerCase() === 'true' || value === '1'
}

/**
 * Parse string from environment variable
 */
function envString(key: string, defaultValue: string | null = null): string | null {
  const value = process.env[key]
  if (value === undefined || value === '') return defaultValue
  return value
}

/**
 * Get the current agent workflow configuration from environment variables.
 * Call this at runtime to get the latest config (supports hot-reload of env vars).
 */
export function getAgentWorkflowConfig(): AgentWorkflowConfig {
  return {
    // Git/PR workflow - default to creating branches and PRs
    createBranch: envBool('ASTRID_AGENT_CREATE_BRANCH', true),
    createPR: envBool('ASTRID_AGENT_CREATE_PR', true),
    branchPrefix: envString('ASTRID_AGENT_BRANCH_PREFIX', 'task/') || 'task/',

    // Testing - default to NOT running tests (let CI handle it)
    // Running tests during workflow blocks output and causes timeouts
    runTests: envBool('ASTRID_AGENT_RUN_TESTS', false),
    testCommand: envString('ASTRID_AGENT_TEST_COMMAND', 'npm run test') || 'npm run test',

    // Vercel deployment - default to deploying
    vercelDeploy: envBool('ASTRID_AGENT_VERCEL_DEPLOY', true),
    vercelUseApi: envBool('ASTRID_AGENT_VERCEL_USE_API', false),
    vercelToken: envString('VERCEL_TOKEN') || envString('VERCEL_API_TOKEN'),
    vercelProjectName: envString('VERCEL_PROJECT_NAME'),
    vercelTeamId: envString('VERCEL_TEAM_ID'),

    // Preview URLs - no default domain (uses Vercel URL unless configured)
    previewDomain: envString('ASTRID_AGENT_PREVIEW_DOMAIN'),
    previewSubdomainPattern: envString('ASTRID_AGENT_PREVIEW_PATTERN', '{branch}') || '{branch}',

    // GitHub
    githubToken: envString('GITHUB_TOKEN') || envString('GH_TOKEN'),
    githubRepo: envString('GITHUB_REPO'),
  }
}

/**
 * Generate a branch name for a task
 */
export function generateBranchName(taskId: string, config?: AgentWorkflowConfig): string {
  const cfg = config || getAgentWorkflowConfig()
  const shortId = taskId.slice(0, 8)
  return `${cfg.branchPrefix}${shortId}`
}

/**
 * Generate a preview subdomain from branch name
 */
export function generatePreviewSubdomain(branchName: string, config?: AgentWorkflowConfig): string {
  const cfg = config || getAgentWorkflowConfig()

  // Sanitize branch name for subdomain use
  const sanitized = branchName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 63)

  return cfg.previewSubdomainPattern.replace('{branch}', sanitized)
}

/**
 * Generate full preview URL
 */
export function generatePreviewUrl(
  branchName: string,
  vercelUrl?: string,
  config?: AgentWorkflowConfig
): string {
  const cfg = config || getAgentWorkflowConfig()

  // If no custom domain configured, use Vercel URL
  if (!cfg.previewDomain) {
    return vercelUrl || ''
  }

  const subdomain = generatePreviewSubdomain(branchName, cfg)
  return `https://${subdomain}.${cfg.previewDomain}`
}

/**
 * Build workflow instructions for the agent prompt based on configuration.
 * Returns instructions that should be included in the agent's prompt.
 *
 * Note: Uses plain text (not markdown) for faster Claude CLI processing.
 */
export function buildWorkflowInstructions(
  taskId: string,
  taskTitle: string,
  config?: AgentWorkflowConfig
): string {
  const cfg = config || getAgentWorkflowConfig()
  const branchName = generateBranchName(taskId, cfg)

  // Use commit prefix based on task title
  const commitPrefix = taskTitle.toLowerCase().includes('fix') ? 'fix' : 'feat'
  const shortTitle = taskTitle.slice(0, 50).replace(/"/g, "'")

  const steps: string[] = []
  let stepNum = 1

  // Branch creation
  if (cfg.createBranch) {
    steps.push(`${stepNum}. Create feature branch: git checkout -b ${branchName}`)
    stepNum++
  }

  // Implementation
  steps.push(`${stepNum}. Implement the task - make all necessary code changes`)
  stepNum++

  // Testing (optional)
  if (cfg.runTests) {
    steps.push(`${stepNum}. Run tests: ${cfg.testCommand} - fix any failures`)
    stepNum++
  }

  // Commit
  steps.push(`${stepNum}. Commit: git add . && git commit -m "${commitPrefix}: ${shortTitle}"`)
  stepNum++

  // Push and PR
  if (cfg.createBranch && cfg.createPR) {
    steps.push(`${stepNum}. Push: git push -u origin ${branchName}`)
    stepNum++
    steps.push(`${stepNum}. Create PR: gh pr create --title "..." --body "..."`)
    stepNum++
  } else if (cfg.createBranch) {
    steps.push(`${stepNum}. Push: git push -u origin ${branchName}`)
    stepNum++
  }

  // Build rules - keep simple
  const rules: string[] = []

  if (cfg.createBranch) {
    rules.push('- Do NOT commit to main - use the feature branch')
  }

  if (cfg.createPR) {
    rules.push('- Output the PR URL so it can be extracted')
  }

  rules.push('- Make ONLY the requested changes')

  return `REQUIRED Workflow:

${steps.join('\n')}

Rules:
${rules.join('\n')}

Start now.`
}

/**
 * Validate that required configuration is present for the workflow
 */
export function validateWorkflowConfig(config?: AgentWorkflowConfig): {
  valid: boolean
  errors: string[]
  warnings: string[]
} {
  const cfg = config || getAgentWorkflowConfig()
  const errors: string[] = []
  const warnings: string[] = []

  // Check GitHub token for PR creation
  if (cfg.createPR && !cfg.githubToken) {
    errors.push('GITHUB_TOKEN is required for PR creation (set ASTRID_AGENT_CREATE_PR=false to disable)')
  }

  // Check Vercel token for deployment
  if (cfg.vercelDeploy && !cfg.vercelToken) {
    errors.push('VERCEL_TOKEN is required for preview deployments (set ASTRID_AGENT_VERCEL_DEPLOY=false to disable)')
  }

  // Warn about custom domain without Vercel deploy
  if (cfg.previewDomain && !cfg.vercelDeploy) {
    warnings.push('ASTRID_AGENT_PREVIEW_DOMAIN is set but ASTRID_AGENT_VERCEL_DEPLOY is false')
  }

  // Warn about PR without branch
  if (cfg.createPR && !cfg.createBranch) {
    warnings.push('ASTRID_AGENT_CREATE_PR is true but ASTRID_AGENT_CREATE_BRANCH is false - PRs require branches')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Log current configuration (for debugging)
 */
export function logWorkflowConfig(config?: AgentWorkflowConfig): void {
  const cfg = config || getAgentWorkflowConfig()

  console.log('📋 Agent Workflow Configuration:')
  console.log(`   Create Branch: ${cfg.createBranch} (prefix: ${cfg.branchPrefix})`)
  console.log(`   Create PR: ${cfg.createPR}`)
  console.log(`   Run Tests: ${cfg.runTests} (command: ${cfg.testCommand})`)
  console.log(`   Vercel Deploy: ${cfg.vercelDeploy} (use API: ${cfg.vercelUseApi})`)
  console.log(`   Preview Domain: ${cfg.previewDomain || '(none - uses Vercel URL)'}`)
  console.log(`   GitHub Token: ${cfg.githubToken ? '✓ configured' : '✗ missing'}`)
  console.log(`   Vercel Token: ${cfg.vercelToken ? '✓ configured' : '✗ missing'}`)
}
