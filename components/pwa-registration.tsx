'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function PWARegistration() {
  const router = useRouter()
  
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // Register service worker
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ Service Worker registered:', registration.scope)
          }
          
          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New content is available, show update notification
                  if (confirm('New version available! Reload to update?')) {
                    window.location.reload()
                  }
                }
              })
            }
          })
        })
        .catch((error) => {
          // Only log in development - in production, SW failures are expected on some browsers
          if (process.env.NODE_ENV === 'development') {
            console.error('❌ Service Worker registration failed:', error)
          }
        })

      // Handle service worker updates
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload()
      })

      // Handle messages from service worker for navigation
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'NAVIGATE') {
          try {
            // Use Next.js router to navigate
            router.push(event.data.url)
            
            // Send confirmation back to service worker
            if (event.ports[0]) {
              event.ports[0].postMessage({ success: true })
            }
          } catch (error) {
            if (process.env.NODE_ENV === 'development') {
              console.error('PWA: Navigation failed:', error)
            }
            
            if (event.ports[0]) {
              event.ports[0].postMessage({ 
                success: false, 
                error: error instanceof Error ? error.message : 'Navigation failed' 
              })
            }
          }
        }
      })

      // Handle beforeinstallprompt for custom install button
      let deferredPrompt: any = null

      window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent the mini-infobar from appearing on mobile
        e.preventDefault()
        // Stash the event so it can be triggered later
        deferredPrompt = e
      })

      // Handle app installed
      window.addEventListener('appinstalled', () => {
        deferredPrompt = null
      })
    }
  }, [router])

  return null
}
