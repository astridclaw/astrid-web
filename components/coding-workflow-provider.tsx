"use client"

/**
 * Global provider for coding workflow management
 * Handles SSE events and workflow orchestration
 */

import { useCodingWorkflow } from '@/hooks/use-coding-workflow'
import { useSession } from 'next-auth/react'

export function CodingWorkflowProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession()

  // Always call the hook (Rules of Hooks), but it will handle auth internally
  useCodingWorkflow()

  // This provider doesn't render anything, just handles global coding workflow logic
  return <>{children}</>
}