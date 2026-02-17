import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { sanityFetch, mutationClient } from '@/lib/sanity'
import { formatDecimalHours } from '@/lib/time'
import { calculateTimesheetTotals } from '../../route'
import { recalculateProjectTimesheetHours } from '@/lib/projectHours'
import { v4 as uuidv4 } from 'uuid'

// Get task billable status
async function getTaskBillableStatus(taskId: string | undefined): Promise<boolean> {
  if (!taskId) return true
  try {
    const task = await sanityFetch<{ isBillable: boolean }>({
      query: `*[_type == "task" && _id == $taskId][0]{ isBillable }`,
      params: { taskId }
    })
    return task?.isBillable ?? true
  } catch {
    return true
  }
}

// POST /api/timesheets/[id]/entries - Add entry
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { projectId, taskId, date, hours, notes, startTime, isTimer } = body

    if (!projectId || !date) {
      return NextResponse.json({ error: 'Project and date required' }, { status: 400 })
    }

    const timesheet = await sanityFetch<{
      _id: string
      user: { _id: string }
      status: string
      isLocked: boolean
      entries: any[]
      weekStart: string
      weekEnd: string
    }>({
      query: `*[_type == "timesheet" && _id == $id][0]{
        _id, "user": user->{_id}, status, isLocked, entries, weekStart, weekEnd
      }`,
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

    if (timesheet.isLocked && !isAdmin) {
      return NextResponse.json({ error: 'Timesheet is locked' }, { status: 403 })
    }

    if (date < timesheet.weekStart || date > timesheet.weekEnd) {
      return NextResponse.json({ error: 'Date outside week range' }, { status: 400 })
    }

    // If starting a new timer, stop any existing running timer in this timesheet
    let updatedEntries = [...(timesheet.entries || [])]
    if (isTimer) {
      const runningEntryIndex = updatedEntries.findIndex((e: any) => e.isRunning === true)
      if (runningEntryIndex !== -1) {
        const runningEntry = updatedEntries[runningEntryIndex]
        const endTime = new Date()
        let calculatedHours = 0
        if (runningEntry.startTime) {
          const start = new Date(runningEntry.startTime)
          calculatedHours = (endTime.getTime() - start.getTime()) / (1000 * 60 * 60)
          calculatedHours = Math.round(calculatedHours * 100) / 100
        }
        const totalHours = (runningEntry.hours || 0) + calculatedHours

        updatedEntries[runningEntryIndex] = {
          ...runningEntry,
          hours: totalHours,
          endTime: endTime.toISOString(),
          isRunning: false,
          updatedAt: new Date().toISOString(),
        }
      }
    }

    const isBillable = await getTaskBillableStatus(taskId)
    const entryKey = uuidv4()

    const newEntry: any = {
      _key: entryKey,
      date,
      project: { _type: 'reference', _ref: projectId },
      hours: isTimer ? 0 : formatDecimalHours(hours || 0),
      notes: notes || '',
      isBillable,
      isRunning: isTimer || false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    if (taskId) {
      newEntry.task = { _type: 'reference', _ref: taskId }
    }
    if (isTimer || startTime) {
      newEntry.startTime = startTime || new Date().toISOString()
    }

    updatedEntries = [...updatedEntries, newEntry]
    const totals = calculateTimesheetTotals(updatedEntries)

    await mutationClient.patch(params.id)
      .setIfMissing({ entries: [] })
      .set({ entries: updatedEntries, ...totals, updatedAt: new Date().toISOString() })
      .commit()

    // Recalculate project's aggregated timesheet hours (fire and forget)
    recalculateProjectTimesheetHours(projectId).catch(err => 
      console.error('Failed to recalculate project hours:', err)
    )

    return NextResponse.json({ success: true, entry: newEntry }, { status: 201 })
  } catch (error) {
    console.error('Error adding entry:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// PATCH /api/timesheets/[id]/entries - Update entry
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
    const { entryKey, action, projectId, taskId, date, hours, notes, isBillable } = body

    if (!entryKey) {
      return NextResponse.json({ error: 'Entry key required' }, { status: 400 })
    }

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

    if (!isOwner && !isAdmin && !isManager) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (timesheet.isLocked && !isAdmin) {
      return NextResponse.json({ error: 'Timesheet is locked' }, { status: 403 })
    }

    const entryIndex = timesheet.entries?.findIndex((e: any) => e._key === entryKey)
    if (entryIndex === -1 || entryIndex === undefined) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    }

    const existingEntry = timesheet.entries[entryIndex]
    const updatedEntries = [...timesheet.entries]

    // Handle timer stop
    if (action === 'stop_timer') {
      const endTime = new Date()
      let calculatedHours = 0
      if (existingEntry.startTime) {
        const start = new Date(existingEntry.startTime)
        calculatedHours = (endTime.getTime() - start.getTime()) / (1000 * 60 * 60)
        calculatedHours = Math.round(calculatedHours * 100) / 100
      }
      const totalHours = (existingEntry.hours || 0) + calculatedHours

      updatedEntries[entryIndex] = {
        ...existingEntry,
        hours: totalHours,
        endTime: endTime.toISOString(),
        isRunning: false,
        updatedAt: new Date().toISOString(),
      }
    }
    // Handle timer start
    else if (action === 'start_timer') {
      // Stop any other running timer in this timesheet before starting this one
      const runningEntryIndex = updatedEntries.findIndex((e: any, idx: number) => 
        e.isRunning === true && idx !== entryIndex
      )
      if (runningEntryIndex !== -1) {
        const runningEntry = updatedEntries[runningEntryIndex]
        const endTime = new Date()
        let calculatedHours = 0
        if (runningEntry.startTime) {
          const start = new Date(runningEntry.startTime)
          calculatedHours = (endTime.getTime() - start.getTime()) / (1000 * 60 * 60)
          calculatedHours = Math.round(calculatedHours * 100) / 100
        }
        const totalHours = (runningEntry.hours || 0) + calculatedHours

        updatedEntries[runningEntryIndex] = {
          ...runningEntry,
          hours: totalHours,
          endTime: endTime.toISOString(),
          isRunning: false,
          updatedAt: new Date().toISOString(),
        }
      }

      // Start timer on the requested entry
      updatedEntries[entryIndex] = {
        ...existingEntry,
        startTime: new Date().toISOString(),
        isRunning: true,
        updatedAt: new Date().toISOString(),
      }
    }
    // Regular update
    else {
      updatedEntries[entryIndex] = {
        ...existingEntry,
        ...(projectId !== undefined && { project: { _type: 'reference', _ref: projectId } }),
        ...(taskId !== undefined && { task: taskId ? { _type: 'reference', _ref: taskId } : undefined }),
        ...(date !== undefined && { date }),
        ...(hours !== undefined && { hours: formatDecimalHours(hours) }),
        ...(notes !== undefined && { notes }),
        ...(isBillable !== undefined && { isBillable }),
        updatedAt: new Date().toISOString(),
      }
    }

    const totals = calculateTimesheetTotals(updatedEntries)

    await mutationClient.patch(params.id)
      .set({ entries: updatedEntries, ...totals, updatedAt: new Date().toISOString() })
      .commit()

    // Recalculate project's aggregated timesheet hours
    // Get affected project IDs (old and new if project changed)
    const affectedProjectIds = new Set<string>()
    if (existingEntry.project?._ref) affectedProjectIds.add(existingEntry.project._ref)
    if (projectId) affectedProjectIds.add(projectId)
    
    // Fire and forget
    Promise.all(
      Array.from(affectedProjectIds).map(pid => 
        recalculateProjectTimesheetHours(pid).catch(err => 
          console.error('Failed to recalculate project hours:', err)
        )
      )
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating entry:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// DELETE /api/timesheets/[id]/entries?entryKey=xxx
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const entryKey = searchParams.get('entryKey')

    if (!entryKey) {
      return NextResponse.json({ error: 'Entry key required' }, { status: 400 })
    }

    const timesheet = await sanityFetch<{
      _id: string
      user: { _id: string }
      isLocked: boolean
      entries: any[]
    }>({
      query: `*[_type == "timesheet" && _id == $id][0]{
        _id, "user": user->{_id}, isLocked, entries
      }`,
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

    if (timesheet.isLocked && !isAdmin) {
      return NextResponse.json({ error: 'Timesheet is locked' }, { status: 403 })
    }

    // Find the entry being deleted to get its project ID
    const deletedEntry = (timesheet.entries || []).find((e: any) => e._key === entryKey)
    const updatedEntries = (timesheet.entries || []).filter((e: any) => e._key !== entryKey)

    if (updatedEntries.length === timesheet.entries?.length) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    }

    const totals = calculateTimesheetTotals(updatedEntries)

    await mutationClient.patch(params.id)
      .set({ entries: updatedEntries, ...totals, updatedAt: new Date().toISOString() })
      .commit()

    // Recalculate project's aggregated timesheet hours (fire and forget)
    if (deletedEntry?.project?._ref) {
      recalculateProjectTimesheetHours(deletedEntry.project._ref).catch(err => 
        console.error('Failed to recalculate project hours:', err)
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting entry:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
