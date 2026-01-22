"use client"

import { useEffect } from 'react'
import { initTaskSounds } from '@/lib/task-sounds'

/**
 * Sound Initializer Component
 *
 * Initializes task sounds once on app mount.
 * Must be a client component to run in browser.
 */
export function SoundInitializer() {
  useEffect(() => {
    // Initialize sounds on first mount only
    initTaskSounds({ enabled: true, volume: 0.4 })
  }, [])

  return null // This component renders nothing
}
