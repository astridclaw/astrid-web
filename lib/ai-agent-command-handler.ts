/**
 * AI Agent Command Handler
 *
 * Centralized command handler for all AI agent operations.
 * Implements Command pattern to avoid circular dependencies.
 *
 * Key principles:
 * 1. Commands are one-way operations (no return loops)
 * 2. Events are read-only notifications (no side effects)
 * 3. Clear separation between user actions and AI responses
 */

import { PrismaClient } from '@prisma/client'

export interface AIAgentCommand {
  type: 'ASSIGN_TASK' | 'PROCESS_APPROVAL' | 'HANDLE_CHANGE_REQUEST' | 'POST_STATUS_UPDATE'
  taskId: string
  aiAgentId: string
  initiatedBy: 'USER' | 'SYSTEM' | 'AI_AGENT'
  payload: any
  timestamp: Date
}

export interface AIAgentEvent {
  type: 'TASK_ASSIGNED' | 'PROCESSING_STARTED' | 'COMMENT_POSTED' | 'ERROR_OCCURRED'
  taskId: string
  aiAgentId: string
  data: any
  timestamp: Date
}

class AIAgentCommandHandler {
  private prisma: PrismaClient
  private processing = new Set<string>() // Track active commands
  private eventLog: AIAgentEvent[] = [] // Audit trail

  constructor(prisma: PrismaClient) {
    this.prisma = prisma
  }

  /**
   * Main command processor - handles all AI agent commands
   * Ensures commands are processed exactly once
   */
  async executeCommand(command: AIAgentCommand): Promise<void> {
    const commandKey = `${command.type}:${command.taskId}:${command.aiAgentId}`

    // Prevent duplicate command execution
    if (this.processing.has(commandKey)) {
      console.log(`⏭️ Command ${commandKey} already processing, skipping`)
      return
    }

    this.processing.add(commandKey)

    try {
      console.log(`🎯 Executing AI command: ${command.type} for task ${command.taskId}`)

      switch (command.type) {
        case 'ASSIGN_TASK':
          await this.handleTaskAssignment(command)
          break
        case 'PROCESS_APPROVAL':
          await this.handleApproval(command)
          break
        case 'HANDLE_CHANGE_REQUEST':
          await this.handleChangeRequest(command)
          break
        case 'POST_STATUS_UPDATE':
          await this.handleStatusUpdate(command)
          break
        default:
          throw new Error(`Unknown command type: ${command.type}`)
      }

    } catch (error) {
      console.error(`❌ Command ${commandKey} failed:`, error)

      // Emit error event (read-only, no side effects)
      await this.emitEvent({
        type: 'ERROR_OCCURRED',
        taskId: command.taskId,
        aiAgentId: command.aiAgentId,
        data: { error: error instanceof Error ? error.message : String(error), command },
        timestamp: new Date()
      })

    } finally {
      this.processing.delete(commandKey)
    }
  }

  /**
   * Handle task assignment - pure command, no return loops
   */
  private async handleTaskAssignment(command: AIAgentCommand): Promise<void> {
    // Only process if initiated by USER (not by AI_AGENT or SYSTEM loops)
    if (command.initiatedBy !== 'USER') {
      console.log(`⏭️ Skipping AI-initiated task assignment to prevent loops`)
      return
    }

    // 1. Validate task and AI agent exist
    const task = await this.prisma.task.findUnique({
      where: { id: command.taskId },
      include: { assignee: true }
    })

    if (!task) {
      throw new Error(`Task ${command.taskId} not found`)
    }

    // 2. Emit assignment event (read-only notification)
    await this.emitEvent({
      type: 'TASK_ASSIGNED',
      taskId: command.taskId,
      aiAgentId: command.aiAgentId,
      data: { task, assignedBy: command.payload.assignedBy },
      timestamp: new Date()
    })

    // 3. Skip automatic status update - the webhook controller now handles intelligent responses
    // The AI orchestration service will handle the actual AI processing
    console.log('📋 Task assignment processed - delegating response generation to webhook controller')
  }

  /**
   * Handle approval processing - no workflow triggers
   */
  private async handleApproval(command: AIAgentCommand): Promise<void> {
    // Process approval logic here
    console.log(`✅ Processing approval for task ${command.taskId}`)

    // Emit event for audit trail
    await this.emitEvent({
      type: 'PROCESSING_STARTED',
      taskId: command.taskId,
      aiAgentId: command.aiAgentId,
      data: { approvalComment: command.payload.comment },
      timestamp: new Date()
    })
  }

  /**
   * Handle status updates - pure output, no triggers
   */
  private async handleStatusUpdate(command: AIAgentCommand): Promise<void> {
    const { status, message } = command.payload

    // Create comment directly (no workflow processing)
    const comment = await this.prisma.comment.create({
      data: {
        content: message,
        type: 'MARKDOWN',
        taskId: command.taskId,
        authorId: command.aiAgentId,
        // Mark as system-generated to prevent workflow processing
        // metadata: { systemGenerated: true, source: 'AI_AGENT_COMMAND_HANDLER' }
      },
      include: {
        author: true // Include author details for SSE events
      }
    })

    // Emit event for notifications (separate concern)
    await this.emitEvent({
      type: 'COMMENT_POSTED',
      taskId: command.taskId,
      aiAgentId: command.aiAgentId,
      data: { status, message, comment }, // Include the actual comment object
      timestamp: new Date()
    })
  }

  /**
   * Handle change requests
   */
  private async handleChangeRequest(command: AIAgentCommand): Promise<void> {
    console.log(`🔄 Processing change request for task ${command.taskId}`)
    // Implementation here
  }

  /**
   * Emit event for read-only processing (notifications, SSE, etc.)
   * Events never trigger new commands - they're purely informational
   */
  private async emitEvent(event: AIAgentEvent): Promise<void> {
    this.eventLog.push(event)
    console.log(`📡 Event emitted: ${event.type} for task ${event.taskId}`)

    // Process event through event handler for notifications
    try {
      const { getAIAgentEventHandler } = await import('./ai-agent-event-handler')
      const eventHandler = getAIAgentEventHandler(this.prisma)
      await eventHandler.handleEvent(event)
    } catch (error) {
      console.error(`❌ Failed to process event ${event.type}:`, error)
      // Don't let event handling failures break command execution
    }
  }

  /**
   * Get event history for debugging
   */
  getEventLog(taskId?: string): AIAgentEvent[] {
    if (taskId) {
      return this.eventLog.filter(event => event.taskId === taskId)
    }
    return [...this.eventLog]
  }

  /**
   * Check if command is currently processing
   */
  isProcessing(commandType: string, taskId: string, aiAgentId: string): boolean {
    const commandKey = `${commandType}:${taskId}:${aiAgentId}`
    return this.processing.has(commandKey)
  }
}

// Singleton instance
let commandHandler: AIAgentCommandHandler | null = null

export function getAIAgentCommandHandler(prisma: PrismaClient): AIAgentCommandHandler {
  if (!commandHandler) {
    commandHandler = new AIAgentCommandHandler(prisma)
  }
  return commandHandler
}

// Export types (already exported above)
// export type { AIAgentCommand, AIAgentEvent }