/**
 * Task Sound Effects Manager
 *
 * Centralized sound effect triggers for task operations.
 * All task-related sounds should be played through these functions
 * to ensure consistency and maintainability.
 */

// Audio elements for each sound type
let taskCompleteAudio: HTMLAudioElement | null = null
let taskCreateAudio: HTMLAudioElement | null = null
let taskDeleteAudio: HTMLAudioElement | null = null
let isInitialized = false

/**
 * Initialize the sound manager (call once, outside React render)
 */
export function initTaskSounds(options: { enabled?: boolean; volume?: number } = {}) {
  if (isInitialized) return

  const volume = options.volume ?? 0.4
  const enabled = options.enabled ?? true

  if (!enabled) return

  try {
    taskCompleteAudio = new Audio('/sounds/task-complete.wav')
    taskCompleteAudio.volume = volume
    taskCompleteAudio.preload = 'auto'

    taskCreateAudio = new Audio('/sounds/task-create.wav')
    taskCreateAudio.volume = volume
    taskCreateAudio.preload = 'auto'

    isInitialized = true
  } catch (error) {
    // Silently fail - sounds are non-critical
  }
}

/**
 * Play sound when a task is created
 */
export function playTaskCreateSound() {
  if (!isInitialized || !taskCreateAudio) return

  taskCreateAudio.currentTime = 0
  taskCreateAudio.play().catch(() => {
    // Silently fail - browser may block autoplay
  })
}

/**
 * Play sound when a task is completed
 * Only plays if task is transitioning from incomplete to complete
 */
export function playTaskCompleteSound(wasCompleted: boolean, isCompleted: boolean) {
  const isBeingCompleted = !wasCompleted && isCompleted
  if (!isBeingCompleted || !isInitialized || !taskCompleteAudio) return

  taskCompleteAudio.currentTime = 0
  taskCompleteAudio.play().catch(() => {
    // Silently fail - browser may block autoplay
  })
}

/**
 * Play sound when a task is deleted
 * NOTE: Currently disabled - delete sound not working properly
 */
export function playTaskDeleteSound() {
  // Disabled for now
  return
}
