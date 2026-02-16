/**
 * Agent Protocol — Shared utilities for agent API endpoints
 *
 * Provides authentication, task enrichment, and types for the
 * generalized agent protocol (/api/v1/agent/*).
 */

import { type NextRequest } from 'next/server'
import { authenticateAPI, type AuthContext, UnauthorizedError, ForbiddenError } from '@/lib/api-auth-middleware'
import { hasRequiredScopes } from '@/lib/oauth/oauth-scopes'
import { prisma } from '@/lib/prisma'

// ── Types ──────────────────────────────────────────────────────────────

export interface AgentTask {
  id: string
  title: string
  description: string
  priority: number
  completed: boolean
  dueDateTime: string | null
  isAllDay: boolean
  listId: string | null
  listName: string | null
  listDescription: string | null
  assignerName: string | null
  assignerId: string | null
  comments: AgentComment[]
  createdAt: string
  updatedAt: string
}

export interface AgentComment {
  id: string
  content: string
  authorName: string | null
  authorId: string
  isAgent: boolean
  createdAt: string
}

export interface AgentEventPayload {
  taskId: string
  task: AgentTask
}

export interface TaskCommentedPayload extends AgentEventPayload {
  comment: AgentComment
}

export interface TaskUpdatedPayload extends AgentEventPayload {
  changes: Record<string, { from: unknown; to: unknown }>
}

export type AgentEventType =
  | 'task.assigned'
  | 'task.commented'
  | 'task.updated'
  | 'task.completed'
  | 'task.deleted'

// ── Authentication ─────────────────────────────────────────────────────

/**
 * Authenticate an agent request via OAuth Bearer token.
 * Returns the auth context — the authenticated user must be an AI agent.
 */
export async function authenticateAgentRequest(req: NextRequest): Promise<AuthContext> {
  const auth = await authenticateAPI(req)

  // Require at minimum tasks:read scope
  if (
    !hasRequiredScopes(auth.scopes, ['tasks:read']) &&
    !hasRequiredScopes(auth.scopes, ['*'])
  ) {
    throw new ForbiddenError('Missing required scope: tasks:read')
  }

  return auth
}

// ── Task Enrichment ────────────────────────────────────────────────────

/**
 * Enrich a Prisma task record with list description and formatted fields
 * for agent consumption.
 */
export function enrichTaskForAgent(task: any): AgentTask {
  const list = task.lists?.[0] || null

  return {
    id: task.id,
    title: task.title,
    description: task.description || '',
    priority: task.priority ?? 0,
    completed: task.completed ?? false,
    dueDateTime: task.dueDateTime ? new Date(task.dueDateTime).toISOString() : null,
    isAllDay: task.isAllDay ?? false,
    listId: list?.id || null,
    listName: list?.name || null,
    listDescription: list?.description || null,
    assignerName: task.creator?.name || task.creator?.email || null,
    assignerId: task.creator?.id || null,
    comments: (task.comments || []).map((c: any) => ({
      id: c.id,
      content: c.content,
      authorName: c.author?.name || c.author?.email || null,
      authorId: c.author?.id || c.authorId,
      isAgent: c.author?.isAIAgent ?? false,
      createdAt: new Date(c.createdAt).toISOString(),
    })),
    createdAt: new Date(task.createdAt).toISOString(),
    updatedAt: new Date(task.updatedAt).toISOString(),
  }
}

// ── Prisma Includes ────────────────────────────────────────────────────

/** Standard Prisma include for agent task queries */
export const agentTaskInclude = {
  lists: {
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
    },
  },
  assignee: {
    select: {
      id: true,
      name: true,
      email: true,
      isAIAgent: true,
    },
  },
  creator: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  comments: {
    include: {
      author: {
        select: {
          id: true,
          name: true,
          email: true,
          isAIAgent: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc' as const,
    },
  },
}
