/**
 * Prisma implementation of User Repository
 */

import { PrismaClient } from '@prisma/client'
import { IUserRepository, User, CreateUserData } from '../interfaces/user.repository'

export class PrismaUserRepository implements IUserRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(id: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        isAIAgent: true,
        aiAgentType: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    })
    return user as User | null
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        isAIAgent: true,
        aiAgentType: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    })
    return user as User | null
  }

  async findFirstAIAgent(): Promise<User | null> {
    const user = await this.prisma.user.findFirst({
      where: { isAIAgent: true, isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        isAIAgent: true,
        aiAgentType: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    })
    return user as User | null
  }

  async create(data: CreateUserData): Promise<User> {
    const user = await this.prisma.user.create({
      data: {
        ...data,
        isAIAgent: data.isAIAgent ?? false,
        isActive: data.isActive ?? true
      },
      select: {
        id: true,
        name: true,
        email: true,
        isAIAgent: true,
        aiAgentType: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    })
    return user as User
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    const user = await this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        isAIAgent: true,
        aiAgentType: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    })
    return user as User
  }
}