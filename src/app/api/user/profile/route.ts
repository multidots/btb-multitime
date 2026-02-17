import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { sanityClient, sanityFetch } from '@/lib/sanity'

// GET - Fetch user profile with notification settings
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId') || session.user.id

    // Only allow users to fetch their own profile unless admin
    if (userId !== session.user.id && session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const query = `*[_type == "user" && _id == $userId][0]{
      _id,
      firstName,
      lastName,
      email,
      role,
      rate,
      timezone,
      avatar,
      permissions,
      notification
    }`

    const user = await sanityFetch({ query, params: { userId } })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json(user)

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch profile' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { firstName, lastName, rate, timezone } = body

    // Validate required fields
    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: 'First name and last name are required' },
        { status: 400 }
      )
    }

    // Only allow admins and managers to update rate
    const canUpdateRate = session.user.role === 'admin' || session.user.role === 'manager'
    const updateData: any = {
      firstName,
      lastName,
      timezone: timezone || 'America/New_York',
    }

    // Add rate only if user is admin and rate is provided
    if (canUpdateRate && rate !== undefined) {
      updateData.rate = parseFloat(rate) || 0
    }

    // Update user in Sanity
    const result = await sanityClient
      .patch(session.user.id)
      .set(updateData)
      .commit()

    return NextResponse.json({
      success: true,
      user: result
    })

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    )
  }
}

// PATCH - Update notification settings
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { userId, notification } = body

    // Only allow users to update their own notifications unless admin
    const targetUserId = userId || session.user.id
    if (targetUserId !== session.user.id && session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Validate notification object
    if (!notification || typeof notification !== 'object') {
      return NextResponse.json(
        { error: 'Invalid notification settings' },
        { status: 400 }
      )
    }

    // Build notification update object with only valid fields
    const validNotificationFields = [
      'dailyPersonalReminders',
      'weeklyTeamReminders',
      'weeklyReportEmail',
      'approvalNotifications',
      'projectDeletedNotifications',
      'occasionalUpdates'
    ]

    const notificationUpdate: Record<string, boolean> = {}
    for (const field of validNotificationFields) {
      if (typeof notification[field] === 'boolean') {
        notificationUpdate[field] = notification[field]
      }
    }

    // Update user notification settings in Sanity
    const result = await sanityClient
      .patch(targetUserId)
      .set({ notification: notificationUpdate })
      .commit()

    return NextResponse.json({
      success: true,
      notification: result.notification
    })

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update notification settings' },
      { status: 500 }
    )
  }
}
