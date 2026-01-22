import { render, screen } from '@testing-library/react'
import { FacePile } from '@/components/ui/face-pile'
import type { User } from '@/types/task'

describe('FacePile', () => {
  const mockUsers: User[] = [
    {
      id: 'user-1',
      name: 'Alice Smith', // Changed to A to be unique
      email: 'alice@example.com',
      image: null,
      createdAt: new Date()
    },
    {
      id: 'user-2', 
      name: 'Bob Johnson',
      email: 'bob@example.com',
      image: null,
      createdAt: new Date()
    },
    {
      id: 'user-3',
      name: 'Charlie Brown', 
      email: 'charlie@example.com',
      image: null,
      createdAt: new Date()
    },
    {
      id: 'user-4',
      name: 'Diana Wilson',
      email: 'diana@example.com', 
      image: null,
      createdAt: new Date()
    }
  ]

  it('renders nothing when no users provided', () => {
    const { container } = render(<FacePile users={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('displays all users when count is under maxVisible', () => {
    render(<FacePile users={mockUsers.slice(0, 2)} maxVisible={3} />)
    
    // Should show fallback letters for both users (since no images)
    expect(screen.getByText('A')).toBeInTheDocument() // Alice
    expect(screen.getByText('B')).toBeInTheDocument() // Bob
    
    // Should not show +count indicator
    expect(screen.queryByText(/\+/)).not.toBeInTheDocument()
  })

  it('displays maxVisible users plus count indicator when exceeded', () => {
    render(<FacePile users={mockUsers} maxVisible={2} />)
    
    // Should show 2 user initials 
    expect(screen.getByText('A')).toBeInTheDocument() // Alice
    expect(screen.getByText('B')).toBeInTheDocument() // Bob
    
    // Should show +2 indicator for remaining users
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('renders different sizes correctly', () => {
    const { container, rerender } = render(<FacePile users={[mockUsers[0]]} size="sm" />)
    let avatars = container.querySelectorAll('[class*="w-4 h-4"]')
    expect(avatars.length).toBeGreaterThan(0)
    
    rerender(<FacePile users={[mockUsers[0]]} size="md" />)
    avatars = container.querySelectorAll('[class*="w-6 h-6"]')
    expect(avatars.length).toBeGreaterThan(0)
    
    rerender(<FacePile users={[mockUsers[0]]} size="lg" />)
    avatars = container.querySelectorAll('[class*="w-8 h-8"]')
    expect(avatars.length).toBeGreaterThan(0)
  })

  it('shows pending users with reduced opacity', () => {
    const pendingUser: User = {
      id: 'pending-1',
      name: 'Pending User',
      email: 'pending@example.com',
      image: null,
      createdAt: new Date(),
      isPending: true
    }
    
    render(<FacePile users={[pendingUser]} />)
    
    const { container } = render(<FacePile users={[pendingUser]} />)
    const avatarWithOpacity = container.querySelector('.opacity-60')
    expect(avatarWithOpacity).toBeInTheDocument()
  })

  it('uses fallback initials when no image provided', () => {
    render(<FacePile users={[mockUsers[0]]} />)
    
    // Should show fallback with user's first initial
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('handles users with no name gracefully', () => {
    const userWithoutName: User = {
      id: 'no-name',
      name: null,
      email: 'noname@example.com',
      image: null,
      createdAt: new Date()
    }
    
    render(<FacePile users={[userWithoutName]} />)
    
    // Should use email's first character as fallback
    expect(screen.getByText('n')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(
      <FacePile users={[mockUsers[0]]} className="custom-class" />
    )
    
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('renders avatars in correct z-index order', () => {
    const { container } = render(<FacePile users={mockUsers.slice(0, 3)} maxVisible={3} />)

    const avatars = container.querySelectorAll('div[style*="z-index"]')
    
    // Should have 3 avatars with z-index styles
    expect(avatars).toHaveLength(3)
    
    // First user should have highest z-index
    expect(avatars[0]).toHaveStyle('z-index: 3')
    // Second user should have middle z-index  
    expect(avatars[1]).toHaveStyle('z-index: 2')
    // Third user should have lowest z-index
    expect(avatars[2]).toHaveStyle('z-index: 1')
  })
})