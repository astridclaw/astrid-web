import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AstridEmptyState } from '@/components/ui/astrid-empty-state'

describe('AstridEmptyState', () => {
  describe('Contextual Messages', () => {
    it('should display personal list message', () => {
      render(<AstridEmptyState listType="personal" />)

      expect(screen.getByText(/Ready to capture your thoughts/i)).toBeInTheDocument()
      expect(screen.getByText(/Tap add a task to create your first task/i)).toBeInTheDocument()
    })

    it('should display shared list message', () => {
      render(<AstridEmptyState listType="shared" />)

      expect(screen.getByText(/Start collaborating/i)).toBeInTheDocument()
      expect(screen.getByText(/Add a task to get this shared list going/i)).toBeInTheDocument()
    })

    it('should display today list message', () => {
      render(<AstridEmptyState listType="today" />)

      expect(screen.getByText(/Nothing scheduled for today/i)).toBeInTheDocument()
      expect(screen.getByText(/Enjoy the free time/i)).toBeInTheDocument()
    })

    it('should display my-tasks list message', () => {
      render(<AstridEmptyState listType="my-tasks" />)

      expect(screen.getByText(/You're all caught up/i)).toBeInTheDocument()
      expect(screen.getByText(/No tasks assigned to you right now/i)).toBeInTheDocument()
    })

    it('should display assigned list message', () => {
      render(<AstridEmptyState listType="assigned" />)

      expect(screen.getByText(/No tasks assigned yet/i)).toBeInTheDocument()
      expect(screen.getByText(/Check back later or create tasks for your team/i)).toBeInTheDocument()
    })

    it('should display not-in-list message', () => {
      render(<AstridEmptyState listType="not-in-list" />)

      expect(screen.getByText(/No orphaned tasks/i)).toBeInTheDocument()
      expect(screen.getByText(/All your tasks are organized in lists/i)).toBeInTheDocument()
    })

    it('should display public list message', () => {
      render(<AstridEmptyState listType="public" />)

      expect(screen.getByText(/Share your ideas with the world/i)).toBeInTheDocument()
      expect(screen.getByText(/Add tasks - anyone can see this public list/i)).toBeInTheDocument()
    })

    it('should display default message with custom list name', () => {
      render(<AstridEmptyState listType="default" listName="My Custom List" />)

      expect(screen.getByText(/Let's fill up "My Custom List"/i)).toBeInTheDocument()
      expect(screen.getByText(/Add your first task to get started/i)).toBeInTheDocument()
    })

    it('should display default message without list name', () => {
      render(<AstridEmptyState listType="default" />)

      expect(screen.getByText(/Time to get organized/i)).toBeInTheDocument()
      expect(screen.getByText(/Add your first task to get started/i)).toBeInTheDocument()
    })
  })

  describe('Featured List View', () => {
    it('should display featured list message when viewing from featured', () => {
      render(<AstridEmptyState listType="personal" isViewingFromFeatured={true} />)

      expect(screen.getByText(/This list is empty right now/i)).toBeInTheDocument()
      expect(screen.getByText(/Copy it to make it your own/i)).toBeInTheDocument()
    })

    it('should override list type message when viewing from featured', () => {
      render(<AstridEmptyState listType="shared" isViewingFromFeatured={true} />)

      // Should show featured message, not shared message
      expect(screen.getByText(/This list is empty right now/i)).toBeInTheDocument()
      expect(screen.queryByText(/Start collaborating/i)).not.toBeInTheDocument()
    })
  })

  describe('Visual Elements', () => {
    it('should render Astrid character icon image', () => {
      render(<AstridEmptyState listType="personal" />)

      // Check for Astrid icon-512x512.png image
      const astridIcon = screen.getByAltText('Astrid')
      expect(astridIcon).toBeInTheDocument()
      expect(astridIcon).toHaveAttribute('src', '/icons/icon-512x512.png')
    })

    it('should render speech bubble container', () => {
      const { container } = render(<AstridEmptyState listType="personal" />)

      // Check for rounded speech bubble
      const speechBubble = container.querySelector('.rounded-2xl')
      expect(speechBubble).toBeInTheDocument()
    })

    it('should apply custom className', () => {
      const { container } = render(<AstridEmptyState listType="personal" className="custom-test-class" />)

      const wrapper = container.querySelector('.custom-test-class')
      expect(wrapper).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should render text content readable by screen readers', () => {
      render(<AstridEmptyState listType="personal" />)

      // All text should be accessible
      const primaryText = screen.getByText(/Ready to capture your thoughts/i)
      const secondaryText = screen.getByText(/Tap add a task to create your first task/i)

      expect(primaryText).toBeVisible()
      expect(secondaryText).toBeVisible()
    })
  })

  describe('Edge Cases', () => {
    it('should handle missing list name gracefully', () => {
      render(<AstridEmptyState listType="default" listName={undefined} />)

      expect(screen.getByText(/Time to get organized/i)).toBeInTheDocument()
    })

    it('should handle empty list name gracefully', () => {
      render(<AstridEmptyState listType="default" listName="" />)

      expect(screen.getByText(/Time to get organized/i)).toBeInTheDocument()
    })

    it('should prioritize isViewingFromFeatured over listType', () => {
      render(
        <AstridEmptyState
          listType="my-tasks"
          isViewingFromFeatured={true}
        />
      )

      // Should show featured message, not my-tasks message
      expect(screen.getByText(/This list is empty right now/i)).toBeInTheDocument()
      expect(screen.queryByText(/You're all caught up/i)).not.toBeInTheDocument()
    })
  })

  describe('Component Rendering', () => {
    it('should render without crashing for all list types', () => {
      const listTypes: Array<'personal' | 'shared' | 'today' | 'my-tasks' | 'public' | 'assigned' | 'not-in-list' | 'default'> = [
        'personal',
        'shared',
        'today',
        'my-tasks',
        'public',
        'assigned',
        'not-in-list',
        'default'
      ]

      listTypes.forEach(listType => {
        const { unmount } = render(<AstridEmptyState listType={listType} />)
        // Check that the Astrid icon is rendered
        const astridIcon = screen.getByAltText('Astrid')
        expect(astridIcon).toBeInTheDocument()
        unmount()
      })
    })
  })
})
