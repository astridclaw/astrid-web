/**
 * Comment Repository Interface
 */

export interface Comment {
  id: string
  content: string
  type: 'TEXT' | 'MARKDOWN'
  taskId: string
  authorId: string
  createdAt: Date
  updatedAt: Date
}

export interface CreateCommentData {
  content: string
  type: 'TEXT' | 'MARKDOWN'
  taskId: string
  authorId: string
}

export interface ICommentRepository {
  create(data: CreateCommentData): Promise<Comment>
  findByTask(taskId: string): Promise<Comment[]>
  findById(id: string): Promise<Comment | null>
}