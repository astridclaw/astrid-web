/**
 * Prisma implementation of Comment Repository
 */

import { PrismaClient } from '@prisma/client'
import { ICommentRepository, Comment, CreateCommentData } from '../interfaces/comment.repository'
import { hasListAccess } from '@/lib/list-member-utils'

// Helper function to safely check list access with any list-like object
function canAccessList(list: any, userId: string): boolean {
  try {
    return hasListAccess(list as any, userId)
  } catch {
    // Fallback to manual check if type casting fails
    if (list.ownerId === userId) return true
    if (list.admins?.some((admin: any) => admin.id === userId)) return true
    if (list.members?.some((member: any) => member.id === userId)) return true
    if (list.listMembers?.some((member: any) => member.userId === userId)) return true
    return false
  }
}

export class PrismaCommentRepository implements ICommentRepository {
  constructor(private prisma: PrismaClient) {}

  async create(data: CreateCommentData): Promise<Comment> {
    // Create the comment with full data for SSE broadcasting
    const comment = await this.prisma.comment.create({
      data: {
        content: data.content,
        type: data.type,
        taskId: data.taskId,
        authorId: data.authorId
      },
      include: {
        author: true,
        secureFiles: true,
        replies: {
          include: {
            author: true,
            secureFiles: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    })

    // Broadcast real-time updates to relevant users (same logic as comments API)
    try {
      // Get task with all related data for SSE broadcasting
      const task = await this.prisma.task.findUnique({
        where: { id: data.taskId },
        include: {
          assignee: true,
          lists: {
            include: {
              owner: true,
              listMembers: {
                include: {
                  user: true
                }
              },
            },
          },
        },
      })

      if (task) {
        // Get all users who should receive updates
        const userIds = new Set<string>()

        // Add task assignee (but not if assignee is AI agent to prevent notification loops)
        const { isDatabaseUserAIAgent } = await import('@/lib/ai-agent-registry')
        if (task.assigneeId && task.assignee && !isDatabaseUserAIAgent(task.assignee)) {
          userIds.add(task.assigneeId)
        }

        // Add task creator
        if (task.creatorId) {
          userIds.add(task.creatorId)
        }

        // Add all list members from all associated lists
        for (const list of task.lists) {
          // List owner
          userIds.add(list.ownerId)

          // List members
          list.listMembers.forEach(member => userIds.add(member.userId))
        }

        // Debug: Log users before removing commenter
        console.log('🔍 Comment Repository SSE debug - All users who should be notified:', Array.from(userIds))
        console.log('🔍 Comment Repository SSE debug - Comment author:', data.authorId)

        // Remove the user who made the comment (they already see it)
        userIds.delete(data.authorId)

        console.log('🔍 Comment Repository SSE debug - Users after removing author:', Array.from(userIds))

        // Broadcast to all relevant users
        if (userIds.size > 0) {
          const { broadcastToUsers } = await import("@/lib/sse-utils")
          console.log('🔍 Comment Repository SSE debug - Broadcasting comment_created to:', Array.from(userIds))
          broadcastToUsers(Array.from(userIds), {
            type: 'comment_created',
            timestamp: new Date().toISOString(),
            data: {
              taskId: task.id,
              taskTitle: task.title,
              commentId: comment.id,
              commentContent: comment.content.substring(0, 100), // First 100 chars for preview
              commenterName: comment.author?.name || comment.author?.email || "Deleted User" || "Someone",
              userId: data.authorId, // Add userId for client-side filtering
              listNames: task.lists.map(list => list.name),
              comment: {
                id: comment.id,
                content: comment.content,
                type: comment.type,
                author: comment.author,
                createdAt: comment.createdAt,
                parentCommentId: comment.parentCommentId
              }
            }
          })
        }
      }
    } catch (sseError) {
      console.error("Failed to send comment SSE notifications from repository:", sseError)
      // Continue - comment was still created
    }

    return comment as Comment
  }

  async findByTask(taskId: string): Promise<Comment[]> {
    const comments = await this.prisma.comment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' }
    })
    return comments as Comment[]
  }

  async findById(id: string): Promise<Comment | null> {
    const comment = await this.prisma.comment.findUnique({
      where: { id }
    })
    return comment as Comment | null
  }
}