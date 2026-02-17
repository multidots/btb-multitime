import { NextRequest, NextResponse } from 'next/server'
import { generateWeeklyReminderEmail, generateWeeklyReportEmail } from '@/lib/email'
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns'

// This endpoint is for local development only - preview email templates
export async function GET(request: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') || 'reminder'
  const format_type = searchParams.get('format') || 'html'

  const now = new Date()
  
  if (type === 'reminder') {
    // Weekly reminder email preview
    const weekStart = startOfWeek(now, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
    
    const { html, text } = generateWeeklyReminderEmail(
      'John',                                    // firstName
      24.5,                                      // hoursLogged
      40,                                        // targetHours
      format(weekStart, 'MMM d'),               // weekStart display
      format(weekEnd, 'MMM d, yyyy'),           // weekEnd display
      'http://localhost:3000/dashboard'    // dashboardUrl
    )

    if (format_type === 'text') {
      return new NextResponse(text, {
        headers: { 'Content-Type': 'text/plain' }
      })
    }

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' }
    })
  }

  if (type === 'report') {
    // Weekly report email preview
    const previousWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 })
    const previousWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 })

    const sampleDailyHours = [
      { day: 'Monday', hours: 8.0 },
      { day: 'Tuesday', hours: 7.5 },
      { day: 'Wednesday', hours: 8.0 },
      { day: 'Thursday', hours: 8.5 },
      { day: 'Friday', hours: 8.0 },
      { day: 'Saturday', hours: 0 },
      { day: 'Sunday', hours: 0 },
    ]

    const { html, text } = generateWeeklyReportEmail(
      'John',                                          // firstName
      format(previousWeekStart, 'd MMM'),             // weekStart display
      format(previousWeekEnd, 'd MMM yyyy'),          // weekEnd display
      40.0,                                           // totalHours
      sampleDailyHours,                               // dailyHours
      'http://localhost:3000/dashboard'               // dashboardUrl
    )

    if (format_type === 'text') {
      return new NextResponse(text, {
        headers: { 'Content-Type': 'text/plain' }
      })
    }

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' }
    })
  }

  // List available previews
  return NextResponse.json({
    message: 'Email Preview API',
    available_previews: [
      {
        type: 'reminder',
        description: 'Weekly timesheet reminder (Friday)',
        urls: {
          html: '/api/email-preview?type=reminder',
          text: '/api/email-preview?type=reminder&format=text'
        }
      },
      {
        type: 'report',
        description: 'Weekly time report (Monday)',
        urls: {
          html: '/api/email-preview?type=report',
          text: '/api/email-preview?type=report&format=text'
        }
      }
    ]
  })
}

