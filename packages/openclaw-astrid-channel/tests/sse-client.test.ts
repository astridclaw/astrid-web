import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// We need to test parseBuffer which is private. We'll extract and test the logic directly.
// Replicate the parseBuffer logic here for unit testing.

interface AgentSSEEvent {
  type: string
  data: any
}

function parseBuffer(buffer: string): { events: AgentSSEEvent[]; remaining: string } {
  const events: AgentSSEEvent[] = []
  const lines = buffer.split('\n')
  let eventType = 'message'
  let dataLines: string[] = []
  let remaining = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (i === lines.length - 1 && !buffer.endsWith('\n')) {
      remaining = line
      break
    }

    if (line === '') {
      if (dataLines.length > 0) {
        try {
          const data = JSON.parse(dataLines.join('\n'))
          events.push({ type: eventType, data })
        } catch { /* skip malformed */ }
      }
      eventType = 'message'
      dataLines = []
      continue
    }

    if (line.startsWith(':')) continue

    const colon = line.indexOf(':')
    if (colon === -1) continue
    const field = line.slice(0, colon)
    const value = line.slice(colon + 1).trimStart()

    if (field === 'event') eventType = value
    else if (field === 'data') dataLines.push(value)
  }

  return { events, remaining }
}

describe('SSE parseBuffer', () => {
  it('parses single complete event', () => {
    const buf = 'event: task.assigned\ndata: {"taskId":"t1"}\n\n'
    const { events, remaining } = parseBuffer(buf)
    assert.equal(events.length, 1)
    assert.equal(events[0].type, 'task.assigned')
    assert.deepEqual(events[0].data, { taskId: 't1' })
    assert.equal(remaining, '')
  })

  it('parses multiple events in one buffer', () => {
    const buf = 'event: task.assigned\ndata: {"taskId":"t1"}\n\nevent: task.completed\ndata: {"taskId":"t2"}\n\n'
    const { events } = parseBuffer(buf)
    assert.equal(events.length, 2)
    assert.equal(events[0].type, 'task.assigned')
    assert.equal(events[1].type, 'task.completed')
  })

  it('handles partial event (no trailing newline)', () => {
    const buf = 'event: task.assigned\ndata: {"taskId":"t'
    const { events, remaining } = parseBuffer(buf)
    assert.equal(events.length, 0)
    assert.equal(remaining, 'data: {"taskId":"t')
  })

  it('skips keepalive comments', () => {
    const buf = ':keepalive\n\nevent: task.assigned\ndata: {"taskId":"t1"}\n\n'
    const { events } = parseBuffer(buf)
    assert.equal(events.length, 1)
    assert.equal(events[0].type, 'task.assigned')
  })

  it('skips arbitrary comments', () => {
    const buf = ': this is a comment\nevent: test\ndata: {"ok":true}\n\n'
    const { events } = parseBuffer(buf)
    assert.equal(events.length, 1)
  })

  it('handles multi-line data fields', () => {
    const buf = 'event: test\ndata: {"a":\ndata: 1}\n\n'
    const { events } = parseBuffer(buf)
    assert.equal(events.length, 1)
    assert.deepEqual(events[0].data, { a: 1 })
  })

  it('skips malformed JSON', () => {
    const buf = 'event: bad\ndata: {not json}\n\nevent: good\ndata: {"ok":true}\n\n'
    const { events } = parseBuffer(buf)
    assert.equal(events.length, 1)
    assert.equal(events[0].type, 'good')
  })

  it('defaults event type to message', () => {
    const buf = 'data: {"hello":"world"}\n\n'
    const { events } = parseBuffer(buf)
    assert.equal(events.length, 1)
    assert.equal(events[0].type, 'message')
  })

  it('ignores lines without colon', () => {
    const buf = 'nocolon\nevent: test\ndata: {"ok":true}\n\n'
    const { events } = parseBuffer(buf)
    assert.equal(events.length, 1)
  })

  it('resets event type after each event', () => {
    const buf = 'event: custom\ndata: {"a":1}\n\ndata: {"b":2}\n\n'
    const { events } = parseBuffer(buf)
    assert.equal(events[0].type, 'custom')
    assert.equal(events[1].type, 'message')
  })
})
