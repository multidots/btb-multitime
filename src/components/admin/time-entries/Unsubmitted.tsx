'use client'

import { useEffect, useState } from 'react'
import { sanityFetch } from '@/lib/sanity'
import { formatSimpleTime } from '@/lib/time'
import { format, startOfWeek, endOfWeek, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { useSession } from 'next-auth/react'

interface TimeEntry {
  _id: string
  user: {
    _id: string
    firstName: string
    lastName: string
  }
  project: {
    _id: string
    name: string
  }
  task: {
    _id: string
    name: string
    isBillable: boolean
  }
  date: string
  hours: number
  isApproved: boolean
  isLocked: boolean
}

interface UnsubmittedEntry {
  user: { _id: string; firstName: string; lastName: string }
  week: string
  totalHours: number
  entries: TimeEntry[]
}

export default function Unsubmitted() {
  const { data: session } = useSession()
  const [unsubmittedEntries, setUnsubmittedEntries] = useState<UnsubmittedEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [availableWeeks, setAvailableWeeks] = useState<string[]>([])
  const [selectedWeek, setSelectedWeek] = useState('')
  const [filteredEntries, setFilteredEntries] = useState<UnsubmittedEntry[]>([])
  const [selectedEntries, setSelectedEntries] = useState<{[key: string]: boolean}>({})

  useEffect(() => {
    if (session?.user?.id) {
      fetchUnsubmittedEntries()
    }
  }, [session])

  useEffect(() => {
    const currentWeekString = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    if (selectedWeek === '') {
      setFilteredEntries(unsubmittedEntries)
    } else if (selectedWeek === 'this_week') {
      setFilteredEntries(unsubmittedEntries.filter(entry => entry.week === currentWeekString));
    } else {
      setFilteredEntries(unsubmittedEntries.filter(entry => entry.week === selectedWeek))
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
      // CRITICAL: Only get published team documents (not unsaved/draft team documents)
      // Use !(_id in path("drafts.**")) to ensure we only get published teams
      const teamsQuery = `*[_type == "team" && manager._ref == $userId && isActive == true && !(_id in path("drafts.**"))]{
        "memberRefs": members[]._ref
      }`

      const teamsData = await sanityFetch<{ memberRefs: (string | null)[] }[]>({
        query: teamsQuery,
        params: { userId: session.user.id }
      })

      // Collect and filter member references - CRITICAL: exclude any draft references
      const allMemberRefs: string[] = []
      teamsData.forEach(team => {
        if (team.memberRefs && Array.isArray(team.memberRefs)) {
          team.memberRefs.forEach(ref => {
            // Only include non-null, non-empty, non-draft references
            if (ref && typeof ref === 'string' && ref.trim() !== '' && !ref.startsWith('drafts.')) {
              allMemberRefs.push(ref)
            }
          })
        }
      })

      // Remove duplicates
      const uniqueMemberRefs = Array.from(new Set(allMemberRefs))

      if (uniqueMemberRefs.length > 0) {
        // Now query users with strict filters - this query will ONLY return published users
        // Use !(_id in path("drafts.**")) to ensure we only get published user documents
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

        // Final defensive filter - should not be needed but ensures safety
        return validMembers
          .map(m => m && m._id)
          .filter((id): id is string => {
            if (!id || typeof id !== 'string') return false
            // Reject any ID that starts with 'drafts.'
            if (id.startsWith('drafts.')) {
              console.warn('Draft user ID detected and filtered:', id)
              return false
            }
            return true
          })
      } else {
        return []
      }
    }

    return []
  }

  const fetchUnsubmittedEntries = async () => {
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

      // Fetch unsubmitted entries
      const unsubmittedEntries = await sanityFetch<TimeEntry[]>(
        {
          query: `*[_type == "timeEntry" && isApproved == false && !defined(submittedAt) && user._ref in $teamMemberIds] | order(user->firstName asc, date asc) {
            _id,
            user->{_id, firstName, lastName},
            project->{_id, name},
            task->{_id, name, isBillable},
            date,
            hours,
            isApproved,
            isLocked,
            submittedAt
          }`,
          params: { teamMemberIds },
        }
      )

      // Fetch approved entries to identify weeks that have approvals
      const approvedEntries = await sanityFetch<Array<{ user: { _id: string }, date: string }>>({
        query: `*[_type == "timeEntry" && isApproved == true && isLocked == true && user._ref in $teamMemberIds]{
          "user": user->_id,
          date
        }`,
        params: { teamMemberIds },
      })

      // Create a Set of week keys (userId-weekStart) that have approved entries
      const weeksWithApprovals = new Set<string>()
      approvedEntries.forEach(entry => {
        const entryDate = parseISO(entry.date)
        const weekStart = format(startOfWeek(entryDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
        weeksWithApprovals.add(`${entry.user}-${weekStart}`)
      })

      // Filter out unsubmitted entries from weeks that have approved entries
      const filteredEntries = unsubmittedEntries.filter(entry => {
        const entryDate = parseISO(entry.date)
        const weekStart = format(startOfWeek(entryDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
        const weekKey = `${entry.user._id}-${weekStart}`
        return !weeksWithApprovals.has(weekKey)
      })

      const groupedUnsubmitted = groupTimeEntriesForUnsubmitted(filteredEntries)
      setUnsubmittedEntries(groupedUnsubmitted)

      const uniqueWeeks = Array.from(new Set(groupedUnsubmitted.map(entry => entry.week))).sort().reverse()
      setAvailableWeeks(uniqueWeeks)
      const currentWeekString = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      if (uniqueWeeks.includes(currentWeekString)) {
        setSelectedWeek('this_week');
      } else if (uniqueWeeks.length > 0) {
        setSelectedWeek(uniqueWeeks[0])
      }

    } catch (error) {
      console.error('Error fetching unsubmitted entries:', error)
      toast.error('Failed to load unsubmitted entries')
    } finally {
      setLoading(false)
    }
  }

  const groupTimeEntriesForUnsubmitted = (entries: TimeEntry[]): UnsubmittedEntry[] => {
    const unsubmittedMap: { [key: string]: UnsubmittedEntry } = {}

    entries.forEach(entry => {
      const weekStart = startOfWeek(new Date(entry.date), { weekStartsOn: 1 })
      const weekString = format(weekStart, 'yyyy-MM-dd')
      const key = `${entry.user._id}-${weekString}`

      if (!unsubmittedMap[key]) {
        unsubmittedMap[key] = {
          user: entry.user,
          week: weekString,
          totalHours: 0,
          entries: [],
        }
      }

      unsubmittedMap[key].totalHours += entry.hours
      unsubmittedMap[key].entries.push(entry)
    })

    return Object.values(unsubmittedMap)
  }

  const handleCheckboxChange = (userId: string, week: string) => {
    const key = `${userId}-${week}`
    setSelectedEntries(prev => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newSelectedEntries: { [key: string]: boolean } = {}
    if (event.target.checked) {
      filteredEntries.forEach(entry => {
        newSelectedEntries[`${entry.user._id}-${entry.week}`] = true
      })
    }
    setSelectedEntries(newSelectedEntries)
  }

  const handleSendRemindersToSelected = async () => {
    const remindersToSend = Object.keys(selectedEntries)
      .filter(key => selectedEntries[key])
      .map(key => {
        const [userId, week] = key.split('-')
        return { userId, week }
      })

    if (remindersToSend.length === 0) {
      toast.error('Please select at least one person to send a reminder.')
      return
    }

    toast.promise(
      fetch('/api/send-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminders: remindersToSend }),
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

  const allSelected = filteredEntries.length > 0 && filteredEntries.every(entry => selectedEntries[`${entry.user._id}-${entry.week}`])

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Unsubmitted Entries</h1>

      <div className="mb-4 max-w-xs">
        <label htmlFor="week-filter" className="block text-sm font-medium text-gray-700"></label>
        <select
          id="week-filter"
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-transparent focus:border-black sm:text-sm rounded-md"
          value={selectedWeek}
          onChange={(e) => setSelectedWeek(e.target.value)}
        >
          <option value="">All Weeks</option>
          <option value="this_week">This Week</option>
          {availableWeeks.map(week => (
            <option key={week} value={week}>
              {format(new Date(week), 'MMM d, yyyy')} - {format(endOfWeek(new Date(week), { weekStartsOn: 1 }), 'MMM d, yyyy')}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="h-48 bg-gray-200 rounded animate-pulse"></div>
      ) : filteredEntries.length === 0 ? (
        <p className="text-gray-500">No unsubmitted entries found for the selected week.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white">
            <thead >
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
                <th className="py-2 px-4 text-left text-sm text-[#1d1e1cb3] font-normal">Week</th>
                <th className="py-2 px-4 text-right text-sm text-[#1d1e1cb3] font-normal">Total Hours</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry, index) => {
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
                    <td className="py-2 px-4">{format(new Date(entry.week), 'MMM d, yyyy')} - {format(endOfWeek(new Date(entry.week), { weekStartsOn: 1 }), 'MMM d, yyyy')}</td>
                    <td className="py-2 px-4 text-right">{formatSimpleTime(entry.totalHours)}</td>
                  </tr>
                )
              })}
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