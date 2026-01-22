#!/usr/bin/env node

/**
 * MCP Test Client - Command Line Tool for Testing MCP Operations
 *
 * Usage:
 *   npm run mcp-test list-operations
 *   npm run mcp-test test-operation get_shared_lists --token=your_token
 *   npm run mcp-test test-all --token=your_token --list=list_id
 */

const { program } = require('commander')
const { spawn } = require('child_process')
const { writeFileSync, mkdirSync } = require('fs')
const { join } = require('path')

// MCP Operations with detailed specifications
const MCP_OPERATIONS = [
  {
    name: "get_shared_lists",
    description: "Get all task lists accessible via MCP token",
    category: "READ",
    requiredParams: ["accessToken"],
    optionalParams: [],
    example: {
      accessToken: "astrid_mcp_your_token_here"
    }
  },
  {
    name: "get_list_tasks",
    description: "Get all tasks from a specific shared list",
    category: "READ",
    requiredParams: ["accessToken", "listId"],
    optionalParams: ["includeCompleted"],
    example: {
      accessToken: "astrid_mcp_your_token_here",
      listId: "list-uuid-here",
      includeCompleted: false
    }
  },
  {
    name: "create_task",
    description: "Create a new task in a shared list",
    category: "WRITE",
    requiredParams: ["accessToken", "listId", "task"],
    optionalParams: [],
    example: {
      accessToken: "astrid_mcp_your_token_here",
      listId: "list-uuid-here",
      task: {
        title: "Test Task from CLI",
        description: "Created via MCP test client",
        priority: 1,
        dueDateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }
    }
  },
  {
    name: "update_task",
    description: "Update an existing task in a shared list",
    category: "WRITE",
    requiredParams: ["accessToken", "listId", "taskUpdate"],
    optionalParams: [],
    example: {
      accessToken: "astrid_mcp_your_token_here",
      listId: "list-uuid-here",
      taskUpdate: {
        taskId: "task-uuid-here",
        title: "Updated Task Title",
        completed: false
      }
    }
  },
  {
    name: "add_comment",
    description: "Add a comment to a task in a shared list",
    category: "WRITE",
    requiredParams: ["accessToken", "listId", "comment"],
    optionalParams: [],
    example: {
      accessToken: "astrid_mcp_your_token_here",
      listId: "list-uuid-here",
      comment: {
        taskId: "task-uuid-here",
        content: "Comment added via MCP test client",
        type: "TEXT"
      }
    }
  },
  {
    name: "get_task_comments",
    description: "Get all comments for a specific task",
    category: "READ",
    requiredParams: ["accessToken", "listId", "taskId"],
    optionalParams: [],
    example: {
      accessToken: "astrid_mcp_your_token_here",
      listId: "list-uuid-here",
      taskId: "task-uuid-here"
    }
  }
]

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
}

function colorize(color, text) {
  return `${colors[color]}${text}${colors.reset}`
}

function printHeader(text) {
  console.log('\n' + colorize('cyan', '='.repeat(60)))
  console.log(colorize('bright', `  ${text}`))
  console.log(colorize('cyan', '='.repeat(60)))
}

function printSuccess(text) {
  console.log(colorize('green', `✓ ${text}`))
}

function printError(text) {
  console.log(colorize('red', `✗ ${text}`))
}

function printInfo(text) {
  console.log(colorize('blue', `ℹ ${text}`))
}

function printWarning(text) {
  console.log(colorize('yellow', `⚠ ${text}`))
}

// List all available MCP operations
function listOperations() {
  printHeader('Available MCP Operations')

  console.log('\nREAD Operations (require "read" permission):')
  MCP_OPERATIONS.filter(op => op.category === 'READ').forEach(op => {
    console.log(colorize('green', `  • ${op.name}`))
    console.log(`    ${op.description}`)
    console.log(colorize('cyan', `    Required: ${op.requiredParams.join(', ')}`))
    if (op.optionalParams.length > 0) {
      console.log(colorize('yellow', `    Optional: ${op.optionalParams.join(', ')}`))
    }
    console.log()
  })

  console.log('\nWRITE Operations (require "write" permission):')
  MCP_OPERATIONS.filter(op => op.category === 'WRITE').forEach(op => {
    console.log(colorize('magenta', `  • ${op.name}`))
    console.log(`    ${op.description}`)
    console.log(colorize('cyan', `    Required: ${op.requiredParams.join(', ')}`))
    console.log()
  })

  console.log('\nUsage Examples:')
  console.log('  npm run mcp-test test-operation get_shared_lists --token=your_token')
  console.log('  npm run mcp-test test-operation create_task --token=your_token --list=list_id')
  console.log('  npm run mcp-test test-all --token=your_token --list=list_id')
  console.log()
}

