"use client"

import { useRouter, usePathname } from '@/lib/i18n/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { locales, localeNames } from '@/lib/i18n/config'
import { useLocale } from '@/lib/i18n/client'
import { Globe } from 'lucide-react'

export function LanguageSwitcher() {
  const router = useRouter()
  const pathname = usePathname()
  const currentLocale = useLocale()

  const handleLocaleChange = (newLocale: string) => {
    // next-intl navigation handles locale switching automatically
    router.replace(pathname, { locale: newLocale })
  }

  return (
    <div className="flex items-center gap-2">
      <Globe className="w-4 h-4 theme-text-muted" />
      <Select value={currentLocale} onValueChange={handleLocaleChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Select language" />
        </SelectTrigger>
        <SelectContent>
          {locales.map((locale) => (
            <SelectItem key={locale} value={locale}>
              {localeNames[locale]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
