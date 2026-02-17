import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { sanityFetch } from '@/lib/sanity'
import { PENDING_TIMESHEETS_QUERY, MANAGER_TEAM_TIMESHEETS_QUERY } from '@/lib/queries'

// GET /api/timesheets/pending - Get pending timesheets for approval
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isAdmin = session.user.role === 'admin' || (session.user as any).isSanityAdmin
    const isManager = session.user.role === 'manager'

    if (!isAdmin && !isManager) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let timesheets
    if (isAdmin) {
      timesheets = await sanityFetch({ query: PENDING_TIMESHEETS_QUERY, params: {} })
    } else {
      timesheets = await sanityFetch({
        query: MANAGER_TEAM_TIMESHEETS_QUERY,
        params: { managerId: session.user.id }
      })
    }

    return NextResponse.json(timesheets || [])
  } catch (error) {
    console.error('Error fetching pending timesheets:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
