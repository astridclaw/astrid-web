#!/usr/bin/env npx tsx
/**
 * Generate OpenClaw Signing Keys
 *
 * This script generates an Ed25519 keypair for signing OpenClaw connection requests.
 * Run once, then add the private key to your environment variables.
 *
 * Usage:
 *   npx tsx scripts/generate-openclaw-keys.ts
 *
 * Output:
 *   - Prints the private key (add to OPENCLAW_SIGNING_PRIVATE_KEY env var)
 *   - Prints the public key (for reference, derived from private key at runtime)
 */

import { generateSigningKeyPair } from '../lib/ai/openclaw-signing'

console.log('Generating OpenClaw signing keypair...\n')

const { privateKeyPem, publicKeyPem } = generateSigningKeyPair()

console.log('='.repeat(70))
console.log('PRIVATE KEY (Add to .env.local as OPENCLAW_SIGNING_PRIVATE_KEY)')
console.log('='.repeat(70))
console.log()

// Format for .env file (escape newlines)
const envValue = privateKeyPem.replace(/\n/g, '\\n')
console.log(`OPENCLAW_SIGNING_PRIVATE_KEY="${envValue}"`)

console.log()
console.log('='.repeat(70))
console.log('PUBLIC KEY (For reference - will be served at /.well-known/openclaw-public-key)')
console.log('='.repeat(70))
console.log()
console.log(publicKeyPem)

console.log()
console.log('='.repeat(70))
console.log('INSTRUCTIONS')
console.log('='.repeat(70))
console.log(`
1. Copy the OPENCLAW_SIGNING_PRIVATE_KEY line above to your .env.local file

2. For production (Vercel), add as environment variable:
   - Variable name: OPENCLAW_SIGNING_PRIVATE_KEY
   - Value: The PEM key (with actual newlines, not escaped)

3. The public key will be automatically served at:
   https://astrid.cc/.well-known/openclaw-public-key

4. OpenClaw gateways will fetch this public key to verify connections.

IMPORTANT: Keep the private key secret! Never commit it to version control.
`)
