import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { sanityClient } from '@/lib/sanity'

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { role, permissions, userId } = body

    // Validate required fields
    if (!role) {
      return NextResponse.json(
        { error: 'Role is required' },
        { status: 400 }
      )
    }

    // Only allow admins to update permissions
    if (session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only administrators can update permissions' },
        { status: 403 }
      )
    }

    // Determine which user to update
    // If userId is provided, update that user; otherwise update the current user
    const targetUserId = userId || session.user.id

    // Update user permissions in Sanity
    const result = await sanityClient
      .patch(targetUserId)
      .set({
        role,
        permissions: permissions || {}
      })
      .commit()

    return NextResponse.json({
      success: true,
      user: result
    })

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update permissions' },
      { status: 500 }
    )
  }
}
