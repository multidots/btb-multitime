import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { sanityFetch, mutationClient } from '@/lib/sanity'

// Sanity transaction limit is 200 mutations per transaction
const TRANSACTION_LIMIT = 200

// PATCH /api/timesheets/bulk-approve - Bulk approve timesheets
export async function PATCH(request: NextRequest) {
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

    const { timesheetIds } = await request.json()

    if (!Array.isArray(timesheetIds) || timesheetIds.length === 0) {
      return NextResponse.json({ error: 'Timesheet IDs required' }, { status: 400 })
    }

    // Verify all are submitted
    const timesheets = await sanityFetch<Array<{ _id: string; status: string }>>({
      query: `*[_type == "timesheet" && _id in $ids]{ _id, status }`,
      params: { ids: timesheetIds }
    })

    const invalid = timesheets.filter(t => t.status !== 'submitted')
    if (invalid.length > 0) {
      return NextResponse.json({
        error: 'Some timesheets not submitted',
        invalidIds: invalid.map(t => t._id)
      }, { status: 400 })
    }

    const approvalTime = new Date().toISOString()
    const updateData = {
      status: 'approved',
      approvedBy: { _type: 'reference', _ref: session.user.id },
      approvedAt: approvalTime,
      isLocked: true,
      updatedAt: approvalTime,
    }

    // Batch timesheets into transactions (200 per batch)
    const batches: string[][] = []
    for (let i = 0; i < timesheetIds.length; i += TRANSACTION_LIMIT) {
      batches.push(timesheetIds.slice(i, i + TRANSACTION_LIMIT))
    }

    // Process each batch in a transaction
    for (const batch of batches) {
      const transaction = mutationClient.transaction()
      
      batch.forEach(id => {
        transaction.patch(id, patch => patch.set(updateData))
      })
      
      await transaction.commit()
    }

    return NextResponse.json({
      success: true,
      approvedCount: timesheetIds.length
    })
  } catch (error) {
    console.error('Error bulk approving:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
