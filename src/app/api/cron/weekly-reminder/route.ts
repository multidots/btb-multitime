import { NextRequest, NextResponse } from 'next/server'
import { sanityFetch } from '@/lib/sanity'
import { sendBatchEmails, generateWeeklyReminderEmail, isEmailDisallowed } from '@/lib/email'
import { startOfWeek, endOfWeek, format } from 'date-fns'

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
  capacity: number
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

    const now = new Date()
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }) // Monday
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 }) // Sunday

    const weekStartStr = format(weekStart, 'yyyy-MM-dd')
    const weekStartDisplay = format(weekStart, 'MMM d')
    const weekEndDisplay = format(weekEnd, 'MMM d, yyyy')

    // Fetch all active users with their timesheet total hours for this week
    const query = `
      *[_type == "user" && isActive == true && isArchived != true] {
        _id,
        firstName,
        lastName,
        email,
        role,
        capacity,
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
    // 1. Have weekly reminders enabled
    // 2. Have logged less than their target hours (default 40) via timesheet
    // 3. Are not in the disallowed emails list
    const totalHours = (h: number | null) => h ?? 0
    const usersToRemind = users.filter(user => {
      const hasRemindersEnabled = user.notification?.weeklyTeamReminders !== false
      const targetHours = user.capacity || 40
      const hours = totalHours(user.weekTotalHours)
      const needsReminder = hours < targetHours
      const isAllowed = !isEmailDisallowed(user.email)
      return hasRemindersEnabled && needsReminder && isAllowed
    }).map(user => ({ ...user, totalHours: totalHours(user.weekTotalHours) }))

    if (usersToRemind.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All users have logged their hours or have reminders disabled',
        emailsSent: 0,
      })
    }

    // Generate emails
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

    const emails = usersToRemind.map(user => {
      const targetHours = user.capacity || 40
      // Admin and manager go to /admin, regular users go to /dashboard
      const dashboardUrl = user.role === 'admin' || user.role === 'manager' 
        ? `${baseUrl}/admin` 
        : `${baseUrl}/dashboard`
      
      const { html, text } = generateWeeklyReminderEmail(
        user.firstName,
        user.totalHours,
        targetHours,
        weekStartDisplay,
        weekEndDisplay,
        dashboardUrl
      )

      return {
        to: user.email,
        subject: `⏰ Timesheet Reminder: ${(targetHours - user.totalHours).toFixed(1)}h remaining this week`,
        html,
        text,
      }
    })

    // Send batch emails
    const { success, failed, errors } = await sendBatchEmails(emails)


    return NextResponse.json({
      success: true,
      message: `Sent ${success} reminder emails`,
      emailsSent: success,
      emailsFailed: failed,
      usersChecked: users.length,
      usersReminded: usersToRemind.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to send weekly reminders', details: String(error) },
      { status: 500 }
    )
  }
}
