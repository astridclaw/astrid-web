/**
 * Vercel Deployment Helper for Astrid SDK
 *
 * Handles preview deployments and alias creation.
 * Supports both Vercel CLI and API-based deployments.
 */

import { execSync } from 'child_process'
import {
  getAgentWorkflowConfig,
  generatePreviewSubdomain,
  type AgentWorkflowConfig,
} from '../config/agent-workflow.js'

export interface VercelDeployResult {
  success: boolean
  vercelUrl?: string
  previewUrl?: string
  aliasUrl?: string
  error?: string
}

/**
 * Deploy to Vercel and optionally create an alias
 *
 * @param branchName - Git branch name for the deployment
 * @param projectPath - Path to the project (defaults to cwd)
 * @param config - Optional workflow config (reads from env if not provided)
 */
export async function deployToVercel(
  branchName: string,
  projectPath?: string,
  config?: AgentWorkflowConfig
): Promise<VercelDeployResult> {
  const cfg = config || getAgentWorkflowConfig()
  const deployDir = projectPath || process.cwd()

  if (!cfg.vercelDeploy) {
    console.log('⏭️ Vercel deployment disabled (ASTRID_AGENT_VERCEL_DEPLOY=false)')
    return { success: true }
  }

  if (!cfg.vercelToken) {
    return {
      success: false,
      error: 'VERCEL_TOKEN is required for preview deployments',
    }
  }

  console.log(`🚀 Deploying to Vercel from branch: ${branchName}`)
  console.log(`   Deploy directory: ${deployDir}`)

  try {
    // Use API or CLI based on configuration
    if (cfg.vercelUseApi) {
      return await deployWithApi(branchName, deployDir, cfg)
    } else {
      return await deployWithCli(branchName, deployDir, cfg)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`❌ Vercel deployment failed: ${errorMessage}`)
    return { success: false, error: errorMessage }
  }
}

/**
 * Deploy using Vercel CLI
 */
async function deployWithCli(
  branchName: string,
  deployDir: string,
  cfg: AgentWorkflowConfig
): Promise<VercelDeployResult> {
  const token = cfg.vercelToken!

  // Link to project if specified
  if (cfg.vercelProjectName) {
    console.log(`   Linking to project: ${cfg.vercelProjectName}`)
    try {
      execSync(
        `vercel link --project ${cfg.vercelProjectName} --yes --token=${token}`,
        {
          encoding: 'utf-8',
          timeout: 60000,
          cwd: deployDir,
          stdio: 'pipe',
        }
      )
    } catch (linkError) {
      console.log(`   ⚠️ Link warning (continuing): ${(linkError as Error).message}`)
    }
  }

  // Deploy
  console.log(`   Running: vercel deploy --yes --force`)
  const deployOutput = execSync(
    `vercel deploy --yes --force --token=${token}`,
    {
      encoding: 'utf-8',
      timeout: 300000, // 5 minutes
      cwd: deployDir,
      stdio: 'pipe',
    }
  )

  // Extract deployment URL
  const lines = deployOutput.trim().split('\n')
  const vercelUrl = lines.find(line => line.includes('.vercel.app'))?.trim()

  if (!vercelUrl) {
    return { success: false, error: 'Could not extract deployment URL from Vercel output' }
  }

  console.log(`✅ Deployed: ${vercelUrl}`)

  // Create alias if custom domain is configured
  if (cfg.previewDomain) {
    const subdomain = generatePreviewSubdomain(branchName, cfg)
    const aliasHostname = `${subdomain}.${cfg.previewDomain}`
    const aliasResult = await createAlias(vercelUrl, aliasHostname, token)

    return {
      success: true,
      vercelUrl,
      previewUrl: aliasResult.success ? aliasResult.aliasUrl : vercelUrl,
      aliasUrl: aliasResult.aliasUrl,
    }
  }

  return {
    success: true,
    vercelUrl,
    previewUrl: vercelUrl,
  }
}

/**
 * Deploy using Vercel API
 */
