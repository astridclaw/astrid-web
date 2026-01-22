import { NextRequest, NextResponse } from "next/server"
import { getUnifiedSession } from "@/lib/session-utils"

/**
 * Authenticated user from session
 */
export interface AuthUser {
  id: string
  email: string
  name: string | null
  image: string | null
}

/**
 * Context passed to authenticated route handlers
 */
export interface AuthContext {
  user: AuthUser
  request: NextRequest
  params?: Record<string, string>
}

/**
 * Route handler function signature for authenticated routes
 */
type AuthenticatedHandler = (
  context: AuthContext
) => Promise<NextResponse> | NextResponse

/**
 * Options for withAuth wrapper
 */
interface WithAuthOptions {
  /** Custom error message for unauthorized response */
  errorMessage?: string
  /** Custom status code for unauthorized response (default: 401) */
  statusCode?: number
}

/**
 * Wraps an API route handler to require authentication.
 *
 * Handles session validation using getUnifiedSession (supports both JWT and database sessions).
 * Returns 401 Unauthorized if no valid session found.
 *
 * @example
 * // Basic usage
 * export const GET = withAuth(async ({ user, request }) => {
 *   const tasks = await prisma.task.findMany({ where: { creatorId: user.id } })
 *   return NextResponse.json(tasks)
 * })
 *
 * @example
 * // With route params
 * export const GET = withAuth(async ({ user, request, params }) => {
 *   const taskId = params?.id
 *   const task = await prisma.task.findUnique({ where: { id: taskId } })
 *   return NextResponse.json(task)
 * })
 *
 * @example
 * // With custom error message
 * export const POST = withAuth(
 *   async ({ user, request }) => {
 *     // handler logic
 *   },
 *   { errorMessage: "Please sign in to create tasks" }
 * )
 */
export function withAuth(
  handler: AuthenticatedHandler,
  options: WithAuthOptions = {}
) {
  const { errorMessage = "Unauthorized", statusCode = 401 } = options

  return async (
    request: NextRequest,
    context?: { params?: Promise<Record<string, string>> }
  ): Promise<NextResponse> => {
    const session = await getUnifiedSession(request)

    if (!session?.user?.id) {
      return NextResponse.json({ error: errorMessage }, { status: statusCode })
    }

    // Resolve params if they exist (Next.js 15 async params)
    const params = context?.params ? await context.params : undefined

    return handler({
      user: session.user,
      request,
      params
    })
  }
}

/**
 * Context passed to optionally authenticated route handlers
 */
export interface OptionalAuthContext {
  user: AuthUser | null
  request: NextRequest
  params?: Record<string, string>
}

/**
 * Wraps an API route handler to optionally use authentication.
 *
 * Unlike withAuth, this wrapper does NOT return 401 if unauthenticated.
 * Instead, it passes user as null to the handler for unauthenticated requests.
 *
 * @example
 * export const GET = withOptionalAuth(async ({ user, request }) => {
 *   if (user) {
 *     // Return personalized data for authenticated users
 *     return NextResponse.json({ tasks: await getUserTasks(user.id) })
 *   }
 *   // Return public data for unauthenticated users
 *   return NextResponse.json({ tasks: await getPublicTasks() })
 * })
 */
export function withOptionalAuth(
  handler: (context: OptionalAuthContext) => Promise<NextResponse> | NextResponse
) {
  return async (
    request: NextRequest,
    context?: { params?: Promise<Record<string, string>> }
  ): Promise<NextResponse> => {
    const session = await getUnifiedSession(request)

    // Resolve params if they exist (Next.js 15 async params)
    const params = context?.params ? await context.params : undefined

    return handler({
      user: session?.user ?? null,
      request,
      params
    })
  }
}
