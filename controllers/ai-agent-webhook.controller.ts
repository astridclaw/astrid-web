/**
 * AI Agent Webhook Controller
 *
 * Pure business logic for handling AI agent webhooks
 * Platform-agnostic - can be used in web, mobile, or other platforms
 */

import { TaskAssignmentWebhookPayload } from '@/lib/ai-agent-webhook-service'
import { ITaskRepository } from '@/repositories/interfaces/task.repository'
import { IAIAgentRepository } from '@/repositories/interfaces/ai-agent.repository'
import { IUserRepository } from '@/repositories/interfaces/user.repository'
import { ICommentRepository } from '@/repositories/interfaces/comment.repository'
import { INotificationService } from '@/services/interfaces/notification.service'
import { IAIOrchestrationService } from '@/services/interfaces/ai-orchestration.service'
import { prisma } from '@/lib/prisma'

export interface WebhookValidationResult {
  isValid: boolean
  errors?: string[]
  data?: TaskAssignmentWebhookPayload
}

export interface TaskAssignmentResult {
  success: boolean
  taskId: string
  aiAgentId: string
  message: string
  error?: string
}

export class AIAgentWebhookController {
  constructor(
    private taskRepository: ITaskRepository,
    private aiAgentRepository: IAIAgentRepository,
    private userRepository: IUserRepository,
    private commentRepository: ICommentRepository,
    private notificationService: INotificationService,
    private aiOrchestrationService: IAIOrchestrationService
  ) {}

  /**
   * Handle incoming webhook payload
   */
  async handleWebhook(payload: TaskAssignmentWebhookPayload): Promise<TaskAssignmentResult> {
    try {
      // 1. Validate and retrieve task
      const task = await this.taskRepository.findByIdWithRelations(payload.task.id, {
        includeAssignee: true,
        includeAIAgent: true,
        includeCreator: true,
        includeLists: true
      })

      if (!task) {
        return {
          success: false,
          taskId: payload.task.id,
          aiAgentId: payload.aiAgent.id,
          message: 'Task not found',
          error: 'TASK_NOT_FOUND'
        }
      }

      // 2. Verify AI agent assignment
      const isValidAssignment = await this.verifyAIAgentAssignment(task, payload.aiAgent.id)
      if (!isValidAssignment) {
        return {
          success: false,
          taskId: payload.task.id,
          aiAgentId: payload.aiAgent.id,
          message: 'Task not assigned to specified AI agent',
          error: 'INVALID_ASSIGNMENT'
        }
      }

      // 3. Handle based on event type
      console.log(`🎯 [WEBHOOK] Processing event: ${payload.event} for task: ${payload.task.title}`)

      switch (payload.event) {
        case 'task.assigned':
          console.log(`📋 [WEBHOOK] Routing to handleTaskAssignment`)
          return await this.handleTaskAssignment(payload, task)
        case 'task.updated':
          console.log(`📋 [WEBHOOK] Routing to handleTaskUpdate`)
          return await this.handleTaskUpdate(payload, task)
        case 'task.completed':
          console.log(`📋 [WEBHOOK] Routing to handleTaskCompletion`)
          return await this.handleTaskCompletion(payload, task)
        case 'task.commented':
          console.log(`📋 [WEBHOOK] Routing to handleTaskComment`)
          return await this.handleTaskComment(payload, task)
        default:
          console.log(`❌ [WEBHOOK] Unknown event type: ${payload.event}`)
          return {
            success: false,
            taskId: payload.task.id,
            aiAgentId: payload.aiAgent.id,
            message: `Unhandled event type: ${payload.event}`,
            error: 'INVALID_EVENT_TYPE'
          }
      }

    } catch (error) {
      return {
        success: false,
        taskId: payload.task.id,
        aiAgentId: payload.aiAgent.id,
        message: 'Internal processing error',
        error: error instanceof Error ? error.message : 'UNKNOWN_ERROR'
      }
    }
  }

  /**
   * Verify that the task is properly assigned to the AI agent
   */
  private async verifyAIAgentAssignment(task: any, aiAgentId: string): Promise<boolean> {
    // Check both assignee and aiAgent paths for flexibility
    const isAssigneeAI = task.assignee?.isAIAgent && task.assignee.id === aiAgentId
    const isAIAgent = task.aiAgent && task.aiAgent.id === aiAgentId

    return isAssigneeAI || isAIAgent
  }

