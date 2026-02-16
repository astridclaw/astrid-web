import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SessionMapper } from '../src/session-mapper'

describe('SessionMapper', () => {
  it('getOrCreate creates new session', () => {
    const m = new SessionMapper()
    const key = m.getOrCreate('task-1')
    assert.equal(key, 'astrid:task:task-1')
  })

  it('getOrCreate returns existing for same taskId', () => {
    const m = new SessionMapper()
    const k1 = m.getOrCreate('task-1')
    const k2 = m.getOrCreate('task-1')
    assert.equal(k1, k2)
  })

  it('get returns undefined for unknown taskId', () => {
    const m = new SessionMapper()
    assert.equal(m.get('nope'), undefined)
  })

  it('get returns key after getOrCreate', () => {
    const m = new SessionMapper()
    m.getOrCreate('task-1')
    assert.equal(m.get('task-1'), 'astrid:task:task-1')
  })

  it('getTaskId reverse lookup works', () => {
    const m = new SessionMapper()
    m.getOrCreate('task-1')
    assert.equal(m.getTaskId('astrid:task:task-1'), 'task-1')
  })

  it('getTaskId returns undefined for unknown key', () => {
    const m = new SessionMapper()
    assert.equal(m.getTaskId('unknown'), undefined)
  })

  it('end removes both mappings', () => {
    const m = new SessionMapper()
    m.getOrCreate('task-1')
    m.end('task-1')
    assert.equal(m.get('task-1'), undefined)
    assert.equal(m.getTaskId('astrid:task:task-1'), undefined)
  })

  it('end is safe for non-existent taskId', () => {
    const m = new SessionMapper()
    m.end('nope') // should not throw
  })

  it('activeCount tracks correctly', () => {
    const m = new SessionMapper()
    assert.equal(m.activeCount(), 0)
    m.getOrCreate('t1')
    assert.equal(m.activeCount(), 1)
    m.getOrCreate('t2')
    assert.equal(m.activeCount(), 2)
    m.getOrCreate('t1') // duplicate
    assert.equal(m.activeCount(), 2)
    m.end('t1')
    assert.equal(m.activeCount(), 1)
    m.end('t2')
    assert.equal(m.activeCount(), 0)
  })

  it('handles multiple concurrent sessions', () => {
    const m = new SessionMapper()
    const ids = ['a', 'b', 'c', 'd', 'e']
    for (const id of ids) m.getOrCreate(id)
    assert.equal(m.activeCount(), 5)
    for (const id of ids) {
      assert.equal(m.get(id), `astrid:task:${id}`)
      assert.equal(m.getTaskId(`astrid:task:${id}`), id)
    }
  })
})
