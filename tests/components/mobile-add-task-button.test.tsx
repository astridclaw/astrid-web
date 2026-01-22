import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// File-based test to verify mobile add task button implementation

describe('Mobile Add Task Button Implementation', () => {
  it('should remove text from mobile buttons in enhanced-task-creation.tsx', () => {
    const filePath = path.join(process.cwd(), 'components/enhanced-task-creation.tsx')
    const fileContent = fs.readFileSync(filePath, 'utf-8')

    // Verify mobile buttons show empty string instead of 'Add' text
    expect(fileContent).toMatch(/buttonText:\s*isMobile\s*\?\s*['"']['"']\s*:\s*['"]Add Task['"]/)

    // Verify the conditional Plus icon margin logic is implemented
    expect(fileContent).toMatch(/className=\{`w-4 h-4 \$\{inputConfig\.buttonText \? 'mr-1' : ''\}`\}/)

    // Verify mobile-specific styling is applied
    expect(fileContent).toContain('font-bold p-3')
  })

  it('should maintain desktop functionality with text', () => {
    const filePath = path.join(process.cwd(), 'components/enhanced-task-creation.tsx')
    const fileContent = fs.readFileSync(filePath, 'utf-8')

    // Verify desktop still shows "Add Task" text
    expect(fileContent).toContain('Add Task')

    // Verify Plus icon is still present
    expect(fileContent).toContain('<Plus className')
  })

  it('should implement proper mobile vs desktop button styling', () => {
    const filePath = path.join(process.cwd(), 'components/enhanced-task-creation.tsx')
    const fileContent = fs.readFileSync(filePath, 'utf-8')

    // Verify mobile-specific classes are conditionally applied
    expect(fileContent).toMatch(/mobileClasses.*isMobile.*font-bold p-3/)

    // Verify desktop classes are conditionally applied
    expect(fileContent).toMatch(/isMobile \? '' : 'px-/)
  })

  it('should verify Plus icon spacing logic', () => {
    const filePath = path.join(process.cwd(), 'components/enhanced-task-creation.tsx')
    const fileContent = fs.readFileSync(filePath, 'utf-8')

    // Verify Plus icon margin is conditional on button text presence
    expect(fileContent).toMatch(/inputConfig\.buttonText \? 'mr-1' : ''/)
  })

  it('should verify all layout types support mobile button changes', () => {
    const filePath = path.join(process.cwd(), 'components/enhanced-task-creation.tsx')
    const fileContent = fs.readFileSync(filePath, 'utf-8')

    // Check that ALL layout types use the mobile pattern
    const threeColumnMatch = fileContent.match(/case '3-column':[\s\S]*?buttonText: isMobile \? '' : 'Add Task'/)
    const twoColumnMatch = fileContent.match(/case '2-column':[\s\S]*?buttonText: isMobile \? '' : 'Add Task'/)
    const oneColumnMatch = fileContent.match(/case '1-column':[\s\S]*?buttonText: isMobile \? '' : 'Add Task'/)

    expect(threeColumnMatch).toBeTruthy()
    expect(twoColumnMatch).toBeTruthy()
    expect(oneColumnMatch).toBeTruthy()
  })
})