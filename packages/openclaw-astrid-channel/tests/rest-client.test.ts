import { describe, it, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { RestClient } from '../src/rest-client'

function makeOAuth(token = 'test-token') {
  return {
    ensureToken: mock.fn(async () => token),
    refreshToken: mock.fn(async () => 'refreshed-token'),
  }
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('RestClient', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  it('getAssignedTasks calls correct URL', async () => {
    const oauth = makeOAuth()
    const client = new RestClient('https://api.test/v1', oauth as any)
    globalThis.fetch = mock.fn(async () => jsonResponse({ tasks: [{ id: 't1' }] })) as any
    const tasks = await client.getAssignedTasks()
    assert.equal(tasks.length, 1)
    const call = (globalThis.fetch as any).mock.calls[0]
    assert.ok(call.arguments[0].includes('/agent/tasks?completed=false'))
    globalThis.fetch = originalFetch
  })

  it('getAssignedTasks passes completed=true', async () => {
    const oauth = makeOAuth()
    const client = new RestClient('https://api.test/v1', oauth as any)
    globalThis.fetch = mock.fn(async () => jsonResponse({ tasks: [] })) as any
    await client.getAssignedTasks(true)
    const call = (globalThis.fetch as any).mock.calls[0]
    assert.ok(call.arguments[0].includes('completed=true'))
    globalThis.fetch = originalFetch
  })

  it('postComment sends correct body', async () => {
    const oauth = makeOAuth()
    const client = new RestClient('https://api.test/v1', oauth as any)
    globalThis.fetch = mock.fn(async () => jsonResponse({ comment: { id: 'c1', content: 'Hi' } })) as any
    const comment = await client.postComment('task-1', 'Hi')
    assert.equal(comment.content, 'Hi')
    const call = (globalThis.fetch as any).mock.calls[0]
    assert.equal(call.arguments[1].method, 'POST')
    assert.equal(JSON.parse(call.arguments[1].body).content, 'Hi')
    globalThis.fetch = originalFetch
  })

  it('completeTask sends PATCH with completed true', async () => {
    const oauth = makeOAuth()
    const client = new RestClient('https://api.test/v1', oauth as any)
    globalThis.fetch = mock.fn(async () => jsonResponse({ task: { id: 't1', completed: true } })) as any
    const task = await client.completeTask('t1')
    assert.equal(task.completed, true)
    const call = (globalThis.fetch as any).mock.calls[0]
    assert.equal(call.arguments[1].method, 'PATCH')
    assert.equal(JSON.parse(call.arguments[1].body).completed, true)
    globalThis.fetch = originalFetch
  })

  it('retries on 401 with refreshed token', async () => {
    const oauth = makeOAuth()
    const client = new RestClient('https://api.test/v1', oauth as any)
    let callCount = 0
    globalThis.fetch = mock.fn(async () => {
      callCount++
      if (callCount === 1) return new Response('', { status: 401 })
      return jsonResponse({ tasks: [] })
    }) as any
    await client.getAssignedTasks()
    assert.equal(callCount, 2)
    assert.equal(oauth.refreshToken.mock.callCount(), 1)
    globalThis.fetch = originalFetch
  })

  it('throws on non-ok response', async () => {
    const oauth = makeOAuth()
    const client = new RestClient('https://api.test/v1', oauth as any)
    globalThis.fetch = mock.fn(async () => new Response('', { status: 500, statusText: 'Internal Server Error' })) as any
    await assert.rejects(() => client.getAssignedTasks(), /Astrid API error: 500/)
    globalThis.fetch = originalFetch
  })
})
