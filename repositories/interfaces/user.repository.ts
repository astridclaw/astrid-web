/**
 * User Repository Interface
 */

export interface User {
  id: string
  name?: string
  email: string
  isAIAgent: boolean
  aiAgentType?: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface CreateUserData {
  id?: string
  name: string
  email: string
  isAIAgent?: boolean
  aiAgentType?: string
  isActive?: boolean
}

export interface IUserRepository {
  findById(id: string): Promise<User | null>
  findByEmail(email: string): Promise<User | null>
  findFirstAIAgent(): Promise<User | null>
  create(data: CreateUserData): Promise<User>
  update(id: string, data: Partial<User>): Promise<User>
}