import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { isCodingAgent } from '../lib/ai-agent-utils'

config({ path: '.env.local' })

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL_PROD
    }
  }
})

async function main() {
  const userEmail = 'jonparis@gmail.com'
  const userId = 'cmeje966q0000k1045si7zrz3'

  console.log(`\n🔍 Diagnosing GitHub integration for coding agent`)
  console.log(`📧 User: ${userEmail}`)
  console.log(`🆔 User ID: ${userId}\n`)

  // 1. Check user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true }
  })

  if (!user) {
    console.log(`❌ User not found!`)
    return
  }

  console.log(`✅ User found: ${user.name} (${user.email})`)

  // 2. Check GitHub integration
  const integration = await prisma.gitHubIntegration.findFirst({
    where: { userId },
    select: {
      userId: true,
      installationId: true,
      isSharedApp: true,
      appId: true
    }
  })

  if (!integration) {
    console.log(`❌ No GitHub integration found for this user\n`)
    return
  }

  console.log(`✅ GitHub integration found:`)
  console.log(`   Installation ID: ${integration.installationId}`)
  console.log(`   Shared App: ${integration.isSharedApp}`)
  console.log(`   App ID: ${integration.appId || 'null'}\n`)

  // 3. Find lists where this user is the AI agent configurator
  const listsConfigured = await prisma.taskList.findMany({
    where: {
      aiAgentConfiguredBy: userId
    },
    select: {
      id: true,
      name: true,
      githubRepositoryId: true,
      aiAgentConfiguredBy: true
    }
  })

  console.log(`📋 Lists where user is AI agent configurator: ${listsConfigured.length}`)
  listsConfigured.forEach(list => {
    console.log(`   - ${list.name} (${list.id})`)
    console.log(`     GitHub repo: ${list.githubRepositoryId || 'not set'}`)
  })

  // 4. Find tasks created by this user and assigned to coding agent
  const allAgents = await prisma.user.findMany({
    where: {
      isAIAgent: true
    },
    select: { id: true, name: true, aiAgentType: true, isAIAgent: true }
  })

  console.log('\n🔍 All AI agents:', allAgents.map(a => ({ name: a.name, type: a.aiAgentType })))

  const codingAgents = allAgents.filter(agent => {
    const result = isCodingAgent(agent)
    console.log(`  Checking ${agent.name} (${agent.aiAgentType}): ${result}`)
    return result
  })
  const codingAgent = codingAgents[0] || null

  console.log(`\n🤖 Coding agents found: ${codingAgents.length}`)
  codingAgents.forEach(agent => {
    console.log(`   - ${agent.name} (${agent.id})`)
    console.log(`     Type: ${agent.aiAgentType}`)
  })

  if (!codingAgent) {
    console.log(`\n⚠️  No coding agent available for task assignment`)
    return
  }

  console.log(`\n🤖 Coding agent: ${codingAgent.name} (${codingAgent.id})`)

  const assignedTasks = await prisma.task.findMany({
    where: {
      assigneeId: codingAgent.id,
      creatorId: userId
    },
    select: {
      id: true,
      title: true,
      completed: true
    },
    take: 5
  })

  console.log(`\n📝 Tasks assigned to coding agent (created by user): ${assignedTasks.length}`)
  assignedTasks.forEach(task => {
    console.log(`   - ${task.title} (${task.completed ? 'completed' : 'active'})`)
  })

  console.log(`\n✅ Diagnosis complete!`)
}

main().finally(() => prisma.$disconnect())
