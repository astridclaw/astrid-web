/**
 * Repository Manager
 *
 * Handles cloning and updating GitHub repositories for Claude Code to work on.
 */
export interface RepoInfo {
    path: string;
    url: string;
    branch: string;
}
declare class RepoManager {
    private reposDir;
    constructor();
    /**
     * Get or clone a repository
     */
    getRepo(repoId: string): Promise<RepoInfo | null>;
    /**
     * Build repository URL (supports GitHub token for private repos)
     */
    private buildRepoUrl;
    /**
     * Clone a repository
     */
    private cloneRepo;
    /**
     * Pull latest changes
     */
    private pullLatest;
    /**
     * Get current branch name
     */
    private getCurrentBranch;
    /**
     * Create a new branch for the task
     */
    createTaskBranch(repoPath: string, taskId: string): Promise<string>;
}
export declare const repoManager: RepoManager;
export {};
//# sourceMappingURL=repo-manager.d.ts.map