"use strict";
/**
 * Webhook Signature Utilities
 *
 * HMAC-SHA256 signature verification for secure webhook communication
 * from Astrid to Claude Code Remote server.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateWebhookSignature = generateWebhookSignature;
exports.generateCallbackHeaders = generateCallbackHeaders;
exports.verifyWebhookSignature = verifyWebhookSignature;
const crypto_1 = __importDefault(require("crypto"));
/**
 * Generate HMAC-SHA256 signature for a webhook payload
 */
function generateWebhookSignature(payload, secret, timestamp) {
    const signedPayload = `${timestamp}.${payload}`;
    return crypto_1.default
        .createHmac('sha256', secret)
        .update(signedPayload, 'utf8')
        .digest('hex');
}
/**
 * Generate all headers needed for a signed callback request to Astrid
 */
function generateCallbackHeaders(payload, secret, event) {
    const timestamp = Date.now().toString();
    const signature = generateWebhookSignature(payload, secret, timestamp);
    return {
        'Content-Type': 'application/json',
        'X-Astrid-Signature': `sha256=${signature}`,
        'X-Astrid-Timestamp': timestamp,
        'X-Astrid-Event': event,
        'User-Agent': 'Claude-Code-Remote/1.0'
    };
}
/**
 * Verify a webhook signature from Astrid
 */
function verifyWebhookSignature(payload, signature, secret, timestamp, maxAge = 300000 // 5 minutes
) {
    if (!payload || !signature || !secret || !timestamp) {
        return { valid: false, error: 'Missing required parameters' };
    }
    const now = Date.now();
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts)) {
        return { valid: false, error: 'Invalid timestamp format' };
    }
    if (now - ts > maxAge) {
        return { valid: false, error: 'Timestamp expired' };
    }
    if (ts - now > 60000) {
        return { valid: false, error: 'Timestamp too far in future' };
    }
    const expected = generateWebhookSignature(payload, secret, timestamp);
    const actual = signature.replace(/^sha256=/, '');
    try {
        const expectedBuffer = Buffer.from(expected, 'hex');
        const actualBuffer = Buffer.from(actual, 'hex');
        if (expectedBuffer.length !== actualBuffer.length) {
            return { valid: false, error: 'Signature length mismatch' };
        }
        const valid = crypto_1.default.timingSafeEqual(expectedBuffer, actualBuffer);
        return { valid };
    }
    catch {
        return { valid: false, error: 'Signature mismatch' };
    }
}
//# sourceMappingURL=webhook-signature.js.map