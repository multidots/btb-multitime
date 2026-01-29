'use client'

import { useEffect, useState } from 'react'

const SYNC_CHECK_KEY = 'sanity_admin_sync_checked'
const SYNC_CHECK_EXPIRY = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

/**
 * Component that automatically syncs the current Sanity Studio user to the user schema
 * This runs in the background when Studio loads, but only if needed
 * Uses localStorage to cache sync status and avoid unnecessary API calls
 */
export default function AutoSyncSanityAdmin() {
  const [hasSynced, setHasSynced] = useState(false)

  useEffect(() => {
    if (hasSynced) return

    // Check localStorage to see if we've recently checked
    const checkSyncStatus = async () => {
      try {
        const cached = localStorage.getItem(SYNC_CHECK_KEY)
        if (cached) {
          const { timestamp, synced } = JSON.parse(cached)
          const now = Date.now()
          
          // If we checked recently (within 24 hours) and user was synced, skip
          if (now - timestamp < SYNC_CHECK_EXPIRY && synced) {
            setHasSynced(true)
            return
          }
        }

        // First, check if user is already synced (GET request - no side effects)
        const checkResponse = await fetch('/api/sanity-admins/sync', {
          method: 'GET',
          credentials: 'include',
        })

        if (checkResponse.ok) {
          const checkData = await checkResponse.json()
          
          // Cache the result
          localStorage.setItem(
            SYNC_CHECK_KEY,
            JSON.stringify({
              timestamp: Date.now(),
              synced: checkData.synced || false,
            })
          )

          // If already synced, no need to call POST
          if (checkData.synced) {
            setHasSynced(true)
            return
          }

          // Only sync if needed
          if (checkData.needsSync) {
            const syncResponse = await fetch('/api/sanity-admins/sync', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              credentials: 'include',
            })

            if (syncResponse.ok) {
              const syncData = await syncResponse.json()
              
              // Update cache
              localStorage.setItem(
                SYNC_CHECK_KEY,
                JSON.stringify({
                  timestamp: Date.now(),
                  synced: syncData.action !== 'error',
                })
              )
              
              setHasSynced(true)
            }
          }
        }
      } catch (error) {
        // Silently fail - don't interrupt Studio experience
        console.debug('Auto-sync Sanity admin:', error)
      }
    }

    // Delay slightly to ensure Studio is fully loaded
    const timer = setTimeout(checkSyncStatus, 1000)
    return () => clearTimeout(timer)
  }, [hasSynced])

  // This component doesn't render anything
  return null
}