  /**
   * Handle new task assignments
   */
  private async handleTaskAssignment(payload: TaskAssignmentWebhookPayload, task: any): Promise<TaskAssignmentResult> {
    console.log('🎯 [WEBHOOK] Task assignment handler called:', {
      taskId: payload.task.id,
      taskTitle: payload.task.title,
      aiAgentEmail: payload.aiAgent.email,
      aiAgentName: payload.aiAgent.name
    })

    try {
      // 1. Ensure AI agent user exists
      const aiAgentUser = await this.ensureAIAgentUser(payload.aiAgent)

      // 2. Generate AI-powered acknowledgment comment
      console.log('📝 [ASSIGNMENT] Generating assignment response...')
      const acknowledgmentResponse = await this.generateAssignmentResponse(
        payload.task.title,
        payload.task.id,
        payload.aiAgent.email,
        payload.aiAgent.name,
        payload // Pass full payload with repository info
      )
      console.log('✅ [ASSIGNMENT] Assignment response generated, length:', acknowledgmentResponse.length)

      console.log('💾 [ASSIGNMENT] Posting assignment comment to task...')
      const assignmentComment = await prisma.comment.create({
        data: {
          content: acknowledgmentResponse + '\\n\\n<!-- SYSTEM_GENERATED_COMMENT -->',
          type: 'MARKDOWN',
          taskId: payload.task.id,
          authorId: aiAgentUser.id
        },
        include: {
          author: true // Include author for SSE notifications
        }
      })
      console.log('✅ [ASSIGNMENT] Assignment comment posted successfully, ID:', assignmentComment.id)

      // Send SSE notification for AI agent comment
      console.log('📡 [ASSIGNMENT] Sending SSE notification for AI agent comment...')
      try {
        const { broadcastCommentCreatedNotification } = await import('@/lib/sse-utils')
        await broadcastCommentCreatedNotification(task, assignmentComment)
        console.log('✅ [ASSIGNMENT] SSE notification sent successfully')
      } catch (sseError) {
        console.error('❌ [ASSIGNMENT] Failed to send SSE notification:', sseError)
        // Don't fail the assignment if SSE notification fails
      }

      // 3. Send notifications
      await this.notificationService.notifyTaskAssignment(task, payload.aiAgent)

      // 4. Check if this is a coding task with GitHub repository configured
      const hasGitHubRepo = payload.list?.githubRepositoryId && payload.list.githubRepositoryId.trim() !== ''

      // Determine if this task requires code changes or is just a question
      const taskLower = payload.task.title.toLowerCase()
      const isQuestion = taskLower.startsWith('what') ||
                         taskLower.startsWith('how') ||
                         taskLower.startsWith('why') ||
                         taskLower.startsWith('when') ||
                         taskLower.startsWith('where') ||
                         taskLower.includes('?') ||
                         taskLower.includes('tell me') ||
                         taskLower.includes('show me') ||
                         taskLower.includes('explain')

      if (hasGitHubRepo && !isQuestion) {
        // This is a coding task with GitHub integration - trigger the full workflow
        console.log(`🚀 [ASSIGNMENT] GitHub repository detected (${payload.list.githubRepositoryId}), triggering AI orchestration service for coding workflow`)

        try {
          await this.aiOrchestrationService.startTaskProcessing(payload.task.id, aiAgentUser.id)
          console.log(`✅ [ASSIGNMENT] AI orchestration service started successfully for GitHub workflow`)
        } catch (orchestrationError) {
          console.error(`❌ [ASSIGNMENT] AI orchestration service failed:`, orchestrationError)
          // Don't fail the entire assignment if orchestration fails - the comment was already posted
        }
      } else if (hasGitHubRepo && isQuestion) {
        // This is a question about the repository - agent will answer via MCP operations in comments
        console.log(`❓ [ASSIGNMENT] Question detected about repository (${payload.list.githubRepositoryId}) - agent will use MCP operations to answer via comments`)
      } else {
        // Regular task without GitHub integration - just acknowledge with comment (already done above)
        console.log(`💬 [ASSIGNMENT] No GitHub repository configured - task acknowledged with comment only`)
      }

      return {
        success: true,
        taskId: payload.task.id,
        aiAgentId: payload.aiAgent.id,
        message: 'Task assignment processed successfully'
      }

    } catch (error) {
      throw new Error(`Task assignment failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Handle task updates
   */
  private async handleTaskUpdate(payload: TaskAssignmentWebhookPayload, task: any): Promise<TaskAssignmentResult> {
    const aiAgentUser = await this.ensureAIAgentUser(payload.aiAgent)

    // Create AI agent comment directly via Prisma to avoid triggering notification loop
    const updateComment = await prisma.comment.create({
      data: {
        content: "🔄 **Task Updated**\\n\\nI've been notified that this task has been updated. Let me review the changes and adjust my approach if needed.\\n\\n*Automatic update from AI Agent*\\n\\n<!-- SYSTEM_GENERATED_COMMENT -->",
        type: 'MARKDOWN',
        taskId: payload.task.id,
        authorId: aiAgentUser.id
      },
      include: {
        author: true // Include author for SSE notifications
      }
    })

    // Send SSE notification for AI agent update comment
    console.log('📡 [UPDATE] Sending SSE notification for AI agent update comment...')
    try {
      const { broadcastCommentCreatedNotification } = await import('@/lib/sse-utils')
      await broadcastCommentCreatedNotification(task, updateComment)
      console.log('✅ [UPDATE] SSE notification sent successfully')
    } catch (sseError) {
      console.error('❌ [UPDATE] Failed to send SSE notification:', sseError)
      // Don't fail the update if SSE notification fails
    }

    await this.notificationService.notifyTaskUpdate(task, payload.aiAgent)

    return {
      success: true,
      taskId: payload.task.id,
      aiAgentId: payload.aiAgent.id,
      message: 'Task update processed successfully'
    }
  }

  /**
   * Handle task completion
   */
  private async handleTaskCompletion(payload: TaskAssignmentWebhookPayload, task: any): Promise<TaskAssignmentResult> {
    const aiAgentUser = await this.ensureAIAgentUser(payload.aiAgent)

    // Create AI agent comment directly via Prisma to avoid triggering notification loop
    const completionComment = await prisma.comment.create({
      data: {
        content: "✅ **Task Marked Complete**\\n\\nGreat! This task has been marked as completed.\\n\\n**Status:** Implementation delivered successfully\\n**Thank you:** It was a pleasure working on this task!\\n\\n*AI Agent Final Update*\\n\\n<!-- SYSTEM_GENERATED_COMMENT -->",
        type: 'MARKDOWN',
        taskId: payload.task.id,
        authorId: aiAgentUser.id
      },
      include: {
        author: true // Include author for SSE notifications
      }
    })

    // Send SSE notification for AI agent completion comment
    console.log('📡 [COMPLETION] Sending SSE notification for AI agent completion comment...')
    try {
      const { broadcastCommentCreatedNotification } = await import('@/lib/sse-utils')
      await broadcastCommentCreatedNotification(task, completionComment)
      console.log('✅ [COMPLETION] SSE notification sent successfully')
    } catch (sseError) {
      console.error('❌ [COMPLETION] Failed to send SSE notification:', sseError)
      // Don't fail the completion if SSE notification fails
    }

    return {
      success: true,
      taskId: payload.task.id,
      aiAgentId: payload.aiAgent.id,
      message: 'Task completion processed successfully'
    }
  }

  /**
   * Handle task comments
   */
  private async handleTaskComment(payload: TaskAssignmentWebhookPayload, task: any): Promise<TaskAssignmentResult> {
    if (!payload.comment) {
      throw new Error('Comment data missing from payload')
    }

    const aiAgentUser = await this.ensureAIAgentUser(payload.aiAgent)

    // Don't respond to comments from ANY AI agent (prevent infinite loops)
    if (!payload.comment.authorId) {
      console.log('⚠️ [AgentWebhook] Skipping comment from deleted user')
      return {
        success: false,
        message: 'Comment author no longer exists',
        taskId: payload.task.id,
        aiAgentId: aiAgentUser.id
      }
    }
    const commentAuthor = await prisma.user.findUnique({
      where: { id: payload.comment.authorId },
      select: { isAIAgent: true, name: true }
    })

    if (commentAuthor?.isAIAgent) {
      console.log(`🤖 Ignoring comment from AI agent: ${commentAuthor.name}`)
      return {
        success: true,
        taskId: payload.task.id,
        aiAgentId: payload.aiAgent.id,
        message: 'Ignoring AI agent comment to prevent infinite loops'
      }
    }

    const response = await this.generateCommentResponse(
      payload.comment.content,
      payload.comment.authorName,
      payload.task.title,
      payload.task.id,
      payload.aiAgent.email
    )

    // Create AI agent comment directly via Prisma to avoid triggering notification loop
    const commentResponse = await prisma.comment.create({
      data: {
        content: response + '\\n\\n<!-- SYSTEM_GENERATED_COMMENT -->',
        type: 'MARKDOWN',
        taskId: payload.task.id,
        authorId: aiAgentUser.id
      },
      include: {
        author: true // Include author for SSE notifications
      }
    })

    // Send SSE notification for AI agent comment response
    console.log('📡 [COMMENT] Sending SSE notification for AI agent comment response...')
    try {
      const { broadcastCommentCreatedNotification } = await import('@/lib/sse-utils')
      await broadcastCommentCreatedNotification(task, commentResponse)
      console.log('✅ [COMMENT] SSE notification sent successfully')
    } catch (sseError) {
      console.error('❌ [COMMENT] Failed to send SSE notification:', sseError)
      // Don't fail the comment response if SSE notification fails
    }

    await this.notificationService.notifyCommentResponse(task, payload.aiAgent, payload.comment)

    return {
      success: true,
      taskId: payload.task.id,
      aiAgentId: payload.aiAgent.id,
      message: 'Comment response processed successfully'
    }
  }

  /**
   * Ensure AI agent user exists in the system
   */
  private async ensureAIAgentUser(aiAgent: { id: string, name: string, type: string, email: string }) {
    try {
      // Try to find existing agent
      let existingAgent = await this.userRepository.findById(aiAgent.id)

      if (existingAgent) {
        return existingAgent
      }

      // Try by email
      existingAgent = await this.userRepository.findByEmail(aiAgent.email)
      if (existingAgent) {
        return existingAgent
      }

      // Create new AI agent user
      return await this.userRepository.create({
        id: aiAgent.id,
        name: aiAgent.name,
        email: aiAgent.email,
        isAIAgent: true,
        aiAgentType: aiAgent.type === 'claude_agent' ? 'claude_agent' : 'coding_agent',
        isActive: true
      })

    } catch (error) {
      // Fallback: try to find any AI agent user
      const fallbackAgent = await this.userRepository.findFirstAIAgent()
      if (fallbackAgent) {
        return fallbackAgent
      }

      throw new Error(`Failed to ensure AI agent exists: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Generate acknowledgment comment
   */
  private generateAcknowledgmentComment(agentName: string): string {
    return `🤖 **AI Coding Agent Activated**

Hello! I'm **${agentName}** and I've received this task assignment.

## What I'll do next:

1. **📋 Analyze** - I'll carefully review the task requirements
2. **🎯 Plan** - Create a detailed implementation plan for your review
3. **💭 Questions** - Ask any clarifying questions if needed
4. **⚙️ Implement** - Generate and test the code after plan approval
5. **📝 Updates** - Keep you informed via real-time notifications
6. **✅ Complete** - Mark the task done when finished

## 🔄 Direct AI Processing Started...

I'm working on this task now using direct AI processing. You'll receive real-time updates!

---
*🤖 Ready to work! I'll keep you updated on my progress via live notifications.*`
  }

  /**
   * Generate error comment
   */
  private generateErrorComment(errorMessage: string): string {
    return `⚠️ **Processing Error**

I encountered an issue while processing this task:

**Error:** ${errorMessage}

**Status:** I'll investigate and try again or request human assistance.

*AI Agent Error Report*`
  }

  /**
   * Generate AI-powered assignment acknowledgment response
   */
  private async generateAssignmentResponse(taskTitle: string, taskId: string, aiAgentEmail: string, agentName: string, payload?: TaskAssignmentWebhookPayload): Promise<string> {
    console.log('🤖 [ASSIGNMENT] Generating assignment response:', {
      taskTitle,
      taskId,
      aiAgentEmail,
      agentName
    })

    // Determine AI service from agent email
    let aiService: 'claude' | 'openai' = 'claude' // default
    if (aiAgentEmail === 'openai@astrid.cc') {
      aiService = 'openai'
    }

    try {

      // Find a user with API key for this AI service
      console.log(`🔍 [ASSIGNMENT] Looking for ${aiService} API key among task participants...`)
      const userWithApiKey = await this.findUserWithApiKey(taskId, aiService)
      console.log(`🔑 [ASSIGNMENT] API key lookup result:`, userWithApiKey ? `Found user ${userWithApiKey}` : 'No user with API key found')

      if (!userWithApiKey) {
        // Provide specific error message about missing API key
        console.error(`❌ No ${aiService} API key found for assignment`)
        return `❌ **API Configuration Required**

I'm ${agentName}, but I need a ${aiService.toUpperCase()} API key to respond intelligently.

**Problem**: No valid ${aiService} API key found among task participants.

**To fix this:**
1. Go to Settings → AI Agents
2. Configure your ${aiService.toUpperCase()} API key
3. Make sure you're a member of this list
4. Re-assign this task to me

**List members checked**: Task creator, list owner, admins, and members
**Service needed**: ${aiService} (based on my email: ${aiAgentEmail})

*This is an automated configuration error - I'll respond with real AI once you add your API key!*`
      }

      // Create AI orchestrator to handle the API call
      const { AIOrchestrator } = await import('@/lib/ai-orchestrator')
      const orchestrator = await AIOrchestrator.createForTaskWithService(taskId, userWithApiKey, aiService)

      // Get task context for better responses
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          title: true,
          description: true,
          lists: { select: { name: true, githubRepositoryId: true } },
          assignee: { select: { name: true } },
          creator: { select: { name: true } }
        }
      })

      // Extract repository info from payload or task - find first list with a repository
      const repositoryId = payload?.list?.githubRepositoryId || task?.lists?.find(l => l.githubRepositoryId)?.githubRepositoryId
      const mcpContext = payload?.mcp?.contextInstructions

      // Fetch repository context if available
      let repositoryContext = ''
      if (repositoryId && userWithApiKey) {
        console.log(`📂 [ASSIGNMENT] Fetching repository context for ${repositoryId}`)
        repositoryContext = await this.fetchRepositoryContext(repositoryId, userWithApiKey)
      }

      // Build assignment-specific prompt with repository context
      const prompt = `You are ${agentName}, an AI coding assistant that has just been assigned to work on a task. Generate a professional, enthusiastic acknowledgment response.

Task: "${taskTitle}"
Task Description: ${task?.description || 'No description provided'}
List: ${task?.lists.map(l => l.name).join(', ') || 'Unknown'}
Assigned by: ${task?.creator?.name || 'Unknown'}
${repositoryId ? `\nGitHub Repository: ${repositoryId}` : ''}

${repositoryContext}

${mcpContext ? `\nContext Information:\n${mcpContext}` : ''}

${repositoryId ? `\nIMPORTANT: You have access to the GitHub repository "${repositoryId}". The files shown above provide initial context, but you can access ANY file in this repository using MCP operations:

**Available MCP Operations for Repository Access:**
- \`get_repository_file\`: Read any file from the repository
  - Parameters: repository="${repositoryId}", path="<file-path>", ref="<branch-or-commit>" (optional)
  - Example: Get the contents of src/index.ts

- \`list_repository_files\`: List files in a directory
  - Parameters: repository="${repositoryId}", path="<directory-path>" (optional, defaults to root), ref="<branch-or-commit>" (optional)
  - Example: List all files in the src/ directory

Use these operations to access files beyond what's shown in the initial context. If the user asks about specific files or code, you can read them directly.` : ''}

Please write a response that:
1. Acknowledges the task assignment professionally
2. ${repositoryId ? 'Mentions that you have access to the repository "' + repositoryId + '" if relevant to the task' : ''}
3. Shows understanding of what needs to be done
4. Outlines your planned approach briefly
5. Asks any initial clarifying questions if needed
6. Sets expectations for communication

Use a professional but friendly tone. Include relevant emojis for visual appeal. Keep it concise but informative.

Format your response in markdown.`

      // DISABLED: Old verbose acknowledgment system
      // The new tools-based workflow (start-tools-workflow) handles everything autonomously
      // This old system doesn't use tools and creates verbose, non-actionable comments
      console.log(`ℹ️  [ASSIGNMENT] Skipping old acknowledgment - tools-based workflow will handle this`)

      return '' // Don't generate acknowledgment - let tools workflow handle it

    } catch (error) {
      console.error('❌ Failed to generate AI assignment response:', error)

      // Provide specific error message based on the error type
      const errorMessage = error instanceof Error ? error.message : String(error)

      if (errorMessage.includes('API key')) {
        return `❌ **Invalid ${aiService.toUpperCase()} API Key**

I'm ${agentName}, but your ${aiService} API key isn't working.

**Error**: ${errorMessage}

**To fix this:**
1. Go to Settings → AI Agents
2. Update your ${aiService.toUpperCase()} API key
3. Make sure it's valid and has sufficient credits
4. Re-assign this task to me

*This is an API authentication error - I'll respond with real AI once you fix your key!*`
      }

