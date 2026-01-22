import { describe, it, expect } from 'vitest'
import { formatImplementationComment, type ImplementationDetails } from '@/lib/ai/workflow-comments'

describe('formatImplementationComment', () => {
  const baseDetails: ImplementationDetails = {
    branchName: 'fix/test-branch',
    prNumber: 123,
    prUrl: 'https://github.com/test/repo/pull/123',
    repository: 'test/repo',
    checksSummary: '✅ All checks passed'
  }

  it('should show "Test the preview link" instructions when deployment URL is available', () => {
    const details: ImplementationDetails = {
      ...baseDetails,
      deploymentUrl: 'https://test-preview.vercel.app',
      deploymentState: 'READY'
    }

    const comment = formatImplementationComment(details)

    // Should include preview URL
    expect(comment).toContain('**Preview**: [https://test-preview.vercel.app](https://test-preview.vercel.app)')
    expect(comment).toContain('✅ Ready')

    // Should show instructions to test the preview link
    expect(comment).toContain('Test the preview link and reply **"ship it"** when ready to deploy.')

    // Should NOT show instructions to test the PR
    expect(comment).not.toContain('Test the changes in the PR')
  })

  it('should show "Test the changes in the PR" instructions when no deployment URL is available', () => {
    const details: ImplementationDetails = {
      ...baseDetails
      // No deploymentUrl
    }

    const comment = formatImplementationComment(details)

    // Should NOT include preview URL line
    expect(comment).not.toContain('**Preview**:')

    // Should show instructions to test the PR directly
    expect(comment).toContain('Test the changes in the PR and reply **"ship it"** when ready to deploy.')

    // Should NOT show instructions to test the preview link
    expect(comment).not.toContain('Test the preview link')
  })

  it('should show building status when deployment is not ready', () => {
    const details: ImplementationDetails = {
      ...baseDetails,
      deploymentUrl: 'https://test-preview.vercel.app',
      deploymentState: 'BUILDING'
    }

    const comment = formatImplementationComment(details)

    expect(comment).toContain('🔄 Building')
    expect(comment).toContain('Test the preview link')
  })

  it('should include all standard PR details regardless of deployment URL', () => {
    const detailsWithDeployment: ImplementationDetails = {
      ...baseDetails,
      deploymentUrl: 'https://test-preview.vercel.app',
      deploymentState: 'READY'
    }

    const detailsWithoutDeployment: ImplementationDetails = {
      ...baseDetails
    }

    const commentWithDeployment = formatImplementationComment(detailsWithDeployment)
    const commentWithoutDeployment = formatImplementationComment(detailsWithoutDeployment)

    // Both should include these standard details
    const expectedContent = [
      '✅ **Implementation Complete - Ready for Testing**',
      '## 📋 Summary',
      '**PR**: [#123](https://github.com/test/repo/pull/123)',
      '**Branch**: `fix/test-branch`',
      '✅ All checks passed',
      '"ship it"'
    ]

    for (const content of expectedContent) {
      expect(commentWithDeployment).toContain(content)
      expect(commentWithoutDeployment).toContain(content)
    }
  })

  it('should handle missing checks summary gracefully', () => {
    const details: ImplementationDetails = {
      ...baseDetails,
      checksSummary: undefined
    }

    const comment = formatImplementationComment(details)

    expect(comment).toContain('⏳ Checks running')
  })

  it('should format deployment URL correctly in preview line', () => {
    const details: ImplementationDetails = {
      ...baseDetails,
      deploymentUrl: 'https://my-app-git-feature-user.vercel.app',
      deploymentState: 'READY'
    }

    const comment = formatImplementationComment(details)

    // Should have markdown link format
    expect(comment).toContain('[https://my-app-git-feature-user.vercel.app](https://my-app-git-feature-user.vercel.app)')
  })
})
