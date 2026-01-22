/**
 * AI Agent Webhook Route - MVC Architecture
 *
 * This route handler is now a thin layer that:
 * 1. Handles HTTP concerns (headers, status codes, rate limiting)
 * 2. Validates input
 * 3. Delegates business logic to the controller
 * 4. Returns appropriate HTTP responses
 *
 * All business logic is now in the AIAgentWebhookController
 */

import { NextRequest, NextResponse } from 'next/server'
import { TaskAssignmentWebhookPayload } from '@/lib/ai-agent-webhook-service'
import { RATE_LIMITS, withRateLimit } from '@/lib/rate-limiter'
import { z } from 'zod'
import { detectPortFromRequest } from '@/lib/runtime-port-detection'
import { DependencyContainer } from '@/lib/dependency-container'

// Force dynamic rendering for webhook endpoints
export const dynamic = 'force-dynamic'

// Validation schema for incoming task assignment webhook payloads
const TaskAssignmentSchema = z.object({
  event: z.enum(['task.assigned', 'task.updated', 'task.completed', 'task.commented']),
  timestamp: z.string(),
  aiAgent: z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    email: z.string()
  }),
  task: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    priority: z.number(),
    dueDateTime: z.string().optional(),
    assigneeId: z.string(),
    creatorId: z.string(),
    listId: z.string(),
    url: z.string()
  }),
  list: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    githubRepositoryId: z.string().optional()
  }),
  mcp: z.object({
    baseUrl: z.string(),
    operationsEndpoint: z.string(),
    accessToken: z.string().optional(),
    availableOperations: z.array(z.string()),
    contextInstructions: z.string()
  }),
  creator: z.object({
    id: z.string(),
    name: z.string().optional(),
    email: z.string()
  }),
  comment: z.object({
    id: z.string(),
    content: z.string(),
    authorName: z.string(),
    authorId: z.string(),
    createdAt: z.string()
  }).optional()
})

/**
 * AI Agent Webhook - POST Handler
 */
export async function POST(request: NextRequest) {
  // Detect current port from request for dynamic URL generation
  const detectedPort = detectPortFromRequest(request)
  if (detectedPort) {
    console.log(`🔍 [Port Detection] Detected server running on port ${detectedPort}`)
  }

  // Apply rate limiting
  const rateLimitCheck = withRateLimit(RATE_LIMITS.WEBHOOK)(request)
  if (!rateLimitCheck.allowed) {
    console.log('🚫 AI agent webhook rate limited:', rateLimitCheck.error)
    return NextResponse.json(
      rateLimitCheck.error,
      {
        status: 429,
        headers: rateLimitCheck.headers
      }
    )
  }

  // Get controller from dependency container
  const container = DependencyContainer.getInstance()
  const controller = container.getAIAgentWebhookController()

  try {
    console.log('🤖 [AI Agent] Received task assignment notification')

    // Parse and validate request body
    const body = await request.json()
    const payload: TaskAssignmentWebhookPayload = TaskAssignmentSchema.parse(body)

    console.log(`📋 [AI Agent] Event: ${payload.event}`)
    console.log(`📋 [AI Agent] Task: "${payload.task.title}"`)
    console.log(`🤖 [AI Agent] Agent: ${payload.aiAgent.name} (${payload.aiAgent.type})`)

    // Delegate to controller
    const result = await controller.handleWebhook(payload)

    // Return appropriate response based on result
    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
        taskId: result.taskId,
        aiAgent: payload.aiAgent.name,
        event: payload.event,
        timestamp: new Date().toISOString(),
        integration: 'mvc-architecture'
      }, { status: 200 })
    } else {
      // Handle different error types with appropriate HTTP status codes
      let statusCode = 500
      switch (result.error) {
        case 'TASK_NOT_FOUND':
          statusCode = 404
          break
        case 'INVALID_ASSIGNMENT':
          statusCode = 400
          break
        case 'INVALID_EVENT_TYPE':
          statusCode = 400
          break
        default:
          statusCode = 500
      }

      return NextResponse.json({
        success: false,
        error: result.message,
        code: result.error,
        taskId: result.taskId,
        aiAgent: payload.aiAgent.name
      }, { status: statusCode })
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      console.log('❌ [AI Agent] Invalid payload:', error.errors)
      return NextResponse.json({
        error: 'Invalid payload format',
        details: error.errors
      }, { status: 400 })
    }

    console.error('❌ [AI Agent] Error processing webhook:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ?
        (error instanceof Error ? error.message : String(error)) : undefined
    }, { status: 500 })
  }
}

/**
 * GET endpoint for webhook documentation
 */
export async function GET() {
  return NextResponse.json({
    service: 'AI Agent Webhook - MVC Architecture',
    description: 'Receives task assignments and processes them via controller-based architecture',
    version: '3.0.0',
    endpoint: 'https://astrid.cc/api/ai-agent/webhook',
    method: 'POST',
    architecture: 'mvc-pattern',
    features: [
      'Controller-based business logic',
      'Repository pattern for data access',
      'Service layer for cross-cutting concerns',
      'Dependency injection container',
      'Platform-agnostic core logic',
      'Testable and maintainable code'
    ],
    supportedEvents: [
      'task.assigned',
      'task.updated',
      'task.completed',
      'task.commented'
    ],
    portability: 'Core logic can be reused in mobile apps and other platforms',
    usage: 'Configure AI agent webhookUrl to: https://astrid.cc/api/ai-agent/webhook'
  })
}