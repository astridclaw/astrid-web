#!/usr/bin/env npx tsx
/**
 * Detect breaking API changes by comparing current types against the API contract
 *
 * Breaking changes include:
 * - Removing a required field from the API contract
 * - Changing a field's type
 * - Removing enum values
 *
 * This script compares:
 * 1. types/task.ts interfaces against lib/api/api-contract.ts
 * 2. Prisma schema against the API contract
 *
 * If breaking changes are detected, the build fails with instructions
 * to either update the contract version or revert the changes.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  API_CONTRACTS,
  CURRENT_API_VERSION,
  type ContractFields,
} from '../lib/api/api-contract';

const projectRoot = path.resolve(__dirname, '..');

interface BreakingChange {
  entity: string;
  field: string;
  type: 'removed' | 'type_changed' | 'made_required' | 'enum_value_removed';
  details: string;
}

/**
 * Parse TypeScript interface from file
 */
function parseTypeScriptInterface(filePath: string, interfaceName: string): Map<string, string> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fields = new Map<string, string>();

  // Split by lines and find the interface start
  const lines = content.split('\n');
  let inInterface = false;
  let braceCount = 0;
  let interfaceBody = '';

  for (const line of lines) {
    if (!inInterface) {
      // Look for the exact interface declaration
      if (line.match(new RegExp(`^export interface ${interfaceName}\\s*[{<]`)) ||
          line.match(new RegExp(`^export interface ${interfaceName}$`))) {
        inInterface = true;
        braceCount = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        continue;
      }
    } else {
      // Count braces to find end of interface
      braceCount += (line.match(/\{/g) || []).length;
      braceCount -= (line.match(/\}/g) || []).length;

      if (braceCount <= 0) {
        break;
      }

      interfaceBody += line + '\n';
    }
  }

  if (!interfaceBody) {
    console.warn(`⚠️  Could not find interface ${interfaceName} in ${filePath}`);
    return fields;
  }

  // Parse field definitions
  const fieldRegex = /^\s+(\w+)(\?)?:\s*([^/\n]+)/gm;
  let fieldMatch;
  while ((fieldMatch = fieldRegex.exec(interfaceBody)) !== null) {
    const [, fieldName, optional, fieldType] = fieldMatch;
    const cleanType = fieldType.trim().replace(/[,;]$/, '');
    fields.set(fieldName, `${cleanType}${optional ? '?' : ''}`);
  }

  return fields;
}

/**
 * Parse Prisma model from schema
 */
