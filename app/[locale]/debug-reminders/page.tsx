import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authConfig } from "@/lib/auth-config"
import { DebugRemindersClient } from "./debug-reminders-client"

export default async function DebugRemindersPage() {
  const session = await getServerSession(authConfig)

  // Require authentication
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/debug-reminders")
  }

  // Pass the authenticated user's email to the client component
  const userEmail = session.user.email || ""

  return <DebugRemindersClient defaultUserEmail={userEmail} />
}
