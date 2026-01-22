"use strict";
/**
 * Astrid API Client
 *
 * Handles outbound communication to Astrid, including callback
 * notifications for session status updates.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.astridClient = exports.AstridClient = void 0;
const webhook_signature_1 = require("./webhook-signature");
class AstridClient {
    callbackUrl;
    webhookSecret;
    timeout;
    constructor(config) {
        this.callbackUrl = config?.callbackUrl || process.env.ASTRID_CALLBACK_URL || '';
        this.webhookSecret = config?.webhookSecret || process.env.ASTRID_WEBHOOK_SECRET || '';
        this.timeout = config?.timeout || 10000;
    }
    /**
     * Check if client is properly configured
     */
    isConfigured() {
        return Boolean(this.callbackUrl && this.webhookSecret);
    }
    /**
     * Send a callback to Astrid
     */
    async sendCallback(payload) {
        if (!this.isConfigured()) {
            console.log(`⚠️ Astrid callback not configured, skipping notification`);
            return { success: false, error: 'Not configured' };
        }
        try {
            const body = JSON.stringify(payload);
            const headers = (0, webhook_signature_1.generateCallbackHeaders)(body, this.webhookSecret, payload.event);
            console.log(`📤 Sending callback to Astrid: ${payload.event}`);
            const response = await fetch(this.callbackUrl, {
                method: 'POST',
                headers,
                body,
                signal: AbortSignal.timeout(this.timeout)
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            console.log(`✅ Callback sent successfully`);
            return { success: true };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`❌ Failed to send callback to Astrid: ${errorMessage}`);
            return { success: false, error: errorMessage };
        }
    }
    /**
     * Notify Astrid that session has started
     */
    async notifyStarted(taskId, sessionId, message) {
        await this.sendCallback({
            event: 'session.started',
            timestamp: new Date().toISOString(),
            sessionId,
            taskId,
            data: { message: message || 'Started working on task' }
        });
    }
    /**
     * Notify Astrid that session has completed
     */
    async notifyCompleted(taskId, sessionId, data) {
        await this.sendCallback({
            event: 'session.completed',
            timestamp: new Date().toISOString(),
            sessionId,
            taskId,
            data
        });
    }
    /**
     * Notify Astrid that session is waiting for user input
     */
    async notifyWaitingInput(taskId, sessionId, question, options, data) {
        await this.sendCallback({
            event: 'session.waiting_input',
            timestamp: new Date().toISOString(),
            sessionId,
            taskId,
            data: {
                question,
                options,
                ...data // Include files, prUrl, diff
            }
        });
    }
    /**
     * Notify Astrid about progress
     */
    async notifyProgress(taskId, sessionId, message) {
        await this.sendCallback({
            event: 'session.progress',
            timestamp: new Date().toISOString(),
            sessionId,
            taskId,
            data: { message }
        });
    }
    /**
     * Notify Astrid that an error occurred
     */
    async notifyError(taskId, sessionId, error, context) {
        await this.sendCallback({
            event: 'session.error',
            timestamp: new Date().toISOString(),
            sessionId,
            taskId,
            data: { error, message: context }
        });
    }
}
exports.AstridClient = AstridClient;
// Export singleton instance
exports.astridClient = new AstridClient();
//# sourceMappingURL=astrid-client.js.map