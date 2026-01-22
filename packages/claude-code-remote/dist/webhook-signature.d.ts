/**
 * Webhook Signature Utilities
 *
 * HMAC-SHA256 signature verification for secure webhook communication
 * from Astrid to Claude Code Remote server.
 */
/**
 * Generate HMAC-SHA256 signature for a webhook payload
 */
export declare function generateWebhookSignature(payload: string, secret: string, timestamp: string): string;
/**
 * Generate all headers needed for a signed callback request to Astrid
 */
export declare function generateCallbackHeaders(payload: string, secret: string, event: string): Record<string, string>;
export interface WebhookVerificationResult {
    valid: boolean;
    error?: string;
}
/**
 * Verify a webhook signature from Astrid
 */
export declare function verifyWebhookSignature(payload: string, signature: string, secret: string, timestamp: string, maxAge?: number): WebhookVerificationResult;
//# sourceMappingURL=webhook-signature.d.ts.map