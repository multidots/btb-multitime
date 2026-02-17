'use client'

import { useState, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useDataFetcher } from '@/lib/hooks/useDataFetcher'
import { sanityFetch } from '@/lib/sanity'
import { formatSimpleTime } from '@/lib/time'
import toast from 'react-hot-toast'
import { FiUser, FiCheckCircle, FiX, FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, isSameWeek } from 'date-fns'

interface TimesheetEntry {
  _key: string
  date: string
  project: { _id: string; name: string }
  task?: { _id: string; name: string }
  hours: number
  notes?: string
  isBillable: boolean
}

interface ApprovedTimesheet {
  _id: string
  _createdAt: string
  user: {
    _id: string
    firstName: string
    lastName: string
    email?: string
  }
  weekStart: string
  weekEnd: string
  year: number
  weekNumber: number
  status: string
  totalHours: number
  billableHours: number
  nonBillableHours: number
  approvedBy?: {
    _id: string
    firstName: string
    lastName: string
  }
  approvedAt?: string
  entries: TimesheetEntry[]
}

export default function TimesheetApproved() {
  const { data: session } = useSession()

  const [unapprovingWeek, setUnapprovingWeek] = useState<string | null>(null)

  // Week navigation state - default to current week
  const [selectedWeekStart, setSelectedWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )

  // Check if we're viewing the current week
  const isCurrentWeek = useMemo(() =>
    isSameWeek(selectedWeekStart, new Date(), { weekStartsOn: 1 }),
    [selectedWeekStart]
  )

  // Calculate the end of the selected week
  const selectedWeekEnd = useMemo(() =>
    endOfWeek(selectedWeekStart, { weekStartsOn: 1 }),
    [selectedWeekStart]
  )

  // Navigation handlers
  const goToPreviousWeek = () => {
    setSelectedWeekStart(prev => subWeeks(prev, 1))
  }

  const goToNextWeek = () => {
    setSelectedWeekStart(prev => addWeeks(prev, 1))
  }

  const goToCurrentWeek = () => {
    setSelectedWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
  }

  const fetchApprovedTimesheets = useCallback(async (): Promise<ApprovedTimesheet[]> => {
    try {
      const query = `*[_type == "timesheet" && status == "approved"] | order(weekStart desc)[0...100]{
        _id,
        _createdAt,
        user->{
          _id,
          firstName,
          lastName,
          email
        },
        weekStart,
        weekEnd,
        year,
        weekNumber,
        status,
        totalHours,
        billableHours,
        nonBillableHours,
        approvedBy->{
          _id,
          firstName,
          lastName
        },
        approvedAt,
        entries[]{
          _key,
          date,
          project->{_id, name},
          task->{_id, name},
          hours,
          notes,
          isBillable
        }
      }`

      const timesheets = await sanityFetch<ApprovedTimesheet[]>({
        query,
        params: {}
      })

      return timesheets || []
    } catch (error) {
      console.error('Error fetching approved timesheets:', error)
      throw error
    }
  }, [])

  const { data: approvedTimesheets, loading, error, refetch } = useDataFetcher<ApprovedTimesheet[]>(
    fetchApprovedTimesheets,
    { refetchOnMount: true }
  )

  // Group timesheets by week and then by user, flattening entries
  const groupedTimesheets = useMemo(() => {
    if (!approvedTimesheets) return {}

    const groups: { [key: string]: { weekStart: Date; weekEnd: Date; users: { [userId: string]: { user: any; entries: any[]; totalHours: number } }; totalHours: number } } = {}

    approvedTimesheets.forEach((timesheet) => {
      const weekStart = new Date(timesheet.weekStart)
      const weekEnd = new Date(timesheet.weekEnd)
      const weekKey = format(weekStart, 'yyyy-MM-dd')
      const userId = timesheet.user._id

      if (!groups[weekKey]) {
        groups[weekKey] = {
          weekStart,
          weekEnd,
          users: {},
          totalHours: 0
        }
      }

      if (!groups[weekKey].users[userId]) {
        groups[weekKey].users[userId] = {
          user: timesheet.user,
          entries: [],
          totalHours: 0
        }
      }

      // Flatten entries and add timesheet metadata
      if (timesheet.entries && Array.isArray(timesheet.entries)) {
        timesheet.entries.forEach((entry: TimesheetEntry) => {
          const entryWithMetadata = {
            ...entry,
            _id: `${timesheet._id}-${entry._key}`,
            timesheetId: timesheet._id,
            approvedBy: timesheet.approvedBy,
            approvedAt: timesheet.approvedAt,
            user: timesheet.user
          }
          groups[weekKey].users[userId].entries.push(entryWithMetadata)
          groups[weekKey].users[userId].totalHours += entry.hours || 0
          groups[weekKey].totalHours += entry.hours || 0
        })
      }
    })

    return groups
  }, [approvedTimesheets])

  // Filter grouped timesheets to show only selected week
  const filteredTimesheets = useMemo(() => {
    const selectedWeekKey = format(selectedWeekStart, 'yyyy-MM-dd')
    if (groupedTimesheets[selectedWeekKey]) {
      return { [selectedWeekKey]: groupedTimesheets[selectedWeekKey] }
    }
    return {}
  }, [groupedTimesheets, selectedWeekStart])

  // Get total entries count for selected week
  const selectedWeekEntriesCount = useMemo(() => {
    const selectedWeekKey = format(selectedWeekStart, 'yyyy-MM-dd')
    const weekData = groupedTimesheets[selectedWeekKey]
    if (!weekData) return 0
    return Object.values(weekData.users).reduce((total: number, userData: any) =>
      total + userData.entries.length, 0
    )
  }, [groupedTimesheets, selectedWeekStart])

  const handleUnapproveUserWeek = async (weekStart: string, userId: string) => {
    const confirmed = window.confirm('Are you sure you want to unapprove this user\'s week? Their timesheets for this week will be set to submitted (pending approval again).')

    if (!confirmed) return

    setUnapprovingWeek(`${weekStart}-${userId}`)
    try {
      // Get all timesheet IDs for this user and week
      const weekData = groupedTimesheets[weekStart]
      if (!weekData || !weekData.users[userId]) {
        throw new Error('User data not found')
      }

      const userEntries = weekData.users[userId].entries
      const timesheetIds = [...new Set(userEntries.map((entry: any) => entry.timesheetId))]

      // Unapprove all timesheets for this user (API sets status to 'submitted')
      const promises = timesheetIds.map(id =>
        fetch(`/api/timesheets/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'unapprove' }),
        })
      )

      const responses = await Promise.all(promises)
      const allOk = responses.every(res => res.ok)

      if (!allOk) {
        throw new Error('Failed to unapprove some timesheets')
      }

      toast.success('Timesheets set to submitted (pending approval again)')
      await refetch()
    } catch (error: any) {
      console.error('Error unapproving user week:', error)
      toast.error(error.message || 'Failed to unapprove user week')
    } finally {
      setUnapprovingWeek(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        <span className="ml-3 text-gray-600">Loading approved timesheets...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-2">
          <FiCheckCircle className="w-12 h-12 mx-auto mb-4" />
          <p className="text-lg font-medium">Error loading approved timesheets</p>
          <p className="text-sm text-gray-500 mt-1">{error}</p>
        </div>
      </div>
    )
  }

  if (!approvedTimesheets || approvedTimesheets.length === 0) {
    return (
      <div className="text-center py-12">
        <FiCheckCircle className="w-12 h-12 mx-auto text-gray-400 mb-4" />
        <p className="text-lg font-medium text-gray-900">No approved timesheets</p>
        <p className="text-sm text-gray-500 mt-1">
          There are no approved timesheets at this time.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-sm font-medium text-gray-900">
          Approved Timesheets ({approvedTimesheets?.length || 0} total)
        </h3>

        {/* Filter dropdown */}
        <select
          className="text-sm border border-gray-300 rounded-lg pl-4 pr-8 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-transparent focus:border-black"
          defaultValue="week"
        >
          <option value="week">Week</option>
        </select>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center gap-4">
        <div className="flex items-center border border-gray-300 rounded-md overflow-hidden">
          <button
            onClick={goToPreviousWeek}
            className="p-2 hover:bg-gray-100 border-r border-gray-300 transition"
            aria-label="Previous week"
          >
            <FiChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <button
            onClick={goToNextWeek}
            disabled={isCurrentWeek}
            className={`p-2 transition ${
              isCurrentWeek 
                ? 'opacity-50 cursor-not-allowed' 
                : 'hover:bg-gray-100'
            }`}
            aria-label="Next week"
          >
            <FiChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <span className="text-lg font-medium text-gray-900">
          {format(selectedWeekStart, 'd')} – {format(selectedWeekEnd, 'd MMM yyyy')}
        </span>

        {!isCurrentWeek && (
          <button
            onClick={goToCurrentWeek}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium hover:underline transition"
          >
            Return to this week
          </button>
        )}
      </div>

      {Object.keys(filteredTimesheets).length === 0 ? (
        <div className="p-8 text-center border border-gray-200 rounded-lg bg-gray-50">
          <FiCheckCircle className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <p className="text-lg font-medium text-gray-900">No approved timesheets</p>
          <p className="text-sm text-gray-500 mt-1">
            No approved timesheets for the week of {format(selectedWeekStart, 'MMM dd')} - {format(selectedWeekEnd, 'MMM dd, yyyy')}
          </p>
        </div>
      ) : (
        Object.entries(filteredTimesheets).map(([weekKey, weekData]: [string, any]) => (
          <div key={weekKey} className="overflow-hidden">
            <div className="bg-[#eee] px-4 py-3 border-b border-gray-200">
              <h4 className="text-sm font-medium text-gray-900">
                Week of {format(weekData.weekStart, 'MMM dd, yyyy')} - {format(weekData.weekEnd, 'MMM dd, yyyy')}
              </h4>
              <p className="text-xs text-gray-500">
                Total Hours: {formatSimpleTime(weekData.totalHours)} | {Object.keys(weekData.users).length} members
              </p>
            </div>

            {Object.entries(weekData.users).map(([userId, userData]: [string, any]) => (
              <div key={userId} className="border-b border-gray-200 last:border-b-0">
                <div className="bg-gray-25 px-4 py-2">
                  <div className="flex items-center justify-between ">
                    <div className="flex items-center space-x-2 flex-wrap">
                      <FiUser className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <p className="text-sm font-medium text-gray-900">
                        {userData.user.firstName} {userData.user.lastName}
                      </p>
                      <span className="text-xs text-gray-500">({userData.user.email})</span>
                      <span className="text-xs text-gray-500">
                        Total: {formatSimpleTime(userData.totalHours)} | {userData.entries.length} entries
                      </span>
                    </div>
                    {unapprovingWeek === `${weekKey}-${userId}` ? (
                      <div className="flex items-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                        <span className="ml-2 text-sm text-gray-600">Unapproving...</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleUnapproveUserWeek(weekKey, userId)}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition"
                        title="Unapprove User's Week"
                      >
                        <FiX className="w-4 h-4" />
                        <span className="ml-1">Unapprove Week</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-[#eee]">
                      <tr>
                        <th className="px-4 py-2 text-center text-sm font-normal text-[#1d1e1c]">Date</th>
                        <th className="px-4 py-2 text-center text-sm font-normal text-[#1d1e1c]">Hours</th>
                        <th className="px-4 py-2 text-left text-sm font-normal text-[#1d1e1c]">Approved By</th>
                        <th className="px-4 py-2 text-center text-sm font-normal text-[#1d1e1c]">Approved Date</th>
                        <th className="px-4 py-2 text-center text-sm font-normal text-[#1d1e1c]">Status</th>
                      </tr>
                    </thead>
                    <tbody className="">
                      {userData.entries.map((entry: any) => (
                        <tr key={entry._id} className="transition hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-2 text-center">
                            <p className="text-gray-900">
                              {format(new Date(entry.date), 'MMM dd, yyyy')}
                            </p>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <p className="font-medium text-gray-900">
                              {formatSimpleTime(entry.hours || 0)}
                            </p>
                          </td>
                          <td className="px-4 py-2">
                            <div>
                              <p className="font-medium text-gray-900">
                                {entry.approvedBy?.firstName} {entry.approvedBy?.lastName}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <p className="text-gray-600">
                              {entry.approvedAt ? format(new Date(entry.approvedAt), 'MMM dd, yyyy HH:mm') : '-'}
                            </p>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Approved
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  )
}
