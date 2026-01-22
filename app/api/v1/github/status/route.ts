/**
 * GitHub Connection Status API (v1 - Mobile Compatible)
 * Checks if user has complete GitHub + AI setup
 *
 * Uses authenticateAPI middleware to support both OAuth and session cookies
 */

import { type NextRequest, NextResponse } from 'next/server'
import { authenticateAPI, requireScopes } from '@/lib/api-auth-middleware'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    // Use API authentication (supports both OAuth and session cookies)
    const auth = await authenticateAPI(req)
    requireScopes(auth, ['user:read'])

    const userId = auth.userId

    // Check GitHub integration (get first one for backward compatibility)
    const githubIntegration = await prisma.gitHubIntegration.findFirst({
      where: { userId }
    })

    // Check if user has AI API keys configured
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { mcpSettings: true }
    })

    const mcpSettings = user?.mcpSettings ? (typeof user.mcpSettings === 'string' ? JSON.parse(user.mcpSettings) : user.mcpSettings) : {}
    const apiKeys = mcpSettings.apiKeys || {}
    const configuredProviders = Object.keys(apiKeys).filter(provider =>
      apiKeys[provider]?.encrypted && ['claude', 'openai', 'gemini'].includes(provider)
    )

    // Check if user has MCP tokens
    const mcpTokens = await prisma.mCPToken.findMany({
      where: { userId }
    })

    const isGitHubConnected = !!githubIntegration?.installationId
    const hasAIKeys = configuredProviders.length > 0
    const hasMCPToken = mcpTokens.length > 0
    const repositoryCount = githubIntegration?.repositories ?
      (Array.isArray(githubIntegration.repositories) ? githubIntegration.repositories.length : 0) : 0

    // For coding workflows (GitHub connected), all agents are available via worker's API keys
    // For non-coding workflows (no GitHub), only user's configured API keys work
    const availableProviders = isGitHubConnected
      ? ['claude', 'openai', 'gemini'] // Worker has all provider keys
      : configuredProviders // User's personal API keys

    console.log('🔍 [GitHub Status v1] Checking status for user:', userId)
    console.log('  - GitHub connected:', isGitHubConnected)
    console.log('  - User API keys:', configuredProviders)
    console.log('  - Available providers:', availableProviders)

    return NextResponse.json({
      isGitHubConnected,
      hasAIKeys,
      hasMCPToken,
      repositoryCount,
      mcpTokenCount: mcpTokens.length,
      isFullyConfigured: isGitHubConnected && hasMCPToken,
      githubIntegration: isGitHubConnected ? {
        installationId: githubIntegration.installationId,
        repositoryCount
      } : null,
      aiProviders: availableProviders,
      userApiKeys: configuredProviders // User's own configured keys (for non-coding)
    })

  } catch (error) {
    console.error('[GitHub Status v1] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
