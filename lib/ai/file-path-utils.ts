/**
 * File Path Utilities for AI Operations
 *
 * Helper functions for handling file paths in GitHub repositories,
 * including path normalization and variation generation.
 */

/**
 * Convert kebab-case to camelCase
 * @example "use-task-operations" -> "useTaskOperations"
 */
export function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}

/**
 * Convert kebab-case to PascalCase
 * @example "task-operations" -> "TaskOperations"
 */
export function kebabToPascal(str: string): string {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}

/**
 * Generate file path variations to try when original path fails.
 * Handles common path mismatches between local workspace and GitHub repo.
 *
 * This is useful when AI suggests a file path that doesn't exactly match
 * the repository structure (e.g., kebab-case vs camelCase, missing src/ prefix).
 *
 * @param path - The original file path to generate variations for
 * @returns Array of path variations to try, starting with the original
 */
export function generateFilePathVariations(path: string): string[] {
  const variations: string[] = [path] // Try original first

  // Common patterns to try
  const patterns = [
    // Add common prefixes
    (p: string) => `src/${p}`,
    (p: string) => `app/${p}`,
    (p: string) => `lib/${p}`,

    // Convert kebab-case to camelCase (e.g., use-task-operations → useTaskOperations)
    (p: string) => {
      const match = p.match(/^(.+\/)?(use-[a-z-]+)(\.tsx?)?$/)
      if (match) {
        const [, dir, name, ext] = match
        return `${dir || ''}${kebabToCamel(name)}${ext || ''}`
      }
      return p.replace(/([a-z])-([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase())
    },

    // Convert kebab-case to PascalCase (e.g., use-task-operations → useTaskOperations with capital T and O)
    (p: string) => {
      const match = p.match(/^(.+\/)?(use-)([a-z-]+)(\.tsx?)?$/)
      if (match) {
        const [, dir, prefix, name, ext] = match
        return `${dir || ''}${prefix}${kebabToPascal(name)}${ext || ''}`
      }
      return p
    },

    // Convert camelCase to kebab-case (e.g., useTaskOperations → use-task-operations)
    (p: string) => p.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase(),

    // Try with .tsx instead of .ts
    (p: string) => p.replace(/\.ts$/, '.tsx'),

    // Try with .ts instead of .tsx
    (p: string) => p.replace(/\.tsx$/, '.ts'),

    // Combine: src/ + camelCase conversion
    (p: string) => {
      const match = p.match(/^(.+\/)?(use-[a-z-]+)(\.tsx?)?$/)
      if (match) {
        const [, , name, ext] = match
        return `src/${kebabToCamel(name)}${ext || ''}`
      }
      return `src/${p}`
    },

    // Combine: src/ + PascalCase conversion
    (p: string) => {
      const match = p.match(/^(.+\/)?(use-)([a-z-]+)(\.tsx?)?$/)
      if (match) {
        const [, , prefix, name, ext] = match
        return `src/${prefix}${kebabToPascal(name)}${ext || ''}`
      }
      return `src/${p}`
    },

    // Combine: app/ + camelCase conversion
    (p: string) => {
      const match = p.match(/^(.+\/)?(use-[a-z-]+)(\.tsx?)?$/)
      if (match) {
        const [, , name, ext] = match
        return `app/${kebabToCamel(name)}${ext || ''}`
      }
      return `app/${p}`
    },
  ]

  // Generate variations
  for (const pattern of patterns) {
    try {
      const variation = pattern(path)
      if (variation && variation !== path && !variations.includes(variation)) {
        variations.push(variation)
      }
    } catch {
      // Skip patterns that fail
    }
  }

  // Also try extension swaps on all generated variations
  const withExtensionSwaps = [...variations]
  for (const v of variations) {
    if (v.endsWith('.ts')) {
      const tsx = v.replace(/\.ts$/, '.tsx')
      if (!withExtensionSwaps.includes(tsx)) {
        withExtensionSwaps.push(tsx)
      }
    } else if (v.endsWith('.tsx')) {
      const ts = v.replace(/\.tsx$/, '.ts')
      if (!withExtensionSwaps.includes(ts)) {
        withExtensionSwaps.push(ts)
      }
    }
  }

  return withExtensionSwaps
}

/**
 * File tree node type for building directory trees
 */
interface FileTreeNode {
  type: 'file' | 'dir'
  children?: Record<string, FileTreeNode>
}

/**
 * Build a file tree structure from a flat list of file objects.
 * Each file object should have a 'path' property.
 *
 * @param files - Array of objects with path property
 * @returns Nested tree structure
 */
export function buildFileTree(files: Array<{ path: string }>): Record<string, FileTreeNode> {
  const tree: Record<string, FileTreeNode> = {}

  for (const file of files) {
    const parts = file.path.split('/')
    let current = tree

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (i === parts.length - 1) {
        // Leaf node (file)
        current[part] = { type: 'file' }
      } else {
        // Directory node
        if (!current[part]) {
          current[part] = { type: 'dir', children: {} }
        }
        current = current[part].children!
      }
    }
  }

  return tree
}

/**
 * Render a file tree as a formatted string with tree characters.
 *
 * @param tree - Tree structure from buildFileTree
 * @param depth - Current depth (for indentation)
 * @param maxDepth - Maximum depth to render
 * @returns Formatted string representation
 */
export function renderFileTree(
  tree: Record<string, FileTreeNode>,
  depth: number = 0,
  maxDepth: number = 3
): string {
  if (depth >= maxDepth) return ''

  let result = ''
  const indent = '  '.repeat(depth)
  const entries = Object.entries(tree)

  for (let i = 0; i < entries.length; i++) {
    const [name, node] = entries[i]
    const isLast = i === entries.length - 1
    const prefix = isLast ? '└── ' : '├── '

    if (node.type === 'file') {
      result += `${indent}${prefix}${name}\n`
    } else if (node.type === 'dir') {
      result += `${indent}${prefix}${name}/\n`
      result += renderFileTree(node.children || {}, depth + 1, maxDepth)
    }
  }

  return result
}
