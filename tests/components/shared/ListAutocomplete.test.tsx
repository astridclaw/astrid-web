import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ListAutocomplete } from '@/components/shared/ListAutocomplete'
import type { TaskList } from '@/types/task'

const mockLists: TaskList[] = [
  { id: '1', name: 'Work Tasks', privacy: 'PRIVATE', ownerId: 'user1' } as TaskList,
  { id: '2', name: 'Personal', privacy: 'PRIVATE', ownerId: 'user1' } as TaskList,
  { id: '3', name: 'Shopping', privacy: 'SHARED', ownerId: 'user1' } as TaskList,
  { id: '4', name: 'Work Projects', privacy: 'PUBLIC', ownerId: 'user1' } as TaskList
]

describe('ListAutocomplete', () => {
  it('should render input with placeholder', () => {
    render(
      <ListAutocomplete
        availableLists={mockLists}
        selectedLists={[]}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    expect(screen.getByPlaceholderText(/Type to search lists/i)).toBeInTheDocument()
  })

  it('should display selected lists as chips', () => {
    const selectedLists = [mockLists[0], mockLists[1]]

    render(
      <ListAutocomplete
        availableLists={mockLists}
        selectedLists={selectedLists}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    expect(screen.getByText('Work Tasks')).toBeInTheDocument()
    expect(screen.getByText('Personal')).toBeInTheDocument()
  })

  it('should filter lists based on input', () => {
    render(
      <ListAutocomplete
        availableLists={mockLists}
        selectedLists={[]}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    const input = screen.getByPlaceholderText(/Type to search lists/i)

    fireEvent.change(input, { target: { value: 'work' } })
    fireEvent.focus(input)

    // Should show both "Work Tasks" and "Work Projects"
    expect(screen.getByText('Work Tasks')).toBeInTheDocument()
    expect(screen.getByText('Work Projects')).toBeInTheDocument()
  })

  it('should call onSelect when list is clicked', () => {
    const onSelect = vi.fn()

    render(
      <ListAutocomplete
        availableLists={mockLists}
        selectedLists={[]}
        onSelect={onSelect}
        onRemove={vi.fn()}
      />
    )

    const input = screen.getByPlaceholderText(/Type to search lists/i)
    fireEvent.change(input, { target: { value: 'work' } })
    fireEvent.focus(input)

    fireEvent.click(screen.getByText('Work Tasks'))

    expect(onSelect).toHaveBeenCalledWith(mockLists[0])
  })

  it('should call onRemove when chip X is clicked', () => {
    const onRemove = vi.fn()
    const selectedLists = [mockLists[0]]

    render(
      <ListAutocomplete
        availableLists={mockLists}
        selectedLists={selectedLists}
        onSelect={vi.fn()}
        onRemove={onRemove}
      />
    )

    fireEvent.click(screen.getByText('Work Tasks'))

    expect(onRemove).toHaveBeenCalledWith(mockLists[0])
  })

  it('should exclude already selected lists from suggestions', () => {
    const selectedLists = [mockLists[0]] // Work Tasks selected

    render(
      <ListAutocomplete
        availableLists={mockLists}
        selectedLists={selectedLists}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    const input = screen.getByPlaceholderText(/Type to search lists/i)
    fireEvent.change(input, { target: { value: 'work' } })
    fireEvent.focus(input)

    // Work Tasks appears in chip above, but not in dropdown suggestions
    // We need to check the dropdown specifically
    const dropdown = screen.getByRole('textbox').nextElementSibling
    const dropdownText = dropdown?.textContent || ''

    // Should show Work Projects in dropdown, not Work Tasks
    expect(dropdownText).toContain('Work Projects')
    expect(screen.getAllByText('Work Tasks').length).toBe(1) // Only in chip, not in dropdown
  })

  it('should show create new option when no matches and allowCreate is true', () => {
    render(
      <ListAutocomplete
        availableLists={mockLists}
        selectedLists={[]}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        onCreateNew={vi.fn()}
        allowCreate={true}
      />
    )

    const input = screen.getByPlaceholderText(/Type to search lists/i)
    fireEvent.change(input, { target: { value: 'nonexistent' } })
    fireEvent.focus(input)

    expect(screen.getByText(/Create new list/i)).toBeInTheDocument()
  })

  it('should call onCreateNew when create option is clicked', () => {
    const onCreateNew = vi.fn()

    render(
      <ListAutocomplete
        availableLists={mockLists}
        selectedLists={[]}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        onCreateNew={onCreateNew}
      />
    )

    const input = screen.getByPlaceholderText(/Type to search lists/i)
    fireEvent.change(input, { target: { value: 'New List' } })
    fireEvent.focus(input)

    fireEvent.click(screen.getByText(/Create new list/i))

    expect(onCreateNew).toHaveBeenCalledWith('New List')
  })

  it('should remove last selected list on backspace with empty input', () => {
    const onRemove = vi.fn()
    const selectedLists = [mockLists[0], mockLists[1]]

    render(
      <ListAutocomplete
        availableLists={mockLists}
        selectedLists={selectedLists}
        onSelect={vi.fn()}
        onRemove={onRemove}
      />
    )

    const input = screen.getByPlaceholderText(/Type to search lists/i)
    fireEvent.keyDown(input, { key: 'Backspace' })

    expect(onRemove).toHaveBeenCalledWith(mockLists[1])
  })

  it('should not show create option when allowCreate is false', () => {
    render(
      <ListAutocomplete
        availableLists={mockLists}
        selectedLists={[]}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        allowCreate={false}
      />
    )

    const input = screen.getByPlaceholderText(/Type to search lists/i)
    fireEvent.change(input, { target: { value: 'nonexistent' } })
    fireEvent.focus(input)

    expect(screen.queryByText(/Create new list/i)).not.toBeInTheDocument()
  })

  it('should display privacy badges for lists', () => {
    render(
      <ListAutocomplete
        availableLists={mockLists}
        selectedLists={[]}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    const input = screen.getByPlaceholderText(/Type to search lists/i)
    fireEvent.change(input, { target: { value: 'shopping' } })
    fireEvent.focus(input)

    expect(screen.getByText('Shared')).toBeInTheDocument()
  })
})
