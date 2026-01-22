/**
 * Gemini Executor for Code Remote Server
 *
 * Executes tasks using the Google Gemini API with function calling.
 * Provides the same interface as the Claude executor for seamless routing.
 */
import type { Session } from '../session-manager';
import type { ExecutionResult, TaskContext } from '../claude-executor';
export declare class GeminiExecutor {
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
     * Build the system instruction
     */
    private buildSystemInstruction;
    /**
     * Start a new session
     */
    startSession(session: Session, prompt?: string, context?: TaskContext, onProgress?: (message: string) => void): Promise<ExecutionResult>;
    /**
     * Resume an existing session
     *
     * Note: Gemini doesn't have built-in session resumption,
     * so we start a new session with the additional context.
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
     * Check if Gemini is available
     */
    checkAvailable(): Promise<boolean>;
}
export declare const geminiExecutor: GeminiExecutor;
//# sourceMappingURL=gemini-executor.d.ts.map