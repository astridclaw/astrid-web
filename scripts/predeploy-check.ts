#!/usr/bin/env tsx

/**
 * Pre-deployment Check Script
 * 
 * This script runs comprehensive checks before deployment to prevent
 * build failures and catch issues early.
 * 
 * Run with: npm run predeploy:check
 */

import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import path from 'path'

interface CheckResult {
  name: string
  status: 'pass' | 'fail' | 'warning'
  message: string
  details?: string[]
}

class PreDeployChecker {
  private results: CheckResult[] = []
  private hasErrors = false

  constructor() {
    console.log('🚀 Pre-deployment Checks\n')
  }

  private addResult(result: CheckResult) {
    this.results.push(result)
    
    const icon = result.status === 'pass' ? '✅' : result.status === 'warning' ? '⚠️' : '❌'
    console.log(`${icon} ${result.name}: ${result.message}`)
    
    if (result.details && result.details.length > 0) {
      result.details.forEach(detail => console.log(`   ${detail}`))
    }
    
    if (result.status === 'fail') {
      this.hasErrors = true
    }
    
    console.log('')
  }

  private runCommand(command: string, description: string): { success: boolean; output: string } {
    try {
      const output = execSync(command, { 
        encoding: 'utf-8', 
        stdio: 'pipe',
        timeout: 60000 // 1 minute timeout
      })
      return { success: true, output }
    } catch (error: any) {
      return { 
        success: false, 
        output: error.stdout || error.stderr || error.message 
      }
    }
  }

  // Check 1: Environment variables
  checkEnvironmentVariables() {
    const requiredEnvVars = [
      'NEXTAUTH_SECRET',
      'NEXTAUTH_URL',
      'DATABASE_URL',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET'
    ]

    const optionalEnvVars = [
      'RESEND_API_KEY',
      'FROM_EMAIL'
    ]

    const missing = requiredEnvVars.filter(envVar => !process.env[envVar])
    const optionalMissing = optionalEnvVars.filter(envVar => !process.env[envVar])

    if (missing.length === 0) {
      const details = []
      if (optionalMissing.length > 0) {
        details.push(`Optional: ${optionalMissing.join(', ')} (email features will use development mode)`)
      }
      
      this.addResult({
        name: 'Environment Variables',
        status: optionalMissing.length > 0 ? 'warning' : 'pass',
        message: 'Required environment variables are set',
        details
      })
    } else {
      this.addResult({
        name: 'Environment Variables',
        status: 'fail',
        message: 'Missing required environment variables',
        details: [`Missing: ${missing.join(', ')}`]
      })
    }
  }

  // Check 2: TypeScript compilation
  checkTypeScript() {
    const result = this.runCommand('npx tsc --noEmit', 'TypeScript compilation')
    
    this.addResult({
      name: 'TypeScript',
      status: result.success ? 'pass' : 'fail',
      message: result.success ? 'No TypeScript errors' : 'TypeScript compilation failed',
      details: result.success ? [] : result.output.split('\n').filter(line => line.trim())
    })
  }

  // Check 3: ESLint
  checkLinting() {
    const result = this.runCommand('npm run lint', 'ESLint')
    
    this.addResult({
      name: 'ESLint',
      status: result.success ? 'pass' : 'fail',
      message: result.success ? 'No linting errors' : 'Linting errors found',
      details: result.success ? [] : result.output.split('\n').filter(line => line.trim())
    })
  }

  // Check 4: Package vulnerabilities
  checkVulnerabilities() {
    const result = this.runCommand('npm audit --audit-level high', 'npm audit')
    
    if (result.success) {
      this.addResult({
        name: 'Security Audit',
        status: 'pass',
        message: 'No high-severity vulnerabilities found'
      })
    } else {
      // Check if it's just warnings or actual high-severity issues
      const hasHighSeverity = result.output.includes('high') || result.output.includes('critical')
      
      this.addResult({
        name: 'Security Audit',
        status: hasHighSeverity ? 'warning' : 'pass',
        message: hasHighSeverity ? 'High-severity vulnerabilities found' : 'Only low-severity vulnerabilities found',
        details: hasHighSeverity ? ['Run "npm audit fix" to resolve issues'] : []
      })
    }
  }

  // Check 5: Database schema
  checkDatabaseSchema() {
    try {
      // Check if Prisma schema exists
      if (!existsSync('prisma/schema.prisma')) {
        this.addResult({
          name: 'Database Schema',
          status: 'fail',
          message: 'Prisma schema not found'
        })
        return
      }

      // Try to generate Prisma client
      const result = this.runCommand('npx prisma generate', 'Prisma client generation')
      
      this.addResult({
        name: 'Database Schema',
        status: result.success ? 'pass' : 'fail',
        message: result.success ? 'Prisma schema is valid' : 'Prisma schema has errors',
        details: result.success ? [] : [result.output]
      })
    } catch (error) {
      this.addResult({
        name: 'Database Schema',
        status: 'fail',
        message: 'Database schema check failed',
        details: [String(error)]
      })
    }
  }

