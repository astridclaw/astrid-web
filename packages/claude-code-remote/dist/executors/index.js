"use strict";
/**
 * Executor Router
 *
 * Routes task execution to the appropriate provider (Claude, OpenAI, Gemini)
 * based on the AI agent email pattern.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.geminiExecutor = exports.openaiExecutor = exports.claudeExecutor = void 0;
exports.detectProvider = detectProvider;
exports.isProviderAvailable = isProviderAvailable;
exports.getProviderName = getProviderName;
exports.getExecutor = getExecutor;
exports.executeTask = executeTask;
exports.resumeTask = resumeTask;
const claude_executor_1 = require("../claude-executor");
const openai_executor_1 = require("./openai-executor");
const gemini_executor_1 = require("./gemini-executor");
/**
 * Detect the AI provider from the agent email or type
 */
function detectProvider(aiAgent) {
    const email = aiAgent.email?.toLowerCase() || '';
    const type = aiAgent.type?.toLowerCase() || '';
    // Check email patterns
    if (email.includes('claude') || email.startsWith('claude@')) {
        return 'claude';
    }
    if (email.includes('openai') || email.startsWith('openai@') || email.includes('codex')) {
        return 'openai';
    }
    if (email.includes('gemini') || email.startsWith('gemini@') || email.includes('google')) {
        return 'gemini';
    }
    // Check type field
    if (type.includes('claude')) {
        return 'claude';
    }
    if (type.includes('openai') || type.includes('gpt')) {
        return 'openai';
    }
    if (type.includes('gemini') || type.includes('google')) {
        return 'gemini';
    }
    // Default to Claude (has the best capabilities)
    return 'claude';
}
/**
 * Check if a provider is available based on environment configuration
 */
function isProviderAvailable(provider) {
    switch (provider) {
        case 'claude':
            // Claude Code CLI needs to be installed
            return true; // We'll check availability at runtime
        case 'openai':
            return !!process.env.OPENAI_API_KEY;
        case 'gemini':
            return !!process.env.GEMINI_API_KEY;
        default:
            return false;
    }
}
/**
 * Get the display name for a provider
 */
function getProviderName(provider) {
    switch (provider) {
        case 'claude':
            return 'Claude Code';
        case 'openai':
            return 'OpenAI';
        case 'gemini':
            return 'Gemini';
        default:
            return 'Unknown';
    }
}
/**
 * Get the executor for a specific provider
 */
function getExecutor(provider) {
    switch (provider) {
        case 'claude':
            return claude_executor_1.claudeExecutor;
        case 'openai':
            return openai_executor_1.openaiExecutor;
        case 'gemini':
            return gemini_executor_1.geminiExecutor;
        default:
            // Default to Claude for unknown providers
            console.warn(`Unknown provider "${provider}", falling back to Claude`);
            return claude_executor_1.claudeExecutor;
    }
}
/**
 * Execute a task with automatic provider detection
 */
async function executeTask(session, aiAgent, prompt, context, onProgress) {
    const provider = detectProvider(aiAgent);
    const executor = getExecutor(provider);
    console.log(`🤖 Using ${getProviderName(provider)} executor for task`);
    // Check availability
    const available = await executor.checkAvailable();
    if (!available) {
        throw new Error(`${getProviderName(provider)} is not available. Please check configuration.`);
    }
    const result = await executor.startSession(session, prompt, context, onProgress);
    return { provider, result };
}
/**
 * Resume a task with the appropriate provider
 */
async function resumeTask(session, provider, input, context, onProgress) {
    const executor = getExecutor(provider);
    console.log(`🔄 Resuming with ${getProviderName(provider)} executor`);
    return executor.resumeSession(session, input, context, onProgress);
}
var claude_executor_2 = require("../claude-executor");
Object.defineProperty(exports, "claudeExecutor", { enumerable: true, get: function () { return claude_executor_2.claudeExecutor; } });
var openai_executor_2 = require("./openai-executor");
Object.defineProperty(exports, "openaiExecutor", { enumerable: true, get: function () { return openai_executor_2.openaiExecutor; } });
var gemini_executor_2 = require("./gemini-executor");
Object.defineProperty(exports, "geminiExecutor", { enumerable: true, get: function () { return gemini_executor_2.geminiExecutor; } });
//# sourceMappingURL=index.js.map