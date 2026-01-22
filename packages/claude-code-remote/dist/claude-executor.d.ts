/**
 * Claude Code CLI Executor
 *
 * Manages Claude Code CLI interactions with session support.
 * Uses --print for non-interactive mode and --resume for session continuity.
 */
import type { Session } from './session-manager';
export interface ExecutionResult {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    sessionId?: string;
    gitDiff?: string;
    modifiedFiles?: string[];
    prUrl?: string;
}
export interface ClaudeExecutorOptions {
    model?: string;
    maxTurns?: number;
    timeout?: number;
}
export interface TaskContext {
    comments?: Array<{
        authorName: string;
        content: string;
        createdAt: string;
    }>;
    prUrl?: string;
    repository?: string;
    mcpToken?: string;
    model?: string;
}
export declare class ClaudeExecutor {
    private model;
    private maxTurns;
    private timeout;
    constructor(options?: ClaudeExecutorOptions);
    /**
     * Create MCP config file for Claude Code
     * Returns the path to the config file, or undefined if no MCP token
     */
    createMcpConfig(session: Session, mcpToken?: string): Promise<string | undefined>;
    /**
     * Clean up MCP config file after session
     */
    cleanupMcpConfig(session: Session): Promise<void>;
    /**
     * Capture git diff and modified files after execution
     */
    captureGitChanges(projectPath: string): Promise<{
        diff: string;
        files: string[];
    }>;
    /**
     * Extract PR URL from Claude output
     */
    extractPrUrl(output: string): string | undefined;
    /**
     * Read CLAUDE.md or ASTRID.md from project for context
     * Limits context to MAX_CONTEXT_CHARS to avoid API timeouts
     */
    readProjectContext(projectPath: string): Promise<string>;
    /**
     * Format comment history for context
     */
    formatCommentHistory(comments?: TaskContext['comments']): string;
    /**
     * Detect platform from task title and description
     */
    detectPlatform(title: string, description?: string): {
        platform: 'ios' | 'android' | 'web' | 'unknown';
        confidence: 'high' | 'medium' | 'low';
    };
    /**
     * Get platform-specific instructions
     */
    getPlatformInstructions(platform: 'ios' | 'android' | 'web' | 'unknown'): string;
    /**
     * Build prompt from task details
     */
    buildPrompt(session: Session, userMessage?: string, context?: TaskContext): Promise<string>;
    /**
     * Start a new Claude Code session
     */
    startSession(session: Session, prompt?: string, context?: TaskContext, onProgress?: (message: string) => void): Promise<ExecutionResult>;
    /**
     * Resume an existing Claude Code session
     */
    resumeSession(session: Session, input: string, context?: TaskContext, onProgress?: (message: string) => void): Promise<ExecutionResult>;
    /**
     * Execute Claude Code CLI with enhanced timeout and error handling
     */
    private runClaude;
    /**
     * Parse Claude Code output to extract key information
     */
    parseOutput(output: string): {
        summary?: string;
        files?: string[];
        prUrl?: string;
        question?: string;
        error?: string;
    };
    /**
     * Check if Claude Code is available
     */
    checkAvailable(): Promise<boolean>;
}
export declare const claudeExecutor: ClaudeExecutor;
//# sourceMappingURL=claude-executor.d.ts.map