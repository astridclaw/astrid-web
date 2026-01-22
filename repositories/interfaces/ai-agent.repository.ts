/**
 * AI Agent Repository Interface
 */

export interface AIAgent {
  id: string
  name: string
  service: string
  agentType: string
  webhookUrl?: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface IAIAgentRepository {
  findById(id: string): Promise<AIAgent | null>
  findByService(service: string): Promise<AIAgent[]>
  findActive(): Promise<AIAgent[]>
  update(id: string, data: Partial<AIAgent>): Promise<AIAgent>
  create(data: Omit<AIAgent, 'id' | 'createdAt' | 'updatedAt'>): Promise<AIAgent>
}