// Client-side i18n utilities
'use client'

import { useEffect, useState } from 'react'

// Get current locale from URL or localStorage
export function useLocale() {
  const [locale, setLocale] = useState('en')

  useEffect(() => {
    // Try to get locale from pathname
    const pathLocale = window.location.pathname.split('/')[1]
    const validLocales = ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'ko', 'zh-CN', 'zh-TW']

    if (validLocales.includes(pathLocale)) {
      setLocale(pathLocale)
    } else {
      // Fallback to browser language or English
      const browserLang = navigator.language.split('-')[0]
      setLocale(validLocales.includes(browserLang) ? browserLang : 'en')
    }
  }, [])

  return locale
}

// Simple translation hook for client components
export function useTranslations() {
  const locale = useLocale()
  const [messages, setMessages] = useState<any>(null)

  useEffect(() => {
    // Dynamically import locale file
    import(`./locales/${locale}.json`)
      .then(module => setMessages(module.default))
      .catch(() => {
        // Fallback to English
        import('./locales/en.json').then(module => setMessages(module.default))
      })
  }, [locale])

  // Return translation function
  const t = (key: string, replacements?: Record<string, string>): string => {
    if (!messages) return key

    // Navigate nested keys (e.g., "reminders.general")
    const keys = key.split('.')
    let value: any = messages

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k]
      } else {
        return key // Return key if path not found
      }
    }

    // Handle replacements like {name}
    if (typeof value === 'string' && replacements) {
      return Object.entries(replacements).reduce(
        (str, [key, val]) => str.replace(`{${key}}`, val),
        value
      )
    }

    return value || key
  }

  // Get array of translations
  const tArray = (key: string): string[] => {
    if (!messages) return []

    const keys = key.split('.')
    let value: any = messages

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k]
      } else {
        return []
      }
    }

    return Array.isArray(value) ? value : []
  }

  return { t, tArray, locale, messages }
}
