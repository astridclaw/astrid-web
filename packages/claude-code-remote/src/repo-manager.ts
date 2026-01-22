/**
 * Repository Manager
 *
 * Handles cloning and updating GitHub repositories for Claude Code to work on.
 */

import { execSync, spawn } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import path from 'path'

const REPOS_DIR = process.env.REPOS_DIR || '/app/repos'

export interface RepoInfo {
  path: string
  url: string
  branch: string
}

class RepoManager {
  private reposDir: string

  constructor() {
    this.reposDir = REPOS_DIR
    // Ensure repos directory exists
    if (!existsSync(this.reposDir)) {
      mkdirSync(this.reposDir, { recursive: true })
    }
  }

  /**
   * Get or clone a repository
   */
  async getRepo(repoId: string): Promise<RepoInfo | null> {
    if (!repoId) {
      return null
    }

    // Parse repo ID (e.g., "Graceful-Tools/astrid-res-www")
    const [owner, repo] = repoId.split('/')
    if (!owner || !repo) {
      console.error(`Invalid repo ID: ${repoId}`)
      return null
    }

    const repoPath = path.join(this.reposDir, owner, repo)
    const repoUrl = this.buildRepoUrl(owner, repo)

    // Check if already cloned
    if (existsSync(path.join(repoPath, '.git'))) {
      console.log(`📂 Repository exists: ${repoPath}`)
      // Pull latest changes
      await this.pullLatest(repoPath)
      return {
        path: repoPath,
        url: repoUrl,
        branch: await this.getCurrentBranch(repoPath)
      }
    }

    // Clone the repository
    console.log(`📥 Cloning repository: ${repoId}`)
    const success = await this.cloneRepo(repoUrl, repoPath)

    if (!success) {
      return null
    }

    return {
      path: repoPath,
      url: repoUrl,
      branch: await this.getCurrentBranch(repoPath)
    }
  }

  /**
   * Build repository URL (supports GitHub token for private repos)
   */
  private buildRepoUrl(owner: string, repo: string): string {
    const token = process.env.GITHUB_TOKEN
    if (token) {
      return `https://${token}@github.com/${owner}/${repo}.git`
    }
    return `https://github.com/${owner}/${repo}.git`
  }

  /**
   * Clone a repository
   */
  private async cloneRepo(url: string, targetPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      // Ensure parent directory exists
      const parentDir = path.dirname(targetPath)
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true })
      }

      // Sanitize URL for logging (hide token)
      const safeUrl = url.replace(/https:\/\/[^@]+@/, 'https://***@')
      console.log(`🔄 Cloning ${safeUrl} to ${targetPath}`)

      const proc = spawn('git', ['clone', '--depth', '100', url, targetPath], {
        timeout: 120000 // 2 minute timeout for clone
      })

      proc.stdout.on('data', (data) => {
        console.log(`git: ${data.toString().trim()}`)
      })

      proc.stderr.on('data', (data) => {
        // Git outputs progress to stderr
        console.log(`git: ${data.toString().trim()}`)
      })

      proc.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ Repository cloned successfully`)
          resolve(true)
        } else {
          console.error(`❌ Failed to clone repository (exit code ${code})`)
          resolve(false)
        }
      })

      proc.on('error', (error) => {
        console.error(`❌ Git clone error:`, error)
        resolve(false)
      })
    })
  }

  /**
   * Pull latest changes
   */
  private async pullLatest(repoPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      console.log(`🔄 Pulling latest changes in ${repoPath}`)

      const proc = spawn('git', ['pull', '--ff-only'], {
        cwd: repoPath,
        timeout: 60000
      })

      proc.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ Repository updated`)
          resolve(true)
        } else {
          console.log(`⚠️ Pull failed (code ${code}), continuing with existing code`)
          resolve(true) // Still allow work to continue
        }
      })

      proc.on('error', () => {
        console.log(`⚠️ Pull error, continuing with existing code`)
        resolve(true)
      })
    })
  }

  /**
   * Get current branch name
   */
  private async getCurrentBranch(repoPath: string): Promise<string> {
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: repoPath,
        encoding: 'utf-8'
      }).trim()
      return branch
    } catch {
      return 'main'
    }
  }

  /**
   * Create a new branch for the task
   */
  async createTaskBranch(repoPath: string, taskId: string): Promise<string> {
    const branchName = `claude/${taskId.slice(0, 8)}`

    try {
      // Check if branch already exists
      execSync(`git rev-parse --verify ${branchName}`, {
        cwd: repoPath,
        stdio: 'pipe'
      })
      // Branch exists, checkout
      execSync(`git checkout ${branchName}`, { cwd: repoPath })
      console.log(`📂 Checked out existing branch: ${branchName}`)
    } catch {
      // Branch doesn't exist, create it
      execSync(`git checkout -b ${branchName}`, { cwd: repoPath })
      console.log(`🌿 Created new branch: ${branchName}`)
    }

    return branchName
  }
}

export const repoManager = new RepoManager()
