import { NextResponse } from 'next/server'
import { AIOrchestrator } from '@/lib/ai-orchestrator'

export async function POST(request: Request) {
  try {
    const { userId, taskId, workflowId } = await request.json()

    console.log('🧪 Testing AI Orchestrator...')
    console.log('   User ID:', userId)
    console.log('   Task ID:', taskId)
    console.log('   Workflow ID:', workflowId)

    // Try to create orchestrator
    const orchestrator = await AIOrchestrator.createForTask(taskId, userId)
    console.log('✅ Orchestrator created successfully')

    // Return success
    return NextResponse.json({
      success: true,
      message: 'Orchestrator created successfully'
    })

  } catch (error) {
    console.error('❌ Orchestrator test failed:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}