      if (errorMessage.includes('budget') || errorMessage.includes('quota') || errorMessage.includes('limit')) {
        return `💰 **${aiService.toUpperCase()} Account Limit Reached**

I'm ${agentName}, but your ${aiService} account has reached its limit.

**Error**: ${errorMessage}

**To fix this:**
1. Check your ${aiService} account billing
2. Add more credits or increase limits
3. Or wait for your quota to reset
4. Re-assign this task to me when ready

*This is a billing/quota error - I'll respond with real AI once you have credits!*`
      }

      return `⚠️ **${aiService.toUpperCase()} API Error**

I'm ${agentName}, but I encountered an error trying to connect to ${aiService}.

**Error**: ${errorMessage}

**Possible solutions:**
1. Check if ${aiService} API is working: https://status.anthropic.com
2. Verify your API key in Settings → AI Agents
3. Try again in a few minutes
4. Contact support if the issue persists

*This is a technical error - I'll respond with real AI once the issue is resolved!*`
    }
  }

  /**
   * Generate intelligent comment responses using Claude API
   */
  private async generateCommentResponse(commentContent: string, authorName: string, taskTitle: string, taskId: string, aiAgentEmail: string): Promise<string> {
    // Determine AI service from agent email
    let aiService: 'claude' | 'openai' = 'claude' // default
    if (aiAgentEmail === 'openai@astrid.cc') {
      aiService = 'openai'
    }

    try {

      // Find a user with API key for this AI service
      const userWithApiKey = await this.findUserWithApiKey(taskId, aiService)

      if (!userWithApiKey) {
        // Provide specific error message about missing API key
        console.error(`❌ No ${aiService} API key found for comment response`)
        return `❌ **API Configuration Required**

Hi ${authorName}! I need a ${aiService.toUpperCase()} API key to respond intelligently to your comment about "${taskTitle}".

**Your comment**: "${commentContent}"

**Problem**: No valid ${aiService} API key found among task participants.

**To fix this**: Go to Settings → AI Agents and configure your ${aiService.toUpperCase()} API key.

*I'll give you real AI responses once someone adds their API key!*`
      }

      // Create AI orchestrator to handle the API call
      const { AIOrchestrator } = await import('@/lib/ai-orchestrator')
      const orchestrator = await AIOrchestrator.createForTaskWithService(taskId, userWithApiKey, aiService)

      // Get task context for better responses
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          title: true,
          description: true,
          lists: { select: { name: true, githubRepositoryId: true } },
          comments: {
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: { author: { select: { name: true, isAIAgent: true } } }
          }
        }
      })

      // Get repository info - find first list with a repository (task may be in multiple lists)
      const repositoryId = task?.lists?.find(l => l.githubRepositoryId)?.githubRepositoryId

      // Fetch repository context if available
      let repositoryContext = ''
      if (repositoryId && userWithApiKey) {
        console.log(`📂 [COMMENT] Fetching repository context for ${repositoryId}`)
        repositoryContext = await this.fetchRepositoryContext(repositoryId, userWithApiKey)
      }

      // Build context-aware prompt (exclude ALL AI agent comments)
      const recentComments = task?.comments
        ?.filter(c => c.author && !c.author.isAIAgent) // Exclude ALL AI agent comments to prevent confusion
        ?.map(c => `${c.author?.name || "Deleted User"}: ${c.content}`)
        ?.join('\\n') || 'No recent comments'

      const prompt = `You are an AI coding assistant working on a task. Please respond to this comment professionally and helpfully.

Task: "${taskTitle}"
Task Description: ${task?.description || 'No description provided'}
List: ${task?.lists.map(l => l.name).join(', ') || 'Unknown'}
${repositoryId ? `GitHub Repository: ${repositoryId}` : ''}

${repositoryContext}

${repositoryId ? `IMPORTANT: You have access to the GitHub repository "${repositoryId}". The files shown above provide initial context, but you can access ANY file in this repository using MCP operations:

**Available MCP Operations for Repository Access:**
- \`get_repository_file\`: Read any file from the repository
  - Parameters: repository="${repositoryId}", path="<file-path>", ref="<branch-or-commit>" (optional)
  - Example: Read src/components/Header.tsx to understand the component structure

- \`list_repository_files\`: List files in a directory
  - Parameters: repository="${repositoryId}", path="<directory-path>" (optional, defaults to root), ref="<branch-or-commit>" (optional)
  - Example: List all files in the src/ directory to understand the codebase structure

Use these operations to answer questions about the codebase, dependencies, or project structure. If the user asks about specific files or code, you can read them directly.` : ''}

Recent conversation context:
${recentComments}

New comment from ${authorName}:
"${commentContent}"

Please provide a helpful, professional response as an AI coding assistant. Be specific and actionable. If they're asking questions, provide detailed answers. If they're requesting changes, acknowledge and explain next steps. Keep the response concise but informative.

Format your response in markdown with appropriate emojis for visual appeal.`

      // Call the AI service
      const aiResponse = await orchestrator.generateCommentResponse(prompt)

      return `${aiResponse}

*Response generated by ${aiService === 'claude' ? 'Claude' : 'OpenAI'} API*`

    } catch (error) {
      console.error('❌ Failed to generate AI response:', error)

      // Provide specific error message based on the error type
      const errorMessage = error instanceof Error ? error.message : String(error)

      if (errorMessage.includes('API key')) {
        return `❌ **Invalid ${aiService.toUpperCase()} API Key**

