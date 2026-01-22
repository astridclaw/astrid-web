// Central i18n configuration for Astrid
// Based on languages supported by original Astrid: https://github.com/Graceful-Tools/astrid

export const locales = [
  'en',    // English
  'es',    // Spanish
  'fr',    // French
  'de',    // German
  'it',    // Italian
  'pt',    // Portuguese
  'nl',    // Dutch
  'ru',    // Russian
  'ja',    // Japanese
  'ko',    // Korean
  'zh-CN', // Simplified Chinese
  'zh-TW', // Traditional Chinese
] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'

// Locale names in their own language for UI display
export const localeNames: Record<Locale, string> = {
  'en': 'English',
  'es': 'Español',
  'fr': 'Français',
  'de': 'Deutsch',
  'it': 'Italiano',
  'pt': 'Português',
  'nl': 'Nederlands',
  'ru': 'Русский',
  'ja': '日本語',
  'ko': '한국어',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
}
