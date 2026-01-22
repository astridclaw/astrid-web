export interface ThemeColors {
  // Background colors
  background: string
  backgroundSecondary: string
  backgroundTertiary: string
  
  // Surface colors
  surface: string
  surfaceHover: string
  surfaceActive: string
  
  // Border colors
  border: string
  borderHover: string
  
  // Text colors
  textPrimary: string
  textSecondary: string
  textMuted: string
  textInverted: string
  
  // Accent colors
  accent: string
  accentHover: string
  accentText: string
  
  // Status colors
  success: string
  warning: string
  error: string
  info: string
}

export const lightTheme: ThemeColors = {
  background: "rgb(255, 255, 255)",
  backgroundSecondary: "rgb(249, 250, 251)",
  backgroundTertiary: "rgb(243, 244, 246)",
  
  surface: "rgb(255, 255, 255)",
  surfaceHover: "rgb(243, 244, 246)",
  surfaceActive: "rgb(229, 231, 235)",
  
  border: "rgb(229, 231, 235)",
  borderHover: "rgb(209, 213, 219)",
  
  textPrimary: "rgb(17, 24, 39)",
  textSecondary: "rgb(75, 85, 99)",
  textMuted: "rgb(156, 163, 175)",
  textInverted: "rgb(255, 255, 255)",
  
  accent: "rgb(59, 130, 246)",
  accentHover: "rgb(37, 99, 235)",
  accentText: "rgb(255, 255, 255)",
  
  success: "rgb(34, 197, 94)",
  warning: "rgb(245, 158, 11)",
  error: "rgb(239, 68, 68)",
  info: "rgb(6, 182, 212)"
}

export const darkTheme: ThemeColors = {
  background: "rgb(17, 24, 39)",
  backgroundSecondary: "rgb(31, 41, 55)",
  backgroundTertiary: "rgb(55, 65, 81)",

  surface: "rgb(31, 41, 55)",
  surfaceHover: "rgb(55, 65, 81)",
  surfaceActive: "rgb(75, 85, 99)",

  border: "rgb(75, 85, 99)",
  borderHover: "rgb(107, 114, 128)",

  textPrimary: "rgb(255, 255, 255)",
  textSecondary: "rgb(209, 213, 219)",
  textMuted: "rgb(156, 163, 175)",
  textInverted: "rgb(17, 24, 39)",

  accent: "rgb(59, 130, 246)",
  accentHover: "rgb(37, 99, 235)",
  accentText: "rgb(255, 255, 255)",

  success: "rgb(34, 197, 94)",
  warning: "rgb(245, 158, 11)",
  error: "rgb(239, 68, 68)",
  info: "rgb(6, 182, 212)"
}

export const oceanTheme: ThemeColors = {
  background: "rgb(136, 220, 248)",
  backgroundSecondary: "rgb(249, 250, 251)",
  backgroundTertiary: "rgb(243, 244, 246)",

  surface: "rgb(255, 255, 255)",
  surfaceHover: "rgb(243, 244, 246)",
  surfaceActive: "rgb(229, 231, 235)",

  border: "rgb(229, 231, 235)",
  borderHover: "rgb(209, 213, 219)",

  textPrimary: "rgb(17, 24, 39)",
  textSecondary: "rgb(75, 85, 99)",
  textMuted: "rgb(156, 163, 175)",
  textInverted: "rgb(255, 255, 255)",

  accent: "rgb(59, 130, 246)",
  accentHover: "rgb(37, 99, 235)",
  accentText: "rgb(255, 255, 255)",

  success: "rgb(34, 197, 94)",
  warning: "rgb(245, 158, 11)",
  error: "rgb(239, 68, 68)",
  info: "rgb(6, 182, 212)"
}

export function getThemeColors(theme: "light" | "dark" | "ocean"): ThemeColors {
  if (theme === "dark") return darkTheme
  if (theme === "ocean") return oceanTheme
  return lightTheme
}

// CSS custom properties mapping
export function applyThemeVars(theme: ThemeColors) {
  const root = document.documentElement
  
  Object.entries(theme).forEach(([key, value]) => {
    root.style.setProperty(`--theme-${key}`, value)
  })
}