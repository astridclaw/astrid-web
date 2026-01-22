"use strict";
/**
 * Session Manager
 *
 * Maps Astrid tasks to Claude Code sessions with persistence.
 * Enables session resumption via Claude Code's --resume flag.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionManager = exports.SessionManager = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
class SessionManager {
    storagePath;
    sessions = new Map();
    loaded = false;
    constructor(storagePath) {
        // Default to /app/persistent/sessions to match Fly.io volume mount
        // This ensures sessions persist across container restarts
        const sessionsDir = process.env.SESSIONS_DIR || '/app/persistent/sessions';
        this.storagePath = storagePath || process.env.SESSION_MAP_PATH || `${sessionsDir}/sessions.json`;
    }
    /**
     * Load sessions from disk
     */
    async load() {
        if (this.loaded)
            return;
        try {
            const dir = path_1.default.dirname(this.storagePath);
            await promises_1.default.mkdir(dir, { recursive: true });
            const data = await promises_1.default.readFile(this.storagePath, 'utf-8');
            const parsed = JSON.parse(data);
            this.sessions = new Map(Object.entries(parsed));
            this.loaded = true;
            console.log(`📂 Loaded ${this.sessions.size} sessions from ${this.storagePath}`);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                this.sessions = new Map();
                this.loaded = true;
                console.log(`📂 No existing sessions file, starting fresh`);
            }
            else {
                throw error;
            }
        }
    }
    /**
     * Save sessions to disk
     */
    async save() {
        try {
            const data = Object.fromEntries(this.sessions);
            const dir = path_1.default.dirname(this.storagePath);
            await promises_1.default.mkdir(dir, { recursive: true });
            await promises_1.default.writeFile(this.storagePath, JSON.stringify(data, null, 2));
        }
        catch (error) {
            // Log but don't crash - sessions will be in-memory only
            console.error(`⚠️ Failed to persist sessions: ${error.message}`);
        }
    }
    /**
     * Create a new session for a task
     */
    async createSession(options) {
        await this.load();
        const session = {
            id: (0, uuid_1.v4)(),
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
        };
        this.sessions.set(options.taskId, session);
        await this.save();
        console.log(`📝 Created session ${session.id} for task ${options.taskId} (provider: ${session.provider})`);
        return session;
    }
    /**
     * Get session by task ID
     */
    async getByTaskId(taskId) {
        await this.load();
        return this.sessions.get(taskId);
    }
    /**
     * Get session by session ID
     */
    async getById(sessionId) {
        await this.load();
        for (const session of this.sessions.values()) {
            if (session.id === sessionId) {
                return session;
            }
        }
        return undefined;
    }
    /**
     * Update a session
     */
    async updateSession(taskId, updates) {
        await this.load();
        const session = this.sessions.get(taskId);
        if (!session)
            return null;
        Object.assign(session, updates, {
            updatedAt: new Date().toISOString()
        });
        await this.save();
        return session;
    }
    /**
     * Set Claude session ID after first response
     */
    async setClaudeSessionId(taskId, claudeSessionId) {
        await this.updateSession(taskId, {
            claudeSessionId,
            status: 'running',
            lastActivity: new Date().toISOString()
        });
        console.log(`🔗 Linked Claude session ${claudeSessionId} to task ${taskId}`);
    }
    /**
     * Increment message count
     */
    async incrementMessageCount(taskId) {
        const session = await this.getByTaskId(taskId);
        if (session) {
            await this.updateSession(taskId, {
                messageCount: session.messageCount + 1,
                lastActivity: new Date().toISOString()
            });
        }
    }
    /**
     * Delete a session
     */
    async deleteSession(taskId) {
        await this.load();
        if (!this.sessions.has(taskId))
            return false;
        this.sessions.delete(taskId);
        await this.save();
        console.log(`🗑️ Deleted session for task ${taskId}`);
        return true;
    }
    /**
     * Get all sessions
     */
    async getAllSessions() {
        await this.load();
        return Array.from(this.sessions.values());
    }
    /**
     * Get active sessions (running or waiting_input)
     */
    async getActiveSessions() {
        await this.load();
        return Array.from(this.sessions.values()).filter(s => s.status === 'running' || s.status === 'waiting_input');
    }
    /**
     * Cleanup expired sessions (older than maxAge)
     */
    async cleanupExpired(maxAgeMs = 24 * 60 * 60 * 1000) {
        await this.load();
        const now = Date.now();
        let cleaned = 0;
        for (const [taskId, session] of this.sessions) {
            const age = now - new Date(session.updatedAt).getTime();
            if (age > maxAgeMs && session.status !== 'running') {
                this.sessions.delete(taskId);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            await this.save();
            console.log(`🧹 Cleaned up ${cleaned} expired sessions`);
        }
        return cleaned;
    }
    /**
     * Mark interrupted sessions on startup
     */
    async recoverSessions() {
        await this.load();
        const interrupted = [];
        for (const session of this.sessions.values()) {
            if (session.status === 'running') {
                session.status = 'interrupted';
                session.updatedAt = new Date().toISOString();
                interrupted.push(session);
            }
        }
        if (interrupted.length > 0) {
            await this.save();
            console.log(`⚠️ Marked ${interrupted.length} sessions as interrupted`);
        }
        return interrupted;
    }
}
exports.SessionManager = SessionManager;
// Export singleton instance
exports.sessionManager = new SessionManager();
//# sourceMappingURL=session-manager.js.map