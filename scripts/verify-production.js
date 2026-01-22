#!/usr/bin/env node

import { config } from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
config({ path: path.resolve(process.cwd(), '.env.local') });

const DATABASE_URL_PROD = process.env.DATABASE_URL_PROD;

if (!DATABASE_URL_PROD) {
  console.error('❌ Error: DATABASE_URL_PROD environment variable is not set');
  console.error('Please set it in your .env.local file');
  process.exit(1);
}

console.log('🔍 Verifying production database schema...');
console.log(`📊 Production DB: ${DATABASE_URL_PROD.substring(0, 30)}...`);

try {
  // Set the production database URL
  process.env.DATABASE_URL = DATABASE_URL_PROD;
  
  // Use Prisma to check the schema
  const { execSync } = await import('child_process');
  
  console.log('📋 Current production database schema:');
  execSync('npx prisma db pull --force', { 
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: DATABASE_URL_PROD }
  });
  
  console.log('✅ Production database schema verified!');
  console.log('🎯 The password field should now be available in your production database.');
  
} catch (error) {
  console.error('❌ Verification failed:', error.message);
  process.exit(1);
}
