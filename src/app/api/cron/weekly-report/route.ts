import { NextRequest, NextResponse } from 'next/server'
import { sanityFetch } from '@/lib/sanity'
import { sendBatchEmails, generateWeeklyReportEmail, isEmailDisallowed } from '@/lib/email'
import { startOfWeek, endOfWeek, subWeeks, format } from 'date-fns'

// Force dynamic rendering since we use request.headers
export const dynamic = 'force-dynamic'

// Verify cron secret to prevent unauthorized access
function verifyCronSecret(request: NextRequest): boolean {
  // Allow in development mode
  if (process.env.NODE_ENV === 'development') {
    return true
  }
  
  // In production, verify the cron secret
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET) {
    return false
  }
  return authHeader === `Bearer ${process.env.CRON_SECRET}`
}

interface TimesheetEntry {
  hours: number
  date: string
}

interface UserWithTimesheet {
  _id: string
  firstName: string
  lastName: string
  email: string
  role: 'admin' | 'manager' | 'user'
  notification: {
    weeklyReportEmail: boolean
  } | null
  timesheet: {
    totalHours: number
    entries: TimesheetEntry[]
  } | null
}

interface DailyHours {
  day: string
  hours: number
}

export async function GET(request: NextRequest) {
  // Pause all cron jobs if environment variable is set
  if (process.env.PAUSE_CRON_JOBS === 'true') {
    return NextResponse.json({ 
      success: true, 
      message: 'Cron jobs are paused',
      paused: true 
    })
  }

  try {
    // Verify the request is from Vercel Cron
    if (!verifyCronSecret(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the previous week's date range (since this runs Monday morning)
    const now = new Date()
    const previousWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 })
    const previousWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 })

    const weekStartStr = format(previousWeekStart, 'yyyy-MM-dd')
    const weekStartDisplay = format(previousWeekStart, 'MMM d')
    const weekEndDisplay = format(previousWeekEnd, 'MMM d, yyyy')

    // Fetch all active users with their timesheet for the previous week (entries for daily breakdown)
    const query = `
      *[_type == "user" && isActive == true && isArchived != true] {
        _id,
        firstName,
        lastName,
        email,
        role,
        notification,
        "timesheet": *[_type == "timesheet" && user._ref == ^._id && weekStart == $weekStart][0] {
          totalHours,
          "entries": entries[] { date, hours }
        }
      }
    `

    const users = await sanityFetch<UserWithTimesheet[]>({
      query,
      params: { weekStart: weekStartStr },
    })

    if (!users || users.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No users found',
        emailsSent: 0,
      })
    }

    // Filter users who:
    // 1. Have weekly report email enabled
    // 2. Are not in the disallowed emails list
    const usersToEmail = users.filter(
      user => user.notification?.weeklyReportEmail !== false && !isEmailDisallowed(user.email)
    )

    if (usersToEmail.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No users have weekly report enabled',
        emailsSent: 0,
      })
    }

    // Generate emails
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

    // Debug: Log users being emailed

    const emails = usersToEmail.map(user => {
      // Total hours and entries from timesheet (or 0 / empty if no timesheet)
      const entries = user.timesheet?.entries ?? []
      const totalHours = user.timesheet?.totalHours ?? entries.reduce((sum, e) => sum + (e.hours || 0), 0)

      // Admin and manager go to /admin, regular users go to /dashboard
      const dashboardUrl = user.role === 'admin' || user.role === 'manager' 
        ? `${baseUrl}/admin` 
        : `${baseUrl}/dashboard`

      // Group by day of week from timesheet entries
      const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
      const dailyMap = new Map<string, number>()
      dayNames.forEach(day => dailyMap.set(day, 0))

      entries.forEach(entry => {
        if (entry.date) {
          const entryDate = new Date(entry.date + 'T00:00:00')
          const dayOfWeek = entryDate.getDay()
          const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1
          const dayName = dayNames[dayIndex]
          dailyMap.set(dayName, (dailyMap.get(dayName) || 0) + (entry.hours || 0))
        }
      })

      const dailyHours: DailyHours[] = dayNames.map(day => ({
        day,
        hours: dailyMap.get(day) || 0,
      }))

      const { html, text } = generateWeeklyReportEmail(
        user.firstName,
        weekStartDisplay,
        weekEndDisplay,
        totalHours,
        dailyHours,
        dashboardUrl
      )

      return {
        to: user.email,
        subject: `📊 Your Weekly Report: ${totalHours.toFixed(1)} hours logged (${weekStartDisplay} - ${weekEndDisplay})`,
        html,
        text,
      }
    })

    // Debug: Log emails being sent

    // Send batch emails
    const { success, failed } = await sendBatchEmails(emails)


    return NextResponse.json({
      success: true,
      message: `Sent ${success} weekly report emails`,
      emailsSent: success,
      emailsFailed: failed,
      usersChecked: users.length,
      usersEmailed: usersToEmail.length,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to send weekly reports', details: String(error) },
      { status: 500 }
    )
  }
}