Hi ${authorName}! Your ${aiService} API key isn't working.

**Your comment**: "${commentContent}"
**Error**: ${errorMessage}

**To fix this**: Go to Settings → AI Agents and update your ${aiService.toUpperCase()} API key.`
      }

      if (errorMessage.includes('budget') || errorMessage.includes('quota') || errorMessage.includes('limit')) {
        return `💰 **${aiService.toUpperCase()} Account Limit Reached**

Hi ${authorName}! Your ${aiService} account has reached its limit.

**Your comment**: "${commentContent}"
**Error**: ${errorMessage}

**To fix this**: Add more credits to your ${aiService} account or wait for quota reset.`
      }

      return `⚠️ **${aiService.toUpperCase()} API Error**

Hi ${authorName}! I encountered an error trying to respond to your comment about "${taskTitle}".

**Your comment**: "${commentContent}"
**Error**: ${errorMessage}

**Try**: Commenting again in a few minutes, or check if ${aiService} API is working.`
    }
  }

  /**
   * Fallback response when AI API is not available
   */
  private generateFallbackResponse(commentContent: string, authorName: string, taskTitle: string): string {
    const content = commentContent.toLowerCase()

    // Question patterns
    if (content.includes('?') || content.match(/\\b(how|what|why|when|where|can you|could you|would you|will you)\\b/)) {
      return `🤔 **Question Received**

