import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Theme-aware class utilities
export const themeClasses = {
  // Backgrounds
  background: "bg-white dark:bg-gray-900",
  backgroundSecondary: "bg-gray-50 dark:bg-gray-800",
  backgroundTertiary: "bg-gray-100 dark:bg-gray-700",
  
  // Surfaces (components)
  surface: "bg-white dark:bg-gray-800",
  surfaceHover: "hover:bg-gray-50 dark:hover:bg-gray-700",
  surfaceActive: "bg-gray-100 dark:bg-gray-700",
  
  // Borders
  border: "border-gray-200 dark:border-gray-700",
  borderHover: "hover:border-gray-300 dark:hover:border-gray-600",
  borderInput: "border-gray-300 dark:border-gray-600",
  
  // Text
  textPrimary: "text-gray-900 dark:text-white",
  textSecondary: "text-gray-700 dark:text-gray-300",
  textMuted: "text-gray-500 dark:text-gray-400",
  textInverted: "text-white dark:text-gray-900",
  
  // Interactive elements
  button: "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700",
  buttonGhost: "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700",
  
  // Inputs
  input: "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400",
  
  // Special states
  selected: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
  selectedText: "text-gray-900 dark:text-white",
}

// Dynamic theme classes based on theme state
export function getThemeClasses(isDark: boolean) {
  return {
    background: isDark ? "bg-gray-900" : "bg-white",
    backgroundSecondary: isDark ? "bg-gray-800" : "bg-gray-50",
    surface: isDark ? "bg-gray-800" : "bg-white",
    border: isDark ? "border-gray-700" : "border-gray-200",
    textPrimary: isDark ? "text-white" : "text-gray-900",
    textSecondary: isDark ? "text-gray-300" : "text-gray-700",
    textMuted: isDark ? "text-gray-400" : "text-gray-500",
    input: isDark 
      ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
      : "bg-white border-gray-300 text-gray-900 placeholder-gray-500",
    button: isDark
      ? "bg-gray-800 border-gray-600 text-white hover:bg-gray-700"
      : "bg-white border-gray-300 text-gray-900 hover:bg-gray-50",
  }
}