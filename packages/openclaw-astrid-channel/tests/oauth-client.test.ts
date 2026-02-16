import { describe, it, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { OAuthClient } from '../src/oauth-client'

const CONFIG = {
  enabled: true,
  clientId: 'test-client',
  clientSecret: 'test-secret',
  apiBase: 'https://api.test/v1',
}

function tokenResponse(token = 'access-123', expiresIn = 3600) {
  return new Response(JSON.stringify({ access_token: token, expires_in: expiresIn }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('OAuthClient', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  it('ensureToken fetches new token on first call', async () => {
    const client = new OAuthClient(CONFIG as any)
    globalThis.fetch = mock.fn(async () => tokenResponse('fresh-token')) as any
    const token = await client.ensureToken()
    assert.equal(token, 'fresh-token')
    assert.equal((globalThis.fetch as any).mock.callCount(), 1)
    globalThis.fetch = originalFetch
  })

  it('ensureToken returns cached token when not expired', async () => {
    const client = new OAuthClient(CONFIG as any)
    globalThis.fetch = mock.fn(async () => tokenResponse('cached', 7200)) as any
    await client.ensureToken()
    const token = await client.ensureToken()
    assert.equal(token, 'cached')
    assert.equal((globalThis.fetch as any).mock.callCount(), 1) // only one fetch
    globalThis.fetch = originalFetch
  })

  it('ensureToken refreshes when within 5min of expiry', async () => {
    const client = new OAuthClient(CONFIG as any)
    // First call: token expires in 4 minutes (< 5 min buffer)
    globalThis.fetch = mock.fn(async () => tokenResponse('short-lived', 240)) as any
    await client.ensureToken()
    // Second call should refresh since 240s < 300s buffer
    const token = await client.ensureToken()
    assert.equal((globalThis.fetch as any).mock.callCount(), 2)
    globalThis.fetch = originalFetch
  })

  it('refreshToken sends correct request body', async () => {
    const client = new OAuthClient(CONFIG as any)
    globalThis.fetch = mock.fn(async (url: string, opts: any) => {
      assert.ok(url.includes('/oauth/token'))
      assert.equal(opts.method, 'POST')
      const body = new URLSearchParams(opts.body)
      assert.equal(body.get('grant_type'), 'client_credentials')
      assert.equal(body.get('client_id'), 'test-client')
      assert.equal(body.get('client_secret'), 'test-secret')
      assert.ok(body.get('scope')!.includes('tasks:read'))
      return tokenResponse('t1')
    }) as any
    await client.refreshToken()
    globalThis.fetch = originalFetch
  })

  it('refreshToken throws on non-ok response', async () => {
    const client = new OAuthClient(CONFIG as any)
    globalThis.fetch = mock.fn(async () => new Response('', { status: 400, statusText: 'Bad Request' })) as any
    await assert.rejects(() => client.refreshToken(), /OAuth token request failed: 400/)
    globalThis.fetch = originalFetch
  })

  it('uses custom tokenEndpoint when provided', async () => {
    const client = new OAuthClient({ ...CONFIG, tokenEndpoint: 'https://custom/token' } as any)
    globalThis.fetch = mock.fn(async (url: string) => {
      assert.equal(url, 'https://custom/token')
      return tokenResponse()
    }) as any
    await client.refreshToken()
    globalThis.fetch = originalFetch
  })
})
