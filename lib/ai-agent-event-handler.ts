/**
 * AI Agent Event Handler
 *
 * Handles read-only events from the AI Agent Command Handler.
 * Responsible for notifications, SSE broadcasting, and audit logging.
 *
 * Key principles:
 * 1. Events are read-only - no database mutations
 * 2. No command generation - only notifications
 * 3. Events never trigger workflows or new AI agent actions
 */

import { PrismaClient } from '@prisma/client'
import { broadcastToUsers } from './sse-utils'
import type { AIAgentEvent } from './ai-agent-command-handler'

interface NotificationPayload {
  type: string
  timestamp: string
  data: any
}

class AIAgentEventHandler {
  private prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this.prisma = prisma
  }

  /**
   * Process AI agent events - read-only operations only
   */
  async handleEvent(event: AIAgentEvent): Promise<void> {
    console.log(`📨 Processing AI agent event: ${event.type} for task ${event.taskId}`)

    try {
      switch (event.type) {
        case 'TASK_ASSIGNED':
          await this.handleTaskAssignedEvent(event)
          break
        case 'PROCESSING_STARTED':
          await this.handleProcessingStartedEvent(event)
          break
        case 'COMMENT_POSTED':
          await this.handleCommentPostedEvent(event)
          break
        case 'ERROR_OCCURRED':
          await this.handleErrorEvent(event)
          break
        default:
          console.log(`ℹ️ Unknown event type: ${event.type}`)
      }
    } catch (error) {
      console.error(`❌ Failed to handle event ${event.type}:`, error)
      // Don't throw - event handling failures shouldn't break the command flow
    }
  }

  /**
   * Handle task assignment events - notifications only
   */
  private async handleTaskAssignedEvent(event: AIAgentEvent): Promise<void> {
    const { task, assignedBy } = event.data

    // Get users to notify (read-only query)
    const usersToNotify = await this.getUsersToNotify(event.taskId)

    if (usersToNotify.length > 0) {
      // Send SSE notifications
      await this.sendSSENotification(usersToNotify, {
        type: 'ai_agent_assigned',
        timestamp: event.timestamp.toISOString(),
        data: {
          taskId: event.taskId,
          taskTitle: task.title,
          aiAgentName: task.assignee?.name || 'AI Agent',
          assignedBy: assignedBy
        }
      })

      // Send push notifications
      await this.sendPushNotifications(usersToNotify, {
        title: '🤖 AI Agent Assigned',
        body: `AI agent assigned to "${task.title}"`
      })
    }
  }

  /**
   * Handle processing started events
   */
  private async handleProcessingStartedEvent(event: AIAgentEvent): Promise<void> {
    const usersToNotify = await this.getUsersToNotify(event.taskId)

    if (usersToNotify.length > 0) {
      await this.sendSSENotification(usersToNotify, {
        type: 'ai_agent_processing_started',
        timestamp: event.timestamp.toISOString(),
        data: {
          taskId: event.taskId,
          aiAgentId: event.aiAgentId,
          message: 'AI agent has started processing this task'
        }
      })
    }
  }

  /**
   * Handle comment posted events - SSE broadcasting only
   */
  private async handleCommentPostedEvent(event: AIAgentEvent): Promise<void> {
    const { status, message, comment } = event.data
    const usersToNotify = await this.getUsersToNotify(event.taskId)

    if (usersToNotify.length > 0) {
      // Get the task with full details for proper SSE event structure
      const task = await this.prisma.task.findUnique({
        where: { id: event.taskId },
        include: {
          lists: { select: { name: true } }
        }
      })

      if (!task) {
        console.error(`Task ${event.taskId} not found for comment event`)
        return
      }

      await this.sendSSENotification(usersToNotify, {
        type: 'comment_created',
        timestamp: event.timestamp.toISOString(),
        data: {
          taskId: event.taskId,
          taskTitle: task.title,
          commentId: comment.id,
          commentContent: comment.content.substring(0, 100), // Preview
          commenterName: comment.author.name || 'AI Agent',
          userId: comment.authorId,
          listNames: task.lists.map(list => list.name),
          comment: {
            id: comment.id,
            content: comment.content,
            type: comment.type,
            author: comment.author,
            authorId: comment.authorId, // Required by TaskDetail component
            createdAt: comment.createdAt,
            parentCommentId: comment.parentCommentId
          }
        }
      })
    }
  }

  /**
   * Handle error events - logging and notifications
   */
  private async handleErrorEvent(event: AIAgentEvent): Promise<void> {
    const { error, command } = event.data

    console.error(`🚨 AI Agent Error Event:`, {
      taskId: event.taskId,
      aiAgentId: event.aiAgentId,
      error,
      command: command.type
    })

    // Optionally notify task participants about AI agent errors
    const usersToNotify = await this.getUsersToNotify(event.taskId)

    if (usersToNotify.length > 0) {
      await this.sendSSENotification(usersToNotify, {
        type: 'ai_agent_error',
        timestamp: event.timestamp.toISOString(),
        data: {
          taskId: event.taskId,
          error: 'AI agent encountered an error processing this task',
          isRetryable: true
        }
      })
    }
  }

  /**
   * Get users who should be notified about task events
   * Read-only operation - no side effects
   */
  private async getUsersToNotify(taskId: string): Promise<string[]> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignee: true,
        creator: true,
        lists: {
          include: {
            owner: true,
            listMembers: {
              include: {
                user: true
              }
            }
          }
        }
      }
    })

    if (!task) {
      return []
    }

    const userIds = new Set<string>()

    // Add task creator (if not AI agent)
    if (task.creatorId && !this.isAIAgent(task.creator)) {
      userIds.add(task.creatorId)
    }

    // Add task assignee (if not AI agent)
    if (task.assigneeId && !this.isAIAgent(task.assignee)) {
      userIds.add(task.assigneeId)
    }

    // Add list participants (excluding AI agents)
    task.lists.forEach(list => {
      // List owner
      if (list.ownerId && !this.isAIAgent(list.owner)) {
        userIds.add(list.ownerId)
      }

      // List members via listMembers relation
      list.listMembers?.forEach(listMember => {
        if (!this.isAIAgent(listMember.user)) {
          userIds.add(listMember.user.id)
        }
      })
    })

    return Array.from(userIds)
  }

  /**
   * Check if a user is an AI agent
   */
  private isAIAgent(user: any): boolean {
    return user?.isAIAgent === true
  }

  /**
   * Send SSE notifications to users
   */
  private async sendSSENotification(userIds: string[], payload: NotificationPayload): Promise<void> {
    try {
      broadcastToUsers(userIds, payload)
      console.log(`📡 SSE notification sent to ${userIds.length} users`)
    } catch (error) {
      console.error(`❌ Failed to send SSE notification:`, error)
    }
  }

  /**
   * Send push notifications to users
   */
  private async sendPushNotifications(userIds: string[], notification: { title: string, body: string }): Promise<void> {
    try {
      // Implementation depends on your push notification service
      console.log(`📱 Push notification would be sent to ${userIds.length} users:`, notification)
    } catch (error) {
      console.error(`❌ Failed to send push notifications:`, error)
    }
  }
}

// Singleton instance
let eventHandler: AIAgentEventHandler | null = null

export function getAIAgentEventHandler(prisma: PrismaClient): AIAgentEventHandler {
  if (!eventHandler) {
    eventHandler = new AIAgentEventHandler(prisma)
  }
  return eventHandler
}

export { AIAgentEventHandler }