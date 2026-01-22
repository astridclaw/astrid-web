/**
 * AI Orchestration Service Interface
 */

export interface IAIOrchestrationService {
  startTaskProcessing(taskId: string, aiAgentUserId: string): Promise<void>
}