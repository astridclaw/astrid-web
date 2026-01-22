import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TaskManagerHeader } from '@/components/TaskManager/Header/TaskManagerHeader'

// Mock the task types
const mockLists = [
  { id: 'list-1', name: 'Test List', description: '', ownerId: 'user-1' }
]

const mockProps = {
  isMobile: true,
  showHamburgerMenu: true,
  mobileView: 'list' as const,
  lists: mockLists,
  selectedListId: 'list-1',
  selectedTask: null,
  effectiveSession: { user: { id: 'user-1', email: 'test@example.com' } },
  mobileSearchMode: true,
  searchValue: 'test search query',
  toggleMobileSidebar: vi.fn(),
  handleMobileBack: vi.fn(),
  onLogoClick: vi.fn(),
  handleMobileSearchStart: vi.fn(),
  handleMobileSearchEnd: vi.fn(),
  handleMobileSearchClear: vi.fn(),
  handleMobileSearchKeyDown: vi.fn(),
  onSearchChange: vi.fn(),
  setShowSettingsPopover: vi.fn(),
  onShowKeyboardShortcuts: vi.fn(),
  isTaskDragActive: false,
  onHamburgerDragHover: vi.fn(),
}

describe('Search Clear Functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should call handleMobileSearchClear when clear button is clicked', () => {
    render(<TaskManagerHeader {...mockProps} />)

    // Find the clear button by test ID or aria label
    const clearButton = screen.getByTestId('search-clear-button')
    expect(clearButton).toBeTruthy()

    fireEvent.click(clearButton)
    expect(mockProps.handleMobileSearchClear).toHaveBeenCalledTimes(1)
  })

  it('should call handleMobileSearchKeyDown when Escape is pressed', () => {
    render(<TaskManagerHeader {...mockProps} />)

    // Find the search input
    const searchInput = screen.getByPlaceholderText('Search for tasks and users')
    expect(searchInput).toBeTruthy()

    // Press Escape key
    fireEvent.keyDown(searchInput, { key: 'Escape' })
    expect(mockProps.handleMobileSearchKeyDown).toHaveBeenCalledTimes(1)
  })

  it('should show search input when mobileSearchMode is true', () => {
    render(<TaskManagerHeader {...mockProps} />)

    // Search input should be visible
    const searchInput = screen.getByPlaceholderText('Search for tasks and users')
    expect(searchInput).toBeTruthy()
    expect(searchInput).toHaveValue('test search query')
  })

  it('should show search icon when mobileSearchMode is false', () => {
    const propsWithoutSearch = {
      ...mockProps,
      mobileSearchMode: false,
      searchValue: ''
    }

    render(<TaskManagerHeader {...propsWithoutSearch} />)

    // Search input should not be visible
    const searchInput = screen.queryByPlaceholderText('Search for tasks and users')
    expect(searchInput).toBeNull()

    // Should have multiple buttons (hamburger, search, settings), so check we have at least one
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)

    // Specifically check for the presence of a search icon (since there are multiple buttons)
    const searchIcons = document.querySelectorAll('.lucide-search')
    expect(searchIcons.length).toBeGreaterThan(0)
  })

  it('should handle search input changes', () => {
    render(<TaskManagerHeader {...mockProps} />)

    const searchInput = screen.getByPlaceholderText('Search for tasks and users')

    fireEvent.change(searchInput, { target: { value: 'new search term' } })

    expect(mockProps.onSearchChange).toHaveBeenCalledWith('new search term')
  })
})
