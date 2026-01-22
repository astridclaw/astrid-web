import { NextRequest } from "next/server"
import { getServerSession } from "next-auth"
import { authConfig } from "./auth-config"
import { prisma } from "./prisma"

/**
 * Unified session validation that supports both:
 * 1. JWT sessions (web app via NextAuth)
 * 2. Database sessions (mobile app via custom OAuth endpoints)
 *
 * Returns the user if authenticated, null otherwise.
 */
export async function getUnifiedSession(request?: NextRequest) {
  // Try JWT session first (web app)
  const jwtSession = await getServerSession(authConfig)

  if (jwtSession?.user?.id) {
    return {
      user: {
        id: jwtSession.user.id,
        email: jwtSession.user.email!,
        name: jwtSession.user.name || null,
        image: jwtSession.user.image || null,
      }
    }
  }

  // Try database session (mobile app)
  if (request) {
    const cookies = request.cookies
    const sessionCookie = cookies.get("next-auth.session-token") || cookies.get("__Secure-next-auth.session-token")

    if (sessionCookie) {
      const session = await prisma.session.findUnique({
        where: { sessionToken: sessionCookie.value },
        include: { user: true },
      })

      if (session && session.expires > new Date()) {
        return {
          user: {
            id: session.user.id,
            email: session.user.email!,
            name: session.user.name,
            image: session.user.image,
          }
        }
      }
    }
  }

  return null
}
