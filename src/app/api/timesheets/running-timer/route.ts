import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { sanityFetch } from '@/lib/sanity'
import { RUNNING_TIMER_TIMESHEET_QUERY } from '@/lib/queries'

// GET /api/timesheets/running-timer - Get running timer across all timesheets
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId') || session.user.id

    // Only allow users to fetch their own running timer, or admins/managers to fetch any user's timer
    const isOwner = userId === session.user.id
    const isAdmin = session.user.role === 'admin' || (session.user as any).isSanityAdmin
    const isManager = session.user.role === 'manager'

    if (!isOwner && !isAdmin && !isManager) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await sanityFetch<{
      _id: string
      weekStart: string
      runningEntry: {
        _key: string
        date: string
        project: { _id: string; name: string; code?: string }
        task?: { _id: string; name: string }
        startTime: string
        notes?: string
      }
    } | null>({
      query: RUNNING_TIMER_TIMESHEET_QUERY,
      params: { userId }
    })

    if (!result || !result.runningEntry) {
      return NextResponse.json({ runningTimer: null })
    }

    return NextResponse.json({
      _id: result._id,
      weekStart: result.weekStart,
      runningEntry: result.runningEntry
    })
  } catch (error) {
    console.error('Error fetching running timer:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
