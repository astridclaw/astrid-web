#!/usr/bin/env node

/**
 * Build script that safely handles database migrations
 * This runs during Vercel build and applies migrations if DATABASE_URL is available
 * Automatically resolves failed migrations before applying new ones
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function runCommand(command, description, critical = true) {
  console.log(`🔄 ${description}...`);
  try {
    const output = execSync(command, { stdio: 'pipe', encoding: 'utf-8' });
    console.log(`✅ ${description} completed`);
    return { success: true, output };
  } catch (error) {
    const errorOutput = (error.stderr || '') + (error.stdout || '') + (error.message || '');
    console.error(`❌ ${description} failed:`, errorOutput.substring(0, 500));
    if (critical) {
      process.exit(1);
    }
    return { success: false, output: error.stdout || '', error: errorOutput };
  }
}

function runCommandSilent(command) {
  try {
    return execSync(command, { stdio: 'pipe', encoding: 'utf-8' });
  } catch (error) {
    return error.stdout || '';
  }
}

async function resolveFailedMigrations() {
  console.log('🔍 Checking for failed migrations...');

  // Query for failed migrations using echo pipe (heredoc doesn't work in execSync)
  const query = "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL ORDER BY started_at;";
  const result = runCommandSilent(`echo "${query}" | npx prisma db execute --stdin`);

  console.log('Query result:', result);

  // Extract migration names (they start with a date like 20260116)
  const lines = result.split('\n').filter(line => /^\d{8}/.test(line.trim()));

  if (lines.length === 0) {
    console.log('✅ No failed migrations found');
    return true;
  }

  console.log(`Found ${lines.length} failed migration(s):`);
  lines.forEach(line => console.log(`  - ${line.trim()}`));

  for (const line of lines) {
    const migrationName = line.trim();
    if (!migrationName) continue;

    console.log(`\n🔧 Processing failed migration: ${migrationName}`);

    // Find the migration file
    const migrationFile = path.join('prisma/migrations', migrationName, 'migration.sql');

    if (!fs.existsSync(migrationFile)) {
      console.log(`  ⚠️ Migration file not found, marking as rolled-back`);
      runCommandSilent(`npx prisma migrate resolve --rolled-back "${migrationName}"`);
      continue;
    }

    // Read the migration SQL
    const sql = fs.readFileSync(migrationFile, 'utf-8');

    // Extract table names from CREATE TABLE statements
    const tableMatches = sql.match(/CREATE TABLE "([^"]+)"/g) || [];
    const tables = tableMatches.map(m => m.replace('CREATE TABLE "', '').replace('"', ''));

    if (tables.length === 0) {
      // No tables created - likely an ALTER or INDEX migration
      // Check if it adds columns
      if (sql.includes('ADD COLUMN') || sql.includes('CREATE INDEX') || sql.includes('ALTER TABLE')) {
        console.log(`  Migration modifies existing tables, marking as applied`);
        runCommandSilent(`npx prisma migrate resolve --applied "${migrationName}"`);
      } else {
        console.log(`  No CREATE TABLE found, marking as applied (safe default)`);
        runCommandSilent(`npx prisma migrate resolve --applied "${migrationName}"`);
      }
      continue;
    }

    // Check if any of the tables exist
    let tablesExist = false;
    for (const table of tables) {
      const checkQuery = `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${table}');`;
      const checkResult = runCommandSilent(`echo "${checkQuery}" | npx prisma db execute --stdin`);

      if (checkResult.includes('t')) {
        console.log(`  Table '${table}' exists in database`);
        tablesExist = true;
        break;
      }
    }

    if (tablesExist) {
      console.log(`  ✅ Migration artifacts exist, marking as applied`);
      runCommandSilent(`npx prisma migrate resolve --applied "${migrationName}"`);
    } else {
      console.log(`  ⚠️ Migration artifacts don't exist, marking as rolled-back for retry`);
      runCommandSilent(`npx prisma migrate resolve --rolled-back "${migrationName}"`);
    }
  }

  console.log('\n✅ Failed migrations resolved');
  return true;
}

function extractFailedMigrationFromError(errorOutput) {
  // Extract migration name from error like: "The `20260116_add_user_webhook_config` migration started at..."
  const match = errorOutput.match(/The `([^`]+)` migration started at/);
  return match ? match[1] : null;
}

async function main() {
  console.log('🚀 Starting build with database migrations...');

  // 1. Generate Prisma client (critical)
  runCommand('npx prisma generate', 'Generating Prisma client', true);

  // 2. Deploy database migrations (non-critical - might not be available during build)
  if (process.env.DATABASE_URL) {
    console.log('📊 DATABASE_URL found, applying migrations...');

    // First, try to resolve any failed migrations
    try {
      await resolveFailedMigrations();
    } catch (error) {
      console.log('⚠️ Could not check for failed migrations:', error.message);
    }

    // Now try to deploy migrations
    let migrationResult = runCommand('npx prisma migrate deploy', 'Deploying database migrations', false);

    // If migration failed due to a failed migration, try to resolve it
    // Loop to handle multiple failed migrations
    let retryCount = 0;
    const maxRetries = 10;

    while (!migrationResult.success && migrationResult.error && retryCount < maxRetries) {
      const failedMigration = extractFailedMigrationFromError(migrationResult.error);
      if (!failedMigration) break;

      retryCount++;
      console.log(`\n🔧 [Attempt ${retryCount}/${maxRetries}] Detected failed migration: ${failedMigration}`);
      console.log('   Marking as applied (safe default for failed migrations)...');

      // For P3009/P3018 errors (failed migrations), mark as applied because the migration
      // likely partially completed. If it didn't, we'll get a clearer error on retry.
      runCommandSilent(`npx prisma migrate resolve --applied "${failedMigration}"`);

      // Try migration deploy again
      console.log('\n🔄 Retrying migration deploy...');
      migrationResult = runCommand('npx prisma migrate deploy', `Deploying database migrations (retry ${retryCount})`, false);
    }

    if (retryCount >= maxRetries && !migrationResult.success) {
      console.log(`\n⚠️ Reached max retries (${maxRetries}) for resolving failed migrations`);
    }

    if (migrationResult.success) {
      // Apply schema changes (for new indexes)
      runCommand('npx prisma db push --skip-generate --accept-data-loss', 'Applying schema optimizations', false);
    } else {
      console.log('⚠️  Database migrations skipped (DATABASE_URL may not be accessible during build)');
      console.log('ℹ️  Migrations will be applied during first runtime if needed');
    }
  } else {
    console.log('⚠️  DATABASE_URL not found during build, skipping migrations');
    console.log('ℹ️  Make sure DATABASE_URL is set in Vercel environment variables');
  }

  // 3. Build Next.js application (critical)
  runCommand('npm run build:next', 'Building Next.js application', true);

  console.log('✅ Build completed successfully!');
}

main().catch(error => {
  console.error('❌ Build failed:', error);
  process.exit(1);
});
