/**
 * Session Manager
 *
 * Maps Astrid tasks to Claude Code sessions with persistence.
 * Enables session resumption via Claude Code's --resume flag.
 */

import fs from 'fs/promises'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

export type AIProvider = 'claude' | 'openai' | 'gemini' | 'unknown'

export interface Session {
  id: string
  taskId: string
  title: string
  description: string
  projectPath?: string
  /** AI provider used for this session */
  provider?: AIProvider
  /** Provider-specific session ID (e.g., Claude's session ID for --resume) */
  claudeSessionId?: string
  status: 'pending' | 'running' | 'waiting_input' | 'completed' | 'error' | 'interrupted'
  createdAt: string
  updatedAt: string
  messageCount: number
  lastActivity?: string
  metadata?: Record<string, unknown>
}

export interface CreateSessionOptions {
  taskId: string
  title: string
  description: string
  projectPath?: string
  /** AI provider for this session */
  provider?: AIProvider
  metadata?: Record<string, unknown>
}

export class SessionManager {
  private storagePath: string
  private sessions: Map<string, Session> = new Map()
  private loaded = false

  constructor(storagePath?: string) {
    // Default to /app/persistent/sessions to match Fly.io volume mount
    // This ensures sessions persist across container restarts
    const sessionsDir = process.env.SESSIONS_DIR || '/app/persistent/sessions'
    this.storagePath = storagePath || process.env.SESSION_MAP_PATH || `${sessionsDir}/sessions.json`
  }

  /**
   * Load sessions from disk
   */
  async load(): Promise<void> {
    if (this.loaded) return

    try {
      const dir = path.dirname(this.storagePath)
      await fs.mkdir(dir, { recursive: true })

      const data = await fs.readFile(this.storagePath, 'utf-8')
      const parsed = JSON.parse(data) as Record<string, Session>
      this.sessions = new Map(Object.entries(parsed))
      this.loaded = true
      console.log(`📂 Loaded ${this.sessions.size} sessions from ${this.storagePath}`)
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.sessions = new Map()
        this.loaded = true
        console.log(`📂 No existing sessions file, starting fresh`)
      } else {
        throw error
      }
    }
  }

  /**
   * Save sessions to disk
   */
  async save(): Promise<void> {
    try {
      const data = Object.fromEntries(this.sessions)
      const dir = path.dirname(this.storagePath)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(this.storagePath, JSON.stringify(data, null, 2))
    } catch (error) {
      // Log but don't crash - sessions will be in-memory only
      console.error(`⚠️ Failed to persist sessions: ${(error as Error).message}`)
    }
  }

  /**
   * Create a new session for a task
   */
  async createSession(options: CreateSessionOptions): Promise<Session> {
    await this.load()

    const session: Session = {
      id: uuidv4(),
      taskId: options.taskId,
      title: options.title,
      description: options.description,
      projectPath: options.projectPath,
      provider: options.provider || 'claude',
      claudeSessionId: undefined,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      lastActivity: undefined,
      metadata: options.metadata
    }

    this.sessions.set(options.taskId, session)
    await this.save()

    console.log(`📝 Created session ${session.id} for task ${options.taskId} (provider: ${session.provider})`)
    return session
  }

  /**
   * Get session by task ID
   */
  async getByTaskId(taskId: string): Promise<Session | undefined> {
    await this.load()
    return this.sessions.get(taskId)
  }

  /**
   * Get session by session ID
   */
  async getById(sessionId: string): Promise<Session | undefined> {
    await this.load()
    for (const session of this.sessions.values()) {
      if (session.id === sessionId) {
        return session
      }
    }
    return undefined
  }

  /**
   * Update a session
   */
  async updateSession(
    taskId: string,
    updates: Partial<Omit<Session, 'id' | 'taskId' | 'createdAt'>>
  ): Promise<Session | null> {
    await this.load()

    const session = this.sessions.get(taskId)
    if (!session) return null

    Object.assign(session, updates, {
      updatedAt: new Date().toISOString()
    })

    await this.save()
    return session
  }

  /**
   * Set Claude session ID after first response
   */
  async setClaudeSessionId(taskId: string, claudeSessionId: string): Promise<void> {
    await this.updateSession(taskId, {
      claudeSessionId,
      status: 'running',
      lastActivity: new Date().toISOString()
    })
    console.log(`🔗 Linked Claude session ${claudeSessionId} to task ${taskId}`)
  }

  /**
   * Increment message count
   */
  async incrementMessageCount(taskId: string): Promise<void> {
    const session = await this.getByTaskId(taskId)
    if (session) {
      await this.updateSession(taskId, {
        messageCount: session.messageCount + 1,
        lastActivity: new Date().toISOString()
      })
    }
  }

  /**
   * Delete a session
   */
  async deleteSession(taskId: string): Promise<boolean> {
    await this.load()

    if (!this.sessions.has(taskId)) return false

    this.sessions.delete(taskId)
    await this.save()
    console.log(`🗑️ Deleted session for task ${taskId}`)
    return true
  }

  /**
   * Get all sessions
   */
  async getAllSessions(): Promise<Session[]> {
    await this.load()
    return Array.from(this.sessions.values())
  }

  /**
   * Get active sessions (running or waiting_input)
   */
  async getActiveSessions(): Promise<Session[]> {
    await this.load()
    return Array.from(this.sessions.values()).filter(
      s => s.status === 'running' || s.status === 'waiting_input'
    )
  }

  /**
   * Cleanup expired sessions (older than maxAge)
   */
  async cleanupExpired(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    await this.load()

    const now = Date.now()
    let cleaned = 0

    for (const [taskId, session] of this.sessions) {
      const age = now - new Date(session.updatedAt).getTime()
      if (age > maxAgeMs && session.status !== 'running') {
        this.sessions.delete(taskId)
        cleaned++
      }
    }

    if (cleaned > 0) {
      await this.save()
      console.log(`🧹 Cleaned up ${cleaned} expired sessions`)
    }

    return cleaned
  }

  /**
   * Mark interrupted sessions on startup
   */
  async recoverSessions(): Promise<Session[]> {
    await this.load()

    const interrupted: Session[] = []

    for (const session of this.sessions.values()) {
      if (session.status === 'running') {
        session.status = 'interrupted'
        session.updatedAt = new Date().toISOString()
        interrupted.push(session)
      }
    }

    if (interrupted.length > 0) {
      await this.save()
      console.log(`⚠️ Marked ${interrupted.length} sessions as interrupted`)
    }

    return interrupted
  }
}

// Export singleton instance
export const sessionManager = new SessionManager()
