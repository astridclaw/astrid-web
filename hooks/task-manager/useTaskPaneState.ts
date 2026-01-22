import { useState, useCallback } from "react"

export interface UseTaskPaneStateProps {
  selectedTaskId: string
  isMobile: boolean
  setSelectedTaskId: (id: string) => void
  setSelectedTaskElement: (el: HTMLElement | null) => void
}

export interface UseTaskPaneStateReturn {
  // State
  isTaskPaneClosing: boolean
  taskPanePosition: { left: number }

  // State setters
  setIsTaskPaneClosing: React.Dispatch<React.SetStateAction<boolean>>
  setTaskPanePosition: React.Dispatch<React.SetStateAction<{ left: number }>>

  // Handlers
  closeTaskPaneAnimated: () => void
}

export function useTaskPaneState({
  selectedTaskId,
  isMobile,
  setSelectedTaskId,
  setSelectedTaskElement
}: UseTaskPaneStateProps): UseTaskPaneStateReturn {
  // Task pane state
  const [isTaskPaneClosing, setIsTaskPaneClosing] = useState(false)
  const [taskPanePosition, setTaskPanePosition] = useState({ left: 0 })

  // Handle animated task pane closing
  const closeTaskPaneAnimated = useCallback(() => {
    if (!selectedTaskId || isMobile) {
      setSelectedTaskId("")
      setSelectedTaskElement(null)
      return
    }

    setIsTaskPaneClosing(true)
    setTimeout(() => {
      setSelectedTaskId("")
      setSelectedTaskElement(null)
      setIsTaskPaneClosing(false)
    }, 300) // Match animation duration
  }, [selectedTaskId, isMobile, setSelectedTaskId, setSelectedTaskElement])

  return {
    // State
    isTaskPaneClosing,
    taskPanePosition,

    // State setters
    setIsTaskPaneClosing,
    setTaskPanePosition,

    // Handlers
    closeTaskPaneAnimated
  }
}
