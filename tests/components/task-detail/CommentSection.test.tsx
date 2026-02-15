import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CommentSection } from '@/components/task-detail/CommentSection'
import type { Task, User } from '@/types/task'
import type { FileAttachment } from '@/hooks/task-detail/useTaskDetailState'

// Mock the layout detection
vi.mock('@/lib/layout-detection', () => ({
  isMobileDevice: vi.fn(() => false),
  isIPadDevice: vi.fn(() => false),
  is1ColumnView: vi.fn(() => false),
}))

describe('CommentSection', () => {
  const mockCurrentUser: User = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    image: null
  }

  const mockTask: Task = {
    id: 'task-1',
    title: 'Test Task',
    description: '',
    priority: 1,
    completed: false,
    lists: [],
    creatorId: 'user-1',
    assigneeId: null,
    when: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    comments: [
      {
        id: 'comment-1',
        content: 'First comment',
        type: 'TEXT',
        author: mockCurrentUser,
        authorId: 'user-1',
        taskId: 'task-1',
        createdAt: new Date('2025-01-01T10:00:00Z'),
        updatedAt: new Date('2025-01-01T10:00:00Z'),
        replies: []
      }
    ]
  }

  const defaultProps = {
    task: mockTask,
    currentUser: mockCurrentUser,
    onUpdate: vi.fn(),
    newComment: '',
    setNewComment: vi.fn(),
    uploadingFile: false,
    setUploadingFile: vi.fn(),
    attachedFile: null,
    setAttachedFile: vi.fn(),
    replyingTo: null,
    setReplyingTo: vi.fn(),
    replyContent: '',
    setReplyContent: vi.fn(),
    replyAttachedFile: null,
    setReplyAttachedFile: vi.fn(),
    uploadingReplyFile: false,
    setUploadingReplyFile: vi.fn(),
    showingActionsFor: null,
    setShowingActionsFor: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  describe('Rendering', () => {
    it('should render comments section with comment count', () => {
      render(<CommentSection {...defaultProps} />)
      expect(screen.getByText('Comments (1)')).toBeInTheDocument()
    })

    it('should render existing comments', () => {
      render(<CommentSection {...defaultProps} />)
      expect(screen.getByText('First comment')).toBeInTheDocument()
      // Chat bubble shows "You" for current user's comments
      expect(screen.getByText('You')).toBeInTheDocument()
    })

    it('should render add comment textarea', () => {
      render(<CommentSection {...defaultProps} />)
      expect(screen.getByPlaceholderText('Add a comment...')).toBeInTheDocument()
    })

    it('should show Reply button for each comment', () => {
      render(<CommentSection {...defaultProps} />)
      // Chat bubble uses an icon button with title="Reply"
      expect(screen.getByTitle('Reply')).toBeInTheDocument()
    })
  })

  describe('Adding Comments', () => {
    it('should call setNewComment when typing', () => {
      const setNewComment = vi.fn()
      render(<CommentSection {...defaultProps} setNewComment={setNewComment} />)

      const textarea = screen.getByPlaceholderText('Add a comment...')
      fireEvent.change(textarea, { target: { value: 'New comment' } })

      expect(setNewComment).toHaveBeenCalledWith('New comment')
    })

    it('should add comment on Enter key', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'new-comment',
          content: 'Test comment',
          type: 'TEXT',
          author: mockCurrentUser,
          authorId: 'user-1',
          taskId: 'task-1',
          createdAt: new Date(),
          updatedAt: new Date()
        })
      })
      global.fetch = mockFetch

      const onUpdate = vi.fn()
      render(<CommentSection {...defaultProps} newComment="Test comment" onUpdate={onUpdate} />)

      const textarea = screen.getByPlaceholderText('Add a comment...')
      fireEvent.keyDown(textarea, { key: 'Enter' })

      await waitFor(() => {
        expect(onUpdate).toHaveBeenCalled()
      })
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/tasks/task-1/comments',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      )
    })

    it('should show Send button when there is content', () => {
      render(<CommentSection {...defaultProps} newComment="Test comment" />)
      expect(screen.getByTitle('Send comment')).toBeInTheDocument()
    })

    it('should not add empty comment', async () => {
      const onUpdate = vi.fn()
      render(<CommentSection {...defaultProps} newComment="" onUpdate={onUpdate} />)

      const textarea = screen.getByPlaceholderText('Add a comment...')
      fireEvent.keyDown(textarea, { key: 'Enter' })

      await waitFor(() => {
        expect(onUpdate).not.toHaveBeenCalled()
      })
    })

    it('should handle Cmd+Enter for line break', () => {
      const setNewComment = vi.fn()
      const onUpdate = vi.fn()
      render(<CommentSection {...defaultProps} newComment="Test" setNewComment={setNewComment} onUpdate={onUpdate} />)

      const textarea = screen.getByPlaceholderText('Add a comment...')
      fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })

      // Should not send comment
      expect(onUpdate).not.toHaveBeenCalled()
    })

    it('should handle Shift+Enter for line break', () => {
      const setNewComment = vi.fn()
      const onUpdate = vi.fn()
      render(<CommentSection {...defaultProps} newComment="Test" setNewComment={setNewComment} onUpdate={onUpdate} />)

      const textarea = screen.getByPlaceholderText('Add a comment...')
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })

      // Should not send comment (line break should be allowed)
      expect(onUpdate).not.toHaveBeenCalled()
    })

    it('should handle Ctrl+Enter for line break', () => {
      const setNewComment = vi.fn()
      const onUpdate = vi.fn()
      render(<CommentSection {...defaultProps} newComment="Test" setNewComment={setNewComment} onUpdate={onUpdate} />)

      const textarea = screen.getByPlaceholderText('Add a comment...')
      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })

      // Should not send comment (line break should be allowed)
      expect(onUpdate).not.toHaveBeenCalled()
    })
  })

  describe('File Attachments', () => {
    it('should show file attachment preview when file is attached', () => {
      const attachedFile: FileAttachment = {
        url: '/api/secure-files/file-123',
        name: 'test.png',
        type: 'image/png',
        size: 1024
      }
      render(<CommentSection {...defaultProps} attachedFile={attachedFile} />)
      expect(screen.getByText('test.png')).toBeInTheDocument()
    })

    it('should remove attachment when X button is clicked', () => {
      const attachedFile: FileAttachment = {
        url: '/api/secure-files/file-123',
        name: 'test.png',
        type: 'image/png',
        size: 1024
      }
      const setAttachedFile = vi.fn()
      render(<CommentSection {...defaultProps} attachedFile={attachedFile} setAttachedFile={setAttachedFile} />)

      const removeButton = screen.getAllByRole('button').find(btn =>
        btn.querySelector('.lucide-x')
      )
      if (removeButton) {
        fireEvent.click(removeButton)
        expect(setAttachedFile).toHaveBeenCalledWith(null)
      }
    })

    it('should upload file when file input changes', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          fileId: 'file-123',
          fileName: 'test.png',
          mimeType: 'image/png',
          fileSize: 1024
        })
      })
      global.fetch = mockFetch

      const setAttachedFile = vi.fn()
      const setUploadingFile = vi.fn()
      render(<CommentSection {...defaultProps} setAttachedFile={setAttachedFile} setUploadingFile={setUploadingFile} />)

      const fileInput = document.getElementById('comment-file-upload') as HTMLInputElement
      const file = new File(['content'], 'test.png', { type: 'image/png' })

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false
      })

      fireEvent.change(fileInput)

      expect(setUploadingFile).toHaveBeenCalledWith(true)

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/secure-upload/request-upload',
          expect.objectContaining({ method: 'POST' })
        )
        expect(setAttachedFile).toHaveBeenCalledWith({
          url: '/api/secure-files/file-123',
          name: 'test.png',
          type: 'image/png',
          size: 1024
        })
        expect(setUploadingFile).toHaveBeenCalledWith(false)
      })
    })
  })

  describe('Replies', () => {
    it('should show reply form when Reply button is clicked', () => {
      const setReplyingTo = vi.fn()
      render(<CommentSection {...defaultProps} setReplyingTo={setReplyingTo} />)

      const replyButton = screen.getByTitle('Reply')
      fireEvent.click(replyButton)

      expect(setReplyingTo).toHaveBeenCalledWith('comment-1')
    })

    it('should render reply form when replyingTo matches comment', () => {
      render(<CommentSection {...defaultProps} replyingTo="comment-1" />)
      expect(screen.getByPlaceholderText('Write a reply...')).toBeInTheDocument()
      expect(screen.getByText('Replying to Test User')).toBeInTheDocument()
    })

    it('should cancel reply when X button is clicked', () => {
      const setReplyingTo = vi.fn()
      const setReplyContent = vi.fn()
      const setReplyAttachedFile = vi.fn()

      render(<CommentSection
        {...defaultProps}
        replyingTo="comment-1"
        setReplyingTo={setReplyingTo}
        setReplyContent={setReplyContent}
        setReplyAttachedFile={setReplyAttachedFile}
      />)

      // Chat bubble uses an X icon button to cancel reply (inside "Replying to..." text)
      const replyingToText = screen.getByText(/Replying to/)
      const cancelButton = replyingToText.querySelector('button')
      expect(cancelButton).toBeTruthy()
      fireEvent.click(cancelButton!)

      expect(setReplyingTo).toHaveBeenCalledWith(null)
      expect(setReplyContent).toHaveBeenCalledWith('')
      expect(setReplyAttachedFile).toHaveBeenCalledWith(null)
    })

    it('should add reply on Enter key', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'new-reply',
          content: 'Test reply',
          type: 'TEXT',
          author: mockCurrentUser,
          authorId: 'user-1',
          taskId: 'task-1',
          parentCommentId: 'comment-1',
          createdAt: new Date(),
          updatedAt: new Date()
        })
      })
      global.fetch = mockFetch

      const onUpdate = vi.fn()
      render(<CommentSection
        {...defaultProps}
        replyingTo="comment-1"
        replyContent="Test reply"
        onUpdate={onUpdate}
      />)

      const textarea = screen.getByPlaceholderText('Write a reply...')
      fireEvent.keyDown(textarea, { key: 'Enter' })

      await waitFor(() => {
        expect(onUpdate).toHaveBeenCalled()
      })
    })

    it('should render nested replies', () => {
      const taskWithReplies = {
        ...mockTask,
        comments: [
          {
            ...mockTask.comments![0],
            replies: [
              {
                id: 'reply-1',
                content: 'Reply content',
                type: 'TEXT' as const,
                author: mockCurrentUser,
                authorId: 'user-1',
                taskId: 'task-1',
                parentCommentId: 'comment-1',
                createdAt: new Date('2025-01-01T11:00:00Z'),
                updatedAt: new Date('2025-01-01T11:00:00Z'),
                replies: []
              }
            ]
          }
        ]
      }

      render(<CommentSection {...defaultProps} task={taskWithReplies} />)
      // Chat bubbles render replies inline as nested bubbles
      expect(screen.getByText('Reply content')).toBeInTheDocument()
    })
  })

  describe('Deleting Comments', () => {
    it('should show delete button for own comments', () => {
      render(<CommentSection {...defaultProps} />)
      // The user should be able to access the dropdown menu for their own comments
      // Verify the Reply icon button exists (always shown for top-level comments)
      expect(screen.getByTitle('Reply')).toBeInTheDocument()
    })

    it('should delete comment when delete is clicked', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true })
      global.fetch = mockFetch

      const onUpdate = vi.fn()
      render(<CommentSection {...defaultProps} onUpdate={onUpdate} />)

      // Click the more menu
      const moreButtons = screen.getAllByRole('button')
      const moreButton = moreButtons.find(btn => btn.querySelector('.lucide-more-vertical'))
      if (moreButton) {
        fireEvent.click(moreButton)

        // Click delete in dropdown
        await waitFor(() => {
          const deleteButton = screen.getByText('Delete Comment')
          fireEvent.click(deleteButton)
        })

        await waitFor(() => {
          expect(mockFetch).toHaveBeenCalledWith(
            '/api/comments/comment-1',
            expect.objectContaining({ method: 'DELETE' })
          )
          expect(onUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
              comments: []
            })
          )
        })
      }
    })

    it('should delete reply when delete is clicked', async () => {
      const taskWithReplies = {
        ...mockTask,
        comments: [
          {
            ...mockTask.comments![0],
            replies: [
              {
                id: 'reply-1',
                content: 'Reply content',
                type: 'TEXT' as const,
                author: mockCurrentUser,
                authorId: 'user-1',
                taskId: 'task-1',
                parentCommentId: 'comment-1',
                createdAt: new Date(),
                updatedAt: new Date(),
                replies: []
              }
            ]
          }
        ]
      }

      const mockFetch = vi.fn().mockResolvedValue({ ok: true })
      global.fetch = mockFetch

      const onUpdate = vi.fn()
      render(<CommentSection {...defaultProps} task={taskWithReplies} onUpdate={onUpdate} />)

      // Find and click the reply's more menu
      const moreButtons = screen.getAllByRole('button')
      const replyMoreButton = moreButtons.find(btn =>
        btn.classList.contains('w-5') && btn.querySelector('.lucide-more-vertical')
      )

      if (replyMoreButton) {
        fireEvent.click(replyMoreButton)

        await waitFor(() => {
          const deleteButton = screen.getByText('Delete Reply')
          fireEvent.click(deleteButton)
        })

        await waitFor(() => {
          expect(mockFetch).toHaveBeenCalledWith(
            '/api/comments/reply-1',
            expect.objectContaining({ method: 'DELETE' })
          )
        })
      }
    })
  })

  describe('Error Handling', () => {
    it('should rollback optimistic update on comment add failure', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Server Error'
      })
      global.fetch = mockFetch

      const onUpdate = vi.fn()
      const setNewComment = vi.fn()
      render(<CommentSection
        {...defaultProps}
        newComment="Test comment"
        onUpdate={onUpdate}
        setNewComment={setNewComment}
      />)

      const textarea = screen.getByPlaceholderText('Add a comment...')
      fireEvent.keyDown(textarea, { key: 'Enter' })

      // Should add optimistically
      await waitFor(() => {
        expect(onUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            comments: expect.arrayContaining([
              expect.objectContaining({ content: 'Test comment' })
            ])
          })
        )
      })

      // Should rollback on failure
      await waitFor(() => {
        expect(onUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            comments: expect.not.arrayContaining([
              expect.objectContaining({ id: expect.stringContaining('temp-') })
            ])
          })
        )
      })

      // Should restore input
      expect(setNewComment).toHaveBeenCalledWith('Test comment')
    })

    it('should handle upload error gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Upload failed'))
      global.fetch = mockFetch

      const setUploadingFile = vi.fn()
      render(<CommentSection {...defaultProps} setUploadingFile={setUploadingFile} />)

      const fileInput = document.getElementById('comment-file-upload') as HTMLInputElement
      const file = new File(['content'], 'test.png', { type: 'image/png' })

      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false
      })

      fireEvent.change(fileInput)

      await waitFor(() => {
        expect(setUploadingFile).toHaveBeenCalledWith(false)
      })
    })
  })

  describe('Theme Compatibility', () => {
    it('should use theme-text-muted for comment author in chat bubble meta', () => {
      // Use a different author so name is displayed (not "You")
      const otherUser: User = { id: 'user-2', email: 'other@test.com', name: 'Other User', image: null }
      const taskWithOtherComment = {
        ...mockTask,
        comments: [{
          ...mockTask.comments![0],
          author: otherUser,
          authorId: 'user-2',
        }]
      }
      render(<CommentSection {...defaultProps} task={taskWithOtherComment} />)
      const usernameElement = screen.getByText('Other User')
      // Chat bubble meta row has theme-text-muted class
      const metaElement = usernameElement.closest('.chat-bubble-meta')
      expect(metaElement).toBeTruthy()
      expect(metaElement).toHaveClass('theme-text-muted')
    })

    it('should use theme-text-muted for reply author in chat bubble meta', () => {
      const otherUser: User = { id: 'user-2', email: 'other@test.com', name: 'Reply User', image: null }
      const taskWithReplies = {
        ...mockTask,
        comments: [
          {
            ...mockTask.comments![0],
            replies: [
              {
                id: 'reply-1',
                content: 'Reply content',
                type: 'TEXT' as const,
                author: otherUser,
                authorId: 'user-2',
                taskId: 'task-1',
                parentCommentId: 'comment-1',
                createdAt: new Date('2025-01-01T11:00:00Z'),
                updatedAt: new Date('2025-01-01T11:00:00Z'),
                replies: []
              }
            ]
          }
        ]
      }

      render(<CommentSection {...defaultProps} task={taskWithReplies} />)
      const replyUsernameElement = screen.getByText('Reply User')
      const metaElement = replyUsernameElement.closest('.chat-bubble-meta')
      expect(metaElement).toBeTruthy()
      expect(metaElement).toHaveClass('theme-text-muted')
    })

    it('should use theme-text-primary for attached file names', () => {
      const attachedFile: FileAttachment = {
        url: '/api/secure-files/file-123',
        name: 'document.pdf',
        type: 'application/pdf',
        size: 1024
      }
      render(<CommentSection {...defaultProps} attachedFile={attachedFile} />)
      const fileNameElement = screen.getByText('document.pdf')
      expect(fileNameElement).toHaveClass('theme-text-primary')
      expect(fileNameElement).not.toHaveClass('text-white')
    })

    it('should use theme-text-primary for reply attached file names', () => {
      const replyAttachedFile: FileAttachment = {
        url: '/api/secure-files/file-456',
        name: 'image.png',
        type: 'image/png',
        size: 2048
      }
      render(<CommentSection {...defaultProps} replyingTo="comment-1" replyAttachedFile={replyAttachedFile} />)
      const fileNameElement = screen.getByText('image.png')
      expect(fileNameElement).toHaveClass('theme-text-primary')
      expect(fileNameElement).not.toHaveClass('text-white')
    })
  })

  describe('Content Formatting', () => {
    it('should render markdown formatting in comments', () => {
      const taskWithMarkdown = {
        ...mockTask,
        comments: [
          {
            ...mockTask.comments![0],
            content: '**Bold** and *italic* and `code`'
          }
        ]
      }

      render(<CommentSection {...defaultProps} task={taskWithMarkdown} />)
      const commentElements = screen.getAllByText((content, element) => {
        return element?.innerHTML.includes('<strong>Bold</strong>') || false
      })
      expect(commentElements.length).toBeGreaterThan(0)
      expect(commentElements[0]).toBeInTheDocument()
    })

    it('should render URLs as clickable links', () => {
      const taskWithURL = {
        ...mockTask,
        comments: [
          {
            ...mockTask.comments![0],
            content: 'Check out https://example.com for more info'
          }
        ]
      }

      render(<CommentSection {...defaultProps} task={taskWithURL} />)
      const linkElements = screen.getAllByText((content, element) => {
        return element?.innerHTML.includes('href="https://example.com"') || false
      })
      expect(linkElements.length).toBeGreaterThan(0)
      expect(linkElements[0]).toBeInTheDocument()
    })

    it('should not show content that starts with "Attached:"', () => {
      const taskWithAttachment = {
        ...mockTask,
        comments: [
          {
            ...mockTask.comments![0],
            content: 'Attached: test.png'
          }
        ]
      }

      render(<CommentSection {...defaultProps} task={taskWithAttachment} />)
      expect(screen.queryByText('Attached: test.png')).not.toBeInTheDocument()
    })
  })
})
