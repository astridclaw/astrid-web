/**
 * AI Orchestration Service Implementation
 * Handles AI task processing
 */

import { IAIOrchestrationService } from '../interfaces/ai-orchestration.service'
import { AIOrchestrator } from '@/lib/ai-orchestrator'
import { PrismaClient } from '@prisma/client'
import { hasValidApiKey } from '@/lib/api-key-cache'
import { createAIAgentComment } from '@/lib/ai-agent-comment-service'
import { getAgentService, type AIService } from '@/lib/ai/agent-config'

export class AIOrchestrationService implements IAIOrchestrationService {
  // Track tasks that are currently being processed to prevent infinite loops
  private static processingTasks = new Set<string>()

  constructor(private prisma: PrismaClient) {}

  /**
   * Find a user who has the required API key for the specified AI service
   * Checks task list members and fallback to task creator
   */
  private async findUserWithApiKey(taskId: string, aiService: AIService): Promise<string | null> {
    // Get task with full list membership details
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        creator: { select: { id: true } },
        lists: {
          select: {
            id: true,
            ownerId: true,
            aiAgentConfiguredBy: true,
            owner: { select: { id: true } },
            listMembers: {
              include: {
                user: { select: { id: true } }
              }
            }
          }
        }
      }
    })

    if (!task) {
      return null
    }

    // Collect all potential users (task list members, owner, admins, creator)
    const candidateUserIds = new Set<string>()

    // Add task creator (if exists)
    const creatorId = task.creator?.id || task.creatorId
    if (creatorId) {
      candidateUserIds.add(creatorId)
    }

    // Add users from all task lists
    for (const list of task.lists) {
      // Check if aiAgentConfiguredBy is set and valid
      if (list.aiAgentConfiguredBy) {
        // Prioritize the user who configured the AI agent
        if (await hasValidApiKey(list.aiAgentConfiguredBy, aiService)) {
          console.log(`🔑 [AIOrchestrationService] Using AI agent configured by user: ${list.aiAgentConfiguredBy}`)
          return list.aiAgentConfiguredBy
        }
      }

      // Add list owner and members
      candidateUserIds.add(list.ownerId)
      list.listMembers.forEach(listMember => candidateUserIds.add(listMember.user.id))
    }

    // Check each candidate user for valid API key
    for (const userId of candidateUserIds) {
      console.log(`🔍 [AIOrchestrationService] Checking user ${userId} for ${aiService} API key...`)
      const hasKey = await hasValidApiKey(userId, aiService)
      console.log(`🔍 [AIOrchestrationService] User ${userId} has valid ${aiService} key: ${hasKey}`)

      if (hasKey) {
        console.log(`🔑 [AIOrchestrationService] Found user with ${aiService} API key: ${userId}`)
        return userId
      }
    }

    console.error(`❌ [AIOrchestrationService] No user found with ${aiService} API key among task participants`)
    return null
  }

  async startTaskProcessing(taskId: string, aiAgentUserId: string): Promise<void> {
    // Prevent infinite loops - check if task is already being processed
    if (AIOrchestrationService.processingTasks.has(taskId)) {
      console.log(`🔄 [AIOrchestrationService] Task ${taskId} is already being processed, skipping to prevent infinite loop`)
      return
    }

    // Mark task as being processed
    AIOrchestrationService.processingTasks.add(taskId)

    try {
      // Get the task with assigned agent information
      const task = await this.prisma.task.findUnique({
        where: { id: taskId },
        include: {
          assignee: {
            select: {
              id: true,
              email: true,
              isAIAgent: true,
              aiAgentType: true
            }
          }
        }
      })

      if (!task) {
        throw new Error(`Task ${taskId} not found`)
      }

      // Determine AI service from the assigned agent using centralized config
      const aiService: AIService = task.assignee?.isAIAgent && task.assignee.email
        ? getAgentService(task.assignee.email)
        : 'claude'

      console.log(`🤖 [AIOrchestrationService] Routed to ${aiService} service for agent: ${task.assignee?.email}`)

      // Find a user who has the required API key for this AI service
      const userWithApiKey = await this.findUserWithApiKey(taskId, aiService)

      if (!userWithApiKey) {
        const errorMessage = `No user found with ${aiService} API key among task participants. Please ensure at least one task list member has configured their ${aiService} API key in Settings → AI Agents.`

        // Post a helpful comment to the task
        const task = await this.prisma.task.findUnique({
          where: { id: taskId },
          include: { assignee: true }
        })

        if (task?.assignee?.isAIAgent) {
          const result = await createAIAgentComment(
            taskId,
            `❌ **API Key Configuration Required**\n\nI need a ${aiService.toUpperCase()} API key to process this task.\n\n**To fix this:**\n1. Go to Settings → AI Agents\n2. Configure your ${aiService.toUpperCase()} API key\n3. Re-assign this task to me\n\n*This is an automated error message*\n\n<!-- SYSTEM_GENERATED_COMMENT -->`
          )
          if (!result.success) {
            console.error('Failed to post API key error comment:', result.error)
          }
        }

        throw new Error(errorMessage)
      }

      console.log(`🔑 [AIOrchestrationService] Using API keys from user: ${userWithApiKey}`)

      // Create AI Orchestrator for this specific service using the user who has API keys
      const orchestrator = await AIOrchestrator.createForTaskWithService(taskId, userWithApiKey, aiService)

      // Create or find coding workflow record
      let workflow = await this.prisma.codingTaskWorkflow.findFirst({
        where: { taskId }
      })

      if (!workflow) {
        workflow = await this.prisma.codingTaskWorkflow.create({
          data: {
            taskId,
            status: 'PLANNING',
            aiService: aiService,
            metadata: {
              webhookTriggered: true,
              startedAt: new Date().toISOString()
            }
          }
        })
      }

      // Execute the AI workflow (this runs in background)
      await orchestrator.executeCompleteWorkflow(workflow.id, taskId)

    } catch (error) {
      console.error('AI orchestration failed:', error)
      throw error
    } finally {
      // Always remove task from processing set
      AIOrchestrationService.processingTasks.delete(taskId)
      console.log(`✅ [AIOrchestrationService] Task ${taskId} processing completed, removed from tracking`)
    }
  }
}