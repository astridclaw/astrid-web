/**
 * Executor Router
 *
 * Routes task execution to the appropriate provider (Claude, OpenAI, Gemini)
 * based on the AI agent email pattern.
 */
import type { Session } from '../session-manager';
import type { ExecutionResult, TaskContext } from '../claude-executor';
export type AIProvider = 'claude' | 'openai' | 'gemini' | 'unknown';
/**
 * Detect the AI provider from the agent email or type
 */
export declare function detectProvider(aiAgent: {
    email?: string;
    type?: string;
}): AIProvider;
/**
 * Check if a provider is available based on environment configuration
 */
export declare function isProviderAvailable(provider: AIProvider): boolean;
/**
 * Get the display name for a provider
 */
export declare function getProviderName(provider: AIProvider): string;
export interface ExecutorInterface {
    startSession(session: Session, prompt?: string, context?: TaskContext, onProgress?: (message: string) => void): Promise<ExecutionResult>;
    resumeSession(session: Session, input: string, context?: TaskContext, onProgress?: (message: string) => void): Promise<ExecutionResult>;
    parseOutput(output: string): {
        summary?: string;
        files?: string[];
        prUrl?: string;
        question?: string;
        error?: string;
    };
    checkAvailable(): Promise<boolean>;
}
/**
 * Get the executor for a specific provider
 */
export declare function getExecutor(provider: AIProvider): ExecutorInterface;
/**
 * Execute a task with automatic provider detection
 */
export declare function executeTask(session: Session, aiAgent: {
    email?: string;
    type?: string;
}, prompt?: string, context?: TaskContext, onProgress?: (message: string) => void): Promise<{
    provider: AIProvider;
    result: ExecutionResult;
}>;
/**
 * Resume a task with the appropriate provider
 */
export declare function resumeTask(session: Session, provider: AIProvider, input: string, context?: TaskContext, onProgress?: (message: string) => void): Promise<ExecutionResult>;
export { claudeExecutor } from '../claude-executor';
export { openaiExecutor } from './openai-executor';
export { geminiExecutor } from './gemini-executor';
//# sourceMappingURL=index.d.ts.map