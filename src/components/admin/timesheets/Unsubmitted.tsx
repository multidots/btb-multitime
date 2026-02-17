'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { sanityFetch } from '@/lib/sanity'
import { formatSimpleTime } from '@/lib/time'
import { format, startOfWeek, endOfWeek, parseISO } from 'date-fns'
import toast from 'react-hot-toast'

interface UnsubmittedTimesheet {
  _id: string
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
  createdAt: string
}

interface UnsubmittedEntry {
  user: { _id: string; firstName: string; lastName: string; email?: string }
  week: string
  weekEnd: string
  totalHours: number
  billableHours: number
  timesheets: UnsubmittedTimesheet[]
}

interface AggregatedUserEntry {
  user: { _id: string; firstName: string; lastName: string; email?: string }
  totalHours: number
  earliestWeekStart: string
  latestWeekEnd: string
  timesheets: UnsubmittedTimesheet[]
}

export default function TimesheetUnsubmitted() {
  const { data: session } = useSession()
  const [unsubmittedEntries, setUnsubmittedEntries] = useState<UnsubmittedEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [availableWeeks, setAvailableWeeks] = useState<string[]>([])
  const [selectedWeek, setSelectedWeek] = useState('')
  const [filteredEntries, setFilteredEntries] = useState<UnsubmittedEntry[]>([])
  const [aggregatedEntries, setAggregatedEntries] = useState<AggregatedUserEntry[]>([])
  const [selectedEntries, setSelectedEntries] = useState<{[key: string]: boolean}>({})

  useEffect(() => {
    if (session?.user?.id) {
      fetchUnsubmittedTimesheets()
    }
  }, [session])

  useEffect(() => {
    const currentWeekString = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
    if (selectedWeek === '') {
      // Aggregate by user for "All Weeks" view
      const userMap: { [userId: string]: AggregatedUserEntry } = {}
      unsubmittedEntries.forEach(entry => {
        const userId = entry.user._id
        if (!userMap[userId]) {
          userMap[userId] = {
            user: entry.user,
            totalHours: 0,
            earliestWeekStart: entry.week,
            latestWeekEnd: entry.weekEnd,
            timesheets: [],
          }
        }
        userMap[userId].totalHours += entry.totalHours
        userMap[userId].timesheets.push(...entry.timesheets)
        
        // Track earliest week start and latest week end
        if (entry.week < userMap[userId].earliestWeekStart) {
          userMap[userId].earliestWeekStart = entry.week
        }
        if (entry.weekEnd > userMap[userId].latestWeekEnd) {
          userMap[userId].latestWeekEnd = entry.weekEnd
        }
      })
      setAggregatedEntries(Object.values(userMap).sort((a, b) => 
        `${a.user.firstName} ${a.user.lastName}`.localeCompare(`${b.user.firstName} ${b.user.lastName}`)
      ))
      setFilteredEntries([])
    } else if (selectedWeek === 'this_week') {
      setFilteredEntries(unsubmittedEntries.filter(entry => entry.week === currentWeekString))
      setAggregatedEntries([])
    } else {
      setFilteredEntries(unsubmittedEntries.filter(entry => entry.week === selectedWeek))
      setAggregatedEntries([])
    }
    setSelectedEntries({}) // Clear selections when filters change
  }, [unsubmittedEntries, selectedWeek])

  const fetchTeamMemberIds = async () => {
    if (!session?.user?.id || !session?.user?.role) return []

    if (session.user.role === 'admin') {
      // Admin sees all active users except other admins (but includes managers), excluding drafts
      const allUsersQuery = `*[_type == "user" && isActive == true && isArchived != true && role != "admin" && !(_id in path("drafts.**"))]{
        _id
      }`
      const allUsers = await sanityFetch<{ _id: string }[]>({ query: allUsersQuery })
      return allUsers.map(u => u._id).filter(id => !id.startsWith('drafts.'))
    } else if (session.user.role === 'manager') {
      // Manager sees only their team members from teams they manage, excluding other managers and drafts
      const teamsQuery = `*[_type == "team" && manager._ref == $userId && isActive == true && !(_id in path("drafts.**"))]{
        "memberRefs": members[]._ref
      }`

      const teamsData = await sanityFetch<{ memberRefs: (string | null)[] }[]>({
        query: teamsQuery,
        params: { userId: session.user.id }
      })

      // Collect and filter member references
      const allMemberRefs: string[] = []
      teamsData.forEach(team => {
        if (team.memberRefs && Array.isArray(team.memberRefs)) {
          team.memberRefs.forEach(ref => {
            if (ref && typeof ref === 'string' && ref.trim() !== '' && !ref.startsWith('drafts.')) {
              allMemberRefs.push(ref)
            }
          })
        }
      })

      const uniqueMemberRefs = Array.from(new Set(allMemberRefs))

      if (uniqueMemberRefs.length > 0) {
        const membersQuery = `*[_type == "user"
          && _id in $memberRefs
          && !(_id in path("drafts.**"))
          && isActive == true
          && isArchived != true
          && role != "manager"
        ]{
          _id
        }`

        const validMembers = await sanityFetch<{ _id: string }[]>({
          query: membersQuery,
          params: { memberRefs: uniqueMemberRefs }
        })

        return validMembers
          .map(m => m && m._id)
          .filter((id): id is string => {
            if (!id || typeof id !== 'string') return false
            if (id.startsWith('drafts.')) return false
            return true
          })
      } else {
        return []
      }
    }

    return []
  }

  const fetchUnsubmittedTimesheets = async () => {
    setLoading(true)
    try {
      // Get team member IDs based on user role
      const teamMemberIds = await fetchTeamMemberIds()

      if (teamMemberIds.length === 0) {
        setUnsubmittedEntries([])
        setAvailableWeeks([])
        setSelectedWeek('')
        setLoading(false)
        return
      }

      const currentWeekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')

      // Fetch unsubmitted timesheets (unsubmitted or rejected status) for team members (including current week)
      const timesheets = await sanityFetch<UnsubmittedTimesheet[]>({
        query: `*[_type == "timesheet" && user._ref in $teamMemberIds && status in ["unsubmitted", "rejected"] && weekStart <= $currentWeekStart] | order(user->firstName asc, weekStart desc) {
          _id,
          user->{_id, firstName, lastName, email},
          weekStart,
          weekEnd,
          year,
          weekNumber,
          status,
          totalHours,
          billableHours,
          createdAt
        }`,
        params: { teamMemberIds, currentWeekStart }
      })

      // Group by user and week
      const groupedEntries = groupTimesheetsForUnsubmitted(timesheets)
      setUnsubmittedEntries(groupedEntries)

      const uniqueWeeks = Array.from(new Set(groupedEntries.map(entry => entry.week))).sort().reverse()
      setAvailableWeeks(uniqueWeeks)
      
      // Default to showing all past weeks
      if (uniqueWeeks.length > 0) {
        setSelectedWeek('')
      }

    } catch (error) {
      console.error('Error fetching unsubmitted timesheets:', error)
      toast.error('Failed to load unsubmitted timesheets')
    } finally {
      setLoading(false)
    }
  }

  const groupTimesheetsForUnsubmitted = (timesheets: UnsubmittedTimesheet[]): UnsubmittedEntry[] => {
    const unsubmittedMap: { [key: string]: UnsubmittedEntry } = {}

    timesheets.forEach(ts => {
      if (!ts.user?._id) return
      
      const weekString = ts.weekStart
      const key = `${ts.user._id}-${weekString}`

      if (!unsubmittedMap[key]) {
        unsubmittedMap[key] = {
          user: ts.user,
          week: weekString,
          weekEnd: ts.weekEnd,
          totalHours: 0,
          billableHours: 0,
          timesheets: [],
        }
      }

      unsubmittedMap[key].totalHours += ts.totalHours || 0
      unsubmittedMap[key].billableHours += ts.billableHours || 0
      unsubmittedMap[key].timesheets.push(ts)
    })

    return Object.values(unsubmittedMap)
  }

  const handleCheckboxChange = (userId: string, week?: string) => {
    const key = week ? `${userId}-${week}` : userId
    setSelectedEntries(prev => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newSelectedEntries: { [key: string]: boolean } = {}
    if (event.target.checked) {
      if (selectedWeek === '') {
        // All weeks - use aggregated entries (key by userId only)
        aggregatedEntries.forEach(entry => {
          newSelectedEntries[entry.user._id] = true
        })
      } else {
        // Specific week - use filtered entries (key by userId-week)
        filteredEntries.forEach(entry => {
          newSelectedEntries[`${entry.user._id}-${entry.week}`] = true
        })
      }
    }
    setSelectedEntries(newSelectedEntries)
  }

  const handleSendRemindersToSelected = async () => {
    let remindersToSend: { userId: string; week?: string }[] = []

    if (selectedWeek === '') {
      // All weeks view - send reminder for all unsubmitted weeks per user
      remindersToSend = Object.keys(selectedEntries)
        .filter(key => selectedEntries[key])
        .map(userId => ({ userId }))
    } else {
      // Specific week view
      remindersToSend = Object.keys(selectedEntries)
        .filter(key => selectedEntries[key])
        .map(key => {
          const [userId, ...weekParts] = key.split('-')
          const week = weekParts.join('-') // Rejoin in case week has dashes
          return { userId, week }
        })
    }

    if (remindersToSend.length === 0) {
      toast.error('Please select at least one person to send a reminder.')
      return
    }

    toast.promise(
      fetch('/api/send-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminders: remindersToSend, type: 'timesheet' }),
      })
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to send reminders')
        }
        return response.json()
      }),
      {
        loading: 'Sending reminders...',
        success: 'Reminders sent successfully!',
        error: 'Failed to send reminders.',
      }
    )
    setSelectedEntries({}) // Clear selections after sending
  }

  const allSelected = selectedWeek === ''
    ? aggregatedEntries.length > 0 && aggregatedEntries.every(entry => selectedEntries[entry.user._id])
    : filteredEntries.length > 0 && filteredEntries.every(entry => selectedEntries[`${entry.user._id}-${entry.week}`])
  
  const displayEntries = selectedWeek === '' ? aggregatedEntries : filteredEntries
  const hasEntries = displayEntries.length > 0

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Unsubmitted Timesheets</h1>

      <div className="mb-4 max-w-xs">
        <label htmlFor="week-filter" className="block text-sm font-medium text-gray-700"></label>
        <select
          id="week-filter"
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-transparent focus:border-black sm:text-sm rounded-md"
          value={selectedWeek}
          onChange={(e) => setSelectedWeek(e.target.value)}
        >
          <option value="">All Weeks</option>
          {availableWeeks.map(week => (
            <option key={week} value={week}>
              {format(new Date(week), 'MMM d, yyyy')} - {format(endOfWeek(new Date(week), { weekStartsOn: 1 }), 'MMM d, yyyy')}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="h-48 bg-gray-200 rounded animate-pulse"></div>
      ) : !hasEntries ? (
        <p className="text-gray-500">No unsubmitted timesheets found for the selected week.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white">
            <thead>
              <tr className="bg-[#eee]">
                <th className="py-2 px-4 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={handleSelectAll}
                    className="theme-color focus:ring-transparent"
                  />
                </th>
                <th className="py-2 px-4 text-left text-sm text-[#1d1e1c] font-normal">Name</th>
                <th className="py-2 px-4 text-left text-sm text-[#1d1e1cb3] font-normal">{selectedWeek === '' ? 'Date Range' : 'Week'}</th>
                <th className="py-2 px-4 text-right text-sm text-[#1d1e1cb3] font-normal">Total Hours</th>
              </tr>
            </thead>
            <tbody>
              {selectedWeek === '' ? (
                // Aggregated view - one row per person
                aggregatedEntries.map((entry, index) => {
                  const key = entry.user._id
                  return (
                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                      <td className="py-2 px-4">
                        <input
                          type="checkbox"
                          checked={selectedEntries[key] || false}
                          onChange={() => handleCheckboxChange(entry.user._id)}
                          className="theme-color focus:ring-transparent"
                        />
                      </td>
                      <td className="py-2 px-4 capitalize">{entry.user.firstName} {entry.user.lastName}</td>
                      <td className="py-2 px-4">
                        {format(new Date(entry.earliestWeekStart), 'MMM d, yyyy')} - {format(new Date(entry.latestWeekEnd), 'MMM d, yyyy')}
                      </td>
                      <td className="py-2 px-4 text-right">{formatSimpleTime(entry.totalHours)}</td>
                    </tr>
                  )
                })
              ) : (
                // Week-specific view - one row per person-week
                filteredEntries.map((entry, index) => {
                  const key = `${entry.user._id}-${entry.week}`
                  return (
                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                      <td className="py-2 px-4">
                        <input
                          type="checkbox"
                          checked={selectedEntries[key] || false}
                          onChange={() => handleCheckboxChange(entry.user._id, entry.week)}
                          className="theme-color focus:ring-transparent"
                        />
                      </td>
                      <td className="py-2 px-4 capitalize">{entry.user.firstName} {entry.user.lastName}</td>
                      <td className="py-2 px-4">
                        {format(new Date(entry.week), 'MMM d, yyyy')} - {format(endOfWeek(new Date(entry.week), { weekStartsOn: 1 }), 'MMM d, yyyy')}
                      </td>
                      <td className="py-2 px-4 text-right">{formatSimpleTime(entry.totalHours)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
          <div className="mt-4">
            <button
              onClick={handleSendRemindersToSelected}
              disabled={Object.keys(selectedEntries).filter(key => selectedEntries[key]).length === 0}
              className="btn-primary bg-blue-500 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded disabled:!opacity-50"
            >
              Send Email Reminder
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
