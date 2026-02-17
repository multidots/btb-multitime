import { NextRequest, NextResponse } from 'next/server'
import { sanityFetch } from '@/lib/sanity'
import { sendBatchEmails, generatePastDueReminderEmail, isEmailDisallowed } from '@/lib/email'
import { startOfWeek, format } from 'date-fns'

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

interface UserWithWeekHours {
  _id: string
  firstName: string
  lastName: string
  email: string
  role: 'admin' | 'manager' | 'user'
  notification: {
    weeklyTeamReminders: boolean
  } | null
  /** Total hours from timesheet for the week (null if no timesheet) */
  weekTotalHours: number | null
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

    // Get the current week's date range (since this runs Saturday, it's the week that just ended Friday)
    const now = new Date()
    const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 })

    const weekStartStr = format(currentWeekStart, 'yyyy-MM-dd')
    const weekStartDisplay = format(currentWeekStart, 'MMM d, yyyy')

    // Fetch all active users with their timesheet total hours for the current week
    const query = `
      *[_type == "user" && isActive == true && isArchived != true] {
        _id,
        firstName,
        lastName,
        email,
        role,
        notification,
        "weekTotalHours": *[_type == "timesheet" && user._ref == ^._id && weekStart == $weekStart][0].totalHours
      }
    `

    const users = await sanityFetch<UserWithWeekHours[]>({
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
    // 1. Have weekly team reminders enabled (default to true if not set)
    // 2. Have no timesheet for the week OR timesheet has zero total hours
    // 3. Are not in the disallowed emails list
    const usersWithNoHours = users.filter(
      user => user.notification?.weeklyTeamReminders !== false && (user.weekTotalHours == null || user.weekTotalHours === 0) && !isEmailDisallowed(user.email)
    )


    if (usersWithNoHours.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All users have logged timesheet hours',
        emailsSent: 0,
        usersChecked: users.length,
      })
    }

    // Generate emails
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

    // Debug: Log users being emailed

    const emails = usersWithNoHours.map(user => {
      // Admin and manager go to /admin, regular users go to /dashboard
      const dashboardUrl = user.role === 'admin' || user.role === 'manager' 
        ? `${baseUrl}/admin` 
        : `${baseUrl}/dashboard`

      const { html, text } = generatePastDueReminderEmail(
        user.firstName,
        weekStartDisplay,
        dashboardUrl
      )

      return {
        to: user.email,
        subject: `⏰ Reminder: Your timesheet for ${weekStartDisplay} is past due`,
        html,
        text,
      }
    })

    // Debug: Log emails being sent

    // Send batch emails
    const { success, failed } = await sendBatchEmails(emails)


    return NextResponse.json({
      success: true,
      message: `Sent ${success} past-due reminder emails`,
      emailsSent: success,
      emailsFailed: failed,
      usersChecked: users.length,
      usersWithNoHours: usersWithNoHours.length,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to send past-due reminders', details: String(error) },
      { status: 500 }
    )
  }
}
