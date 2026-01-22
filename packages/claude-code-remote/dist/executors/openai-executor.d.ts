/**
 * OpenAI Executor for Code Remote Server
 *
 * Executes tasks using the OpenAI API with function calling.
 * Provides the same interface as the Claude executor for seamless routing.
 */
import type { Session } from '../session-manager';
import type { ExecutionResult, TaskContext } from '../claude-executor';
export declare class OpenAIExecutor {
    private model;
    private maxIterations;
    private apiKey;
    constructor();
    /**
     * Read CLAUDE.md or ASTRID.md from project for context
     */
    private readProjectContext;
    /**
     * Format comment history for context
     */
    private formatCommentHistory;
    /**
     * Build the system prompt
     */
    private buildSystemPrompt;
    /**
     * Start a new session
     */
    startSession(session: Session, prompt?: string, context?: TaskContext, onProgress?: (message: string) => void): Promise<ExecutionResult>;
    /**
     * Resume an existing session
     *
     * Note: OpenAI doesn't have built-in session resumption like Claude Code,
     * so we essentially start a new session with the additional context.
     */
    resumeSession(session: Session, input: string, context?: TaskContext, onProgress?: (message: string) => void): Promise<ExecutionResult>;
    /**
     * Parse output to extract key information
     */
    parseOutput(output: string): {
        summary?: string;
        files?: string[];
        prUrl?: string;
        question?: string;
        error?: string;
    };
    /**
     * Check if OpenAI is available
     */
    checkAvailable(): Promise<boolean>;
}
export declare const openaiExecutor: OpenAIExecutor;
//# sourceMappingURL=openai-executor.d.ts.map