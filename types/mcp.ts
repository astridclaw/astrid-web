export type MCPAccessLevel = 'READ' | 'WRITE' | 'BOTH'

export interface MCPToken {
  id: string
  token: string
  listId: string
  userId: string
  permissions: string[]
  description?: string
  expiresAt?: Date | string
  createdAt: Date | string
  updatedAt: Date | string
  isActive: boolean
  list?: {
    id: string
    name: string
    mcpEnabled: boolean
    mcpAccessLevel: MCPAccessLevel
  }
  user?: {
    id: string
    name?: string
    email: string
  }
}

export interface MCPUserSettings {
  mcpEnabled: boolean
  allowedDomains?: string[]
  maxTokensPerList?: number
  defaultTokenExpiration?: number // days
}

export interface MCPListSettings {
  mcpEnabled: boolean
  mcpAccessLevel: MCPAccessLevel
}

export interface MCPTokenValidation {
  user: {
    id: string
    name?: string
    email: string
    mcpEnabled: boolean
  }
  permissions: string[]
  list: {
    id: string
    name: string
    mcpEnabled: boolean
    mcpAccessLevel: MCPAccessLevel
    ownerId: string
  }
}

export interface MCPTaskCreateData {
  title: string
  description?: string
  priority?: number
  assigneeId?: string
  dueDateTime?: string
  reminderTime?: string
  reminderType?: 'push' | 'email' | 'both'
  isPrivate?: boolean
}

export interface MCPTaskUpdateData extends Partial<MCPTaskCreateData> {
  completed?: boolean
}

export interface MCPCommentData {
  content: string
  type?: 'TEXT' | 'MARKDOWN'
}

export interface MCPAccessibleList {
  id: string
  name: string
  description?: string
  color: string
  privacy: string
  owner: {
    id: string
    name?: string
    email: string
  }
  taskCount: number
  permissions: string[]
  mcpAccessLevel: MCPAccessLevel
}