"use client"

import { useState, useRef, useMemo, useCallback, useEffect } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SecureAttachmentViewer } from "@/components/secure-attachment-viewer"
import { UserLink } from "@/components/user-link"
import { Trash2, Paperclip, Reply, Send, MoreVertical, X, Image as ImageIcon, FileText, Loader2, RefreshCw } from "lucide-react"
import { format } from "date-fns"
import { isMobileDevice } from "@/lib/layout-detection"
import { renderMarkdownWithLinks } from "@/lib/markdown"
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh"
import type { Task, User } from "@/types/task"
import type { FileAttachment } from "@/hooks/task-detail/useTaskDetailState"

// Helper function to display author name/email with fallback for system/deleted users
function getAuthorDisplay(author: User | null | undefined, isSystemComment: boolean = false): string {
  if (isSystemComment || !author) return "System"
  return author.name || author.email || "Unknown User"
}

function getAuthorInitial(author: User | null | undefined, isSystemComment: boolean = false): string {
  if (isSystemComment || !author) return "S" // "S" for System
  const display = author.name || author.email || "?"
  return display.charAt(0).toUpperCase()
}

/**
 * Shared file upload logic for comments and replies.
 * Handles the upload to secure-upload API and returns file attachment data.
 */
async function uploadCommentFile(
  file: File,
  taskId: string,
  setUploading: (value: boolean) => void,
  setAttachedFile: (value: FileAttachment | null) => void,
  setUploadError?: (error: string | null) => void
): Promise<void> {
  // Check file size before upload (100MB limit)
  const maxSize = 100 * 1024 * 1024
  if (file.size > maxSize) {
    const errorMessage = `File size exceeds 100MB limit. Please upload large files to a file service (Google Drive, Dropbox, etc.) and share a link instead.`
    if (setUploadError) {
      setUploadError(errorMessage)
    }
    return
  }

  setUploading(true)
  if (setUploadError) {
    setUploadError(null)
  }

  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('context', JSON.stringify({ taskId }))

    const response = await fetch('/api/secure-upload/request-upload', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.error || 'Failed to upload file'

      // Check if error is about file size
      if (errorMessage.includes('100MB') || errorMessage.includes('size')) {
        if (setUploadError) {
          setUploadError('File size exceeds 100MB limit. Please upload large files to a file service (Google Drive, Dropbox, etc.) and share a link instead.')
        }
      } else {
        if (setUploadError) {
          setUploadError(errorMessage)
        }
      }
      throw new Error(errorMessage)
    }

    const result = await response.json()
    setAttachedFile({
      url: `/api/secure-files/${result.fileId}`,
      name: result.fileName,
      type: result.mimeType,
      size: result.fileSize
    })
  } catch (error) {
    console.error('Error uploading file:', error)
    if (!setUploadError) {
      // If no error handler provided, show generic message
      alert('Failed to upload file. Please try again.')
    }
  } finally {
    setUploading(false)
  }
}

interface CommentSectionProps {
  task: Task
  currentUser: User
  onUpdate: (updatedTask: Task) => void
  onLocalUpdate?: (updatedTaskOrFn: Task | ((taskId: string, currentTask: Task) => Task)) => void  // Update local state only, no API call
  readOnly?: boolean  // If true, hide comment input
  onRefreshComments?: () => Promise<void>  // Callback to refresh comments from API
  // Comment state from useTaskDetailState
  newComment: string
  setNewComment: (value: string) => void
  uploadingFile: boolean
  setUploadingFile: (value: boolean) => void
  attachedFile: FileAttachment | null
  setAttachedFile: (value: FileAttachment | null) => void
  replyingTo: string | null
  setReplyingTo: (value: string | null) => void
  replyContent: string
  setReplyContent: (value: string) => void
  replyAttachedFile: FileAttachment | null
  setReplyAttachedFile: (value: FileAttachment | null) => void
  uploadingReplyFile: boolean
  setUploadingReplyFile: (value: boolean) => void
  showingActionsFor: string | null
  setShowingActionsFor: (value: string | null) => void
  uploadError?: string | null
  setUploadError?: (value: string | null) => void
  replyUploadError?: string | null
  setReplyUploadError?: (value: string | null) => void
}

