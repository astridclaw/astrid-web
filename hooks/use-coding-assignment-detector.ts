/**
 * Hook to detect when tasks are assigned to coding agents
 *
 * NOTE: This hook only shows UI feedback (toast). The actual webhook triggering
 * happens in the backend via Prisma middleware when the task is saved.
 * See lib/prisma.ts for the centralized webhook logic.
 */

import { useEffect, useRef } from 'react'
import type { Task, User } from '@/types/task'
import { isCodingAgent } from '@/lib/ai-agent-utils'
import { toast } from '@/hooks/use-toast'

export function useCodingAssignmentDetector(
  task: Task,
  onWorkflowCreated?: (workflowId: string) => void
) {
  const previousAssigneeRef = useRef<User | null>(task.assignee || null)

  useEffect(() => {
    const previousAssignee = previousAssigneeRef.current
    const currentAssignee = task.assignee

    // Check if assignment changed to a coding agent
    const wasNotCodingAgent = !previousAssignee || !isCodingAgent(previousAssignee)
    const isNowCodingAgent = currentAssignee && isCodingAgent(currentAssignee)

    if (wasNotCodingAgent && isNowCodingAgent && !task.id.startsWith('new-')) {
      console.log('🤖 [CodingAssignment] Detected assignment to coding agent:', {
        taskId: task.id,
        assignee: currentAssignee.name,
        assigneeId: currentAssignee.id
      })

      // ✅ Just show UI feedback - backend handles webhook via Prisma middleware
      // The PUT /api/tasks/{id} request triggers the middleware which sends the webhook
      toast({
        title: "🤖 AI Agent Assigned",
        description: `${currentAssignee.name} will start working on this task shortly.`,
        variant: "default",
        duration: 5000
      })

      // Call the callback if provided (for any UI state updates)
      if (onWorkflowCreated) {
        // Use task.id as a pseudo-workflow ID since workflow creation is now backend-only
        onWorkflowCreated(task.id)
      }

      console.log('✅ [CodingAssignment] Backend will handle webhook via Prisma middleware')
    }

    // Update previous assignee for next comparison
    previousAssigneeRef.current = currentAssignee || null
  }, [task, onWorkflowCreated])
}
