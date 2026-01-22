/**
 * Setup OAuth Credentials for iOS App
 *
 * Creates an OAuth client for the iOS app and provides configuration instructions.
 * Run with: npm run setup:ios-oauth
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') })

import { prisma } from '../lib/prisma'
import { createOAuthClient } from '../lib/oauth/oauth-client-manager'

async function main() {
  console.log('📱 Setting up OAuth for iOS App\n')

  try {
    // Find or create system user for iOS app
    console.log('1️⃣  Finding iOS app system user...')
    let systemUser = await prisma.user.findFirst({
      where: { email: 'ios-app@system.astrid.cc' }
    })

    if (!systemUser) {
      console.log('   Creating system user for iOS app...')
      systemUser = await prisma.user.create({
        data: {
          email: 'ios-app@system.astrid.cc',
          name: 'iOS App (System)',
          isAIAgent: false,
        }
      })
    }
    console.log(`   ✅ User: ${systemUser.email} (${systemUser.id})\n`)

    // Check if OAuth client already exists
    const existingClient = await prisma.oAuthClient.findFirst({
      where: {
        userId: systemUser.id,
        name: 'Astrid iOS App (Production)'
      }
    })

    if (existingClient) {
      console.log('⚠️  OAuth client already exists!')
      console.log(`   Client ID: ${existingClient.clientId}`)
      console.log('\n⚠️  Note: Client secret cannot be retrieved after creation.')
      console.log('   If you need a new secret, delete the existing client and run this script again.\n')

      const continuePrompt = 'Do you want to create a new client? (y/N): '
      // In automated script, we'll just show info and exit
      console.log('   Exiting without creating new client.')
      console.log('   To regenerate: Delete client in database and re-run this script.\n')
      return
    }

    // Create OAuth client for iOS
    console.log('2️⃣  Creating OAuth client for iOS app...')
    const client = await createOAuthClient({
      userId: systemUser.id,
      name: 'Astrid iOS App (Production)',
      description: 'Official Astrid iOS application',
      grantTypes: ['client_credentials'],
      scopes: [
        'tasks:read', 'tasks:write', 'tasks:delete',
        'lists:read', 'lists:write', 'lists:delete', 'lists:manage_members',
        'comments:read', 'comments:write', 'comments:delete',
        'attachments:read', 'attachments:write', 'attachments:delete',
        'user:read', 'user:write',
        'public:read', 'public:write'
      ]
    })

    console.log('✅ OAuth client created!\n')

    // Display configuration instructions
    console.log('═'.repeat(80))
    console.log('📋 iOS App OAuth Configuration')
    console.log('═'.repeat(80))
    console.log()
    console.log('⚠️  IMPORTANT: Save these credentials securely!')
    console.log('   The client secret will NOT be shown again.\n')

    console.log('Client ID:')
    console.log(`   ${client.clientId}\n`)

    console.log('Client Secret (SAVE THIS NOW):')
    console.log(`   ${client.clientSecret}\n`)

    console.log('═'.repeat(80))
    console.log()

    // Configuration steps
    console.log('📝 Configuration Steps:\n')

    console.log('1. Update OAuthManager.swift')
    console.log('   Replace the clientId in OAuthConfig:')
    console.log(`   static let clientId = "${client.clientId}"\n`)

    console.log('2. Add to iOS Keychain (First Run)')
    console.log('   On first app launch, store the secret:')
    console.log(`   OAuthManager.shared.configure(clientSecret: "${client.clientSecret}")\n`)

    console.log('3. Or use Xcode Build Settings')
    console.log('   Add to Info.plist or use build configuration:')
    console.log(`   OAUTH_CLIENT_ID = ${client.clientId}`)
    console.log(`   OAUTH_CLIENT_SECRET = ${client.clientSecret}\n`)

    console.log('4. Security Best Practices')
    console.log('   - Store client secret in iOS Keychain')
    console.log('   - Never commit secrets to version control')
    console.log('   - Use different clients for dev/staging/production')
    console.log('   - Rotate secrets periodically\n')

    console.log('═'.repeat(80))
    console.log()

    // Save to file for reference
    const configFile = resolve(process.cwd(), 'ios-oauth-credentials.txt')
    const configContent = `
Astrid iOS App OAuth Configuration
Generated: ${new Date().toISOString()}

⚠️  CONFIDENTIAL - Do not commit to version control

Client ID: ${client.clientId}
Client Secret: ${client.clientSecret}

Configuration Steps:
1. Update OAuthManager.swift with clientId
2. Store clientSecret in iOS Keychain on first run
3. Never commit this file to git
4. Delete this file after configuration

API Endpoint: ${process.env.NEXT_PUBLIC_API_URL || 'https://astrid.cc'}/api/v1/oauth/token
Grant Type: client_credentials
Scopes: ${client.scopes.join(', ')}
`

    const fs = require('fs')
    fs.writeFileSync(configFile, configContent.trim())
    console.log(`💾 Credentials saved to: ios-oauth-credentials.txt`)
    console.log('   ⚠️  Remember to DELETE this file after configuration!\n')

    console.log('✅ iOS OAuth setup complete!\n')

  } catch (error) {
    console.error('\n❌ Setup failed:', error)
    process.exit(1)
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
