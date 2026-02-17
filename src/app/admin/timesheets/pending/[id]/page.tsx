'use client'

import { useEffect, useState } from 'react'
import { sanityFetch } from '@/lib/sanity'
import { formatSimpleTime } from '@/lib/time'
import { format, startOfWeek, endOfWeek, parseISO, addDays } from 'date-fns'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardLayout from '@/components/layouts/DashboardLayout'
import { FiChevronLeft } from 'react-icons/fi'
import { useSession } from 'next-auth/react'

interface TimesheetEntry {
  _key: string
  date: string
  project: { _id: string; name: string }
  task?: { _id: string; name: string }
  hours: number
  notes?: string
  isBillable: boolean
}

interface Timesheet {
  _id: string
  user: {
    _id: string
    firstName: string
    lastName: string
    email: string
  }
  weekStart: string
  weekEnd: string
  year: number
  weekNumber: number
  status: string
  entries: TimesheetEntry[]
  totalHours: number
  billableHours: number
  nonBillableHours: number
  submittedAt?: string
}

interface PendingApprovalDetailPageProps {
  params: {
    id: string // Format: userId__weekString
  }
}

// A component to render a ring-shaped circle for billable vs non-billable hours
const UtilizationCircle = ({ billable, nonBillable }: { billable: number; nonBillable: number }) => {
  const total = billable + nonBillable
  if (total === 0) {
    return (
      <div className="relative w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-500">
        No Hours
      </div>
    )
  }

  const billablePercentage = (billable / total) * 100
  // Using Tailwind CSS colors: blue-500 for billable, blue-300 for non-billable
  const conicGradient = `conic-gradient(#3b82f6 ${billablePercentage}%, #93c5fd 0)`

  return (
    <div className="relative w-24 h-24 rounded-full flex items-center justify-center" style={{ background: conicGradient }}>
      {/* Inner circle to create a ring effect */}
      <div className="w-20 h-20 rounded-full bg-white"></div>
    </div>
  )
}

