/**
 * Session Manager
 *
 * Maps Astrid tasks to Claude Code sessions with persistence.
 * Enables session resumption via Claude Code's --resume flag.
 */
export type AIProvider = 'claude' | 'openai' | 'gemini' | 'unknown';
export interface Session {
    id: string;
    taskId: string;
    title: string;
    description: string;
    projectPath?: string;
    /** AI provider used for this session */
    provider?: AIProvider;
    /** Provider-specific session ID (e.g., Claude's session ID for --resume) */
    claudeSessionId?: string;
    status: 'pending' | 'running' | 'waiting_input' | 'completed' | 'error' | 'interrupted';
    createdAt: string;
    updatedAt: string;
    messageCount: number;
    lastActivity?: string;
    metadata?: Record<string, unknown>;
}
export interface CreateSessionOptions {
    taskId: string;
    title: string;
    description: string;
    projectPath?: string;
    /** AI provider for this session */
    provider?: AIProvider;
    metadata?: Record<string, unknown>;
}
export declare class SessionManager {
    private storagePath;
    private sessions;
    private loaded;
    constructor(storagePath?: string);
    /**
     * Load sessions from disk
     */
    load(): Promise<void>;
    /**
     * Save sessions to disk
     */
    save(): Promise<void>;
    /**
     * Create a new session for a task
     */
    createSession(options: CreateSessionOptions): Promise<Session>;
    /**
     * Get session by task ID
     */
    getByTaskId(taskId: string): Promise<Session | undefined>;
    /**
     * Get session by session ID
     */
    getById(sessionId: string): Promise<Session | undefined>;
    /**
     * Update a session
     */
    updateSession(taskId: string, updates: Partial<Omit<Session, 'id' | 'taskId' | 'createdAt'>>): Promise<Session | null>;
    /**
     * Set Claude session ID after first response
     */
    setClaudeSessionId(taskId: string, claudeSessionId: string): Promise<void>;
    /**
     * Increment message count
     */
    incrementMessageCount(taskId: string): Promise<void>;
    /**
     * Delete a session
     */
    deleteSession(taskId: string): Promise<boolean>;
    /**
     * Get all sessions
     */
    getAllSessions(): Promise<Session[]>;
    /**
     * Get active sessions (running or waiting_input)
     */
    getActiveSessions(): Promise<Session[]>;
    /**
     * Cleanup expired sessions (older than maxAge)
     */
    cleanupExpired(maxAgeMs?: number): Promise<number>;
    /**
     * Mark interrupted sessions on startup
     */
    recoverSessions(): Promise<Session[]>;
}
export declare const sessionManager: SessionManager;
//# sourceMappingURL=session-manager.d.ts.map