async function deployWithApi(
  branchName: string,
  deployDir: string,
  cfg: AgentWorkflowConfig
): Promise<VercelDeployResult> {
  const token = cfg.vercelToken!
  const baseUrl = 'https://api.vercel.com'

  // Get repository info from git
  let repoFullName = cfg.githubRepo
  if (!repoFullName) {
    try {
      const remoteUrl = execSync('git remote get-url origin', {
        cwd: deployDir,
        encoding: 'utf-8',
      }).trim()

      // Parse owner/repo from remote URL
      const match = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/)
      if (match) {
        repoFullName = `${match[1]}/${match[2]}`
      }
    } catch {
      // Ignore
    }
  }

  if (!repoFullName) {
    return { success: false, error: 'Could not determine GitHub repository' }
  }

  console.log(`   Repository: ${repoFullName}`)

  // Find project ID
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  if (cfg.vercelTeamId) {
    headers['X-Vercel-Team-Id'] = cfg.vercelTeamId
  }

  // Get project
  const projectsRes = await fetch(`${baseUrl}/v9/projects`, { headers })
  if (!projectsRes.ok) {
    return { success: false, error: `Failed to fetch Vercel projects: ${projectsRes.statusText}` }
  }

  const projectsData = (await projectsRes.json()) as { projects: Array<{ id: string; link?: { repo?: string } }> }
  const project = projectsData.projects?.find(
    (p) => p.link?.repo === repoFullName
  )

  if (!project) {
    return { success: false, error: `No Vercel project found for repository: ${repoFullName}` }
  }

  // Create deployment
  const deployPayload = {
    name: `${repoFullName.split('/')[1]}-${branchName}`,
    gitSource: {
      type: 'github',
      repo: repoFullName,
      ref: branchName,
    },
    target: 'preview',
    meta: {
      branchName,
      purpose: 'astrid-agent-preview',
    },
  }

  const deployRes = await fetch(`${baseUrl}/v13/deployments`, {
    method: 'POST',
    headers,
    body: JSON.stringify(deployPayload),
  })

  if (!deployRes.ok) {
    const errorText = await deployRes.text()
    return { success: false, error: `Vercel API error: ${errorText}` }
  }

  const deployment = (await deployRes.json()) as { id: string; url: string }
  const vercelUrl = `https://${deployment.url}`

  console.log(`✅ Deployment created: ${vercelUrl}`)

  // Wait for deployment to be ready (poll for status)
  const readyUrl = await waitForDeployment(deployment.id, headers, baseUrl)

  // Create alias if custom domain is configured
  if (cfg.previewDomain && readyUrl) {
    const subdomain = generatePreviewSubdomain(branchName, cfg)
    const aliasHostname = `${subdomain}.${cfg.previewDomain}`
    const aliasResult = await createAliasViaApi(deployment.id, aliasHostname, headers, baseUrl)

    return {
      success: true,
      vercelUrl: readyUrl,
      previewUrl: aliasResult.success ? aliasResult.aliasUrl : readyUrl,
      aliasUrl: aliasResult.aliasUrl,
    }
  }

  return {
    success: true,
    vercelUrl: readyUrl || vercelUrl,
    previewUrl: readyUrl || vercelUrl,
  }
}

/**
 * Wait for deployment to be ready
 */
async function waitForDeployment(
  deploymentId: string,
  headers: Record<string, string>,
  baseUrl: string,
  timeoutMs = 300000
): Promise<string | null> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    const res = await fetch(`${baseUrl}/v13/deployments/${deploymentId}`, { headers })
    if (!res.ok) return null

    const deployment = (await res.json()) as { readyState: string; url: string }

    if (deployment.readyState === 'READY') {
      return `https://${deployment.url}`
    }

    if (deployment.readyState === 'ERROR' || deployment.readyState === 'CANCELED') {
      console.error(`Deployment failed with state: ${deployment.readyState}`)
      return null
    }

    // Wait 10 seconds before checking again
    await new Promise((resolve) => setTimeout(resolve, 10000))
  }

  console.error('Deployment timed out')
  return null
}

/**
 * Create alias using Vercel CLI
 */
async function createAlias(
  deploymentUrl: string,
  aliasHostname: string,
  token: string
): Promise<{ success: boolean; aliasUrl?: string; error?: string }> {
  console.log(`🔗 Creating alias: ${aliasHostname}`)

  try {
    execSync(
      `vercel alias ${deploymentUrl} ${aliasHostname} --token=${token}`,
      {
        encoding: 'utf-8',
        timeout: 30000,
        stdio: 'pipe',
      }
    )

    const aliasUrl = `https://${aliasHostname}`
    console.log(`✅ Alias created: ${aliasUrl}`)
    return { success: true, aliasUrl }
  } catch (error) {
    console.log(`⚠️ Alias creation failed: ${(error as Error).message}`)
    return { success: false, error: (error as Error).message }
  }
}

/**
 * Create alias using Vercel API
 */
async function createAliasViaApi(
  deploymentId: string,
  aliasHostname: string,
  headers: Record<string, string>,
  baseUrl: string
): Promise<{ success: boolean; aliasUrl?: string; error?: string }> {
  console.log(`🔗 Creating alias via API: ${aliasHostname}`)

  try {
    const res = await fetch(`${baseUrl}/v2/deployments/${deploymentId}/aliases`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ alias: aliasHostname }),
    })

    if (!res.ok) {
      const errorText = await res.text()
      return { success: false, error: `Alias API error: ${errorText}` }
    }

    const aliasUrl = `https://${aliasHostname}`
    console.log(`✅ Alias created: ${aliasUrl}`)
    return { success: true, aliasUrl }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

/**
 * Check if Vercel deployment is enabled and configured
 */
export function isVercelConfigured(config?: AgentWorkflowConfig): boolean {
  const cfg = config || getAgentWorkflowConfig()
  return cfg.vercelDeploy && !!cfg.vercelToken
}