  // Check 6: Build test
  checkBuild() {
    console.log('🏗️  Testing production build (this may take a while)...\n')
    
    const result = this.runCommand('npm run build', 'Next.js build')
    
    this.addResult({
      name: 'Production Build',
      status: result.success ? 'pass' : 'fail',
      message: result.success ? 'Build completed successfully' : 'Build failed',
      details: result.success ? [] : result.output.split('\n').filter(line => line.trim()).slice(-20) // Last 20 lines
    })
  }

  // Check 7: Test suite
  checkTests() {
    const result = this.runCommand('npm run test:run', 'Test suite')
    
    this.addResult({
      name: 'Test Suite',
      status: result.success ? 'pass' : 'warning',
      message: result.success ? 'All tests passed' : 'Some tests failed',
      details: result.success ? [] : ['Check test output for details']
    })
  }

  // Check 8: File structure
  checkFileStructure() {
    const requiredFiles = [
      'package.json',
      'next.config.mjs',
      'tailwind.config.ts',
      'prisma/schema.prisma',
      'app/layout.tsx',
      'app/page.tsx'
    ]

    const missing = requiredFiles.filter(file => !existsSync(file))
    
    this.addResult({
      name: 'File Structure',
      status: missing.length === 0 ? 'pass' : 'fail',
      message: missing.length === 0 ? 'All required files present' : 'Missing required files',
      details: missing.length > 0 ? [`Missing: ${missing.join(', ')}`] : []
    })
  }

  // Check 9: Package.json validation
  checkPackageJson() {
    try {
      const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'))
      
      const requiredScripts = ['build', 'start', 'dev']
      const missingScripts = requiredScripts.filter(script => !packageJson.scripts?.[script])
      
      if (missingScripts.length === 0) {
        this.addResult({
          name: 'Package Configuration',
          status: 'pass',
          message: 'Package.json is valid'
        })
      } else {
        this.addResult({
          name: 'Package Configuration',
          status: 'fail',
          message: 'Package.json missing required scripts',
          details: [`Missing scripts: ${missingScripts.join(', ')}`]
        })
      }
    } catch (error) {
      this.addResult({
        name: 'Package Configuration',
        status: 'fail',
        message: 'Invalid package.json',
        details: [String(error)]
      })
    }
  }

  // Check 10: Next.js configuration
  checkNextConfig() {
    const configFiles = ['next.config.mjs', 'next.config.js']
    const configExists = configFiles.some(file => existsSync(file))
    
    if (configExists) {
      this.addResult({
        name: 'Next.js Configuration',
        status: 'pass',
        message: 'Next.js configuration found'
      })
    } else {
      this.addResult({
        name: 'Next.js Configuration',
        status: 'warning',
        message: 'No Next.js configuration file found',
        details: ['This may be fine for simple setups']
      })
    }
  }

  // Run all checks
  async runAllChecks() {
    console.log('Running pre-deployment checks...\n')

    // Quick checks first
    this.checkFileStructure()
    this.checkPackageJson()
    this.checkNextConfig()
    this.checkEnvironmentVariables()
    
    // Database and schema checks
    this.checkDatabaseSchema()
    
    // Code quality checks
    this.checkTypeScript()
    this.checkLinting()
    
    // Security and dependencies
    this.checkVulnerabilities()
    
    // Test suite
    this.checkTests()
    
    // Final build test (most comprehensive)
    this.checkBuild()
    
    this.printSummary()
  }

  private printSummary() {
    console.log('📋 Summary\n')
    
    const passed = this.results.filter(r => r.status === 'pass').length
    const warnings = this.results.filter(r => r.status === 'warning').length
    const failed = this.results.filter(r => r.status === 'fail').length
    
    console.log(`✅ Passed: ${passed}`)
    console.log(`⚠️  Warnings: ${warnings}`)
    console.log(`❌ Failed: ${failed}`)
    console.log('')
    
    if (this.hasErrors) {
      console.log('🚫 Pre-deployment checks FAILED')
      console.log('Please fix the errors above before deploying.')
      console.log('')
      process.exit(1)
    } else if (warnings > 0) {
      console.log('⚠️  Pre-deployment checks passed with warnings')
      console.log('Consider addressing the warnings above.')
      console.log('')
    } else {
      console.log('🎉 All pre-deployment checks PASSED!')
      console.log('Your application is ready for deployment.')
      console.log('')
    }
  }
}

// Main execution
async function main() {
  const checker = new PreDeployChecker()
  await checker.runAllChecks()
}

main().catch(console.error)
