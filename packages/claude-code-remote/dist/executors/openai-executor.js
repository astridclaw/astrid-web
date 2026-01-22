"use strict";
/**
 * OpenAI Executor for Code Remote Server
 *
 * Executes tasks using the OpenAI API with function calling.
 * Provides the same interface as the Claude executor for seamless routing.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openaiExecutor = exports.OpenAIExecutor = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
// ============================================================================
// TOOL DEFINITIONS
// ============================================================================
const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'read_file',
            description: 'Read the contents of a file',
            parameters: {
                type: 'object',
                properties: {
                    file_path: { type: 'string', description: 'Path to the file relative to project root' }
                },
                required: ['file_path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'write_file',
            description: 'Write content to a file (creates or overwrites)',
            parameters: {
                type: 'object',
                properties: {
                    file_path: { type: 'string', description: 'Path to the file' },
                    content: { type: 'string', description: 'Content to write' }
                },
                required: ['file_path', 'content']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'edit_file',
            description: 'Edit a file by replacing old_string with new_string',
            parameters: {
                type: 'object',
                properties: {
                    file_path: { type: 'string', description: 'Path to the file' },
                    old_string: { type: 'string', description: 'Exact string to find and replace' },
                    new_string: { type: 'string', description: 'Replacement string' }
                },
                required: ['file_path', 'old_string', 'new_string']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'run_bash',
            description: 'Run a bash command in the project directory',
            parameters: {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'The bash command to execute' }
                },
                required: ['command']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'glob_files',
            description: 'Find files matching a glob pattern',
            parameters: {
                type: 'object',
                properties: {
                    pattern: { type: 'string', description: 'Glob pattern (e.g., "**/*.ts", "src/**/*.tsx")' }
                },
                required: ['pattern']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'grep_search',
            description: 'Search for a pattern in files using grep',
            parameters: {
                type: 'object',
                properties: {
                    pattern: { type: 'string', description: 'Search pattern (regex supported)' },
                    file_pattern: { type: 'string', description: 'Optional: limit search to files matching this pattern' }
                },
                required: ['pattern']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'task_complete',
            description: 'Signal that the task is complete with a summary of changes',
            parameters: {
                type: 'object',
                properties: {
                    commit_message: { type: 'string', description: 'Git commit message for the changes' },
                    pr_title: { type: 'string', description: 'Pull request title' },
                    pr_description: { type: 'string', description: 'Pull request description with details of changes' }
                },
                required: ['commit_message', 'pr_title', 'pr_description']
            }
        }
    }
];
const DANGEROUS_COMMANDS = [
    'rm -rf /',
    'rm -rf /*',
    'sudo rm',
    '> /dev/',
    'mkfs',
    'dd if=',
    ':(){:|:&};:',
    'chmod -R 777 /',
    'curl | bash',
    'wget | bash'
];
async function executeTool(name, args, projectPath) {
    try {
        switch (name) {
            case 'read_file': {
                const filePath = path_1.default.join(projectPath, args.file_path);
                const content = await promises_1.default.readFile(filePath, 'utf-8');
                return { success: true, result: content.slice(0, 50000) }; // Limit output size
            }
            case 'write_file': {
                const filePath = path_1.default.join(projectPath, args.file_path);
                const content = args.content;
                let action = 'create';
                try {
                    await promises_1.default.access(filePath);
                    action = 'modify';
                }
                catch {
                    await promises_1.default.mkdir(path_1.default.dirname(filePath), { recursive: true });
                }
                await promises_1.default.writeFile(filePath, content, 'utf-8');
                return {
                    success: true,
                    result: `File ${action === 'create' ? 'created' : 'updated'}: ${args.file_path}`,
                    fileChange: { path: args.file_path, content, action }
                };
            }
            case 'edit_file': {
                const filePath = path_1.default.join(projectPath, args.file_path);
                const oldContent = await promises_1.default.readFile(filePath, 'utf-8');
                const oldString = args.old_string;
                const newString = args.new_string;
                if (!oldContent.includes(oldString)) {
                    return { success: false, result: `Error: Could not find the specified string in ${args.file_path}` };
                }
                const newContent = oldContent.replace(oldString, newString);
                await promises_1.default.writeFile(filePath, newContent, 'utf-8');
                return {
                    success: true,
                    result: `File edited successfully: ${args.file_path}`,
                    fileChange: { path: args.file_path, content: newContent, action: 'modify' }
                };
            }
            case 'run_bash': {
                const command = args.command;
                // Safety check
                if (DANGEROUS_COMMANDS.some(d => command.includes(d))) {
                    return { success: false, result: 'Error: This command is blocked for safety reasons' };
                }
                try {
                    const output = (0, child_process_1.execSync)(command, {
                        cwd: projectPath,
                        encoding: 'utf-8',
                        timeout: 60000,
                        maxBuffer: 1024 * 1024
                    });
                    return { success: true, result: output.slice(0, 20000) || '(no output)' };
                }
                catch (error) {
                    const err = error;
                    const output = err.stdout || '';
                    const errorMsg = err.stderr || err.message || 'Command failed';
                    return { success: false, result: `${output}\nError: ${errorMsg}`.slice(0, 20000) };
                }
            }
            case 'glob_files': {
                const pattern = args.pattern;
                try {
                    // Use find command for glob-like matching
                    const output = (0, child_process_1.execSync)(`find . -type f -name "${pattern.replace(/\*\*/g, '*')}" 2>/dev/null | head -100`, { cwd: projectPath, encoding: 'utf-8', timeout: 30000 });
                    return { success: true, result: output || '(no matches)' };
                }
                catch {
                    return { success: true, result: '(no matches)' };
                }
            }
            case 'grep_search': {
                const pattern = args.pattern;
                const filePattern = args.file_pattern || '.';
                try {
                    const output = (0, child_process_1.execSync)(`grep -rn "${pattern.replace(/"/g, '\\"')}" ${filePattern} 2>/dev/null | head -100`, { cwd: projectPath, encoding: 'utf-8', timeout: 30000 });
                    return { success: true, result: output || '(no matches)' };
                }
                catch {
                    return { success: true, result: '(no matches)' };
                }
            }
            case 'task_complete':
                return { success: true, result: 'Task marked as complete' };
            default:
                return { success: false, result: `Unknown tool: ${name}` };
        }
    }
    catch (error) {
        return { success: false, result: `Error: ${error instanceof Error ? error.message : String(error)}` };
    }
}
async function callOpenAI(messages, apiKey, model) {
    const maxRetries = 3;
    const initialBackoffMs = 1000;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min timeout
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                signal: controller.signal,
                body: JSON.stringify({
                    model,
                    messages,
                    tools: TOOLS,
                    tool_choice: 'auto',
                    max_tokens: 8192,
                    temperature: 0.2
                })
            });
            clearTimeout(timeoutId);
            if (response.ok) {
                return response.json();
            }
            const errorText = await response.text();
            if (response.status === 429 && attempt < maxRetries - 1) {
                const waitTime = initialBackoffMs * Math.pow(2, attempt);
                console.log(`⏳ Rate limited, waiting ${waitTime}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            throw new Error(`OpenAI API error (${response.status}): ${errorText.substring(0, 200)}`);
        }
        catch (fetchError) {
            clearTimeout(timeoutId);
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, initialBackoffMs));
                continue;
            }
            throw fetchError;
        }
    }
    throw new Error('OpenAI API call failed after retries');
}
// ============================================================================
// EXECUTOR CLASS
// ============================================================================
class OpenAIExecutor {
    model;
    maxIterations;
    apiKey;
    constructor() {
        this.model = process.env.OPENAI_MODEL || 'gpt-5';
        this.maxIterations = parseInt(process.env.OPENAI_MAX_ITERATIONS || '50', 10);
        this.apiKey = process.env.OPENAI_API_KEY || '';
    }
    /**
     * Read CLAUDE.md or ASTRID.md from project for context
     */
    async readProjectContext(projectPath) {
        const contextFiles = ['CLAUDE.md', 'ASTRID.md', 'CODEX.md'];
        let context = '';
        for (const file of contextFiles) {
            try {
                const filePath = path_1.default.join(projectPath, file);
                const content = await promises_1.default.readFile(filePath, 'utf-8');
                context += `\n\n## Project Instructions (from ${file})\n\n${content.slice(0, 15000)}`;
                console.log(`📄 Loaded project context from ${file}`);
                break;
            }
            catch {
                // File doesn't exist, try next
            }
        }
        return context;
    }
    /**
     * Format comment history for context
     */
    formatCommentHistory(comments) {
        if (!comments || comments.length === 0)
            return '';
        const formatted = comments
            .slice(-10)
            .map(c => `**${c.authorName}** (${new Date(c.createdAt).toLocaleString()}):\n${c.content}`)
            .join('\n\n---\n\n');
        return `\n\n## Previous Discussion\n\n${formatted}`;
    }
    /**
     * Build the system prompt
     */
    async buildSystemPrompt(session, context) {
        let projectContext = '';
        if (session.projectPath) {
            projectContext = await this.readProjectContext(session.projectPath);
        }
        const commentHistory = this.formatCommentHistory(context?.comments);
        return `You are an expert software engineer working on a task. You have access to tools for reading, writing, and editing files, running bash commands, and searching the codebase.

## Task: ${session.title}

${session.description}
${commentHistory}
${projectContext}

## Instructions

1. First, explore the codebase to understand the structure
2. Use glob_files and grep_search to find relevant files
3. Read files to understand existing patterns
4. Make changes using write_file or edit_file
5. Run tests or build commands to verify your changes
6. When complete, call task_complete with a commit message and PR details

## Rules

- Follow existing code patterns and styles in the project
- Write complete, production-ready code (no TODOs or placeholders)
- Test your changes before completing
- Create small, focused changes
- If you need clarification, explain what you need to know`;
    }
    /**
     * Start a new session
     */
    async startSession(session, prompt, context, onProgress) {
        if (!this.apiKey) {
            return {
                exitCode: 1,
                stdout: '',
                stderr: 'OPENAI_API_KEY not configured'
            };
        }
        console.log(`🚀 Starting OpenAI session for task: ${session.title}`);
        if (session.projectPath) {
            console.log(`📁 Working directory: ${session.projectPath}`);
        }
        const systemPrompt = await this.buildSystemPrompt(session, context);
        const userPrompt = prompt || 'Please implement the task described above. Start by exploring the codebase structure.';
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];
        const modifiedFiles = [];
        let prUrl;
        let lastOutput = '';
        let completionMessage;
        try {
            for (let i = 0; i < this.maxIterations; i++) {
                onProgress?.(`Iteration ${i + 1}...`);
                const response = await callOpenAI(messages, this.apiKey, this.model);
                const choice = response.choices[0];
                const assistantMessage = choice.message;
                messages.push({
                    role: 'assistant',
                    content: assistantMessage.content,
                    tool_calls: assistantMessage.tool_calls
                });
                if (assistantMessage.content) {
                    lastOutput = assistantMessage.content;
                    console.log(`💬 Assistant: ${assistantMessage.content.slice(0, 200)}...`);
                }
                if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
                    for (const toolCall of assistantMessage.tool_calls) {
                        const args = JSON.parse(toolCall.function.arguments);
                        const toolName = toolCall.function.name;
                        onProgress?.(`Using tool: ${toolName}`);
                        console.log(`🔧 Tool: ${toolName}(${JSON.stringify(args).slice(0, 100)}...)`);
                        if (toolName === 'task_complete') {
                            completionMessage = args;
                            // Create commit and PR if we have changes
                            if (session.projectPath && modifiedFiles.length > 0) {
                                try {
                                    // Stage and commit changes
                                    (0, child_process_1.execSync)(`git add -A`, { cwd: session.projectPath });
                                    (0, child_process_1.execSync)(`git commit -m "${args.commit_message}"`, { cwd: session.projectPath });
                                    // Try to create PR
                                    try {
                                        const prOutput = (0, child_process_1.execSync)(`gh pr create --title "${args.pr_title}" --body "${args.pr_description.replace(/"/g, '\\"')}"`, { cwd: session.projectPath, encoding: 'utf-8' });
                                        const prMatch = prOutput.match(/(https:\/\/github\.com\/[\w-]+\/[\w-]+\/pull\/\d+)/);
                                        if (prMatch) {
                                            prUrl = prMatch[1];
                                        }
                                    }
                                    catch (prError) {
                                        console.log(`⚠️ Could not create PR: ${prError}`);
                                    }
                                }
                                catch (gitError) {
                                    console.log(`⚠️ Git operations failed: ${gitError}`);
                                }
                            }
                            return {
                                exitCode: 0,
                                stdout: `Task completed!\n\n${args.pr_description}\n\nFiles modified: ${modifiedFiles.join(', ')}${prUrl ? `\n\nPR: ${prUrl}` : ''}`,
                                stderr: '',
                                sessionId: session.id
                            };
                        }
                        const result = await executeTool(toolName, args, session.projectPath || process.cwd());
                        if (result.fileChange) {
                            modifiedFiles.push(result.fileChange.path);
                        }
                        messages.push({
                            role: 'tool',
                            content: result.result.slice(0, 15000),
                            tool_call_id: toolCall.id
                        });
                    }
                    continue;
                }
                // If model stops without completing
                if (choice.finish_reason === 'stop') {
                    messages.push({
                        role: 'user',
                        content: 'Please continue with the implementation or call task_complete if you are done.'
                    });
                }
            }
            // Max iterations reached
            return {
                exitCode: 1,
                stdout: lastOutput,
                stderr: 'Max iterations reached without completion'
            };
        }
        catch (error) {
            console.error(`❌ OpenAI execution error:`, error);
            return {
                exitCode: 1,
                stdout: lastOutput,
                stderr: error instanceof Error ? error.message : String(error)
            };
        }
    }
    /**
     * Resume an existing session
     *
     * Note: OpenAI doesn't have built-in session resumption like Claude Code,
     * so we essentially start a new session with the additional context.
     */
    async resumeSession(session, input, context, onProgress) {
        console.log(`🔄 Resuming OpenAI session with new input`);
        // Build context from previous work
        const additionalContext = `
## New Instructions from User

${input}

## Previous Context

The task "${session.title}" has been in progress. The user has provided additional instructions above. Please continue from where you left off.
`;
        return this.startSession(session, additionalContext, context, onProgress);
    }
    /**
     * Parse output to extract key information
     */
    parseOutput(output) {
        const result = {};
        const lines = output.split('\n');
        const files = [];
        for (const line of lines) {
            // Extract modified files
            const fileMatch = line.match(/(?:modified|created|edited|wrote|Files modified:)\s*[`'"]*([^`'"]+)[`'"]*/i);
            if (fileMatch) {
                files.push(...fileMatch[1].split(',').map(f => f.trim()));
            }
            // Extract PR URL
            const prMatch = line.match(/(https:\/\/github\.com\/[\w-]+\/[\w-]+\/pull\/\d+)/i);
            if (prMatch) {
                result.prUrl = prMatch[1];
            }
            // Extract errors
            if (line.toLowerCase().includes('error:') || line.toLowerCase().includes('failed:')) {
                result.error = line.trim();
            }
        }
        if (files.length > 0) {
            result.files = [...new Set(files.filter(f => f.length > 0))];
        }
        // Try to extract summary (last substantial paragraph)
        const paragraphs = output.split(/\n\n+/).filter(p => p.trim().length > 50);
        if (paragraphs.length > 0) {
            result.summary = paragraphs[paragraphs.length - 1].trim().slice(0, 500);
        }
        return result;
    }
    /**
     * Check if OpenAI is available
     */
    async checkAvailable() {
        return !!this.apiKey;
    }
}
exports.OpenAIExecutor = OpenAIExecutor;
// Export singleton instance
exports.openaiExecutor = new OpenAIExecutor();
//# sourceMappingURL=openai-executor.js.map