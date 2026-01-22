import type React from "react"

// Root layout - minimal wrapper for all routes
// The actual layout with providers is in [locale]/layout.tsx
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
