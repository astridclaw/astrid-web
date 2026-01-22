/**
 * Notification Service Interface
 */

export interface INotificationService {
  notifyTaskAssignment(task: any, aiAgent: any): Promise<void>
  notifyTaskUpdate(task: any, aiAgent: any): Promise<void>
  notifyCommentResponse(task: any, aiAgent: any, comment: any): Promise<void>
}