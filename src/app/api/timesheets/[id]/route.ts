import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { sanityFetch, mutationClient } from '@/lib/sanity'
import { TIMESHEET_QUERY } from '@/lib/queries'
import { calculateTimesheetTotals } from '../route'
import { recalculateMultipleProjectHours, getProjectIdsFromTimesheetEntries } from '@/lib/projectHours'

// GET /api/timesheets/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const timesheet = await sanityFetch<any>({
      query: TIMESHEET_QUERY,
      params: { id: params.id }
    })

    if (!timesheet) {
      return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 })
    }

    const isOwner = timesheet.user?._id === session.user.id
    const isAdmin = session.user.role === 'admin' || (session.user as any).isSanityAdmin
    const isManager = session.user.role === 'manager'

    if (!isOwner && !isAdmin && !isManager) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(timesheet)
  } catch (error) {
    console.error('Error fetching timesheet:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// PATCH /api/timesheets/[id] - Submit, approve, reject
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action } = body

    const timesheet = await sanityFetch<{
      _id: string
      user: { _id: string }
      status: string
      isLocked: boolean
      entries: any[]
    }>({
      query: `*[_type == "timesheet" && _id == $id][0]{
        _id, "user": user->{_id}, status, isLocked, entries
      }`,
      params: { id: params.id }
    })

    if (!timesheet) {
      return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 })
    }

    const isOwner = timesheet.user?._id === session.user.id
    const isAdmin = session.user.role === 'admin' || (session.user as any).isSanityAdmin
    const isManager = session.user.role === 'manager'

    switch (action) {
      case 'submit': {
        if (!isOwner && !isAdmin) {
          return NextResponse.json({ error: 'Only owner can submit' }, { status: 403 })
        }
        // Allow submit when unsubmitted, rejected (resubmit after rejection), or submitted (resubmit while pending)
        const allowedStatusesForSubmit = ['unsubmitted', 'rejected', 'submitted']
        if (!allowedStatusesForSubmit.includes(timesheet.status)) {
          return NextResponse.json({ error: 'Cannot submit - invalid status' }, { status: 400 })
        }
        if (timesheet.entries?.some((e: any) => e.isRunning)) {
          return NextResponse.json({ error: 'Stop running timer first' }, { status: 400 })
        }

        await mutationClient.patch(params.id).set({
          status: 'submitted',
          submittedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }).commit()

        return NextResponse.json({ success: true })
      }

      case 'approve': {
        if (!isAdmin && !isManager) {
          return NextResponse.json({ error: 'Only admin/manager can approve' }, { status: 403 })
        }
        if (timesheet.status !== 'submitted') {
          return NextResponse.json({ error: 'Timesheet not submitted' }, { status: 400 })
        }

        await mutationClient.patch(params.id).set({
          status: 'approved',
          approvedBy: { _type: 'reference', _ref: session.user.id },
          approvedAt: new Date().toISOString(),
          isLocked: true,
          updatedAt: new Date().toISOString(),
        }).commit()

        // Recalculate affected projects' approved hours (fire and forget)
        const approveProjectIds = getProjectIdsFromTimesheetEntries(timesheet.entries || [])
        recalculateMultipleProjectHours(approveProjectIds).catch(err => 
          console.error('Failed to recalculate project hours on approve:', err)
        )

        return NextResponse.json({ success: true })
      }

      case 'reject': {
        if (!isAdmin && !isManager) {
          return NextResponse.json({ error: 'Only admin/manager can reject' }, { status: 403 })
        }
        if (timesheet.status !== 'submitted') {
          return NextResponse.json({ error: 'Timesheet not submitted' }, { status: 400 })
        }

        await mutationClient.patch(params.id).set({
          status: 'rejected',
          rejectedAt: new Date().toISOString(),
          rejectionReason: body.reason || '',
          updatedAt: new Date().toISOString(),
        }).commit()

        return NextResponse.json({ success: true })
      }

      case 'unapprove': {
        if (!isAdmin) {
          return NextResponse.json({ error: 'Only admin can unapprove' }, { status: 403 })
        }

        await mutationClient.patch(params.id).set({
          status: 'submitted',
          isLocked: false,
          updatedAt: new Date().toISOString(),
        }).unset(['approvedBy', 'approvedAt']).commit()

        // Recalculate affected projects' approved hours (fire and forget)
        const unapproveProjectIds = getProjectIdsFromTimesheetEntries(timesheet.entries || [])
        recalculateMultipleProjectHours(unapproveProjectIds).catch(err => 
          console.error('Failed to recalculate project hours on unapprove:', err)
        )

        return NextResponse.json({ success: true })
      }

      case 'recalculate': {
        const totals = calculateTimesheetTotals(timesheet.entries || [])
        await mutationClient.patch(params.id).set({
          ...totals,
          updatedAt: new Date().toISOString(),
        }).commit()

        return NextResponse.json({ success: true, totals })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('Error updating timesheet:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// DELETE /api/timesheets/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isAdmin = session.user.role === 'admin' || (session.user as any).isSanityAdmin
    if (!isAdmin) {
      return NextResponse.json({ error: 'Only admin can delete' }, { status: 403 })
    }

    const timesheet = await sanityFetch<{ _id: string; isLocked: boolean; status: string }>({
      query: `*[_type == "timesheet" && _id == $id][0]{ _id, isLocked, status }`,
      params: { id: params.id }
    })

    if (!timesheet) {
      return NextResponse.json({ error: 'Timesheet not found' }, { status: 404 })
    }

    if (timesheet.isLocked || timesheet.status === 'approved') {
      return NextResponse.json({ error: 'Cannot delete approved timesheet' }, { status: 400 })
    }

    await mutationClient.delete(params.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting timesheet:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