export function CommentSection({
  task,
  currentUser,
  onUpdate,
  onLocalUpdate,
  readOnly = false,
  onRefreshComments,
  newComment,
  setNewComment,
  uploadingFile,
  setUploadingFile,
  attachedFile,
  setAttachedFile,
  replyingTo,
  setReplyingTo,
  replyContent,
  setReplyContent,
  replyAttachedFile,
  setReplyAttachedFile,
  uploadingReplyFile,
  setUploadingReplyFile,
  showingActionsFor,
  setShowingActionsFor,
  uploadError,
  setUploadError,
  replyUploadError,
  setReplyUploadError
}: CommentSectionProps) {
  const [showSystemComments, setShowSystemComments] = useState(true)
  const [localUploadError, setLocalUploadError] = useState<string | null>(null)
  const [localReplyUploadError, setLocalReplyUploadError] = useState<string | null>(null)
  const [isRefreshingDesktop, setIsRefreshingDesktop] = useState(false)
  const commentsContainerRef = useRef<HTMLDivElement>(null)
  const commentInputRef = useRef<HTMLTextAreaElement>(null)
  const replyInputRef = useRef<HTMLTextAreaElement>(null)

  // Mention state
  const [mentionSearch, setMentionSearch] = useState<string | null>(null)
  const [mentionCursorPos, setMentionCursorPos] = useState<number>(0)
  const [isMentioningForReply, setIsMentioningForReply] = useState(false)

  const mentionableUsers = useMemo(() => {
    const users = new Map<string, User>()
    
    if (task.creator) users.set(task.creator.id, task.creator)
    if (task.assignee) users.set(task.assignee.id, task.assignee)
    
    task.lists?.forEach(list => {
      if (list.owner) users.set(list.owner.id, list.owner)
      list.members?.forEach(member => users.set(member.id, member))
      list.listMembers?.forEach(lm => {
        if (lm.user) users.set(lm.user.id, lm.user)
      })
      list.admins?.forEach(admin => users.set(admin.id, admin))
    })
    
    return Array.from(users.values()).filter(u => u.id !== currentUser.id)
  }, [task, currentUser.id])

  const filteredMentionUsers = useMemo(() => {
    if (!mentionSearch) return mentionableUsers
    const search = mentionSearch.toLowerCase()
    return mentionableUsers.filter(u => 
      (u.name?.toLowerCase().includes(search)) || 
      (u.email.toLowerCase().includes(search))
    )
  }, [mentionableUsers, mentionSearch])

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>, isReply: boolean) => {
    const value = e.target.value
    const cursorPos = e.target.selectionStart
    
    if (isReply) {
      setReplyContent(value)
    } else {
      setNewComment(value)
    }

    // Detect @ mention
    const textBeforeCursor = value.substring(0, cursorPos)
    const atIndex = textBeforeCursor.lastIndexOf('@')
    
    if (atIndex !== -1 && (atIndex === 0 || /\s/.test(textBeforeCursor[atIndex - 1]))) {
      const search = textBeforeCursor.substring(atIndex + 1)
      if (!/\s/.test(search)) {
        setMentionSearch(search)
        setMentionCursorPos(atIndex)
        setIsMentioningForReply(isReply)
        return
      }
    }
    
    setMentionSearch(null)
  }

  const insertMention = (user: User) => {
    const isReply = isMentioningForReply
    const content = isReply ? replyContent : newComment
    const setContent = isReply ? setReplyContent : setNewComment
    const inputRef = isReply ? replyInputRef : commentInputRef

    const textBefore = content.substring(0, mentionCursorPos)
    const textAfter = content.substring(mentionCursorPos + (mentionSearch?.length || 0) + 1)
    
    const mentionText = `@[${user.name || user.email}](${user.id}) `
    const newText = textBefore + mentionText + textAfter
    
    setContent(newText)
    setMentionSearch(null)
    
    // Focus back and set cursor
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        const newPos = mentionCursorPos + mentionText.length
        inputRef.current.setSelectionRange(newPos, newPos)
      }
    }, 0)
  }

  // Use provided error state or local state
  const uploadErrorState = uploadError ?? localUploadError
  const setUploadErrorState = setUploadError ?? setLocalUploadError
  const replyUploadErrorState = replyUploadError ?? localReplyUploadError
  const setReplyUploadErrorState = setReplyUploadError ?? setLocalReplyUploadError

  // Desktop refresh handler
  const handleDesktopRefresh = async () => {
    if (!onRefreshComments || isRefreshingDesktop) return
    setIsRefreshingDesktop(true)
    try {
      await onRefreshComments()
    } finally {
      setIsRefreshingDesktop(false)
    }
  }

  // Initialize pull-to-refresh hook
  const pullToRefresh = usePullToRefresh({
    threshold: 60,
    maxDistance: 120,
    onRefresh: onRefreshComments,
    disabled: !isMobileDevice() || !onRefreshComments
  })

  // Bind the comments container to the pull-to-refresh hook
  const { bindToElement, onTouchStart, onTouchMove, onTouchEnd, isRefreshing, pullDistance, isPulling, canRefresh } = pullToRefresh

  // Helper function to determine if we should show mobile-style attachment buttons
  const shouldShowMobileAttachmentButtons = () => {
    return isMobileDevice()
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    await uploadCommentFile(file, task.id, setUploadingFile, setAttachedFile, setUploadErrorState)
  }

  const handleAddComment = async () => {
    if (!newComment.trim() && !attachedFile) return

    const { nanoid } = await import('nanoid')
    const { OfflineSyncManager, isOfflineMode } = await import('@/lib/offline-sync')
    const { OfflineCommentOperations } = await import('@/lib/offline-db')

    const tempId = `temp-${nanoid()}`
    const commentData = {
      content: newComment.trim() || (attachedFile ? `Attached: ${attachedFile.name}` : ''),
      type: attachedFile ? "ATTACHMENT" as const : "TEXT" as const,
      fileId: attachedFile ? attachedFile.url.split('/').pop() : undefined
    }

    // Create optimistic comment for immediate UI update
    const optimisticComment = {
      id: tempId,
      content: commentData.content,
      type: commentData.type,
      author: currentUser,
      authorId: currentUser.id,
      taskId: task.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      parentCommentId: undefined,
      replies: [],
      secureFiles: attachedFile ? [{
        id: commentData.fileId || 'temp-file',
        originalName: attachedFile.name,
        mimeType: attachedFile.type || 'application/octet-stream',
        fileSize: attachedFile.size || 0,
        uploadedBy: currentUser.id,
        uploadedAt: new Date(),
        commentId: tempId
      }] : []
    }

    // Store original values for potential rollback
    const originalComment = newComment
    const originalFile = attachedFile

    // Clear inputs immediately for better UX
    setNewComment("")
    setAttachedFile(null)

    // Check if this is a collaborative public list where user doesn't have edit permissions
    const taskList = task.lists?.[0]
    const isCollaborativePublic = taskList?.privacy === 'PUBLIC' && taskList?.publicListType === 'collaborative'

    // Check if user has edit permissions (owner, admin, or member)
    // For collaborative public lists, non-members can comment but shouldn't trigger optimistic updates
    const isOwner = taskList?.ownerId === currentUser.id
    const isAdmin = taskList?.admins?.some(admin => admin.id === currentUser.id) ?? false
    const isMember = taskList?.members?.some(member => member.id === currentUser.id) ?? false
    const isListMember = taskList?.listMembers?.some((lm: any) => lm.userId === currentUser.id) ?? false
    const hasEditPermissions = isOwner || isAdmin || isMember || isListMember

    // Skip optimistic update for collaborative public lists where user doesn't have edit permissions
    // The comment will appear via onLocalUpdate instead, avoiding 403 errors on task update
    const shouldSkipOptimisticUpdate = isCollaborativePublic && !hasEditPermissions

    if (!shouldSkipOptimisticUpdate) {
      // Update UI optimistically (only for users with edit permissions)
      // Use onLocalUpdate to avoid triggering full task PUT request
      if (onLocalUpdate) {
        // Function-based update for onLocalUpdate to avoid stale closure
        onLocalUpdate((taskId: string, currentTask: Task) => {
          if (currentTask.id !== task.id) return currentTask
          return {
            ...currentTask,
            comments: [...(currentTask.comments || []), optimisticComment as any],
          }
        })
      } else {
        // Object-based update for onUpdate (fallback)
        onUpdate({
          ...task,
          comments: [...(task.comments || []), optimisticComment as any],
        })
      }
    }

    try {
      // Check if offline
      if (isOfflineMode()) {
        // Save comment locally
        await OfflineCommentOperations.saveComment(optimisticComment as any)

        // Queue mutation for sync
        await OfflineSyncManager.queueMutation(
          'create',
          'comment',
          tempId,
          `/api/tasks/${task.id}/comments`,
          'POST',
          commentData,
          task.id // parentId for dependency tracking
        )

        console.log('💬 Comment queued for offline sync')
        return
      }

      // Send the actual comment to the server
      const response = await fetch(`/api/tasks/${task.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(commentData),
      })

      if (!response.ok) {
        throw new Error('Failed to add comment')
      }

      const serverComment = await response.json()

      // Save to local cache
      await OfflineCommentOperations.saveComment(serverComment)

      // Update the UI with the server comment
      if (!shouldSkipOptimisticUpdate) {
        // For members: Replace the optimistic comment with the server version
        // Use function update to avoid stale closure issues
        if (onLocalUpdate) {
          onLocalUpdate((taskId: string, currentTask: Task) => {
            if (currentTask.id !== task.id) return currentTask
            return {
              ...currentTask,
              comments: (currentTask.comments || []).map(comment =>
                comment.id === tempId ? serverComment : comment
              ),
            }
          })
        } else {
          onUpdate({
            ...task,
            comments: (task.comments || []).map(comment =>
              comment.id === tempId ? serverComment : comment
            ),
          })
        }
      } else {
        // For non-members: Use onLocalUpdate to update UI without triggering API call
        if (onLocalUpdate) {
          onLocalUpdate((taskId: string, currentTask: Task) => {
            if (currentTask.id !== task.id) return currentTask
            return {
              ...currentTask,
              comments: [...(currentTask.comments || []), serverComment],
            }
          })
        }
      }

    } catch (error) {
      console.error("Error adding comment:", error)

      // Revert optimistic update on failure (only if we did one)
      if (!shouldSkipOptimisticUpdate) {
        // Use onLocalUpdate to avoid triggering full task PUT request
        if (onLocalUpdate) {
          onLocalUpdate((taskId: string, currentTask: Task) => {
            if (currentTask.id !== task.id) return currentTask
            return {
              ...currentTask,
              comments: (currentTask.comments || []).filter(comment => comment.id !== tempId),
            }
          })
        } else {
          onUpdate({
            ...task,
            comments: (task.comments || []).filter(comment => comment.id !== tempId),
          })
        }
      }

      // Restore the input values
      setNewComment(originalComment)
      setAttachedFile(originalFile)
    }
  }

  const handleReplyFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    await uploadCommentFile(file, task.id, setUploadingReplyFile, setReplyAttachedFile, setReplyUploadErrorState)
  }

  const handleDeleteComment = async (commentId: string) => {
    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to delete comment')
      }

      // Optimistically remove the comment from the UI
      // Use onLocalUpdate to avoid triggering full task PUT request
      if (onLocalUpdate) {
        onLocalUpdate((taskId: string, currentTask: Task) => {
          if (currentTask.id !== task.id) return currentTask
          return {
            ...currentTask,
            comments: (currentTask.comments || []).filter(c => c.id !== commentId),
          }
        })
      } else {
        // Object-based update for onUpdate (fallback)
        onUpdate({
          ...task,
          comments: (task.comments || []).filter(c => c.id !== commentId),
        })
      }
    } catch (error) {
      console.error("Error deleting comment:", error)
    }
  }

  const handleCommentTap = (commentId: string) => {
    // Only show actions on mobile when tapping
    if (isMobileDevice()) {
      setShowingActionsFor(showingActionsFor === commentId ? null : commentId)
    }
  }

  const handleDeleteReply = async (replyId: string, parentCommentId: string) => {
    try {
      const response = await fetch(`/api/comments/${replyId}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to delete reply')
      }

      // Optimistically remove the reply from the UI
      // Use onLocalUpdate to avoid triggering full task PUT request
      if (onLocalUpdate) {
        onLocalUpdate((taskId: string, currentTask: Task) => {
          if (currentTask.id !== task.id) return currentTask
          return {
            ...currentTask,
            comments: (currentTask.comments || []).map(comment => {
              if (comment.id === parentCommentId) {
                return {
                  ...comment,
                  replies: (comment.replies || []).filter(reply => reply.id !== replyId)
                }
              }
              return comment
            }),
          }
        })
      } else {
        // Object-based update for onUpdate (fallback)
        onUpdate({
          ...task,
          comments: (task.comments || []).map(comment => {
            if (comment.id === parentCommentId) {
              return {
                ...comment,
                replies: (comment.replies || []).filter(reply => reply.id !== replyId)
              }
            }
            return comment
          }),
        })
      }
    } catch (error) {
      console.error("Error deleting reply:", error)
    }
  }

  const handleAddReply = async (parentCommentId: string) => {
    if (!replyContent.trim() && !replyAttachedFile) return

    const { nanoid } = await import('nanoid')
    const { OfflineSyncManager, isOfflineMode } = await import('@/lib/offline-sync')
    const { OfflineCommentOperations } = await import('@/lib/offline-db')

    const tempId = `temp-reply-${nanoid()}`
    const replyData = {
      content: replyContent.trim() || (replyAttachedFile ? `Attached: ${replyAttachedFile.name}` : ''),
      type: replyAttachedFile ? "ATTACHMENT" as const : "TEXT" as const,
      parentCommentId,
      fileId: replyAttachedFile ? replyAttachedFile.url.split('/').pop() : undefined
    }

    // Create optimistic reply for immediate UI update
    const optimisticReply = {
      id: tempId,
      content: replyData.content,
      type: replyData.type,
      author: currentUser,
      authorId: currentUser.id,
      taskId: task.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      parentCommentId,
      replies: [],
      secureFiles: replyAttachedFile ? [{
        id: replyData.fileId || 'temp-reply-file',
        originalName: replyAttachedFile.name,
        mimeType: replyAttachedFile.type || 'application/octet-stream',
        fileSize: replyAttachedFile.size || 0,
        uploadedBy: currentUser.id,
        uploadedAt: new Date(),
        commentId: tempId
      }] : []
    }

    // Store original values for potential rollback
    const originalReply = replyContent
    const originalReplyFile = replyAttachedFile

    // Clear inputs immediately for better UX
    setReplyContent("")
    setReplyAttachedFile(null)
    setReplyingTo(null)

    // Update UI optimistically
    // Use onLocalUpdate to avoid triggering full task PUT request
    if (onLocalUpdate) {
        onLocalUpdate((taskId: string, currentTask: Task) => {
        if (currentTask.id !== task.id) return currentTask
        return {
          ...currentTask,
          comments: (currentTask.comments || []).map(comment => {
            if (comment.id === parentCommentId) {
              return {
                ...comment,
                replies: [...(comment.replies || []), optimisticReply as any]
              }
            }
            return comment
          }),
        }
      })
    } else {
      // Object-based update for onUpdate (fallback)
      onUpdate({
        ...task,
        comments: (task.comments || []).map(comment => {
          if (comment.id === parentCommentId) {
            return {
              ...comment,
              replies: [...(comment.replies || []), optimisticReply as any]
            }
          }
          return comment
        }),
      })
    }

    try {
      // Check if offline
      if (isOfflineMode()) {
        // Save reply locally
        await OfflineCommentOperations.saveComment(optimisticReply as any)

        // Queue mutation for sync
        await OfflineSyncManager.queueMutation(
          'create',
          'comment',
          tempId,
          `/api/tasks/${task.id}/comments`,
          'POST',
          replyData,
          task.id // parentId for dependency tracking
        )

        console.log('💬 Reply queued for offline sync')
        return
      }

      // Send the actual reply to the server
      const response = await fetch(`/api/tasks/${task.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(replyData),
      })

      if (!response.ok) {
        throw new Error('Failed to add reply')
      }

      const serverReply = await response.json()

      // Save to local cache
      await OfflineCommentOperations.saveComment(serverReply)

      // Replace the optimistic reply with the server version
      // Use onLocalUpdate to avoid triggering full task PUT request
      if (onLocalUpdate) {
        onLocalUpdate((taskId: string, currentTask: Task) => {
          if (currentTask.id !== task.id) return currentTask
          return {
            ...currentTask,
            comments: (currentTask.comments || []).map(comment => {
              if (comment.id === parentCommentId) {
                return {
                  ...comment,
                  replies: (comment.replies || []).map(reply =>
                    reply.id === tempId ? serverReply : reply
                  )
                }
              }
              return comment
            }),
          }
        })
      } else {
        // Object-based update for onUpdate (fallback)
        onUpdate({
          ...task,
          comments: (task.comments || []).map(comment => {
            if (comment.id === parentCommentId) {
              return {
                ...comment,
                replies: (comment.replies || []).map(reply =>
                  reply.id === tempId ? serverReply : reply
                )
              }
            }
            return comment
          }),
        })
      }

    } catch (error) {
      console.error("Error adding reply:", error)

      // Revert optimistic update on failure
      // Use onLocalUpdate to avoid triggering full task PUT request
      if (onLocalUpdate) {
        onLocalUpdate((taskId: string, currentTask: Task) => {
          if (currentTask.id !== task.id) return currentTask
          return {
            ...currentTask,
            comments: (currentTask.comments || []).map(comment => {
              if (comment.id === parentCommentId) {
                return {
                  ...comment,
                  replies: (comment.replies || []).filter(reply => reply.id !== tempId)
                }
              }
              return comment
            }),
          }
        })
      } else {
        // Object-based update for onUpdate (fallback)
        onUpdate({
          ...task,
          comments: (task.comments || []).map(comment => {
            if (comment.id === parentCommentId) {
              return {
                ...comment,
                replies: (comment.replies || []).filter(reply => reply.id !== tempId)
              }
            }
            return comment
          }),
        })
      }

      // Restore the input values
      setReplyContent(originalReply)
      setReplyAttachedFile(originalReplyFile)
      setReplyingTo(parentCommentId)
    }
  }

  const userComments = (task.comments || []).filter(c => c.authorId !== null)
  const systemComments = (task.comments || []).filter(c => c.authorId === null)
  const displayedCommentCount = showSystemComments
    ? (task.comments || []).length
    : userComments.length

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-4 flex flex-col flex-1 min-h-0">
      <div className="mb-3 flex items-center gap-2">
        <Label className="text-sm theme-text-muted">Comments ({displayedCommentCount})</Label>
        {systemComments.length > 0 && (
          <button
            onClick={() => setShowSystemComments(!showSystemComments)}
            className="text-xs theme-text-muted hover:theme-text-secondary transition-colors"
            title={showSystemComments ? "Hide system comments" : "Show system comments"}
          >
            {showSystemComments ? "Hide system" : "Show system"}
          </button>
        )}
        {/* Desktop refresh button - only show on non-mobile when refresh is available */}
        {!isMobileDevice() && onRefreshComments && (
          <button
            onClick={handleDesktopRefresh}
            disabled={isRefreshingDesktop}
            className="ml-auto text-xs theme-text-muted hover:theme-text-secondary transition-colors flex items-center gap-1"
            title="Refresh comments"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshingDesktop ? 'animate-spin' : ''}`} />
            {isRefreshingDesktop ? 'Refreshing...' : 'Refresh'}
          </button>
        )}
      </div>

      {/* Pull-to-refresh indicator */}
      {isMobileDevice() && (isPulling || isRefreshing) && (
        <div
          className="flex items-center justify-center py-2 transition-opacity duration-200"
          style={{
            opacity: isRefreshing ? 1 : Math.min(pullDistance / 60, 1),
            height: isRefreshing ? '40px' : `${Math.min(pullDistance / 2, 40)}px`
          }}
        >
          {isRefreshing ? (
            <Loader2 className="w-5 h-5 animate-spin theme-text-muted" />
          ) : canRefresh ? (
            <span className="text-sm theme-text-muted">Release to refresh...</span>
          ) : (
            <span className="text-sm theme-text-muted">Pull to refresh...</span>
          )}
        </div>
      )}

      <div
        ref={(el) => {
          commentsContainerRef.current = el
          bindToElement(el)
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="flex-1 overflow-y-auto scrollbar-hide space-y-3 pr-2 mb-4"
      >
        {(task.comments || [])
          .filter(comment => showSystemComments || comment.authorId !== null)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          .map((comment) => (
          <div key={comment.id} className="space-y-2">
            {/* System comments - simplified style */}
            {comment.authorId === null ? (
              <div className="text-xs theme-text-muted py-1">
                On {format(comment.createdAt, "MMM d 'at' h:mm a")}, {comment.content}
              </div>
            ) : (
              /* Regular comment */
              <div className="flex space-x-2">
                <div className="flex-1">
                  <div className="mb-1">
                    <div className="flex items-center justify-between">
                      <UserLink
                        user={comment.author}
                        showAvatar={true}
                        avatarSize="sm"
                        className="text-sm font-medium"
                      />
                      <div className="flex items-center space-x-2">
                        {/* Always show Reply button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                          className="text-xs theme-text-muted hover:text-blue-400 p-0 h-auto"
                        >
                          <Reply className="w-3 h-3 mr-1" />
                          Reply
                        </Button>

                        {/* Show More menu if user has actions available */}
                        {(comment.authorId === currentUser.id) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs theme-text-muted hover:theme-text-secondary p-0 h-auto w-6 h-6"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              onClick={() => handleDeleteComment(comment.id)}
                              className="text-red-600 hover:text-red-700 focus:text-red-700"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete Comment
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}

                      {/* Mobile: Show actions when comment is tapped */}
                      {isMobileDevice() && showingActionsFor === comment.id && comment.authorId === currentUser.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            handleDeleteComment(comment.id)
                            setShowingActionsFor(null)
                          }}
                          className="text-xs text-red-600 hover:text-red-700 p-0 h-auto"
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="text-xs theme-text-muted">
                    {format(comment.createdAt, "MMM d, yyyy 'at' h:mm a")}
                  </div>
                </div>

                {/* Comment content */}
                <div className="space-y-2">
                  {/* Show secure files if present */}
                  {comment.secureFiles && comment.secureFiles.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {comment.secureFiles.map((file: any) => (
                        <SecureAttachmentViewer
                          key={file.id}
                          fileId={file.id}
                          fileName={file.originalName}
                          showFileName={false}
                        />
                      ))}
                    </div>
                  )}


                  {/* Show text content if present and not just attachment description */}
                  {comment.content && !comment.content.startsWith('Attached: ') && (
                    <div
                      className="text-sm theme-text-secondary"
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdownWithLinks(comment.content, { codeClass: 'theme-bg-tertiary px-1 rounded' })
                      }}
                    />
                  )}
                </div>

                {/* Reply form */}
                {replyingTo === comment.id && (
                  <div className="mt-2 pl-4 border-l-2 border-blue-500 bg-gray-800/30 rounded-r-lg p-3">
                    <div className="text-xs text-blue-400 mb-2">
                      Replying to {getAuthorDisplay(comment.author)}
                    </div>

                    {/* Reply upload error message */}
                    {replyUploadErrorState && (
                      <div className="mb-2 p-2 bg-red-900/20 border border-red-500/50 rounded">
                        <div className="flex items-start space-x-2">
                          <X className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-xs text-red-300">{replyUploadErrorState}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setReplyUploadErrorState(null)}
                            className="p-0 h-auto text-red-400 hover:text-red-300 flex-shrink-0"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* File attachment preview for reply */}
                    {replyAttachedFile && (
                      <div className="mb-2 p-2 bg-gray-700 rounded border border-gray-600">
                        <div className="flex items-center space-x-2">
                          {replyAttachedFile.type?.startsWith('image/') ? (
                            <ImageIcon className="w-4 h-4 text-blue-400" />
                          ) : (
                            <FileText className="w-4 h-4 text-green-400" />
                          )}
                          <span className="text-sm theme-text-primary">{replyAttachedFile.name}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setReplyAttachedFile(null)}
                            className="p-0 h-auto text-red-400 hover:text-red-300"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Reply input with send button */}
                    <div className="relative mb-2">
                      {mentionSearch !== null && isMentioningForReply && (
                        <div className="absolute bottom-full left-0 mb-2 w-64 bg-popover border rounded-md shadow-lg z-50 overflow-hidden">
                          <div className="p-2 text-xs font-semibold text-muted-foreground border-b bg-muted/50 flex items-center">
                            Mention member
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            {filteredMentionUsers.length === 0 ? (
                              <div className="p-2 text-sm text-muted-foreground">No members found</div>
                            ) : (
                              filteredMentionUsers.map(user => (
                                <button
                                  key={user.id}
                                  className="w-full flex items-center px-3 py-2 text-sm hover:bg-accent text-left transition-colors"
                                  onClick={() => insertMention(user)}
                                >
                                  <Avatar className="h-6 w-6 mr-2">
                                    <AvatarImage src={user.image || undefined} />
                                    <AvatarFallback>{getAuthorInitial(user)}</AvatarFallback>
                                  </Avatar>
                                  <span className="truncate">{user.name || user.email}</span>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                      <textarea
                        ref={replyInputRef}
                        value={replyContent}
                        onChange={(e) => handleTextChange(e, true)}
                        placeholder="Write a reply..."
                        className={`w-full theme-comment-bg theme-border border theme-text-primary rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                          shouldShowMobileAttachmentButtons() ? 'pr-3' : 'pr-12'
                        }`}
                        rows={2}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            if (e.shiftKey || e.metaKey || e.ctrlKey) {
                              // Shift+Enter, Cmd/Ctrl + Enter: Add line break (default textarea behavior)
                              // Don't prevent default - let textarea handle line break
                              return
                            } else {
                              // Plain Enter: Send reply
                              e.preventDefault()
                              if (replyContent.trim()) {
                                handleAddReply(comment.id)
                              }
                            }
                          }
                        }}
                      />

                      {/* Paperclip and Send buttons - Desktop only */}
                      {!shouldShowMobileAttachmentButtons() && (
                        <div className="absolute right-2 top-2 flex space-x-1">
                          {/* File upload button - paperclip icon */}
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={uploadingReplyFile}
                            className="p-1 h-auto theme-text-muted hover:theme-text-secondary hover:theme-bg-hover relative"
                            title={uploadingReplyFile ? 'Uploading...' : 'Attach file'}
                            onClick={() => document.getElementById(`reply-file-upload-${comment.id}`)?.click()}
                          >
                            <input
                              type="file"
                              id={`reply-file-upload-${comment.id}`}
                              onChange={handleReplyFileUpload}
                              className="hidden"
                              accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip"
                              disabled={uploadingReplyFile}
                            />
                            <Paperclip className="w-4 h-4" />
                          </Button>

                          {/* Send button (only show when there's content or attachment) */}
                          {(replyContent.trim() || replyAttachedFile) && (
                            <Button
                              size="sm"
                              onClick={() => handleAddReply(comment.id)}
                              disabled={uploadingReplyFile}
                              className="p-1 h-auto bg-blue-600 hover:bg-blue-700 text-white"
                              title="Send reply (Enter)"
                            >
                              <Send className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Mobile attachment and send buttons - Below text area */}
                    {shouldShowMobileAttachmentButtons() && (
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex space-x-2">
                          {/* File upload button for mobile */}
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={uploadingReplyFile}
                            className="flex items-center space-x-1 theme-text-muted hover:theme-text-secondary hover:theme-bg-hover px-3 py-2"
                            onClick={() => document.getElementById(`reply-file-upload-${comment.id}`)?.click()}
                          >
                            <input
                              type="file"
                              id={`reply-file-upload-${comment.id}`}
                              onChange={handleReplyFileUpload}
                              className="hidden"
                              accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip"
                              disabled={uploadingReplyFile}
                            />
                            <Paperclip className="w-4 h-4" />
                            <span className="text-sm">{uploadingReplyFile ? 'Uploading...' : 'Attach'}</span>
                          </Button>
                        </div>

                        {/* Send button for mobile (only show when there's content or attachment) */}
                        {(replyContent.trim() || replyAttachedFile) && (
                          <Button
                            size="sm"
                            onClick={() => handleAddReply(comment.id)}
                            disabled={uploadingReplyFile}
                            className="flex items-center space-x-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2"
                          >
                            <Send className="w-4 h-4" />
                            <span className="text-sm">Send</span>
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Helper text and Cancel button */}
                    <div className="flex items-center justify-between">
                      <div className="text-xs theme-text-muted">
                        Press Enter to send • Shift+Enter or Cmd/Ctrl+Enter for line breaks
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setReplyingTo(null)
                          setReplyContent("")
                          setReplyAttachedFile(null)
                        }}
                        className="theme-text-muted hover:theme-text-secondary text-xs"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Nested replies */}
                {comment.replies && comment.replies.length > 0 && (
                  <div className="mt-3 ml-4 pl-4 border-l-2 border-gray-600 space-y-3">
                    <div className="text-xs theme-text-muted font-medium">
                      {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}
                    </div>
                    {comment.replies.map((reply) => (
                      <div key={reply.id} className="flex space-x-2 bg-gray-800/20 rounded-lg p-3">
                        <div className="flex-1">
                          <div className="mb-1">
                            <div className="flex items-center justify-between">
                              <UserLink
                                user={reply.author}
                                showAvatar={true}
                                avatarSize="sm"
                                className="text-xs font-medium"
                              />
                              <div className="flex items-center space-x-2">
                                <span className="text-xs text-blue-400">replied</span>

                                {/* Show More menu for reply authors */}
                                {(reply.authorId === currentUser.id) && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-xs theme-text-muted hover:theme-text-secondary p-0 h-auto w-5 h-5"
                                      >
                                        <MoreVertical className="w-3 h-3" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-40">
                                      <DropdownMenuItem
                                        onClick={() => handleDeleteReply(reply.id, comment.id)}
                                        className="text-red-600 hover:text-red-700 focus:text-red-700"
                                      >
                                        <Trash2 className="w-3 h-3 mr-2" />
                                        Delete Reply
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}

                                {/* Mobile: Show actions when reply is tapped */}
                                {isMobileDevice() && showingActionsFor === reply.id && reply.authorId === currentUser.id && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      handleDeleteReply(reply.id, comment.id)
                                      setShowingActionsFor(null)
                                    }}
                                    className="text-xs text-red-600 hover:text-red-700 p-0 h-auto"
                                  >
                                    <Trash2 className="w-3 h-3 mr-1" />
                                    Delete
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div className="text-xs theme-text-muted">
                              {format(reply.createdAt, "MMM d 'at' h:mm a")}
                            </div>
                          </div>
                          {/* Reply content */}
                          <div className="space-y-2">
                            {/* Show secure files if present */}
                            {reply.secureFiles && reply.secureFiles.length > 0 && (
                              <div className="flex gap-2 flex-wrap">
                                {reply.secureFiles.map((file: any) => (
                                  <SecureAttachmentViewer
                                    key={file.id}
                                    fileId={file.id}
                                    fileName={file.originalName}
                                    showFileName={false}
                                  />
                                ))}
                              </div>
                            )}

                            {/* Show text content if present and not just attachment description */}
                            {reply.content && reply.content !== `Attached: ${reply.attachmentName}` && (
                              <div
                                className="text-xs theme-text-secondary"
                                dangerouslySetInnerHTML={{
                                  __html: renderMarkdownWithLinks(reply.content, { codeClass: 'theme-bg-tertiary px-1 rounded' })
                                }}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            )}
          </div>
        ))}
      </div>

      {/* Persistent Add Comment Box */}
      <div className="border-t border-gray-600 pt-3 mt-auto">
        {/* Upload error message */}
        {uploadErrorState && (
          <div className="mb-2 p-3 bg-red-900/20 border border-red-500/50 rounded-lg">
            <div className="flex items-start space-x-2">
              <X className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-300">{uploadErrorState}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setUploadErrorState(null)}
                className="p-0 h-auto text-red-400 hover:text-red-300 flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* File attachment preview */}
        {attachedFile && (
          <div className="mb-2 p-2 bg-gray-700 rounded border border-gray-600">
            <div className="flex items-center space-x-2">
              {attachedFile.type?.startsWith('image/') ? (
                <ImageIcon className="w-4 h-4 text-blue-400" />
              ) : (
                <FileText className="w-4 h-4 text-green-400" />
              )}
              <span className="text-sm theme-text-primary">{attachedFile.name}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAttachedFile(null)}
                className="p-0 h-auto text-red-400 hover:text-red-300"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Comment input section - hidden in readOnly mode */}
        {!readOnly && (
          <>
            {/* Comment input with paperclip icon */}
            <div className="relative">
              {mentionSearch !== null && !isMentioningForReply && (
                <div className="absolute bottom-full left-0 mb-2 w-64 bg-popover border rounded-md shadow-lg z-50 overflow-hidden">
                  <div className="p-2 text-xs font-semibold text-muted-foreground border-b bg-muted/50 flex items-center">
                    Mention member
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {filteredMentionUsers.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground">No members found</div>
                    ) : (
                      filteredMentionUsers.map(user => (
                        <button
                          key={user.id}
                          className="w-full flex items-center px-3 py-2 text-sm hover:bg-accent text-left transition-colors"
                          onClick={() => insertMention(user)}
                        >
                          <Avatar className="h-6 w-6 mr-2">
                            <AvatarImage src={user.image || undefined} />
                            <AvatarFallback>{getAuthorInitial(user)}</AvatarFallback>
                          </Avatar>
                          <span className="truncate">{user.name || user.email}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
              <textarea
                ref={commentInputRef}
                value={newComment}
                onChange={(e) => handleTextChange(e, false)}
                placeholder="Add a comment..."
                className={`w-full theme-comment-bg theme-border border theme-text-primary rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  shouldShowMobileAttachmentButtons() ? 'pr-3' : 'pr-12'
                }`}
                rows={2}
                inputMode="text"
                enterKeyHint="send"
                style={{ fontSize: '16px' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (e.shiftKey || e.metaKey || e.ctrlKey) {
                      // Shift+Enter, Cmd/Ctrl + Enter: Add line break (default textarea behavior)
                      // Don't prevent default - let textarea handle line break
                      return
                    } else {
                      // Plain Enter: Send comment
                      e.preventDefault()
                      if (newComment.trim()) {
                        handleAddComment()
                      }
                    }
                  }
                }}
              />

              {/* Paperclip icon for attachments - Desktop only */}
              {!shouldShowMobileAttachmentButtons() && (
                <div className="absolute right-2 top-2 flex space-x-1">
                  {/* File upload button - paperclip icon */}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={uploadingFile}
                    className="p-1 h-auto theme-text-muted hover:theme-text-secondary hover:theme-bg-hover relative"
                    title={uploadingFile ? 'Uploading...' : 'Attach file'}
                    onClick={() => document.getElementById('comment-file-upload')?.click()}
                  >
                    <input
                      type="file"
                      id="comment-file-upload"
                      onChange={handleFileUpload}
                      className="hidden"
                      accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip"
                      disabled={uploadingFile}
                    />
                    <Paperclip className="w-4 h-4" />
                  </Button>

                  {/* Send button (only show when there's content or attachment) */}
                  {(newComment.trim() || attachedFile) && (
                    <Button
                      size="sm"
                      onClick={handleAddComment}
                      disabled={uploadingFile}
                      className="p-1 h-auto bg-blue-600 hover:bg-blue-700 text-white"
                      title="Send comment (Enter)"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Mobile attachment and send buttons - Below text area */}
            {shouldShowMobileAttachmentButtons() && (
              <div className="flex justify-between items-center mt-2">
                <div className="flex space-x-2">
                  {/* File upload button for mobile */}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={uploadingFile}
                    className="flex items-center space-x-1 theme-text-muted hover:theme-text-secondary hover:theme-bg-hover px-3 py-2"
                    onClick={() => document.getElementById('comment-file-upload')?.click()}
                  >
                    <input
                      type="file"
                      id="comment-file-upload"
                      onChange={handleFileUpload}
                      className="hidden"
                      accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip"
                      disabled={uploadingFile}
                    />
                    <Paperclip className="w-4 h-4" />
                    <span className="text-sm">{uploadingFile ? 'Uploading...' : 'Attach'}</span>
                  </Button>
                </div>

                {/* Send button for mobile (only show when there's content or attachment) */}
                {(newComment.trim() || attachedFile) && (
                  <Button
                    size="sm"
                    onClick={handleAddComment}
                    disabled={uploadingFile}
                    className="flex items-center space-x-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2"
                  >
                    <Send className="w-4 h-4" />
                    <span className="text-sm">Send</span>
                  </Button>
                )}
              </div>
            )}

            {/* Helper text */}
            <div className="text-xs theme-text-muted mt-1">
              Press Enter to send • Shift+Enter or Cmd/Ctrl+Enter for line breaks
            </div>
          </>
        )}
      </div>
    </div>
  )
}