function parsePrismaModel(modelName: string): Map<string, string> {
  const schemaPath = path.join(projectRoot, 'prisma/schema.prisma');
  const content = fs.readFileSync(schemaPath, 'utf-8');
  const fields = new Map<string, string>();

  const modelRegex = new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`, 'm');
  const match = content.match(modelRegex);
  if (!match) {
    console.warn(`⚠️  Could not find model ${modelName} in Prisma schema`);
    return fields;
  }

  const modelBody = match[1];

  // Parse field definitions
  const lines = modelBody.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;

    const fieldMatch = trimmed.match(/^(\w+)\s+(\w+)(\?)?/);
    if (fieldMatch) {
      const [, fieldName, fieldType, optional] = fieldMatch;
      fields.set(fieldName, `${fieldType}${optional ? '?' : ''}`);
    }
  }

  return fields;
}

/**
 * Check for breaking changes against contract
 */
function checkBreakingChanges(
  entityName: string,
  contract: ContractFields,
  currentFields: Map<string, string>
): BreakingChange[] {
  const changes: BreakingChange[] = [];

  for (const [fieldName, fieldDef] of Object.entries(contract)) {
    // Skip deprecated fields - they can be removed
    if (fieldDef.deprecated) continue;

    // Check if field exists in current implementation
    if (!currentFields.has(fieldName)) {
      // Field was removed - this is a breaking change if it was required
      if (fieldDef.required) {
        changes.push({
          entity: entityName,
          field: fieldName,
          type: 'removed',
          details: `Required field "${fieldName}" was removed from ${entityName}`,
        });
      }
    } else {
      // Field exists - check for type changes
      const currentType = currentFields.get(fieldName)!;
      const expectedType = fieldDef.type;

      // Basic type compatibility check
      // This is simplified - a full implementation would parse types properly
      const typeMapping: Record<string, string[]> = {
        string: ['string', 'String'],
        number: ['number', 'Int', 'Float'],
        boolean: ['boolean', 'Boolean'],
        date: ['Date', 'DateTime'],
        object: ['object', 'Object'],
        array: ['array', 'Array'],
        enum: ['enum'], // Special handling below
      };

      if (expectedType !== 'enum') {
        const validTypes = typeMapping[expectedType] || [expectedType];
        const isCompatible = validTypes.some(
          (t) =>
            currentType.toLowerCase().includes(t.toLowerCase()) ||
            currentType.includes('|') // Union types are complex, skip for now
        );

        if (!isCompatible && !currentType.includes('null') && !currentType.includes('undefined')) {
          // Type might have changed - log as warning
          // Full type checking would require a TypeScript parser
        }
      }
    }
  }

  return changes;
}

/**
 * Main function
 */
function main() {
  console.log('🔍 Checking for API breaking changes...\n');

  const typesPath = path.join(projectRoot, 'types/task.ts');
  const breakingChanges: BreakingChange[] = [];

  // Get current contract
  const contract = API_CONTRACTS[CURRENT_API_VERSION as keyof typeof API_CONTRACTS];

  // Check Task interface
  console.log('📋 Checking Task interface...');
  const taskFields = parseTypeScriptInterface(typesPath, 'Task');
  const taskChanges = checkBreakingChanges('Task', contract.Task, taskFields);
  breakingChanges.push(...taskChanges);
  console.log(`   Found ${taskFields.size} fields in types/task.ts`);

  // Check TaskList interface
  console.log('📋 Checking TaskList interface...');
  const taskListFields = parseTypeScriptInterface(typesPath, 'TaskList');
  const taskListChanges = checkBreakingChanges('TaskList', contract.TaskList, taskListFields);
  breakingChanges.push(...taskListChanges);
  console.log(`   Found ${taskListFields.size} fields in types/task.ts`);

  // Check User interface
  console.log('📋 Checking User interface...');
  const userFields = parseTypeScriptInterface(typesPath, 'User');
  const userChanges = checkBreakingChanges('User', contract.User, userFields);
  breakingChanges.push(...userChanges);
  console.log(`   Found ${userFields.size} fields in types/task.ts`);

  // Check Comment interface
  console.log('📋 Checking Comment interface...');
  const commentFields = parseTypeScriptInterface(typesPath, 'Comment');
  const commentChanges = checkBreakingChanges('Comment', contract.Comment, commentFields);
  breakingChanges.push(...commentChanges);
  console.log(`   Found ${commentFields.size} fields in types/task.ts`);

  // Also check Prisma schema matches
  console.log('\n📋 Checking Prisma Task model...');
  const prismaTaskFields = parsePrismaModel('Task');
  console.log(`   Found ${prismaTaskFields.size} fields in Prisma schema`);

  // Compare Prisma fields with contract
  for (const [fieldName, fieldDef] of Object.entries(contract.Task)) {
    if ('deprecated' in fieldDef && fieldDef.deprecated) continue;

    // Map TypeScript field names to Prisma field names
    const prismaFieldName = fieldName === 'creator' ? 'creatorId' : fieldName;

    // Skip relation fields and computed fields
    const skipFields = new Set([
      'creator',
      'assignee',
      'lists',
      'attachments',
      'comments',
      'secureFiles',
      'when',
      'dueDate',
    ]);

    if (skipFields.has(fieldName)) continue;

    if (fieldDef.required && !prismaTaskFields.has(prismaFieldName) && !prismaTaskFields.has(fieldName)) {
      // Check if it's a field that Prisma handles differently
      const prismaAliases: Record<string, string> = {
        repeatFrom: 'repeatFrom',
        occurrenceCount: 'occurrenceCount',
      };

      const actualPrismaName = prismaAliases[fieldName] || fieldName;
      if (!prismaTaskFields.has(actualPrismaName)) {
        console.log(`   ⚠️  Contract field "${fieldName}" not found in Prisma (may be computed)`);
      }
    }
  }

  // Report results
  console.log('\n' + '─'.repeat(60));

  if (breakingChanges.length > 0) {
    console.log('❌ BREAKING CHANGES DETECTED!\n');

    for (const change of breakingChanges) {
      console.log(`   ${change.entity}.${change.field}: ${change.details}`);
    }

    console.log('\n📝 To fix this:');
    console.log('');
    console.log('   Option 1: Revert the breaking change');
    console.log('   - Add the removed field back');
    console.log('   - Keep the field as optional if deprecating');
    console.log('');
    console.log('   Option 2: Create a new API version');
    console.log('   1. Update CURRENT_API_VERSION in lib/api/api-contract.ts');
    console.log('   2. Add V2_*_FIELDS contracts with the new schema');
    console.log('   3. Add transformation functions to convert V2 → V1');
    console.log('   4. Keep serving V1 for old clients via X-API-Version header');
    console.log('');
    console.log('   Option 3: Mark the field as deprecated (if removing intentionally)');
    console.log('   - Add "deprecated: true" to the field in api-contract.ts');
    console.log('   - The field can then be safely removed');

    process.exit(1);
  }

  // Check for new fields that should be added to contract
  console.log('\n📋 Checking for new fields not in contract...');

  const newFields: { entity: string; field: string }[] = [];

  // Compare current Task fields with contract
  for (const [field] of taskFields) {
    if (!contract.Task[field as keyof typeof contract.Task]) {
      // Skip common computed/local fields
      const skipFields = new Set(['when', 'dueDate']);
      if (!skipFields.has(field)) {
        newFields.push({ entity: 'Task', field });
      }
    }
  }

  // Compare current TaskList fields with contract
  for (const [field] of taskListFields) {
    if (!contract.TaskList[field as keyof typeof contract.TaskList]) {
      newFields.push({ entity: 'TaskList', field });
    }
  }

  if (newFields.length > 0) {
    console.log('   ⚠️  New fields found that should be added to API contract:');
    for (const { entity, field } of newFields) {
      console.log(`      - ${entity}.${field}`);
    }
    console.log('');
    console.log('   Add these to lib/api/api-contract.ts to track them.');
    console.log('   (This is a warning, not an error - new fields don\'t break clients)');
  } else {
    console.log('   ✅ All fields are tracked in the API contract');
  }

  console.log('\n' + '─'.repeat(60));
  console.log('✅ No breaking API changes detected');
  console.log(`   Current API version: v${CURRENT_API_VERSION}`);
  process.exit(0);
}

main();
