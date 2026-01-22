import { Suspense } from "react"
import { SignInContent } from "./signin-client"

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="text-white">Loading...</div>
    </div>
  )
}

export default function SignIn() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SignInContent />
    </Suspense>
  )
}
