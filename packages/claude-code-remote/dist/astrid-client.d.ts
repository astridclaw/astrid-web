/**
 * Astrid API Client
 *
 * Handles outbound communication to Astrid, including callback
 * notifications for session status updates.
 */
export interface CallbackPayload {
    event: 'session.started' | 'session.completed' | 'session.waiting_input' | 'session.error' | 'session.progress';
    timestamp: string;
    sessionId: string;
    taskId: string;
    data?: {
        message?: string;
        summary?: string;
        files?: string[];
        prUrl?: string;
        error?: string;
        question?: string;
        options?: string[];
        changes?: string[];
    };
}
export interface AstridClientConfig {
    callbackUrl: string;
    webhookSecret: string;
    timeout?: number;
}
export declare class AstridClient {
    private callbackUrl;
    private webhookSecret;
    private timeout;
    constructor(config?: AstridClientConfig);
    /**
     * Check if client is properly configured
     */
    isConfigured(): boolean;
    /**
     * Send a callback to Astrid
     */
    sendCallback(payload: CallbackPayload): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Notify Astrid that session has started
     */
    notifyStarted(taskId: string, sessionId: string, message?: string): Promise<void>;
    /**
     * Notify Astrid that session has completed
     */
    notifyCompleted(taskId: string, sessionId: string, data: {
        summary?: string;
        files?: string[];
        prUrl?: string;
        changes?: string[];
        diff?: string;
    }): Promise<void>;
    /**
     * Notify Astrid that session is waiting for user input
     */
    notifyWaitingInput(taskId: string, sessionId: string, question: string, options?: string[], data?: {
        files?: string[];
        prUrl?: string;
        diff?: string;
    }): Promise<void>;
    /**
     * Notify Astrid about progress
     */
    notifyProgress(taskId: string, sessionId: string, message: string): Promise<void>;
    /**
     * Notify Astrid that an error occurred
     */
    notifyError(taskId: string, sessionId: string, error: string, context?: string): Promise<void>;
}
export declare const astridClient: AstridClient;
//# sourceMappingURL=astrid-client.d.ts.map