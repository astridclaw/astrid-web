"use strict";
/**
 * Repository Manager
 *
 * Handles cloning and updating GitHub repositories for Claude Code to work on.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.repoManager = void 0;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const REPOS_DIR = process.env.REPOS_DIR || '/app/repos';
class RepoManager {
    reposDir;
    constructor() {
        this.reposDir = REPOS_DIR;
        // Ensure repos directory exists
        if (!(0, fs_1.existsSync)(this.reposDir)) {
            (0, fs_1.mkdirSync)(this.reposDir, { recursive: true });
        }
    }
    /**
     * Get or clone a repository
     */
    async getRepo(repoId) {
        if (!repoId) {
            return null;
        }
        // Parse repo ID (e.g., "Graceful-Tools/astrid-res-www")
        const [owner, repo] = repoId.split('/');
        if (!owner || !repo) {
            console.error(`Invalid repo ID: ${repoId}`);
            return null;
        }
        const repoPath = path_1.default.join(this.reposDir, owner, repo);
        const repoUrl = this.buildRepoUrl(owner, repo);
        // Check if already cloned
        if ((0, fs_1.existsSync)(path_1.default.join(repoPath, '.git'))) {
            console.log(`📂 Repository exists: ${repoPath}`);
            // Pull latest changes
            await this.pullLatest(repoPath);
            return {
                path: repoPath,
                url: repoUrl,
                branch: await this.getCurrentBranch(repoPath)
            };
        }
        // Clone the repository
        console.log(`📥 Cloning repository: ${repoId}`);
        const success = await this.cloneRepo(repoUrl, repoPath);
        if (!success) {
            return null;
        }
        return {
            path: repoPath,
            url: repoUrl,
            branch: await this.getCurrentBranch(repoPath)
        };
    }
    /**
     * Build repository URL (supports GitHub token for private repos)
     */
    buildRepoUrl(owner, repo) {
        const token = process.env.GITHUB_TOKEN;
        if (token) {
            return `https://${token}@github.com/${owner}/${repo}.git`;
        }
        return `https://github.com/${owner}/${repo}.git`;
    }
    /**
     * Clone a repository
     */
    async cloneRepo(url, targetPath) {
        return new Promise((resolve) => {
            // Ensure parent directory exists
            const parentDir = path_1.default.dirname(targetPath);
            if (!(0, fs_1.existsSync)(parentDir)) {
                (0, fs_1.mkdirSync)(parentDir, { recursive: true });
            }
            // Sanitize URL for logging (hide token)
            const safeUrl = url.replace(/https:\/\/[^@]+@/, 'https://***@');
            console.log(`🔄 Cloning ${safeUrl} to ${targetPath}`);
            const proc = (0, child_process_1.spawn)('git', ['clone', '--depth', '100', url, targetPath], {
                timeout: 120000 // 2 minute timeout for clone
            });
            proc.stdout.on('data', (data) => {
                console.log(`git: ${data.toString().trim()}`);
            });
            proc.stderr.on('data', (data) => {
                // Git outputs progress to stderr
                console.log(`git: ${data.toString().trim()}`);
            });
            proc.on('close', (code) => {
                if (code === 0) {
                    console.log(`✅ Repository cloned successfully`);
                    resolve(true);
                }
                else {
                    console.error(`❌ Failed to clone repository (exit code ${code})`);
                    resolve(false);
                }
            });
            proc.on('error', (error) => {
                console.error(`❌ Git clone error:`, error);
                resolve(false);
            });
        });
    }
    /**
     * Pull latest changes
     */
    async pullLatest(repoPath) {
        return new Promise((resolve) => {
            console.log(`🔄 Pulling latest changes in ${repoPath}`);
            const proc = (0, child_process_1.spawn)('git', ['pull', '--ff-only'], {
                cwd: repoPath,
                timeout: 60000
            });
            proc.on('close', (code) => {
                if (code === 0) {
                    console.log(`✅ Repository updated`);
                    resolve(true);
                }
                else {
                    console.log(`⚠️ Pull failed (code ${code}), continuing with existing code`);
                    resolve(true); // Still allow work to continue
                }
            });
            proc.on('error', () => {
                console.log(`⚠️ Pull error, continuing with existing code`);
                resolve(true);
            });
        });
    }
    /**
     * Get current branch name
     */
    async getCurrentBranch(repoPath) {
        try {
            const branch = (0, child_process_1.execSync)('git rev-parse --abbrev-ref HEAD', {
                cwd: repoPath,
                encoding: 'utf-8'
            }).trim();
            return branch;
        }
        catch {
            return 'main';
        }
    }
    /**
     * Create a new branch for the task
     */
    async createTaskBranch(repoPath, taskId) {
        const branchName = `claude/${taskId.slice(0, 8)}`;
        try {
            // Check if branch already exists
            (0, child_process_1.execSync)(`git rev-parse --verify ${branchName}`, {
                cwd: repoPath,
                stdio: 'pipe'
            });
            // Branch exists, checkout
            (0, child_process_1.execSync)(`git checkout ${branchName}`, { cwd: repoPath });
            console.log(`📂 Checked out existing branch: ${branchName}`);
        }
        catch {
            // Branch doesn't exist, create it
            (0, child_process_1.execSync)(`git checkout -b ${branchName}`, { cwd: repoPath });
            console.log(`🌿 Created new branch: ${branchName}`);
        }
        return branchName;
    }
}
exports.repoManager = new RepoManager();
//# sourceMappingURL=repo-manager.js.map