Hi ${authorName}! I see you have a question about "${taskTitle}".

**Your message:** "${commentContent}"

**My response:** I'm analyzing your question and will provide a detailed answer. Let me review the task requirements and current progress to give you the most accurate information.

*I'll follow up with specific details shortly!*`
    }

    // Update/change request patterns
    if (content.match(/\\b(update|change|modify|fix|adjust|revise|edit)\\b/)) {
      return `🔄 **Update Request Acknowledged**

Got it, ${authorName}! I understand you'd like some changes to "${taskTitle}".

**Your request:** "${commentContent}"

**Next steps:**
1. I'll review your requested changes
2. Update my implementation plan accordingly
3. Apply the modifications
4. Test the changes
5. Update you on the progress

*Starting work on your updates now...*`
    }

    // Approval patterns
    if (content.match(/\\b(approve|approved|looks good|lgtm|ship it|deploy|go ahead|proceed)\\b/)) {
      return `✅ **Approval Received**

Thank you ${authorName}! I'm glad you're happy with the progress on "${taskTitle}".

**Status:** Moving forward with implementation
**Next:** I'll proceed with the next phase of development

*Continuing work with your approval...*`
    }

    // Default response
    return `💬 **Message Received**

Hi ${authorName}! Thanks for your message about "${taskTitle}".

**Your comment:** "${commentContent}"

**My response:** I've noted your message and I'm processing the information. I'll take this into account as I continue working on the task and will update you on any relevant progress or changes.

*Thanks for staying engaged with this task!*`
  }

  /**
   * Fetch repository context (README, package.json, etc.) for AI prompts
   */
  private async fetchRepositoryContext(repositoryId: string, userId: string): Promise<string> {
    console.log(`📂 [REPO-CONTEXT] Fetching context for ${repositoryId}`)

    try {
      const { GitHubClient } = await import('@/lib/github-client')
      const githubClient = await GitHubClient.forUser(userId)

      let context = '\n\n### 📂 Repository Context:\n'
      context += `**Repository:** ${repositoryId}\n\n`

      // Try to fetch README.md
      try {
        const readme = await githubClient.getFile(repositoryId, 'README.md')
        const preview = readme.length > 3000 ? readme.substring(0, 3000) + '\n... (truncated)' : readme
        context += `#### README.md:\n\`\`\`markdown\n${preview}\n\`\`\`\n\n`
        console.log(`✅ [REPO-CONTEXT] Fetched README.md (${readme.length} bytes)`)
      } catch (error) {
        context += `*README.md: Not found or not accessible*\n\n`
        console.log(`⚠️ [REPO-CONTEXT] README.md not found: ${error instanceof Error ? error.message : 'unknown error'}`)
      }

      // Try to fetch package.json
      try {
        const packageJson = await githubClient.getFile(repositoryId, 'package.json')
        const pkg = JSON.parse(packageJson)
        const summary = {
          name: pkg.name,
          version: pkg.version,
          description: pkg.description,
          scripts: pkg.scripts,
          dependencies: Object.keys(pkg.dependencies || {}).slice(0, 10),
          devDependencies: Object.keys(pkg.devDependencies || {}).slice(0, 10)
        }
        context += `#### package.json:\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`\n\n`
        console.log(`✅ [REPO-CONTEXT] Fetched package.json`)
      } catch (error) {
        context += `*package.json: Not found or not accessible*\n\n`
        console.log(`⚠️ [REPO-CONTEXT] package.json not found`)
      }

      // Try to fetch tsconfig.json or other config
      try {
        const tsconfig = await githubClient.getFile(repositoryId, 'tsconfig.json')
        const config = JSON.parse(tsconfig)
        context += `#### tsconfig.json:\n\`\`\`json\n${JSON.stringify(config.compilerOptions || config, null, 2).substring(0, 500)}\n\`\`\`\n\n`
        console.log(`✅ [REPO-CONTEXT] Fetched tsconfig.json`)
      } catch {
        // Silent fail - tsconfig is optional
      }

      console.log(`✅ [REPO-CONTEXT] Context built (${context.length} chars)`)
      return context
    } catch (error) {
      console.error(`❌ [REPO-CONTEXT] Failed to fetch repository context:`, error)
      return '\n*(Repository files could not be fetched)*\n'
    }
  }

  /**
   * Find a user who has the required API key for the specified AI service
   */
  private async findUserWithApiKey(taskId: string, aiService: 'claude' | 'openai'): Promise<string | null> {
    const { hasValidApiKey } = await import('@/lib/api-key-cache')

    // Get task with full list membership details
    const task = await prisma.task.findUnique({
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
          console.log(`🔑 Using AI agent configured by user: ${list.aiAgentConfiguredBy}`)
          return list.aiAgentConfiguredBy
        }
      }

      // Add list owner and members
      candidateUserIds.add(list.ownerId)
      list.listMembers.forEach(listMember => candidateUserIds.add(listMember.user.id))
    }

    // Check each candidate user for valid API key
    for (const userId of candidateUserIds) {
      const hasKey = await hasValidApiKey(userId, aiService)
      if (hasKey) {
        console.log(`🔑 Found user with ${aiService} API key: ${userId}`)
        return userId
      }
    }

    console.error(`❌ No user found with ${aiService} API key among task participants`)
    return null
  }
}