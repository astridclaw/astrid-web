#!/usr/bin/env npx tsx
/**
 * Check that Prisma schema, iOS Swift models, and Core Data models stay in sync
 *
 * This script prevents issues where:
 * - API adds a field but iOS doesn't know about it (app crashes or ignores data)
 * - iOS adds a field that doesn't exist in the API (silent failures)
 * - Core Data model doesn't match Swift model (migration issues)
 */

import * as fs from 'fs';
import * as path from 'path';

// Field mappings between Prisma and iOS (some fields have different names)
const FIELD_MAPPINGS: Record<string, string> = {
  // Prisma name -> iOS name
  'description': 'description', // iOS uses taskDescription in CoreData but description in Task.swift
};

// Fields that exist only on one side (intentionally different)
const PRISMA_ONLY_FIELDS = new Set([
  'creatorId',      // iOS gets this from API but doesn't persist locally
  'assigneeId',     // iOS handles this differently
  'aiAgentId',      // Server-only field
  'attachments',    // Complex relation, handled separately
  'codingWorkflow', // Server-only
  'comments',       // Fetched separately
  'reminderQueue',  // Server-only
  'secureFiles',    // Handled separately
  'lists',          // Relation handled differently
  'creator',        // Relation
  'assignee',       // Relation
  'aiAgent',        // Relation
]);

const IOS_ONLY_FIELDS = new Set([
  'listIds',        // iOS flattens the lists relation
  'syncStatus',     // Local sync tracking
  'lastSyncedAt',   // Local sync tracking
  'syncAttempts',   // Local sync tracking
  'lastSyncAttemptAt', // Local sync tracking
  'lastSyncError',  // Local sync tracking
  'searchableText', // Local search index
]);

// Parse Prisma schema to extract Task model fields
function parsePrismaSchema(schemaPath: string): Set<string> {
  const content = fs.readFileSync(schemaPath, 'utf-8');
  const fields = new Set<string>();

  // Find the Task model
  const taskModelMatch = content.match(/model Task \{([\s\S]*?)\n\}/);
  if (!taskModelMatch) {
    console.error('❌ Could not find Task model in Prisma schema');
    process.exit(1);
  }

  const taskModel = taskModelMatch[1];

  // Extract field names (lines that start with field name, not @@ or comments)
  const lines = taskModel.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;

    const fieldMatch = trimmed.match(/^(\w+)\s+/);
    if (fieldMatch) {
      fields.add(fieldMatch[1]);
    }
  }

  return fields;
}

