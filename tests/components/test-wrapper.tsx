import React from 'react'
import { SessionProvider } from 'next-auth/react'

export const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const mockSession = {
    user: {
      id: 'test-user-id',
      name: 'Test User',
      email: 'test@example.com',
      image: 'test-image-url',
    },
    expires: new Date(Date.now() + 2 * 86400).toISOString(),
  }

  return (
    <SessionProvider session={mockSession}>
      {children}
    </SessionProvider>
  )
}