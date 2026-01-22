import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { isCodingAgent } from '@/lib/ai-agent-utils'

const prisma = new PrismaClient()

interface WorkflowCompleteRequest {
  taskId: string
  workflowStatus: 'success' | 'failure' | 'partial'
  message: string
  githubContext: {
    repository: string
    runId: string
    runUrl: string
    prUrl?: string
    previewUrl?: string
  }
}

/**
 * API endpoint for GitHub Actions to report workflow completion
 * Called by astrid-code-assistant.yml workflow in the notify-completion job
 */
export async function POST(request: NextRequest) {
  try {
    console.log('📊 [Workflow Complete] Received completion notification from GitHub Actions')

    // Parse request
    const body: WorkflowCompleteRequest = await request.json()
    const { taskId, workflowStatus, message, githubContext } = body

    if (!taskId || !workflowStatus) {
      return NextResponse.json({ error: 'taskId and workflowStatus are required' }, { status: 400 })
    }

    console.log(`📋 [Workflow Complete] Task: ${taskId}`)
    console.log(`📊 [Workflow Complete] Status: ${workflowStatus}`)

    // Validate MCP token authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'MCP token required' }, { status: 401 })
    }

    const token = authHeader.substring(7)

    // Find the MCP token and associated user
    const mcpToken = await prisma.mCPToken.findFirst({
      where: {
        token,
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      },
      include: {
        user: true
      }
    })

    if (!mcpToken) {
      return NextResponse.json({ error: 'Invalid or expired MCP token' }, { status: 401 })
    }

    // Verify this is the coding agent user
    if (!isCodingAgent(mcpToken.user)) {
      return NextResponse.json({ error: 'Only coding agents can access this endpoint' }, { status: 403 })
    }

    console.log(`✅ [Workflow Complete] Authenticated as coding agent: ${mcpToken.user.name}`)

    // Get the task and workflow
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        creator: true,
        assignee: true
      }
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    const workflow = await prisma.codingTaskWorkflow.findUnique({
      where: { taskId }
    })

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 })
    }

    console.log(`📋 [Workflow Complete] Task: "${task.title}"`)
    console.log(`🔧 [Workflow Complete] Current workflow status: ${workflow.status}`)

    // Update workflow with GitHub Actions completion data
    const updatedWorkflow = await prisma.codingTaskWorkflow.update({
      where: { id: workflow.id },
      data: {
        metadata: {
          ...workflow.metadata as any,
          githubActionsComplete: true,
          githubActionsStatus: workflowStatus,
          githubActionsMessage: message,
          githubActionsContext: githubContext,
          completedAt: new Date().toISOString()
        }
      }
    })

    console.log(`✅ [Workflow Complete] Updated workflow metadata`)

    // Determine the appropriate status message and emoji
    let statusEmoji: string
    let statusMessage: string
    let actionRequired = ''

    switch (workflowStatus) {
      case 'success':
        statusEmoji = '✅'
        statusMessage = 'GitHub Actions workflow completed successfully!'
        if (githubContext.prUrl && githubContext.previewUrl) {
          actionRequired = '\n\n**Next Steps:**\n- Review the implementation in the pull request\n- Test the preview deployment\n- Reply with "merge" to deploy to production'
        }
        break
      case 'failure':
        statusEmoji = '❌'
        statusMessage = 'GitHub Actions workflow failed'
        actionRequired = '\n\n**Action Required:** Please check the workflow logs and address any issues.'
        break
      case 'partial':
        statusEmoji = '⚠️'
        statusMessage = 'GitHub Actions workflow completed with warnings'
        actionRequired = '\n\n**Action Required:** Please review the warnings and ensure everything is working correctly.'
        break
      default:
        statusEmoji = 'ℹ️'
        statusMessage = `GitHub Actions workflow completed with status: ${workflowStatus}`
    }

    // Create a comprehensive completion comment
    const completionComment = `${statusEmoji} **GitHub Actions Workflow Complete**

${statusMessage}

**Workflow Summary:**
- **Repository:** ${githubContext.repository}
- **Run ID:** [${githubContext.runId}](${githubContext.runUrl})
- **Status:** ${workflowStatus.toUpperCase()}
- **Message:** ${message}

${githubContext.prUrl ? `**🔗 Pull Request:** [View Code Changes](${githubContext.prUrl})` : ''}
${githubContext.previewUrl ? `**🌐 Live Preview:** [Test Implementation](${githubContext.previewUrl})` : ''}

**GitHub Actions Details:**
- Build and tests: ${workflowStatus === 'success' ? '✅ Passed' : workflowStatus === 'failure' ? '❌ Failed' : '⚠️ Warning'}
- AI Implementation: ${workflow.status === 'TESTING' || workflow.status === 'READY_TO_MERGE' ? '✅ Complete' : '🔄 In Progress'}
- Preview Deployment: ${githubContext.previewUrl ? '✅ Deployed' : '❌ Not Available'}

${actionRequired}

---
*Automated update from GitHub Actions workflow*`

    try {
      await prisma.comment.create({
        data: {
          content: completionComment,
          type: 'MARKDOWN',
          taskId,
          authorId: mcpToken.user.id
        }
      })

      console.log('✅ [Workflow Complete] Added completion comment to task')
    } catch (commentError) {
      console.error('⚠️ [Workflow Complete] Failed to add completion comment:', commentError)
    }

    // If the workflow was successful and we have PR/preview URLs, we can consider updating the task status
    if (workflowStatus === 'success' && workflow.status !== 'COMPLETED') {
      try {
        // If we have a PR URL, update the workflow status to TESTING (ready for review)
        if (githubContext.prUrl) {
          await prisma.codingTaskWorkflow.update({
            where: { id: workflow.id },
            data: {
              status: 'TESTING',
              deploymentUrl: githubContext.previewUrl || workflow.deploymentUrl,
              metadata: {
                ...updatedWorkflow.metadata as any,
                readyForReview: true
              }
            }
          })

          console.log('✅ [Workflow Complete] Updated workflow status to TESTING')
        }
      } catch (statusError) {
        console.error('⚠️ [Workflow Complete] Failed to update workflow status:', statusError)
      }
    }

    return NextResponse.json({
      success: true,
      taskId,
      workflowId: workflow.id,
      status: workflowStatus,
      message: 'Workflow completion processed successfully',
      actions: {
        commentAdded: true,
        workflowUpdated: true,
        statusUpdated: workflowStatus === 'success' && githubContext.prUrl
      }
    }, { status: 200 })

  } catch (error) {
    console.error('❌ [Workflow Complete] Error:', error)

    return NextResponse.json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
    }, { status: 500 })
  }
}

/**
 * GET endpoint to check the workflow completion service
 */
export async function GET() {
  return NextResponse.json({
    service: 'GitHub Actions Workflow Completion',
    status: 'available',
    version: '1.0.0',
    description: 'Receives completion notifications from GitHub Actions workflows',
    authentication: 'Bearer MCP_TOKEN required',
    expectedPayload: {
      taskId: 'string',
      workflowStatus: 'success | failure | partial',
      message: 'string',
      githubContext: {
        repository: 'string',
        runId: 'string',
        runUrl: 'string',
        prUrl: 'string (optional)',
        previewUrl: 'string (optional)'
      }
    }
  })
}