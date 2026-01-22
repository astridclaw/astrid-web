#!/usr/bin/env npx tsx
/**
 * Create a task in Astrid via OAuth API
 * Usage: npx tsx scripts/create-task.ts "Task title" "Optional description"
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const ASTRID_API_BASE = 'https://astrid.cc';

async function getAccessToken(): Promise<string> {
  const clientId = process.env.ASTRID_OAUTH_CLIENT_ID;
  const clientSecret = process.env.ASTRID_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing ASTRID_OAUTH_CLIENT_ID or ASTRID_OAUTH_CLIENT_SECRET');
  }

  const response = await fetch(`${ASTRID_API_BASE}/api/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function createTask(title: string, listId: string, description?: string) {
  console.log('🔐 Obtaining OAuth access token...');
  const accessToken = await getAccessToken();
  console.log('✅ Access token obtained');

  console.log(`📝 Creating task: "${title}"`);
  const response = await fetch(`${ASTRID_API_BASE}/api/v1/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-OAuth-Token': accessToken,
    },
    body: JSON.stringify({
      title,
      description,
      listIds: [listId],
      priority: 1,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create task: ${response.status} - ${text}`);
  }

  const data = await response.json();
  console.log('✅ Task created successfully!');
  console.log(`📋 Task ID: ${data.task.id}`);
  console.log(`📋 Title: ${data.task.title}`);
  return data.task;
}

// Main
const listId = process.env.ASTRID_OAUTH_LIST_ID;
if (!listId) {
  console.error('❌ Missing ASTRID_OAUTH_LIST_ID environment variable');
  process.exit(1);
}

const title = process.argv[2];
const description = process.argv[3];

if (!title) {
  console.error('Usage: npx tsx scripts/create-task.ts "Task title" "Optional description"');
  process.exit(1);
}

createTask(title, listId, description).catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
