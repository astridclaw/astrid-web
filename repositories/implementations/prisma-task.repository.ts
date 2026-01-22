/**
 * Prisma implementation of Task Repository
 */

import { PrismaClient } from '@prisma/client'
import { ITaskRepository, Task, TaskRelations } from '../interfaces/task.repository'

export class PrismaTaskRepository implements ITaskRepository {
  constructor(private prisma: PrismaClient) {}

  async findByIdWithRelations(id: string, relations: TaskRelations = {}): Promise<Task | null> {
    const task = await this.prisma.task.findFirst({
      where: { id },
      include: {
        assignee: relations.includeAssignee ? {
          select: {
            id: true,
            name: true,
            isAIAgent: true,
            aiAgentType: true,
            email: true
          }
        } : false,
        aiAgent: relations.includeAIAgent ? {
          select: {
            id: true,
            name: true,
            service: true,
            agentType: true
          }
        } : false,
        creator: relations.includeCreator ? {
          select: { id: true, name: true, email: true }
        } : false,
        lists: relations.includeLists ? {
          select: { id: true, name: true, description: true }
        } : false,
        comments: relations.includeComments ? true : false,
        attachments: relations.includeAttachments ? true : false
      }
    })

    return task as Task | null
  }

  async findById(id: string): Promise<Task | null> {
    const task = await this.prisma.task.findUnique({
      where: { id }
    })
    return task as Task | null
  }

  async update(id: string, data: Partial<Task>): Promise<Task> {
    const task = await this.prisma.task.update({
      where: { id },
      data: data as any
    })
    return task as Task
  }

  async create(data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const task = await this.prisma.task.create({
      data: data as any
    })
    return task as Task
  }

  async findByAIAgent(aiAgentId: string): Promise<Task[]> {
    const tasks = await this.prisma.task.findMany({
      where: {
        OR: [
          { assigneeId: aiAgentId },
          { aiAgentId: aiAgentId }
        ]
      }
    })
    return tasks as Task[]
  }

  async findByCreator(creatorId: string): Promise<Task[]> {
    const tasks = await this.prisma.task.findMany({
      where: { creatorId }
    })
    return tasks as Task[]
  }
}