/**
 * Astrid API Client
 *
 * Handles outbound communication to Astrid, including callback
 * notifications for session status updates.
 */

import { generateCallbackHeaders } from './webhook-signature.js'

export interface CallbackPayload {
  event: 'session.started' | 'session.completed' | 'session.waiting_input' | 'session.error' | 'session.progress'
  timestamp: string
  sessionId: string
  taskId: string
  data?: {
    message?: string
    summary?: string
    files?: string[]
    prUrl?: string
    error?: string
    question?: string
    options?: string[]
    changes?: string[]
    diff?: string
  }
}

export interface AstridClientConfig {
  callbackUrl: string
  webhookSecret: string
  timeout?: number
}

export class AstridClient {
  private callbackUrl: string
  private webhookSecret: string
  private timeout: number

  constructor(config?: AstridClientConfig) {
    this.callbackUrl = config?.callbackUrl || process.env.ASTRID_CALLBACK_URL || ''
    this.webhookSecret = config?.webhookSecret || process.env.ASTRID_WEBHOOK_SECRET || ''
    this.timeout = config?.timeout || 10000
  }

  /**
   * Check if client is properly configured
   */
  isConfigured(): boolean {
    return Boolean(this.callbackUrl && this.webhookSecret)
  }

  /**
   * Send a callback to Astrid
   */
  async sendCallback(payload: CallbackPayload): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured()) {
      console.log(`⚠️ Astrid callback not configured, skipping notification`)
      return { success: false, error: 'Not configured' }
    }

    try {
      const body = JSON.stringify(payload)
      const headers = generateCallbackHeaders(body, this.webhookSecret, payload.event)

      console.log(`📤 Sending callback to Astrid: ${payload.event}`)

      const response = await fetch(this.callbackUrl, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(this.timeout)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      console.log(`✅ Callback sent successfully`)
      return { success: true }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`❌ Failed to send callback to Astrid: ${errorMessage}`)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Notify Astrid that session has started
   */
  async notifyStarted(taskId: string, sessionId: string, message?: string): Promise<void> {
    await this.sendCallback({
      event: 'session.started',
      timestamp: new Date().toISOString(),
      sessionId,
      taskId,
      data: { message: message || 'Started working on task' }
    })
  }

  /**
   * Notify Astrid that session has completed
   */
  async notifyCompleted(
    taskId: string,
    sessionId: string,
    data: {
      summary?: string
      files?: string[]
      prUrl?: string
      changes?: string[]
      diff?: string
    }
  ): Promise<void> {
    await this.sendCallback({
      event: 'session.completed',
      timestamp: new Date().toISOString(),
      sessionId,
      taskId,
      data
    })
  }

  /**
   * Notify Astrid that session is waiting for user input
   */
  async notifyWaitingInput(
    taskId: string,
    sessionId: string,
    question: string,
    options?: string[],
    data?: {
      files?: string[]
      prUrl?: string
      diff?: string
    }
  ): Promise<void> {
    await this.sendCallback({
      event: 'session.waiting_input',
      timestamp: new Date().toISOString(),
      sessionId,
      taskId,
      data: {
        question,
        options,
        ...data
      }
    })
  }

  /**
   * Notify Astrid about progress
   */
  async notifyProgress(taskId: string, sessionId: string, message: string): Promise<void> {
    await this.sendCallback({
      event: 'session.progress',
      timestamp: new Date().toISOString(),
      sessionId,
      taskId,
      data: { message }
    })
  }

  /**
   * Notify Astrid that an error occurred
   */
  async notifyError(taskId: string, sessionId: string, error: string, context?: string): Promise<void> {
    await this.sendCallback({
      event: 'session.error',
      timestamp: new Date().toISOString(),
      sessionId,
      taskId,
      data: { error, message: context }
    })
  }
}

// Export singleton instance
export const astridClient = new AstridClient()
