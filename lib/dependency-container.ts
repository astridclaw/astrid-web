/**
 * Dependency Injection Container
 *
 * Provides a centralized way to manage dependencies
 * Makes it easy to swap implementations for testing or different platforms
 */

import { PrismaClient } from '@prisma/client'
import { AIAgentWebhookController } from '@/controllers/ai-agent-webhook.controller'

// Repository implementations
import { PrismaTaskRepository } from '@/repositories/implementations/prisma-task.repository'
import { PrismaUserRepository } from '@/repositories/implementations/prisma-user.repository'
import { PrismaCommentRepository } from '@/repositories/implementations/prisma-comment.repository'

// Service implementations
import { NotificationService } from '@/services/implementations/notification.service'
import { AIOrchestrationService } from '@/services/implementations/ai-orchestration.service'

// Repository interfaces
import { ITaskRepository } from '@/repositories/interfaces/task.repository'
import { IUserRepository } from '@/repositories/interfaces/user.repository'
import { ICommentRepository } from '@/repositories/interfaces/comment.repository'
import { IAIAgentRepository, AIAgent } from '@/repositories/interfaces/ai-agent.repository'

// Service interfaces
import { INotificationService } from '@/services/interfaces/notification.service'
import { IAIOrchestrationService } from '@/services/interfaces/ai-orchestration.service'

// Placeholder AI Agent Repository (we don't have this implemented yet)
class MockAIAgentRepository implements IAIAgentRepository {
  async findById(id: string): Promise<AIAgent | null> { return null }
  async findByService(service: string): Promise<AIAgent[]> { return [] }
  async findActive(): Promise<AIAgent[]> { return [] }
  async update(id: string, data: Partial<AIAgent>): Promise<AIAgent> {
    throw new Error('Not implemented')
  }
  async create(data: Omit<AIAgent, 'id' | 'createdAt' | 'updatedAt'>): Promise<AIAgent> {
    throw new Error('Not implemented')
  }
}

export class DependencyContainer {
  private static instance: DependencyContainer
  private prisma: PrismaClient

  // Repositories
  private taskRepository: ITaskRepository
  private userRepository: IUserRepository
  private commentRepository: ICommentRepository
  private aiAgentRepository: IAIAgentRepository

  // Services
  private notificationService: INotificationService
  private aiOrchestrationService: IAIOrchestrationService

  // Controllers
  private aiAgentWebhookController: AIAgentWebhookController

  private constructor() {
    // Initialize Prisma client
    this.prisma = new PrismaClient()

    // Initialize repositories
    this.taskRepository = new PrismaTaskRepository(this.prisma)
    this.userRepository = new PrismaUserRepository(this.prisma)
    this.commentRepository = new PrismaCommentRepository(this.prisma)
    this.aiAgentRepository = new MockAIAgentRepository() // TODO: Implement proper AIAgent repository

    // Initialize services
    this.notificationService = new NotificationService()
    this.aiOrchestrationService = new AIOrchestrationService(this.prisma)

    // Initialize controllers
    this.aiAgentWebhookController = new AIAgentWebhookController(
      this.taskRepository,
      this.aiAgentRepository,
      this.userRepository,
      this.commentRepository,
      this.notificationService,
      this.aiOrchestrationService
    )
  }

  static getInstance(): DependencyContainer {
    if (!DependencyContainer.instance) {
      DependencyContainer.instance = new DependencyContainer()
    }
    return DependencyContainer.instance
  }

  // Repository getters
  getTaskRepository(): ITaskRepository {
    return this.taskRepository
  }

  getUserRepository(): IUserRepository {
    return this.userRepository
  }

  getCommentRepository(): ICommentRepository {
    return this.commentRepository
  }

  getAIAgentRepository(): IAIAgentRepository {
    return this.aiAgentRepository
  }

  // Service getters
  getNotificationService(): INotificationService {
    return this.notificationService
  }

  getAIOrchestrationService(): IAIOrchestrationService {
    return this.aiOrchestrationService
  }

  // Controller getters
  getAIAgentWebhookController(): AIAgentWebhookController {
    return this.aiAgentWebhookController
  }

  // Database getters
  getPrismaClient(): PrismaClient {
    return this.prisma
  }

  // Cleanup method
  async cleanup(): Promise<void> {
    await this.prisma.$disconnect()
  }
}