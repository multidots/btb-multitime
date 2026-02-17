import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { sanityFetch, mutationClient } from '@/lib/sanity'
import { format, startOfWeek, endOfWeek, getISOWeek, getYear } from 'date-fns'
import { TIMESHEET_BY_USER_WEEK_QUERY, USER_TIMESHEETS_QUERY, APPROVED_TIMESHEET_BY_USER_WEEK_QUERY } from '@/lib/queries'

// Generate deterministic timesheet ID
export function generateTimesheetId(userId: string, weekStart: string): string {
  const date = new Date(weekStart)
  const year = getYear(date)
  const week = getISOWeek(date)
  return `timesheet-${userId}-${year}-W${week.toString().padStart(2, '0')}`
}

// Get week dates from any date
export function getWeekDates(date: Date) {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(date, { weekStartsOn: 1 })
  return {
    weekStart: format(weekStart, 'yyyy-MM-dd'),
    weekEnd: format(weekEnd, 'yyyy-MM-dd'),
    year: getYear(weekStart),
    weekNumber: getISOWeek(weekStart),
  }
}

// Calculate timesheet totals
export function calculateTimesheetTotals(entries: Array<{ hours: number; isBillable: boolean; isRunning?: boolean }>) {
  const totalHours = entries.reduce((sum, e) => sum + (e.hours || 0), 0)
  const billableHours = entries.filter(e => e.isBillable).reduce((sum, e) => sum + (e.hours || 0), 0)
  const nonBillableHours = totalHours - billableHours
  const hasRunningTimer = entries.some(e => e.isRunning === true)
  return { totalHours, billableHours, nonBillableHours, hasRunningTimer }
}

// GET /api/timesheets - Get user's timesheets
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const weekStart = searchParams.get('weekStart')
    const forCopy = searchParams.get('forCopy') === '1' // When true, return timesheet regardless of status (for "copy from previous week")
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const status = searchParams.get('status')
    const beforeWeek = searchParams.get('beforeWeek')

    const isAdmin = session.user.role === 'admin' || (session.user as any).isSanityAdmin
    const isManager = session.user.role === 'manager'

    // Permission check for viewing other users
    if (userId && userId !== session.user.id && !isAdmin && !isManager) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Admin/Manager: Get timesheets by status (for tabs)
    if ((isAdmin || isManager) && status) {
      // Optimized: Build conditions array instead of string concatenation
      const conditions = [
        '_type == "timesheet"',
        'status == $status',
        weekStart ? 'weekStart == $weekStart' : null,
        beforeWeek ? 'weekStart < $beforeWeek' : null
      ].filter(Boolean)

      const params: Record<string, string> = { status }
      if (weekStart) params.weekStart = weekStart
      if (beforeWeek) params.beforeWeek = beforeWeek

      const query = `*[${conditions.join(' && ')}] | order(weekStart desc) {
        _id,
        user->{_id, firstName, lastName, email, avatar},
        weekStart,
        weekEnd,
        year,
        weekNumber,
        status,
        entries[]{
          _key,
          date,
          "project": *[_type == "project" && _id == ^.project._ref][0]{_id, name, code},
          "task": *[_type == "task" && _id == ^.task._ref][0]{_id, name, isBillable},
          hours,
          notes,
          isBillable
        },
        totalHours,
        billableHours,
        nonBillableHours,
        submittedAt,
        approvedBy->{_id, firstName, lastName},
        approvedAt,
        isLocked,
        createdAt
      }`

      const timesheets = await sanityFetch({ query, params })
      return NextResponse.json({ timesheets: timesheets || [] })
    }

    // Get specific user's timesheet for a week
    const targetUserId = userId || session.user.id
    
    if (weekStart) {
      // For "copy from previous week" we need the previous week's timesheet regardless of status (submitted/unsubmitted/approved)
      const query = forCopy ? TIMESHEET_BY_USER_WEEK_QUERY : APPROVED_TIMESHEET_BY_USER_WEEK_QUERY
      const timesheet = await sanityFetch({
        query,
        params: { userId: targetUserId, weekStart }
      })
      return NextResponse.json(timesheet)
    }

    // Get timesheets for date range
    if (startDate && endDate) {
      const timesheets = await sanityFetch({
        query: USER_TIMESHEETS_QUERY,
        params: { userId: targetUserId, startDate, endDate }
      })
      return NextResponse.json(timesheets)
    }

    // Default: current week for current user
    const { weekStart: currentWeekStart } = getWeekDates(new Date())
    const timesheet = await sanityFetch({
      query: TIMESHEET_BY_USER_WEEK_QUERY,
      params: { userId: session.user.id, weekStart: currentWeekStart }
    })
    return NextResponse.json(timesheet)
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching timesheets:', error)
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// POST /api/timesheets - Create or get timesheet for a week
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { date, userId: requestedUserId } = body

    const userId = (session.user.role === 'admin' || session.user.role === 'manager') && requestedUserId
      ? requestedUserId
      : session.user.id

    const targetDate = date ? new Date(date) : new Date()
    const { weekStart, weekEnd, year, weekNumber } = getWeekDates(targetDate)
    const timesheetId = generateTimesheetId(userId, weekStart)

    // Optimized: Combine check and fetch into single query
    // Since generateTimesheetId creates deterministic IDs, we can safely check by ID or user/week
    const timesheet = await sanityFetch({
      query: `*[_type == "timesheet" && (_id == $id || (user._ref == $userId && weekStart == $weekStart))][0]{
        _id,
        user->{_id, firstName, lastName, email},
        weekStart,
        weekEnd,
        year,
        weekNumber,
        status,
        entries[]{
          _key,
          date,
          "project": *[_type == "project" && _id == ^.project._ref][0]{_id, name, code, client->{_id, name}},
          "task": *[_type == "task" && _id == ^.task._ref][0]{_id, name, isBillable},
          hours,
          notes,
          isBillable,
          startTime,
          endTime,
          isRunning,
          createdAt,
          updatedAt
        },
        totalHours,
        billableHours,
        nonBillableHours,
        hasRunningTimer,
        submittedAt,
        approvedBy->{_id, firstName, lastName},
        approvedAt,
        isLocked,
        createdAt,
        updatedAt
      }`,
      params: { id: timesheetId, userId, weekStart }
    })

    if (timesheet) {
      return NextResponse.json(timesheet)
    }

    // Create new timesheet if not found
    await mutationClient.create({
      _id: timesheetId,
      _type: 'timesheet',
      user: { _type: 'reference', _ref: userId },
      weekStart,
      weekEnd,
      year,
      weekNumber,
      status: 'unsubmitted',
      entries: [],
      totalHours: 0,
      billableHours: 0,
      nonBillableHours: 0,
      hasRunningTimer: false,
      isLocked: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    // Fetch the newly created timesheet
    const newTimesheet = await sanityFetch({
      query: TIMESHEET_BY_USER_WEEK_QUERY,
      params: { userId, weekStart }
    })

    return NextResponse.json(newTimesheet, { status: 201 })
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error creating timesheet:', error)
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
