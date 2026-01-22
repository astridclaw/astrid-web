/**
 * Phase 2: Coding Workflow Hook
 * Handles task assignments to the coding agent and workflow management
 */

import { useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useCodingWorkflowSSEEvents, type CodingWorkflowEventData } from '@/hooks/use-sse-subscription'

// Types for coding workflow
export interface CodingWorkflowEvent {
  type: 'coding_task_assigned' | 'coding_plan_ready' | 'coding_implementation_ready' | 'coding_task_completed' | 'coding_task_failed'
  taskId: string
  workflowId?: string
  userId: string
  data?: CodingWorkflowEventData
}

export interface CodingTaskAssignment {
  taskId: string
  assigneeId: string
  aiService?: 'claude' | 'openai' | 'gemini'
  repositoryId?: string
}

/**
 * Hook for managing coding workflow events and task assignments
 */
export function useCodingWorkflow() {
  // SSE subscriptions are handled below via useCodingWorkflowSSEEvents hook
  const { status } = useSession()

  // Only set up event listeners when authenticated
  const shouldInitialize = status === 'authenticated'

  // Handle task assignment to coding agent
  const handleTaskAssigned = useCallback(async (data: CodingWorkflowEventData) => {
    console.log('🤖 [CodingWorkflow] Task assigned to coding agent:', data)

    try {
      const { taskId, assigneeId, aiService } = data

      // Create coding workflow record
      const response = await fetch('/api/coding-workflow/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          assigneeId,
          aiService: aiService || 'claude' // Default to Claude
        })
      })

      if (!response.ok) {
        throw new Error(`Failed to create coding workflow: ${response.statusText}`)
      }

      const workflow = await response.json()
      console.log('✅ [CodingWorkflow] Workflow created:', workflow.id)

      // Trigger the coding agent to start planning
      await fetch('/api/coding-workflow/start-planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: workflow.id,
          taskId
        })
      })

      console.log('🎯 [CodingWorkflow] Planning phase initiated')

    } catch (error) {
      console.error('❌ [CodingWorkflow] Error handling task assignment:', error)
    }
  }, [])

  // Handle user approval of coding plan
  const handlePlanApproval = useCallback(async (data: CodingWorkflowEventData) => {
    console.log('✅ [CodingWorkflow] Plan approved:', data)

    try {
      const { workflowId, taskId, commentId } = data

      // Start implementation phase
      await fetch('/api/coding-workflow/start-implementation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId,
          taskId,
          approvalCommentId: commentId
        })
      })

      console.log('⚙️ [CodingWorkflow] Implementation phase started')

    } catch (error) {
      console.error('❌ [CodingWorkflow] Error handling plan approval:', error)
    }
  }, [])

  // Handle merge request
  const handleMergeRequest = useCallback(async (data: CodingWorkflowEventData) => {
    console.log('🔀 [CodingWorkflow] Merge requested:', data)

    try {
      const { workflowId, taskId, commentId } = data

      // Start merge process
      await fetch('/api/coding-workflow/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId,
          taskId,
          mergeRequestCommentId: commentId
        })
      })

      console.log('🎉 [CodingWorkflow] Merge process initiated')

    } catch (error) {
      console.error('❌ [CodingWorkflow] Error handling merge request:', error)
    }
  }, [])

  // Set up coding workflow SSE events using centralized SSE Manager
  useCodingWorkflowSSEEvents({
    onTaskAssigned: handleTaskAssigned,
    onPlanApproved: handlePlanApproval,
    onMergeRequested: handleMergeRequest,
    onTaskCompleted: (event) => {
      console.log('✅ [CodingWorkflow] Task completed successfully:', event)
    },
    onTaskFailed: (event) => {
      console.error('❌ [CodingWorkflow] Task failed:', event)
    }
  }, {
    enabled: shouldInitialize,
    componentName: 'CodingWorkflow'
  })

  // Utility functions for checking coding agent status
  const isCodingAgent = useCallback(async (userId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/users/${userId}/is-coding-agent`)
      if (!response.ok) return false

      const { isCodingAgent } = await response.json()
      return isCodingAgent
    } catch (error) {
      console.error('Error checking if user is coding agent:', error)
      return false
    }
  }, [])

  const getCodingAgentId = useCallback(async (): Promise<string | null> => {
    try {
      const response = await fetch('/api/coding-agent/info')
      if (!response.ok) return null

      const { agentId } = await response.json()
      return agentId
    } catch (error) {
      console.error('Error getting coding agent ID:', error)
      return null
    }
  }, [])

  const getWorkflowStatus = useCallback(async (taskId: string) => {
    try {
      const response = await fetch(`/api/coding-workflow/status/${taskId}`)
      if (!response.ok) return null

      return await response.json()
    } catch (error) {
      console.error('Error getting workflow status:', error)
      return null
    }
  }, [])

  // Function to manually trigger coding workflow (for testing)
  const triggerCodingWorkflow = useCallback(async (assignment: CodingTaskAssignment) => {
    try {
      console.log('🎯 [CodingWorkflow] Manually triggering workflow:', assignment)

      // Check if assignee is coding agent
      const isAgent = await isCodingAgent(assignment.assigneeId)
      if (!isAgent) {
        console.log('⚠️ [CodingWorkflow] Assignee is not a coding agent')
        return false
      }

      // Simulate SSE event for testing
      await handleTaskAssigned({
        taskId: assignment.taskId,
        assigneeId: assignment.assigneeId,
        aiService: assignment.aiService
      })

      return true
    } catch (error) {
      console.error('❌ [CodingWorkflow] Error triggering workflow:', error)
      return false
    }
  }, [handleTaskAssigned, isCodingAgent])

  return {
    // Status
    shouldInitialize,

    // Utility functions
    isCodingAgent,
    getCodingAgentId,
    getWorkflowStatus,

    // Manual triggers (for testing)
    triggerCodingWorkflow,

    // Event handlers (exposed for testing)
    handleTaskAssigned,
    handlePlanApproval,
    handleMergeRequest
  }
}

/**
 * Hook for components that need to detect coding agent assignments
 */
export function useCodingAgentDetection() {
  const { getCodingAgentId, isCodingAgent } = useCodingWorkflow()

  const checkIfCodingTaskAssignment = useCallback(async (assigneeId: string): Promise<boolean> => {
    return await isCodingAgent(assigneeId)
  }, [isCodingAgent])

  const getCodingAgent = useCallback(async () => {
    return await getCodingAgentId()
  }, [getCodingAgentId])

  return {
    checkIfCodingTaskAssignment,
    getCodingAgent
  }
}