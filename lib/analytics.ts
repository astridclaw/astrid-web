import posthog from "posthog-js"

// Check if PostHog is initialized and loaded
function isPostHogReady(): boolean {
  return typeof window !== "undefined" && posthog.__loaded
}

// ============================================
// AUTH EVENTS
// ============================================

export function trackSignUp(method: "email" | "google" | "apple" | "passkey") {
  if (!isPostHogReady()) return
  posthog.capture("user_signed_up", {
    method,
    platform: "web",
  })
}

export function trackLogin(method: "email" | "google" | "apple" | "passkey" | "magic_link") {
  if (!isPostHogReady()) return
  posthog.capture("user_logged_in", {
    method,
    platform: "web",
  })
}

export function trackLogout() {
  if (!isPostHogReady()) return
  posthog.capture("user_logged_out", {
    platform: "web",
  })
}

// ============================================
// TASK EVENTS
// ============================================

interface TaskEventProps {
  taskId: string
  listId?: string
  hasDescription?: boolean
  hasDueDate?: boolean
  hasReminder?: boolean
  priority?: number
  isRepeating?: boolean
}

export function trackTaskCreated(props: TaskEventProps) {
  if (!isPostHogReady()) return
  posthog.capture("task_created", {
    ...props,
    platform: "web",
  })
}

export function trackTaskCompleted(props: TaskEventProps & { completionSource?: "checkbox" | "swipe" | "keyboard" }) {
  if (!isPostHogReady()) return
  posthog.capture("task_completed", {
    ...props,
    platform: "web",
  })
}

export function trackTaskUncompleted(props: TaskEventProps) {
  if (!isPostHogReady()) return
  posthog.capture("task_uncompleted", {
    ...props,
    platform: "web",
  })
}

export function trackTaskDeleted(props: TaskEventProps) {
  if (!isPostHogReady()) return
  posthog.capture("task_deleted", {
    ...props,
    platform: "web",
  })
}

export function trackTaskEdited(props: TaskEventProps & { fieldsChanged: string[] }) {
  if (!isPostHogReady()) return
  posthog.capture("task_edited", {
    ...props,
    platform: "web",
  })
}

export function trackTaskViewed(props: { taskId: string; listId?: string }) {
  if (!isPostHogReady()) return
  posthog.capture("task_viewed", {
    ...props,
    platform: "web",
  })
}

export function trackTaskAssigned(props: { taskId: string; listId?: string; assigneeCount: number }) {
  if (!isPostHogReady()) return
  posthog.capture("task_assigned", {
    ...props,
    platform: "web",
  })
}

// ============================================
// LIST EVENTS
// ============================================

interface ListEventProps {
  listId: string
  isVirtual?: boolean
}

interface ListCreatedProps extends ListEventProps {
  hasImage?: boolean
  isShared?: boolean // Has members besides creator
  hasGitIntegration?: boolean
  isPublic?: boolean
}

export function trackListCreated(props: ListCreatedProps) {
  if (!isPostHogReady()) return
  posthog.capture("list_created", {
    ...props,
    platform: "web",
  })
}

export function trackListEdited(props: ListEventProps & { fieldsChanged: string[] }) {
  if (!isPostHogReady()) return
  posthog.capture("list_edited", {
    ...props,
    platform: "web",
  })
}

export function trackListShared(props: ListEventProps & { memberCount: number }) {
  if (!isPostHogReady()) return
  posthog.capture("list_shared", {
    ...props,
    platform: "web",
  })
}

export function trackListDeleted(props: ListEventProps & { taskCount?: number }) {
  if (!isPostHogReady()) return
  posthog.capture("list_deleted", {
    ...props,
    platform: "web",
  })
}

// ============================================
// COMMENT EVENTS
// ============================================

export function trackCommentAdded(props: { taskId: string; listId?: string; hasAttachment?: boolean }) {
  if (!isPostHogReady()) return
  posthog.capture("comment_added", {
    ...props,
    platform: "web",
  })
}

// ============================================
// REMINDER EVENTS
// ============================================

export function trackReminderSet(props: { taskId: string; reminderType: "specific" | "relative" }) {
  if (!isPostHogReady()) return
  posthog.capture("reminder_set", {
    ...props,
    platform: "web",
  })
}

export function trackReminderCleared(props: { taskId: string }) {
  if (!isPostHogReady()) return
  posthog.capture("reminder_cleared", {
    ...props,
    platform: "web",
  })
}

// ============================================
// SESSION EVENTS
// ============================================

export function trackSessionStart() {
  if (!isPostHogReady()) return
  posthog.capture("session_started", {
    platform: "web",
    userAgent: navigator.userAgent,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  })
}

// ============================================
// SETTINGS EVENTS
// ============================================

export function trackSettingsVisited(section: string) {
  if (!isPostHogReady()) return
  posthog.capture("settings_visited", {
    section,
    platform: "web",
  })
}

export function trackSettingsChanged(props: { setting: string; newValue: unknown }) {
  if (!isPostHogReady()) return
  posthog.capture("settings_changed", {
    ...props,
    platform: "web",
  })
}
