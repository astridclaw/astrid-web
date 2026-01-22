/**
 * Production Environment Variable Validation
 * Validates that all critical environment variables are set correctly for production deployment
 * This helps prevent insecure connection warnings and other deployment issues
 */

interface ValidationResult {
  variable: string
  status: 'ok' | 'warning' | 'error'
  message: string
}

const results: ValidationResult[] = []

function checkVariable(
  name: string,
  required: boolean = false,
  validator?: (value: string) => { valid: boolean; message?: string }
): void {
  const value = process.env[name]

  if (!value) {
    if (required) {
      results.push({
        variable: name,
        status: 'error',
        message: `❌ Missing required variable`
      })
    } else {
      results.push({
        variable: name,
        status: 'warning',
        message: `⚠️  Not set (will use fallback)`
      })
    }
    return
  }

  // Run custom validator if provided
  if (validator) {
    const result = validator(value)
    if (!result.valid) {
      results.push({
        variable: name,
        status: 'error',
        message: `❌ ${result.message || 'Invalid value'}`
      })
      return
    }
  }

  results.push({
    variable: name,
    status: 'ok',
    message: `✅ Set correctly`
  })
}

function validateUrl(value: string): { valid: boolean; message?: string } {
  // Check if URL uses HTTPS in production
  if (process.env.NODE_ENV === 'production' && value.startsWith('http://')) {
    return {
      valid: false,
      message: 'Must use HTTPS in production (starts with http://)'
    }
  }

  // Check if URL is valid
  try {
    new URL(value)
    return { valid: true }
  } catch {
    return {
      valid: false,
      message: 'Invalid URL format'
    }
  }
}

function validateDatabaseUrl(value: string): { valid: boolean; message?: string } {
  // Check if it's a PostgreSQL URL
  if (!value.startsWith('postgresql://') && !value.startsWith('postgres://')) {
    return {
      valid: false,
      message: 'Must be a PostgreSQL connection string'
    }
  }

  // In production, recommend SSL mode
  if (process.env.NODE_ENV === 'production' && !value.includes('sslmode=')) {
    return {
      valid: true, // Not an error, just a warning
      message: '⚠️  Consider adding ?sslmode=require for production'
    }
  }

  return { valid: true }
}

console.log('\n🔍 Validating Production Environment Variables\n')
console.log(`Environment: ${process.env.NODE_ENV || 'development'}\n`)

// Critical URL variables that prevent insecure connection warnings
console.log('📡 URL Configuration (prevents mixed content warnings):')
checkVariable('NEXTAUTH_URL', false, validateUrl)
checkVariable('NEXT_PUBLIC_BASE_URL', false, validateUrl)
checkVariable('VERCEL_URL', false) // Set automatically by Vercel

// Database
console.log('\n🗄️  Database Configuration:')
checkVariable('DATABASE_URL', true, validateDatabaseUrl)

// Authentication
console.log('\n🔐 Authentication:')
checkVariable('NEXTAUTH_SECRET', true)
checkVariable('GOOGLE_CLIENT_ID', false)
checkVariable('GOOGLE_CLIENT_SECRET', false)

// Email
console.log('\n📧 Email Service:')
checkVariable('RESEND_API_KEY', false)
checkVariable('FROM_EMAIL', false)

// AI Services
console.log('\n🤖 AI Services (optional):')
checkVariable('ANTHROPIC_API_KEY', false)
checkVariable('OPENAI_API_KEY', false)

// GitHub Integration
console.log('\n🐙 GitHub Integration (optional):')
checkVariable('GITHUB_APP_ID', false)
checkVariable('GITHUB_APP_PRIVATE_KEY', false)
checkVariable('GITHUB_WEBHOOK_SECRET', false)

// Print results
console.log('\n' + '='.repeat(70))
console.log('📊 Validation Results:\n')

const errors = results.filter(r => r.status === 'error')
const warnings = results.filter(r => r.status === 'warning')
const success = results.filter(r => r.status === 'ok')

results.forEach(result => {
  console.log(`${result.variable.padEnd(30)} ${result.message}`)
})

console.log('\n' + '='.repeat(70))
console.log(`\n✅ Success: ${success.length}`)
console.log(`⚠️  Warnings: ${warnings.length}`)
console.log(`❌ Errors: ${errors.length}\n`)

if (errors.length > 0) {
  console.log('🚨 CRITICAL: Fix the errors above before deploying to production!\n')
  process.exit(1)
}

if (warnings.length > 0) {
  console.log('💡 TIP: Set the warned variables to avoid fallback behavior\n')
}

if (process.env.NODE_ENV === 'production') {
  if (!process.env.NEXTAUTH_URL && !process.env.NEXT_PUBLIC_BASE_URL && !process.env.VERCEL_URL) {
    console.log('⚠️  WARNING: No URL variables set in production!')
    console.log('This may cause insecure connection warnings.')
    console.log('Set at least one of: NEXTAUTH_URL, NEXT_PUBLIC_BASE_URL, or VERCEL_URL\n')
  }
}

console.log('✨ Validation complete!\n')
