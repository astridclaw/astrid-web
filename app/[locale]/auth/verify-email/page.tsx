import { Suspense } from "react"
import { VerifyEmailClient } from "./verify-email-client"
import { LoadingScreen } from "@/components/loading-screen"

export const dynamic = 'force-dynamic'

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <VerifyEmailClient />
    </Suspense>
  )
}