export default function TimesheetPendingApprovalDetailPage({ params }: PendingApprovalDetailPageProps) {
  const { data: session } = useSession()
  const router = useRouter()
  const { id } = params
  const [loading, setLoading] = useState(true)
  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [userInfo, setUserInfo] = useState<{ firstName: string; lastName: string; email: string } | null>(null)
  const [weekStart, setWeekStart] = useState<Date | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [submittingApproval, setSubmittingApproval] = useState(false)

  // Derive userId and weekStringFromMatch from id
  const [userId, weekStringFromMatch] = id.split('__')

  useEffect(() => {
    if (!userId || !weekStringFromMatch) {
      toast.error('Invalid approval ID format.')
      router.push('/admin/timesheets?tab=Pending%20Approval')
      return
    }

    let parsedWeekStart: Date
    try {
      parsedWeekStart = parseISO(weekStringFromMatch)
      if (isNaN(parsedWeekStart.getTime())) {
        throw new Error('Invalid date')
      }
    } catch (error) {
      toast.error('Invalid week date format.')
      router.push('/admin/timesheets?tab=Pending%20Approval')
      return
    }

    setWeekStart(parsedWeekStart)
    if (session) {
      fetchTimesheetsForApproval(userId, weekStringFromMatch)
    }
  }, [id, router, userId, weekStringFromMatch, session])

  const fetchTimesheetsForApproval = async (userId: string, weekString: string) => {
    setLoading(true)
    try {
      const userQuery = `*[_type == "user" && _id == $userId][0]{_id, firstName, lastName, email}`
      const userResult = await sanityFetch<{ _id: string; firstName: string; lastName: string; email: string } | null>({
        query: userQuery,
        params: { userId }
      })

      if (!userResult) {
        toast.error('User not found.')
        setLoading(false)
        return
      }
      setUserInfo(userResult)

      const weekStartDate = startOfWeek(parseISO(weekString), { weekStartsOn: 1 })
      const weekEndDate = endOfWeek(parseISO(weekString), { weekStartsOn: 1 })

      const query = `*[_type == "timesheet" && user._ref == $userId && weekStart >= $weekStart && weekStart <= $weekEnd && status == "submitted"] | order(weekStart asc) {
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
          project->{_id, name},
          task->{_id, name},
          hours,
          notes,
          isBillable
        },
        totalHours,
        billableHours,
        nonBillableHours,
        submittedAt
      }`

      const params = {
        userId,
        weekStart: format(weekStartDate, 'yyyy-MM-dd'),
        weekEnd: format(weekEndDate, 'yyyy-MM-dd')
      }

      const fetchedTimesheets = await sanityFetch<Timesheet[]>({
        query,
        params
      })
      setTimesheets(fetchedTimesheets || [])
    } catch (error) {
      console.error('Error fetching timesheets for approval:', error)
      toast.error('Failed to load timesheets for approval.')
    } finally {
      setLoading(false)
    }
  }

  // Aggregate all entries from all timesheets
  const allEntries = timesheets.flatMap(ts => ts.entries || [])
  const totalHours = timesheets.reduce((sum, ts) => sum + (ts.totalHours || 0), 0)
  const totalBillableHours = timesheets.reduce((sum, ts) => sum + (ts.billableHours || 0), 0)
  const totalNonBillableHours = totalHours - totalBillableHours

  // Calendar view data processing
  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const weekDates = weekStart ? daysOfWeek.map((_, i) => addDays(weekStart, i)) : []

  const entriesByProjectTask = allEntries.reduce((acc, entry) => {
    if (!entry.project) return acc
    const projectName = entry.project.name || 'Unknown Project'
    const taskName = entry.task?.name || 'No Task'
    const key = `${projectName}-${taskName}`
    if (!acc[key]) {
      acc[key] = {
        projectName,
        taskName,
        hoursByDay: { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 },
        notesByDay: { Mon: '', Tue: '', Wed: '', Thu: '', Fri: '', Sat: '', Sun: '' },
      }
    }
    const day = format(parseISO(entry.date), 'EEE')
    acc[key].hoursByDay[day] += entry.hours || 0
    if (entry.notes) {
      acc[key].notesByDay[day] = entry.notes
    }
    return acc
  }, {} as Record<string, { projectName: string; taskName: string; hoursByDay: Record<string, number>; notesByDay: Record<string, string> }>)

  const dailyTotals = daysOfWeek.reduce((acc, day) => {
    acc[day] = Object.values(entriesByProjectTask).reduce((sum, item) => sum + item.hoursByDay[day], 0)
    return acc
  }, {} as Record<string, number>)

  // Get actual role from session for DashboardLayout
  const userRole = session?.user?.role === 'admin' ? 'admin' : (session?.user?.role === 'manager' ? 'manager' : 'user')

  if (loading) {
    return (
      <DashboardLayout role={userRole}>
        <div className="container mx-auto p-4"><div className="h-48 bg-gray-200 rounded animate-pulse"></div></div>
      </DashboardLayout>
    )
  }

  if (!userInfo || !weekStart) {
    return (
      <DashboardLayout role={userRole}>
        <div className="container mx-auto p-4">
          <Link href="/admin/timesheets?tab=Pending%20Approval" className="flex items-center text-gray-500 hover:text-gray-700 mb-4 block">
            <FiChevronLeft className="w-5 h-5 mr-1" />
            Back to Pending Approvals
          </Link>
          <div className="text-red-500">Error: Could not load timesheet details. Please try again or return to pending approvals.</div>
        </div>
      </DashboardLayout>
    )
  }

  const weekRange = `${format(weekStart, 'MMM d, yyyy')} - ${format(endOfWeek(weekStart, { weekStartsOn: 1 }), 'MMM d, yyyy')}`

  if (timesheets.length === 0) {
    return (
      <DashboardLayout role={userRole}>
        <div className="container mx-auto p-4">
          <Link href="/admin/timesheets?tab=Pending%20Approval" className="flex items-center text-gray-500 hover:text-gray-700 mb-4 block">
            <FiChevronLeft className="w-5 h-5 mr-1" />
            Back to Pending Approvals
          </Link>
          <h1 className="text-2xl font-bold mb-4">Approve {userInfo.firstName} {userInfo.lastName} timesheet for week {weekRange}</h1>
          <p className="text-gray-500">No timesheets found for approval.</p>
        </div>
      </DashboardLayout>
    )
  }

  const allTimesheetsApproved = timesheets.length > 0 && timesheets.every(ts => ts.status === 'approved')
  const allTimesheetsPending = timesheets.length > 0 && timesheets.every(ts => ts.status === 'submitted')

  const handleApprove = async () => {
    if (!confirm('Are you sure you want to approve this timesheet?')) return
    setSubmittingApproval(true)
    try {
      const submittedTimesheets = timesheets.filter(ts => ts.status === 'submitted')

      if (submittedTimesheets.length === 0) {
        toast.error('No submitted timesheets to approve.')
        setSubmittingApproval(false)
        return
      }

      const patchPromises = submittedTimesheets.map(ts =>
        fetch(`/api/timesheets/${ts._id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approve' }),
        })
      )
      const responses = await Promise.all(patchPromises)
      const allOk = responses.every(res => res.ok)

      if (allOk) {
        toast.success(`Successfully approved ${submittedTimesheets.length} timesheet(s)!`)
        fetchTimesheetsForApproval(userId, weekStringFromMatch)
      } else {
        const errorMessages = await Promise.all(responses.map(async res => {
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({ message: 'Unknown error' }))
            return errorData.message || res.statusText
          }
          return null
        }))
        throw new Error(`Failed to approve some timesheets: ${errorMessages.filter(Boolean).join(', ')}`)
      }
    } catch (error: any) {
      console.error('Error approving timesheet:', error)
      toast.error(error.message || 'Failed to approve timesheet.')
    } finally {
      setSubmittingApproval(false)
    }
  }

  return (
    <DashboardLayout role={userRole}>
      <div className="bg-white rounded-lg shadow-custom p-6">
        <Link href="/admin/timesheets?tab=Pending%20Approval" className="flex items-center text-gray-500 hover:text-gray-700 mb-4 block">
          <FiChevronLeft className="w-5 h-5 mr-1" />
          Back to Pending Approvals
        </Link>
        <h1 className="text-2xl font-bold mb-4">Approve {userInfo.firstName} {userInfo.lastName} timesheet for week {weekRange}</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="p-4 border rounded-md bg-white shadow-sm">
            <h2 className="text-lg font-semibold mb-2">Total Hours</h2>
            <p className="text-2xl font-bold text-[#2a59c1]">{formatSimpleTime(totalHours)}</p>
          </div>

          {/* Combined second column for Utilization Circle and Billable/Non-Billable text */}
          <div className="p-4 border rounded-md bg-white shadow-sm flex flex-col md:flex-row items-center justify-center md:justify-start">
            <div className="mb-4 md:mb-0 md:mr-6">
              <UtilizationCircle billable={totalBillableHours} nonBillable={totalNonBillableHours} />
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-2">Billable vs Non-Billable</h2>
              <div className="flex items-center mb-2">
                <div className="w-4 h-4 bg-blue-500 mr-2 rounded-full"></div>
                <span>Billable: <span className="font-semibold">{formatSimpleTime(totalBillableHours)}</span></span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-blue-300 mr-2 rounded-full"></div>
                <span>Non-Billable: <span className="font-semibold">{formatSimpleTime(totalNonBillableHours)}</span></span>
              </div>
            </div>
          </div>
        </div>

        <h2 className="text-xl font-semibold mb-3">Weekly Entries</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white">
            <thead className="bg-[#eee]">
              <tr className="bg-[#eee]">
                <th className="py-2 px-4 text-left text-sm font-normal text-[#1d1e1c] sticky left-0 z-10">Project / Task</th>
                {weekDates.map((date, i) => (
                  <th key={i} className="py-2 px-4 text-center text-sm font-normal text-[#1d1e1c]">
                    <div>{daysOfWeek[i]}</div>
                    <div className="font-normal text-gray-500 text-xs">{format(date, 'MMM d, yyyy')}</div>
                  </th>
                ))}
                <th className="py-2 px-4 text-right text-sm font-normal text-[#1d1e1c]">Status</th>
                <th className="py-2 px-4 text-right text-sm font-normal text-[#1d1e1c]">Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(entriesByProjectTask).map(([key, item]) => {
                const rowTotal = Object.values(item.hoursByDay).reduce((sum, h) => sum + h, 0)

                return (
                  <tr key={key}>
                    <td className="py-2 px-4 left-0 bg-white">
                      <div>{item.projectName}</div>
                      <div className="text-sm text-gray-500">{item.taskName}</div>
                    </td>
                    {daysOfWeek.map(day => (
                      <td key={day} className="py-2 px-4 text-center">
                        {item.hoursByDay[day] > 0 ? formatSimpleTime(item.hoursByDay[day]) : '-'}
                      </td>
                    ))}
                    <td className="py-2 px-4 text-right">
                      {allTimesheetsApproved && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Approved</span>}
                      {allTimesheetsPending && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">Pending</span>}
                      {!allTimesheetsApproved && !allTimesheetsPending && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">Open</span>}
                    </td>
                    <td className="py-2 px-4 text-right font-semibold">{formatSimpleTime(rowTotal)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td className="py-2 px-4 text-left sticky left-0 text-sm font-normal text-[#1d1e1c] z-10">Total</td>
                {daysOfWeek.map(day => (
                  <td key={day} className="py-2 px-4 text-center">
                    {dailyTotals[day] > 0 ? formatSimpleTime(dailyTotals[day]) : '-'}
                  </td>
                ))}
                <td className="py-2 px-4 text-right"></td> {/* Empty cell for Status column */}
                <td className="py-2 px-4 text-right">{formatSimpleTime(totalHours)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* View/Hide Timesheet Details button */}
        <div className="mt-6 flex justify-start">
          <button
            className="btn-secondary px-4 py-2 border border-transparent text-sm font-semibold rounded-md focus:outline-none focus:ring-transparent"
            onClick={() => setShowDetails(!showDetails)}
          >
            {showDetails ? 'Hide Timesheet Details' : 'View Timesheet Details'}
          </button>
        </div>

        {showDetails && (
          <div className="mt-6 border rounded-md bg-white shadow-sm p-4">
            <h2 className="text-xl font-semibold mb-4">Timesheet Details</h2>
            {weekDates.map(date => (
              <div key={date.toISOString()} className="mb-6 p-4 border rounded-md bg-gray-50">
                <h3 className="text-lg font-semibold mb-3">{format(date, 'EEEE, MMM d, yyyy')}</h3>
                <div className="space-y-2">
                  {/* Filter entries for this specific day */}
                  {Object.entries(entriesByProjectTask)
                    .filter(([, item]) => item.hoursByDay[format(date, 'EEE')] > 0)
                    .map(([key, item]) => {
                      const dayKey = format(date, 'EEE')
                      const dayNotes = item.notesByDay[dayKey]
                      return (
                        <div key={key} className="border-b pb-2 last:border-b-0 last:pb-0">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="font-medium">{item.projectName}</div>
                              <div className="text-sm text-gray-600">{item.taskName}</div>
                              {dayNotes && (
                                <div className="text-sm text-gray-500 mt-1">{dayNotes}</div>
                              )}
                            </div>
                            <div className="font-semibold ml-4">{formatSimpleTime(item.hoursByDay[dayKey])}</div>
                          </div>
                        </div>
                      )
                    })}
                  {/* If no entries for the day */}
                  {Object.entries(entriesByProjectTask).filter(([, item]) => item.hoursByDay[format(date, 'EEE')] > 0).length === 0 && (
                    <p className="text-gray-500">No time tracked for this day.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Approve, Reject and Email buttons */}
        <div className="mt-6 flex justify-start space-x-3">
          <button
            className="btn-primary px-4 py-2 text-sm font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50"
            onClick={handleApprove}
            disabled={allTimesheetsApproved || timesheets.length === 0 || submittingApproval}
          >
            {allTimesheetsApproved ? 'Approved' : (submittingApproval ? 'Approving...' : 'Approve Timesheet')}
          </button>
        </div>
      </div>
    </DashboardLayout>
  )
}
