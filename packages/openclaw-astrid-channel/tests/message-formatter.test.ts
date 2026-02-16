import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { taskToMessage, commentToMessage, responseToComment } from '../src/message-formatter'
import type { AgentTask, AgentComment, OutboundMessage } from '../src/types'

const makeTask = (overrides: Partial<AgentTask> = {}): AgentTask => ({
  id: 'task-1',
  title: 'Test task',
  description: 'Do something',
  priority: 2,
  completed: false,
  dueDateTime: '2026-03-01T00:00:00.000Z',
  isAllDay: true,
  listId: 'list-1',
  listName: 'My List',
  listDescription: 'Instructions for the agent',
  assignerName: 'Jon',
  assignerId: 'user-1',
  comments: [],
  createdAt: '2026-02-16T00:00:00.000Z',
  updatedAt: '2026-02-16T00:00:00.000Z',
  ...overrides,
})

describe('taskToMessage', () => {
  it('includes title and description', () => {
    const msg = taskToMessage(makeTask())
    assert.ok(msg.content.includes('# Task: Test task'))
    assert.ok(msg.content.includes('Do something'))
  })

  it('includes list description as instructions', () => {
    const msg = taskToMessage(makeTask())
    assert.ok(msg.content.includes('Instructions for the agent'))
  })

  it('includes priority', () => {
    const msg = taskToMessage(makeTask({ priority: 3 }))
    assert.ok(msg.content.includes('⬆️ High'))
  })

  it('skips priority 0', () => {
    const msg = taskToMessage(makeTask({ priority: 0 }))
    assert.ok(!msg.content.includes('Priority'))
  })

  it('includes due date', () => {
    const msg = taskToMessage(makeTask())
    assert.ok(msg.content.includes('Due:'))
  })

  it('includes previous comments', () => {
    const msg = taskToMessage(makeTask({
      comments: [{ id: 'c1', content: 'Hello', authorName: 'Jon', authorId: 'u1', isAgent: false, createdAt: '2026-02-16T00:00:00Z' }],
    }))
    assert.ok(msg.content.includes('**Jon:** Hello'))
  })

  it('sets correct session key', () => {
    const msg = taskToMessage(makeTask({ id: 'abc123' }))
    assert.equal(msg.sessionKey, 'astrid:task:abc123')
  })

  it('handles empty description', () => {
    const msg = taskToMessage(makeTask({ description: '' }))
    assert.ok(msg.content.includes('# Task: Test task'))
  })

  it('handles null list description', () => {
    const msg = taskToMessage(makeTask({ listDescription: null }))
    assert.ok(!msg.content.includes('Instructions'))
  })
})

describe('commentToMessage', () => {
  it('formats comment with author', () => {
    const comment: AgentComment = { id: 'c1', content: 'Please update', authorName: 'Jon', authorId: 'u1', isAgent: false, createdAt: '2026-02-16T00:00:00Z' }
    const msg = commentToMessage('task-1', comment)
    assert.ok(msg.content.includes('**Jon:** Please update'))
    assert.equal(msg.sessionKey, 'astrid:task:task-1')
  })

  it('handles null author name', () => {
    const comment: AgentComment = { id: 'c1', content: 'Hi', authorName: null, authorId: 'u1', isAgent: false, createdAt: '2026-02-16T00:00:00Z' }
    const msg = commentToMessage('task-1', comment)
    assert.ok(msg.content.includes('**Someone:** Hi'))
  })
})

describe('responseToComment', () => {
  it('strips agent prefix', () => {
    const msg: OutboundMessage = { content: 'Assistant: Here is the result', sessionKey: 'astrid:task:1' }
    assert.equal(responseToComment(msg), 'Here is the result')
  })

  it('preserves normal content', () => {
    const msg: OutboundMessage = { content: 'Done! The task is complete.', sessionKey: 'astrid:task:1' }
    assert.equal(responseToComment(msg), 'Done! The task is complete.')
  })

  it('trims whitespace', () => {
    const msg: OutboundMessage = { content: '  Result  \n', sessionKey: 'astrid:task:1' }
    assert.equal(responseToComment(msg), 'Result')
  })
})