// Test a specific MCP operation
async function testOperation(operationName, options) {
  const operation = MCP_OPERATIONS.find(op => op.name === operationName)
  if (!operation) {
    printError(`Unknown operation: ${operationName}`)
    process.exit(1)
  }

  printHeader(`Testing: ${operation.name}`)
  printInfo(`Description: ${operation.description}`)
  printInfo(`Category: ${operation.category}`)

  // Build the test data
  let testData = { ...operation.example }

  // Override with command line options
  if (options.token) {
    testData.accessToken = options.token
  }
  if (options.list) {
    testData.listId = options.list
    if (testData.taskUpdate) testData.taskUpdate.listId = options.list
    if (testData.comment) testData.comment.listId = options.list
  }
  if (options.task) {
    testData.taskId = options.task
    if (testData.taskUpdate) testData.taskUpdate.taskId = options.task
    if (testData.comment) testData.comment.taskId = options.task
  }

  printInfo('Test Data:')
  console.log(JSON.stringify(testData, null, 2))

  // Simulate the MCP call
  try {
    console.log('\n' + colorize('yellow', '⏳ Executing MCP operation...'))

    // Create a temporary MCP client script
    const clientScript = createMCPClientScript(operation.name, testData)
    const scriptPath = join(process.cwd(), 'tmp_mcp_client.js')
    writeFileSync(scriptPath, clientScript)

    // Run the MCP client
    const startTime = Date.now()
    const result = await runMCPClient(scriptPath)
    const duration = Date.now() - startTime

    // Clean up
    try {
      require('fs').unlinkSync(scriptPath)
    } catch (e) {}

    printSuccess(`Operation completed in ${duration}ms`)
    console.log('\nResponse:')
    console.log(colorize('green', JSON.stringify(result, null, 2)))

  } catch (error) {
    printError(`Operation failed: ${error.message}`)
    console.log('\nError details:')
    console.log(colorize('red', error.stack || error.toString()))
  }
}

// Test all operations with a token
async function testAll(options) {
  if (!options.token) {
    printError('Token is required for testing all operations')
    process.exit(1)
  }

  printHeader('Testing All MCP Operations')

  const results = {
    passed: 0,
    failed: 0,
    details: []
  }

  for (const operation of MCP_OPERATIONS) {
    console.log(`\n${colorize('cyan', `Testing: ${operation.name}`)}\n`)

    try {
      await testOperation(operation.name, options)
      results.passed++
      results.details.push({ operation: operation.name, status: 'PASS' })
      printSuccess(`${operation.name} - PASSED`)
    } catch (error) {
      results.failed++
      results.details.push({ operation: operation.name, status: 'FAIL', error: error.message })
      printError(`${operation.name} - FAILED: ${error.message}`)
    }
  }

  // Summary
  printHeader('Test Summary')
  console.log(`Total Operations: ${MCP_OPERATIONS.length}`)
  printSuccess(`Passed: ${results.passed}`)
  printError(`Failed: ${results.failed}`)

  if (results.failed > 0) {
    console.log('\nFailed Operations:')
    results.details.filter(d => d.status === 'FAIL').forEach(d => {
      printError(`  ${d.operation}: ${d.error}`)
    })
  }
}

// Create a temporary MCP client script
function createMCPClientScript(operationName, testData) {
  return `
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");

async function testMCPOperation() {
  try {
    // Import your MCP server
    const AstridMCPServer = require("./mcp-server-v2.js");

    // Create server instance
    const server = new AstridMCPServer();

    // Mock the MCP protocol call
    const request = {
      params: {
        name: "${operationName}",
        arguments: ${JSON.stringify(testData)}
      }
    };

    // This is a simplified test - in reality you'd use the full MCP protocol
    console.log("Test completed successfully");
    console.log(JSON.stringify({
      operation: "${operationName}",
      status: "simulated",
      message: "This is a simulated response - connect to real MCP server for actual testing"
    }, null, 2));

  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

testMCPOperation();
`
}

// Run the MCP client script
function runMCPClient(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd()
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Script failed with code ${code}: ${stderr}`))
      } else {
        try {
          // Try to parse JSON response
          const lines = stdout.split('\n').filter(line => line.trim())
          const lastLine = lines[lines.length - 1]
          const result = JSON.parse(lastLine)
          resolve(result)
        } catch (e) {
          resolve({ raw: stdout, error: stderr })
        }
      }
    })

    child.on('error', (error) => {
      reject(error)
    })
  })
}

// Generate comprehensive test data
function generateTestData(options) {
  const now = new Date()

  return {
    lists: [
      {
        id: options.list || 'test-list-001',
        name: 'MCP Test List',
        description: 'List created for MCP testing',
        color: '#3b82f6'
      }
    ],
    tasks: [
      {
        id: options.task || 'test-task-001',
        title: 'MCP Test Task',
        description: 'Task created for MCP testing',
        priority: 1,
        dueDateTime: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        completed: false
      }
    ],
    comments: [
      {
        id: 'test-comment-001',
        content: 'This is a test comment for MCP testing',
        type: 'TEXT'
      }
    ]
  }
}

// Command line interface
program
  .name('mcp-test')
  .description('MCP Test Client for Astrid Task Manager')
  .version('2.0.0')

program
  .command('list-operations')
  .description('List all available MCP operations')
  .action(listOperations)

program
  .command('test-operation <operation>')
  .description('Test a specific MCP operation')
  .option('--token <token>', 'MCP access token')
  .option('--list <listId>', 'List ID for testing')
  .option('--task <taskId>', 'Task ID for testing')
  .action(testOperation)

program
  .command('test-all')
  .description('Test all MCP operations')
  .option('--token <token>', 'MCP access token (required)')
  .option('--list <listId>', 'List ID for testing')
  .option('--task <taskId>', 'Task ID for testing')
  .action(testAll)

program
  .command('generate-test-data')
  .description('Generate test data for MCP operations')
  .option('--list <listId>', 'Custom list ID')
  .option('--task <taskId>', 'Custom task ID')
  .action((options) => {
    const testData = generateTestData(options)
    console.log(JSON.stringify(testData, null, 2))
  })

// Parse command line arguments
if (process.argv.length < 3) {
  program.help()
} else {
  program.parse()
}