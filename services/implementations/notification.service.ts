/**
 * Notification Service Implementation
 * Handles SSE and push notifications
 */

import { INotificationService } from '../interfaces/notification.service'
import { broadcastToUsers } from '@/lib/sse-utils'
import { PushNotificationService } from '@/lib/push-notification-service'

export class NotificationService implements INotificationService {
  private pushService: PushNotificationService

  constructor() {
    this.pushService = new PushNotificationService()
  }

  async notifyTaskAssignment(task: any, aiAgent: any): Promise<void> {
    // Get users to notify
    const notifyUserIds = new Set<string>()

    // Add task creator
    if (task.creator?.id) {
      notifyUserIds.add(task.creator.id)
    }

    // Add list members (simplified - in real implementation, fetch list members)
    // For now, just notify the creator

    // Remove AI agent from notifications
    notifyUserIds.delete(aiAgent.id)

    const userIdsArray = Array.from(notifyUserIds)
    if (userIdsArray.length > 0) {
      broadcastToUsers(userIdsArray, {
        type: 'ai_agent_assigned',
        timestamp: new Date().toISOString(),
        data: {
          taskId: task.id,
          taskTitle: task.title,
          aiAgentName: aiAgent.name,
          aiAgentType: aiAgent.type,
          event: 'task.assigned',
          integration: 'direct-ai',
          status: 'acknowledged',
          message: `${aiAgent.name} has started working on "${task.title}"`
        }
      })
    }
  }

  async notifyTaskUpdate(task: any, aiAgent: any): Promise<void> {
    const notifyUserIds = [task.creator?.id].filter(Boolean)

    if (notifyUserIds.length > 0) {
      broadcastToUsers(notifyUserIds, {
        type: 'ai_agent_task_updated',
        timestamp: new Date().toISOString(),
        data: {
          taskId: task.id,
          aiAgentName: aiAgent.name,
          status: 'reviewing_updates'
        }
      })
    }
  }

  async notifyCommentResponse(task: any, aiAgent: any, comment: any): Promise<void> {
    const notifyUserIds = [task.creator?.id, comment.authorId].filter(id => id !== aiAgent.id)

    if (notifyUserIds.length > 0) {
      broadcastToUsers(notifyUserIds, {
        type: 'ai_agent_commented',
        timestamp: new Date().toISOString(),
        data: {
          taskId: task.id,
          taskTitle: task.title,
          aiAgentName: aiAgent.name,
          originalComment: comment.content.substring(0, 50) + (comment.content.length > 50 ? '...' : ''),
          originalAuthor: comment.authorName
        }
      })
    }
  }
}