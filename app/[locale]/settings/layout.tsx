import type React from "react"

type Props = {
  children: React.ReactNode
}

export default function SettingsLayout({ children }: Props) {
  return (
    <div className="min-h-screen theme-bg-primary">
      {children}
    </div>
  )
}
