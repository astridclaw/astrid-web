"use client"

import React, { createContext, useContext, useState, useEffect } from "react"

interface SettingsContextType {
  toastDebugMode: boolean
  setToastDebugMode: (enabled: boolean) => void
  reminderDebugMode: boolean
  setReminderDebugMode: (enabled: boolean) => void
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [toastDebugMode, setToastDebugModeState] = useState(false)
  const [reminderDebugMode, setReminderDebugModeState] = useState(false)

  useEffect(() => {
    // Load from localStorage on mount
    const savedToast = localStorage.getItem("toast-debug-mode")
    if (savedToast !== null) {
      setToastDebugModeState(JSON.parse(savedToast))
    }
    
    const savedReminder = localStorage.getItem("reminder-debug-mode")
    if (savedReminder !== null) {
      setReminderDebugModeState(JSON.parse(savedReminder))
    }
  }, [])

  const setToastDebugMode = (enabled: boolean) => {
    setToastDebugModeState(enabled)
    localStorage.setItem("toast-debug-mode", JSON.stringify(enabled))
  }

  const setReminderDebugMode = (enabled: boolean) => {
    setReminderDebugModeState(enabled)
    localStorage.setItem("reminder-debug-mode", JSON.stringify(enabled))
  }

  return (
    <SettingsContext.Provider value={{
      toastDebugMode,
      setToastDebugMode,
      reminderDebugMode,
      setReminderDebugMode
    }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider")
  }
  return context
}