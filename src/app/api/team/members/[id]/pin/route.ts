import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { mutationClient, sanityFetch } from '@/lib/sanity'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Admins and managers can pin members (including Sanity admins)
    const isAdmin = session.user.role === 'admin' || (session.user as any).isSanityAdmin === true
    const isManager = session.user.role === 'manager'
    
    if (!isAdmin && !isManager) {
      return NextResponse.json({ error: 'Forbidden: Only admins and managers can pin members' }, { status: 403 })
    }

    const memberId = params.id
    const body = await request.json()
    const { isPinned } = body

    if (typeof isPinned !== 'boolean') {
      return NextResponse.json({ error: 'Invalid isPinned value' }, { status: 400 })
    }

    // Try to get the member's current pinnedBy array - try multiple methods
    let memberDoc: any = null
    
    // Method 1: Try getDocument (works for published documents)
    try {
      memberDoc = await mutationClient.getDocument(memberId)
    } catch (getDocError) {
      // Silent fail, try next method
    }
    
    // Method 2: If getDocument fails, try query (works for both published and drafts)
    if (!memberDoc || !memberDoc._id) {
      try {
        const memberQuery = await sanityFetch<{ _id: string; pinnedBy?: any[] } | null>({
          query: `*[_type == "user" && _id == $memberId][0]{
            _id,
            pinnedBy
          }`,
          params: { memberId }
        })
        if (memberQuery) {
          memberDoc = memberQuery
        }
      } catch (queryError) {
        // Silent fail, try next method
      }
    }
    
    // Method 3: Try with draft prefix
    if (!memberDoc || !memberDoc._id) {
      const draftId = `drafts.${memberId}`
      try {
        const draftDoc = await mutationClient.getDocument(draftId)
        if (draftDoc && draftDoc._id) {
          memberDoc = draftDoc
        }
      } catch (draftError) {
        // Silent fail
      }
    }
    
    if (!memberDoc || !memberDoc._id) {
      return NextResponse.json({ 
        error: `Member not found: ${memberId}. Please ensure the member exists and is accessible.` 
      }, { status: 404 })
    }
    
    // Use the actual document ID (might be different from the param if it's a draft)
    const actualMemberId = memberDoc._id

    // Get current pinnedBy array from the document
    let pinnedByArray: any[] = []
    
    if (memberDoc.pinnedBy && Array.isArray(memberDoc.pinnedBy)) {
      // Preserve existing references with their _key properties
      for (const ref of memberDoc.pinnedBy) {
        if (ref && typeof ref === 'object') {
          const refId = (ref as any)._ref || (ref as any)._id
          if (refId && typeof refId === 'string') {
            // Preserve the _key if it exists, otherwise generate a new one
            const existingKey = (ref as any)._key
            pinnedByArray.push({
              _type: 'reference',
              _ref: refId,
              _key: existingKey || `key-${refId}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
            })
          }
        } else if (typeof ref === 'string') {
          // Handle string references (shouldn't happen but handle gracefully)
          pinnedByArray.push({
            _type: 'reference',
            _ref: ref,
            _key: `key-${ref}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
          })
        }
      }
      
      // Validate that all referenced users exist
      if (pinnedByArray.length > 0) {
        const refIds = pinnedByArray.map((ref: any) => ref._ref).filter(Boolean)
        const validUsers = await sanityFetch<Array<{ _id: string }>>({
          query: `*[_type == "user" && _id in $refIds]{
            _id
          }`,
          params: { refIds }
        })
        
        const validIds = new Set((validUsers || []).map((u) => u._id))
        
        // Only keep valid references, preserving their _key
        pinnedByArray = pinnedByArray.filter((ref: any) => validIds.has(ref._ref))
      }
    }

    // Get the current user's document ID - try multiple methods
    let currentUserId = session.user.id
    let currentUserDoc = null
    const sessionUser = session.user as any

    // Method 1: Try to find user by session ID (works for regular users)
    currentUserDoc = await sanityFetch<{ _id: string } | null>({
      query: `*[_type == "user" && _id == $userId && isActive == true][0]{
        _id
      }`,
      params: { userId: currentUserId }
    })

    // Method 2: If not found, try to find by email (for Sanity admins or if session ID doesn't match)
    if (!currentUserDoc && sessionUser.email) {
      currentUserDoc = await sanityFetch<{ _id: string } | null>({
        query: `*[_type == "user" && email == $email && isActive == true][0]{
          _id
        }`,
        params: { email: sessionUser.email.toLowerCase() }
      })
      
      if (currentUserDoc) {
        currentUserId = currentUserDoc._id
      }
    }

    // Method 3: If still not found and user is admin/Sanity admin, try to sync/create user document
    if (!currentUserDoc && (isAdmin || sessionUser.isSanityAdmin) && sessionUser.email) {
      try {
        const { ensureSanityAdminInUserSchema } = await import('@/lib/sanityAdmins')
        const result = await ensureSanityAdminInUserSchema(
          sessionUser.email,
          sessionUser.sanityUserId,
          sessionUser.name || `${sessionUser.firstName || ''} ${sessionUser.lastName || ''}`.trim() || sessionUser.email
        )
        
        if (result === 'created' || result === 'updated') {
          // Try to find the user again after sync
          currentUserDoc = await sanityFetch<{ _id: string } | null>({
            query: `*[_type == "user" && email == $email && isActive == true][0]{
              _id
            }`,
            params: { email: sessionUser.email.toLowerCase() }
          })
          
          if (currentUserDoc) {
            currentUserId = currentUserDoc._id
          }
        }
      } catch (syncError) {
      }
    }

    // If still not found, return error
    if (!currentUserDoc) {
      if (isAdmin || sessionUser.isSanityAdmin) {
        return NextResponse.json({ 
          error: 'User document not found. Please try logging out and logging back in to sync your account.' 
        }, { status: 404 })
      }
      return NextResponse.json({ error: 'Current user not found' }, { status: 404 })
    }

    // Helper function to generate a unique _key
    const generateKey = (refId: string) => {
      return `key-${refId}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
    }

    if (isPinned) {
      // Add current user to pinnedBy if not already present
      const exists = pinnedByArray.some((ref: any) => {
        const refId = ref._ref || ref._id
        return refId === currentUserId
      })
      
      if (!exists) {
        pinnedByArray.push({ 
          _type: 'reference', 
          _ref: currentUserId,
          _key: generateKey(currentUserId)
        })
      }
    } else {
      // Remove current user from pinnedBy
      pinnedByArray = pinnedByArray.filter((ref: any) => {
        const refId = ref._ref || ref._id
        return refId !== currentUserId
      })
    }

    // Update the member's pinnedBy array in Sanity
    let updatedUser: any = null
    try {
      updatedUser = await mutationClient
        .patch(actualMemberId)
        .set({ pinnedBy: pinnedByArray })
        .commit()
    } catch (patchError: any) {
      throw new Error(`Failed to update pinnedBy field: ${patchError?.message || 'Unknown error'}`)
    }

    if (!updatedUser) {
      return NextResponse.json({ 
        error: `Failed to update member ${actualMemberId}. The patch operation returned no result.` 
      }, { status: 500 })
    }
    
    // Verify the operation
    const verifyUser = await sanityFetch<{ 
      _id: string; 
      pinnedByRefs?: string[]; 
      pinnedBy?: any[] 
    }>({
      query: `*[_type == "user" && _id == $memberId][0]{
        _id,
        "pinnedByRefs": pinnedBy[]._ref,
        pinnedBy
      }`,
      params: { memberId: actualMemberId }
    })
    
    if (isPinned && !verifyUser?.pinnedByRefs?.includes(currentUserId)) {
      return NextResponse.json({ 
        error: 'Pin operation completed but verification failed. Please refresh the page.' 
      }, { status: 500 })
    }
    
    if (!isPinned && verifyUser?.pinnedByRefs?.includes(currentUserId)) {
      return NextResponse.json({ 
        error: 'Unpin operation completed but verification failed. Please refresh the page.' 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      user: updatedUser, 
      pinnedByRefs: verifyUser?.pinnedByRefs,
      pinnedBy: verifyUser?.pinnedBy
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal Server Error'
    return NextResponse.json({ 
      error: errorMessage
    }, { status: 500 })
  }
}
