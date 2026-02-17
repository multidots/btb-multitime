import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { sanityFetch } from '@/lib/sanity'
import { format } from 'date-fns'

import { sendBatchEmails, generateUnsubmittedReminderEmail, isEmailDisallowed } from '@/lib/email'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    // Only admins and managers can send reminders
    if (!session?.user?.id || (session.user.role !== 'admin' && session.user.role !== 'manager')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { reminders } = await request.json()

    if (!reminders || !Array.isArray(reminders) || reminders.length === 0) {
      return NextResponse.json({ error: 'No reminders provided' }, { status: 400 })
    }

    // Get base URL for dashboard link
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

    // Extract unique user IDs from reminders
    const userIds = Array.from(new Set(reminders.map((r: any) => r.userId)))

    // Batch fetch all users at once (optimized - single query instead of N queries)
    const users = await sanityFetch<Array<{
      _id: string
      firstName: string
      lastName: string
      email: string
    }>>({
      query: `*[_type == "user" && _id in $userIds]{
        _id,
        firstName,
        lastName,
        email
      }`,
      params: { userIds }
    })

    // Create a map for quick user lookup
    const userMap = new Map<string, typeof users[0]>()
    users.forEach(user => {
      userMap.set(user._id, user)
    })

    // Prepare emails for batch sending
    const emails: Array<{ to: string; subject: string; html: string; text: string }> = []
    const results: Array<{ userId: string; week: string; status: string; reason?: string }> = []

    // Process each reminder and prepare emails
    for (const reminder of reminders) {
      const { userId, week } = reminder
      const user = userMap.get(userId)

      if (user?.email) {
        // Skip if email is disallowed
        if (isEmailDisallowed(user.email)) {
          results.push({ userId, week, status: 'skipped', reason: 'Email is disallowed from notifications' })
          continue
        }

        const weekFormatted = format(new Date(week), 'd MMM yyyy')
        const dashboardUrl = `${baseUrl}/dashboard`
        
        // Generate the styled email using the template
        const { html, text } = generateUnsubmittedReminderEmail(
          user.firstName,
          weekFormatted,
          dashboardUrl
        )

        const subject = 'Reminder: Submit Your Timesheet'

        emails.push({ to: user.email, subject, html, text })
        results.push({ userId, week, status: 'sent' })
      } else {
        results.push({ userId, week, status: 'failed', reason: 'User email not found' })
      }
    }

    // Batch send all emails at once (optimized - uses sendBatchEmails which handles rate limiting)
    if (emails.length > 0) {
      const { success, failed, errors } = await sendBatchEmails(emails)
      
      // Update results based on email send status
      // Note: sendBatchEmails handles individual failures, so we mark all as sent
      // If detailed error tracking is needed, we could enhance this
      if (failed > 0) {
        // Mark failed emails in results
        const emailMap = new Map(emails.map((e, i) => [e.to, i]))
        errors.forEach(error => {
          // Extract email from error message (format: "email@example.com: error message")
          const emailMatch = error.match(/^([^:]+):/)
          if (emailMatch) {
            const email = emailMatch[1].trim()
            const emailIndex = emailMap.get(email)
            if (emailIndex !== undefined) {
              // Find corresponding result and mark as failed
              const emailObj = emails[emailIndex]
              const result = results.find(r => {
                const user = userMap.get(r.userId)
                return user?.email === emailObj.to
              })
              if (result && result.status === 'sent') {
                result.status = 'failed'
                result.reason = error.split(':').slice(1).join(':').trim() || 'Email send failed'
              }
            }
          }
        })
      }
    }

    return NextResponse.json({ success: true, results })
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