// Parse iOS Task.swift to extract properties
function parseSwiftTask(swiftPath: string): Set<string> {
  const content = fs.readFileSync(swiftPath, 'utf-8');
  const fields = new Set<string>();

  // Find struct Task definition and its properties
  const structMatch = content.match(/struct Task[^{]*\{([\s\S]*?)(?=\n    (?:enum|struct|init|func|var \w+:.*\{|static|private|\/\/)|\n\})/);
  if (!structMatch) {
    console.error('❌ Could not find Task struct in Swift file');
    process.exit(1);
  }

  const structBody = structMatch[1];

  // Extract var/let declarations
  const propRegex = /^\s+(?:var|let)\s+(\w+)\s*:/gm;
  let match;
  while ((match = propRegex.exec(structBody)) !== null) {
    fields.add(match[1]);
  }

  return fields;
}

// Parse Core Data model XML to extract CDTask attributes
function parseCoreDataModel(xmlPath: string): Set<string> {
  const content = fs.readFileSync(xmlPath, 'utf-8');
  const fields = new Set<string>();

  // Find CDTask entity
  const entityMatch = content.match(/<entity name="CDTask"[^>]*>([\s\S]*?)<\/entity>/);
  if (!entityMatch) {
    console.error('❌ Could not find CDTask entity in Core Data model');
    process.exit(1);
  }

  const entityContent = entityMatch[1];

  // Extract attribute names
  const attrRegex = /<attribute name="(\w+)"/g;
  let match;
  while ((match = attrRegex.exec(entityContent)) !== null) {
    fields.add(match[1]);
  }

  return fields;
}

// Normalize field name for comparison
function normalizeFieldName(name: string): string {
  // Handle special mappings
  if (FIELD_MAPPINGS[name]) return FIELD_MAPPINGS[name];

  // Handle taskDescription -> description
  if (name === 'taskDescription') return 'description';

  return name;
}

function main() {
  const projectRoot = path.resolve(__dirname, '..');

  const prismaPath = path.join(projectRoot, 'prisma/schema.prisma');
  const swiftPath = path.join(projectRoot, 'ios-app/Astrid App/Models/Task.swift');
  const coreDataPath = path.join(projectRoot, 'ios-app/AstridApp.xcdatamodeld/AstridApp.xcdatamodel/contents');

  console.log('🔍 Checking model synchronization...\n');

  // Check if iOS code exists (it may be in a separate repo after monorepo split)
  const iosExists = fs.existsSync(swiftPath) && fs.existsSync(coreDataPath);
  if (!iosExists) {
    console.log('ℹ️  iOS code not found in this repo (expected after monorepo split)');
    console.log('   iOS code is now in: https://github.com/Graceful-Tools/astrid-ios');
    console.log('✅ Skipping iOS model sync check\n');
    process.exit(0);
  }

  // Parse all models
  const prismaFields = parsePrismaSchema(prismaPath);
  const swiftFields = parseSwiftTask(swiftPath);
  const coreDataFields = parseCoreDataModel(coreDataPath);

  console.log(`📊 Found fields:`);
  console.log(`   Prisma Task: ${prismaFields.size} fields`);
  console.log(`   iOS Task.swift: ${swiftFields.size} fields`);
  console.log(`   Core Data CDTask: ${coreDataFields.size} fields\n`);

  let hasErrors = false;
  const warnings: string[] = [];

  // Check Prisma fields exist in iOS
  console.log('🔄 Checking Prisma → iOS sync...');
  for (const field of prismaFields) {
    if (PRISMA_ONLY_FIELDS.has(field)) continue;

    const normalizedField = normalizeFieldName(field);

    if (!swiftFields.has(field) && !swiftFields.has(normalizedField)) {
      console.log(`   ❌ Prisma field "${field}" missing from iOS Task.swift`);
      hasErrors = true;
    }
  }

  // Check iOS fields exist in Prisma (or are intentionally iOS-only)
  console.log('🔄 Checking iOS → Prisma sync...');
  for (const field of swiftFields) {
    if (IOS_ONLY_FIELDS.has(field)) continue;

    const normalizedField = normalizeFieldName(field);

    if (!prismaFields.has(field) && !prismaFields.has(normalizedField)) {
      // Check if it's a computed property or local-only
      if (!field.startsWith('_') && field !== 'id') {
        warnings.push(`   ⚠️  iOS field "${field}" not in Prisma (may be computed/local-only)`);
      }
    }
  }

  // Check Swift Task fields exist in Core Data
  console.log('🔄 Checking Task.swift → Core Data sync...');
  for (const field of swiftFields) {
    if (IOS_ONLY_FIELDS.has(field)) continue;

    // Skip computed properties and relations that aren't stored in CoreData
    const skipFields = new Set(['id', 'lists', 'attachments', 'comments', 'secureFiles', 'assignee', 'creator']);
    if (skipFields.has(field)) continue;

    const coreDataField = field === 'description' ? 'taskDescription' : field;

    if (!coreDataFields.has(field) && !coreDataFields.has(coreDataField)) {
      // Not all Swift fields need to be in CoreData (some are API-only)
      warnings.push(`   ⚠️  Swift field "${field}" not in Core Data CDTask`);
    }
  }

  // Print warnings
  if (warnings.length > 0) {
    console.log('\n📋 Warnings (may be intentional):');
    warnings.forEach(w => console.log(w));
  }

  // Summary
  console.log('\n' + '─'.repeat(50));
  if (hasErrors) {
    console.log('❌ Model sync check FAILED');
    console.log('\nTo fix:');
    console.log('1. Add missing fields to iOS Task.swift');
    console.log('2. Add corresponding attributes to Core Data model');
    console.log('3. Update CDTask+CoreDataClass.swift to map the field');
    console.log('\nOr if the field is intentionally server-only, add it to PRISMA_ONLY_FIELDS in this script.');
    process.exit(1);
  } else {
    console.log('✅ Model sync check PASSED');
    process.exit(0);
  }
}

main();
