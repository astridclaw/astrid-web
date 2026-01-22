"use strict";
/**
 * Gemini Executor for Code Remote Server
 *
 * Executes tasks using the Google Gemini API with function calling.
 * Provides the same interface as the Claude executor for seamless routing.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.geminiExecutor = exports.GeminiExecutor = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
// ============================================================================
// TOOL DEFINITIONS
// ============================================================================
const TOOL_DECLARATIONS = [
    {
        name: 'read_file',
        description: 'Read the contents of a file',
        parameters: {
            type: 'object',
            properties: {
                file_path: { type: 'string', description: 'Path to the file relative to project root' }
            },
            required: ['file_path']
        }
    },
    {
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
    },
    {
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
    },
    {
        name: 'run_bash',
        description: 'Run a bash command in the project directory',
        parameters: {
            type: 'object',
            properties: {
                command: { type: 'string', description: 'The bash command to execute' }
            },
            required: ['command']
        }
    },
    {
        name: 'glob_files',
        description: 'Find files matching a glob pattern',
        parameters: {
            type: 'object',
            properties: {
                pattern: { type: 'string', description: 'Glob pattern (e.g., "**/*.ts", "src/**/*.tsx")' }
            },
            required: ['pattern']
        }
    },
    {
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
    },
    {
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
                return { success: true, result: content.slice(0, 50000) };
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
async function callGemini(contents, systemInstruction, apiKey, model) {
    const maxRetries = 3;
    const initialBackoffMs = 1000;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systemInstruction }] },
                    contents,
                    tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
                    toolConfig: {
                        functionCallingConfig: {
                            mode: 'AUTO'
                        }
                    },
                    generationConfig: { maxOutputTokens: 8192, temperature: 0.2 }
                })
            });
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
            throw new Error(`Gemini API error (${response.status}): ${errorText.substring(0, 200)}`);
        }
        catch (fetchError) {
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, initialBackoffMs));
                continue;
            }
            throw fetchError;
        }
    }
    throw new Error('Gemini API call failed after retries');
}
// ============================================================================
// EXECUTOR CLASS
// ============================================================================
class GeminiExecutor {
    model;
    maxIterations;
    apiKey;
    constructor() {
        this.model = process.env.GEMINI_MODEL || 'gemini-3-pro';
        this.maxIterations = parseInt(process.env.GEMINI_MAX_ITERATIONS || '50', 10);
        this.apiKey = process.env.GEMINI_API_KEY || '';
    }
    /**
     * Read CLAUDE.md or ASTRID.md from project for context
     */
    async readProjectContext(projectPath) {
        const contextFiles = ['CLAUDE.md', 'ASTRID.md', 'GEMINI.md'];
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
     * Build the system instruction
     */
    async buildSystemInstruction(session, context) {
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

- You MUST use actual function calls, not text descriptions
- Do NOT write text saying "I will call X" - actually invoke the function
- Follow existing code patterns and styles in the project
- Write complete, production-ready code (no TODOs or placeholders)
- Test your changes before completing
- Create small, focused changes`;
    }
    /**
     * Start a new session
     */
    async startSession(session, prompt, context, onProgress) {
        if (!this.apiKey) {
            return {
                exitCode: 1,
                stdout: '',
                stderr: 'GEMINI_API_KEY not configured'
            };
        }
        console.log(`🚀 Starting Gemini session for task: ${session.title}`);
        if (session.projectPath) {
            console.log(`📁 Working directory: ${session.projectPath}`);
        }
        const systemInstruction = await this.buildSystemInstruction(session, context);
        const userPrompt = prompt || 'Please implement the task described above. Start by exploring the codebase structure using glob_files.';
        const contents = [
            { role: 'user', parts: [{ text: userPrompt }] }
        ];
        const modifiedFiles = [];
        let prUrl;
        let lastOutput = '';
        try {
            for (let i = 0; i < this.maxIterations; i++) {
                onProgress?.(`Iteration ${i + 1}...`);
                const response = await callGemini(contents, systemInstruction, this.apiKey, this.model);
                const candidate = response.candidates[0];
                if (!candidate) {
                    return {
                        exitCode: 1,
                        stdout: lastOutput,
                        stderr: 'No response from Gemini'
                    };
                }
                contents.push({ role: 'model', parts: candidate.content.parts });
                // Check for text content
                const textPart = candidate.content.parts.find(p => p.text);
                if (textPart?.text) {
                    lastOutput = textPart.text;
                    console.log(`💬 Assistant: ${textPart.text.slice(0, 200)}...`);
                }
                // Check for function calls
                const functionCalls = candidate.content.parts.filter(p => p.functionCall);
                if (functionCalls.length > 0) {
                    const functionResponses = [];
                    for (const part of functionCalls) {
                        if (!part.functionCall)
                            continue;
                        const { name, args } = part.functionCall;
                        onProgress?.(`Using tool: ${name}`);
                        console.log(`🔧 Tool: ${name}(${JSON.stringify(args).slice(0, 100)}...)`);
                        if (name === 'task_complete') {
                            const typedArgs = args;
                            // Create commit and PR if we have changes
                            if (session.projectPath && modifiedFiles.length > 0) {
                                try {
                                    (0, child_process_1.execSync)(`git add -A`, { cwd: session.projectPath });
                                    (0, child_process_1.execSync)(`git commit -m "${typedArgs.commit_message}"`, { cwd: session.projectPath });
                                    try {
                                        const prOutput = (0, child_process_1.execSync)(`gh pr create --title "${typedArgs.pr_title}" --body "${typedArgs.pr_description.replace(/"/g, '\\"')}"`, { cwd: session.projectPath, encoding: 'utf-8' });
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
                                stdout: `Task completed!\n\n${typedArgs.pr_description}\n\nFiles modified: ${modifiedFiles.join(', ')}${prUrl ? `\n\nPR: ${prUrl}` : ''}`,
                                stderr: '',
                                sessionId: session.id
                            };
                        }
                        const result = await executeTool(name, args, session.projectPath || process.cwd());
                        if (result.fileChange) {
                            modifiedFiles.push(result.fileChange.path);
                        }
                        functionResponses.push({
                            functionResponse: { name, response: { result: result.result.slice(0, 15000) } }
                        });
                    }
                    contents.push({ role: 'user', parts: functionResponses });
                    continue;
                }
                // If model stops without completing
                if (candidate.finishReason === 'STOP') {
                    contents.push({
                        role: 'user',
                        parts: [{ text: 'Please continue with the implementation or call task_complete if you are done.' }]
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
            console.error(`❌ Gemini execution error:`, error);
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
     * Note: Gemini doesn't have built-in session resumption,
     * so we start a new session with the additional context.
     */
    async resumeSession(session, input, context, onProgress) {
        console.log(`🔄 Resuming Gemini session with new input`);
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
            const fileMatch = line.match(/(?:modified|created|edited|wrote|Files modified:)\s*[`'"]*([^`'"]+)[`'"]*/i);
            if (fileMatch) {
                files.push(...fileMatch[1].split(',').map(f => f.trim()));
            }
            const prMatch = line.match(/(https:\/\/github\.com\/[\w-]+\/[\w-]+\/pull\/\d+)/i);
            if (prMatch) {
                result.prUrl = prMatch[1];
            }
            if (line.toLowerCase().includes('error:') || line.toLowerCase().includes('failed:')) {
                result.error = line.trim();
            }
        }
        if (files.length > 0) {
            result.files = [...new Set(files.filter(f => f.length > 0))];
        }
        const paragraphs = output.split(/\n\n+/).filter(p => p.trim().length > 50);
        if (paragraphs.length > 0) {
            result.summary = paragraphs[paragraphs.length - 1].trim().slice(0, 500);
        }
        return result;
    }
    /**
     * Check if Gemini is available
     */
    async checkAvailable() {
        return !!this.apiKey;
    }
}
exports.GeminiExecutor = GeminiExecutor;
// Export singleton instance
exports.geminiExecutor = new GeminiExecutor();
//# sourceMappingURL=gemini-executor.js.map