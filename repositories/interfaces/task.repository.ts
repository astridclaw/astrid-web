/**
 * Task Repository Interface
 *
 * Defines the contract for task data access
 * Platform-agnostic interface that can be implemented for different databases
 */

export interface TaskRelations {
  includeAssignee?: boolean
  includeAIAgent?: boolean
  includeCreator?: boolean
  includeLists?: boolean
  includeComments?: boolean
  includeAttachments?: boolean
}

export interface Task {
  id: string
  title: string
  description: string
  priority: number
  completed: boolean
  dueDateTime?: Date
  assigneeId?: string
  aiAgentId?: string
  creatorId: string
  createdAt: Date
  updatedAt: Date

  // Relations (populated based on includes)
  assignee?: any
  aiAgent?: any
  creator?: any
  lists?: any[]
  comments?: any[]
  attachments?: any[]
}

export interface ITaskRepository {
  /**
   * Find task by ID with optional relations
   */
  findByIdWithRelations(id: string, relations?: TaskRelations): Promise<Task | null>

  /**
   * Find task by ID (simple)
   */
  findById(id: string): Promise<Task | null>

  /**
   * Update task
   */
  update(id: string, data: Partial<Task>): Promise<Task>

  /**
   * Create task
   */
  create(data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task>

  /**
   * Find tasks assigned to AI agent
   */
  findByAIAgent(aiAgentId: string): Promise<Task[]>

  /**
   * Find tasks by creator
   */
  findByCreator(creatorId: string): Promise<Task[]>
}