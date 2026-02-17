import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { sanityFetch } from '@/lib/sanity'
import { format, startOfWeek, parseISO } from 'date-fns'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admins can check pending approvals
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { memberIds } = body

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return NextResponse.json({ memberIds: [] })
    }

    // Parallelize independent queries for better performance
    // Query for members with pending OR unsubmitted timesheets
    // Pending: status == "submitted" (submitted but not approved)
    // Unsubmitted: status == "unsubmitted" (not submitted yet)
    // Fetch approved timesheets to identify weeks that have approvals
    const [pendingTimesheets, approvedTimesheets] = await Promise.all([
      sanityFetch<Array<{ 
        userId: string
        entries: Array<{ date: string }>
      }>>({
        query: `*[_type == "timesheet" && user._ref in $memberIds && status in ["unsubmitted", "submitted"] && count(entries) > 0 && !(_id in path("drafts.**"))] {
          "userId": user._ref,
          "entries": entries[]{
            date
          }
        }`,
        params: { memberIds }
      }),
      sanityFetch<Array<{ 
        userId: string
        entries: Array<{ date: string }>
      }>>({
        query: `*[_type == "timesheet" && user._ref in $memberIds && status == "approved" && count(entries) > 0 && !(_id in path("drafts.**"))]{
          "userId": user._ref,
          "entries": entries[]{
            date
          }
        }`,
        params: { memberIds }
      })
    ])

    // Flatten timesheet entries to individual date entries for compatibility with existing logic
    const pendingEntries: Array<{ userId: string; date: string }> = []
    pendingTimesheets.forEach(ts => {
      if (ts.entries && Array.isArray(ts.entries)) {
        ts.entries.forEach((entry: any) => {
          if (entry.date) {
            pendingEntries.push({
              userId: ts.userId,
              date: entry.date
            })
          }
        })
      }
    })

    const approvedEntries: Array<{ userId: string; date: string }> = []
    approvedTimesheets.forEach(ts => {
      if (ts.entries && Array.isArray(ts.entries)) {
        ts.entries.forEach((entry: any) => {
          if (entry.date) {
            approvedEntries.push({
              userId: ts.userId,
              date: entry.date
            })
          }
        })
      }
    })

    // Create a Set of week keys (userId-weekStart) that have approved entries
    const weeksWithApprovals = new Set<string>()
    approvedEntries.forEach(entry => {
      const entryDate = parseISO(entry.date)
      const weekStart = format(startOfWeek(entryDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
      weeksWithApprovals.add(`${entry.userId}-${weekStart}`)
    })

    // Filter out pending/unsubmitted entries from weeks that have approved entries
    const validPendingEntries = pendingEntries.filter(entry => {
      const entryDate = parseISO(entry.date)
      const weekStart = format(startOfWeek(entryDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
      const weekKey = `${entry.userId}-${weekStart}`
      return !weeksWithApprovals.has(weekKey)
    })

    // Extract unique member IDs with valid pending or unsubmitted entries
    const memberIdsWithPendingOrUnsubmitted = Array.from(
      new Set(validPendingEntries.map(entry => entry.userId).filter(Boolean))
    )

    return NextResponse.json({ memberIds: memberIdsWithPendingOrUnsubmitted })
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

