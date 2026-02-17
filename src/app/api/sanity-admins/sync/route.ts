import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { ensureSanityAdminInUserSchema } from '@/lib/sanityAdmins'

/**
 * Check if request is from an authenticated Sanity Studio user
 */
async function isSanityStudioAuthenticated(request: NextRequest): Promise<boolean> {
  try {
    // Check for Sanity Studio session cookie
    const cookies = request.cookies
    const sanitySession = cookies.get('sanitySession') || cookies.get('__sanity_session')
    
    // If we have a Sanity session, the user is authenticated in Studio
    if (sanitySession) {
      return true
    }

    // Also check if request comes from Studio path
    const referer = request.headers.get('referer') || ''
    if (referer.includes('/studio')) {
      // If coming from Studio, assume authenticated (Studio handles its own auth)
      return true
    }

    return false
  } catch (error) {
    return false
  }
}

/**
 * GET /api/sanity-admins/sync
 * Checks if the current user is already synced as a Sanity admin
 * Returns status without making changes
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const isStudioAuth = await isSanityStudioAuthenticated(request)
    
    if (!session && !isStudioAuth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get email from session (for NextAuth) or query params (for Studio)
    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email') || session?.user?.email
    if (!email) {
      // If Studio authenticated but no email available, can't check status
      // Return neutral response (not an error, just can't determine)
      return NextResponse.json(
        { synced: false, needsSync: false, message: 'Email not available' },
        { status: 200 }
      )
    }

    // Check if user exists and is already marked as Sanity admin
    const { client } = await import('@/lib/sanity')
    const user = await client.fetch(
      `*[_type == "user" && email == $email][0]{
        _id,
        email,
        isSanityAdmin,
        role
      }`,
      { email: email.toLowerCase() }
    )

    if (!user) {
      return NextResponse.json({
        synced: false,
        needsSync: true,
      })
    }

    // User exists - check if they're already properly synced
    const isSynced = user.isSanityAdmin === true && user.role === 'admin'

    return NextResponse.json({
      synced: isSynced,
      needsSync: !isSynced,
      user: {
        id: user._id,
        email: user.email,
        isSanityAdmin: user.isSanityAdmin,
        role: user.role,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to check status', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/sanity-admins/sync
 * Automatically syncs the current user if they're a Sanity Studio admin
 * Called automatically when a Sanity admin accesses Studio or logs in
 * Only syncs if the user is not already properly synced
 */
export async function POST(request: NextRequest) {
  try {
    // Check NextAuth session first
    const session = await getServerSession(authOptions)
    
    // Also check if user is authenticated in Sanity Studio
    const isStudioAuth = await isSanityStudioAuthenticated(request)
    
    // Get user info from request body (from Studio) or session
    let body: any = {}
    try {
      body = await request.json()
    } catch {
      // No body provided
    }

    const email = body.email || session?.user?.email
    const sanityUserId = body.sanityUserId || body.id
    const name = body.name || session?.user?.name

    // If no email and not authenticated, return error
    if (!email && !session && !isStudioAuth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    if (!email) {
      // If Studio authenticated but no email in body, we can't sync
      // This is okay - the user might not be a Sanity admin
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // First check if user is already synced to avoid unnecessary updates
    const { client } = await import('@/lib/sanity')
    const existingUser = await client.fetch(
      `*[_type == "user" && email == $email][0]{
        _id,
        email,
        isSanityAdmin,
        role
      }`,
      { email: email.toLowerCase() }
    )

    // If user exists and is already properly synced, skip the update
    if (existingUser && existingUser.isSanityAdmin === true && existingUser.role === 'admin') {
      return NextResponse.json({
        success: true,
        message: 'User is already synced as Sanity admin',
        action: 'skipped',
      })
    }

    // Automatically add/update the user if they're a Sanity admin
    // Note: We assume if they're accessing Studio, they're a Sanity admin
    const result = await ensureSanityAdminInUserSchema(email, sanityUserId, name)

    if (result === 'error') {
      return NextResponse.json(
        { error: 'Failed to sync Sanity admin' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: result === 'created' 
        ? 'Sanity admin added to user schema' 
        : 'Sanity admin updated in user schema',
      action: result,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to sync Sanity admin', details: error.message },
      { status: 500 }
    )
  }
}
