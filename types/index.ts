// Re-export all types from their source files
// This provides backward compatibility for imports from "@/types"

import type {
  TaskList as BaseTaskList,
  User as BaseUser,
  Attachment as BaseAttachment,
  Comment as BaseComment,
  RepeatFromMode,
} from "./task"

// Entity types (User, Task, TaskList, Comment, etc.)
export type {
  User,
  ListMember,
  TaskList,
  ListPermission,
  Comment,
  Attachment,
  SecureFile,
  Task,
  RepeatOption,
  PriorityLevel,
  RepeatFromMode,
} from "./task"

// API request/response types
export type {
  CreateTaskData,
  UpdateTaskData,
  CreateListData,
  CreateCommentData,
  CopyTaskData,
  ApiResponse,
} from "./api"

// Reminder types
export type { ReminderSettings } from "./reminder"

// Extended types with relations (keep here for backward compatibility)
export interface TaskListWithRelations extends BaseTaskList {
  owner: BaseUser
  admins: BaseUser[]
  tasks?: TaskWithRelations[]
  _count?: {
    tasks: number
  }
}

export interface TaskWithRelations {
  id: string
  title: string
  description: string
  assignee?: BaseUser | null
  assigneeId?: string | null
  creator: BaseUser
  creatorId: string
  when?: Date
  dueDate?: Date | null
  dueDateTime?: Date | null
  isAllDay?: boolean
  reminderTime?: Date | null
  reminderSent?: boolean
  reminderType?: "push" | "email" | "both" | null
  repeating: "never" | "daily" | "weekly" | "monthly" | "yearly" | "custom"
  repeatFrom: RepeatFromMode
  occurrenceCount: number
  priority: 0 | 1 | 2 | 3
  lists: TaskListWithRelations[]
  isPrivate: boolean
  completed: boolean
  attachments: BaseAttachment[]
  comments: BaseComment[]
  createdAt: Date
  updatedAt: Date
  originalTaskId?: string
  sourceListId?: string
}
