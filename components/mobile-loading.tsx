"use client"

import { TaskCheckbox } from "./task-checkbox"

// Blank task row component that looks exactly like a real task but with empty content
function BlankTaskRow({ isMobile = false }: { isMobile?: boolean }) {
  return (
    <div
      className={`task-row task-card transition-theme theme-surface theme-border theme-surface-hover ${
        isMobile ? 'mobile-task-item' : ''
      }`}
    >
      <TaskCheckbox
        checked={false}
        onToggle={() => {}} // No-op for loading state
        priority={0} // Lowest priority (gray)
        repeating={false}
      />
      <div className="flex-1 min-w-0">
        <div className={`task-title ${
          isMobile ? 'text-base font-medium leading-tight' : ''
        } theme-text-primary`}>
          {/* Empty title - just a space to maintain height */}
          &nbsp;
        </div>
        
        {/* Mobile: Show empty date and lists row */}
        {isMobile ? (
          <div className="flex items-center justify-between mt-1 gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {/* Empty space for lists */}
            </div>
            {/* Empty space for due date */}
          </div>
        ) : (
          /* Desktop: Empty lists row */
          <div className="flex items-center gap-2 mt-1">
            {/* Empty space for lists and due date */}
          </div>
        )}
      </div>
    </div>
  )
}

export function BlankTaskList({ count = 5, isMobile = false }: { count?: number, isMobile?: boolean }) {
  return (
    <div className={isMobile ? "space-y-2 px-2 pt-2" : "space-y-2 p-4"}>
      {Array.from({ length: count }, (_, i) => (
        <BlankTaskRow key={i} isMobile={isMobile} />
      ))}
    </div>
  )
}

// Legacy export for backward compatibility
export const MobileTaskListSkeleton = BlankTaskList