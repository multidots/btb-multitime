'use client'

import { useEffect, useState, useMemo, Fragment } from 'react'
import { useSession } from 'next-auth/react'
import { sanityFetch } from '@/lib/sanity'
import { format, startOfWeek, endOfWeek, parseISO } from 'date-fns'
import { formatSimpleTime } from '@/lib/time'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'

interface TimesheetEntry {
  _key: string
  date: string
  project: { _id: string; name: string }
  task?: { _id: string; name: string }
  hours: number
  notes?: string
  isBillable: boolean
}

interface PendingTimesheet {
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
  entries: TimesheetEntry[]
  totalHours: number
  billableHours: number
  nonBillableHours: number
  submittedAt?: string
}

interface ApprovalEntry {
  user: { _id: string; firstName: string; lastName: string; email?: string }
  project?: { _id: string; name: string }
  week: string
  weekEnd: string
  totalHours: number
  billableHours: number
  timesheets: PendingTimesheet[]
}

export default function TimesheetPendingApproval() {
  const { data: session } = useSession()
  const router = useRouter()
  const [rawTimesheets, setRawTimesheets] = useState<PendingTimesheet[]>([])
  const [loading, setLoading] = useState(true)
  const [groupBy, setGroupBy] = useState<'week' | 'person' | 'project'>('week')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [pinnedUserIds, setPinnedUserIds] = useState<string[]>([])
  const [adminAssignedUserIds, setAdminAssignedUserIds] = useState<string[]>([])
  const [teamMemberIds, setTeamMemberIds] = useState<string[]>([])
  const [projectUserIds, setProjectUserIds] = useState<string[]>([])
  const [categories, setCategories] = useState<Array<{ _id: string; name: string; slug: { current: string } }>>([])

  useEffect(() => {
    if (session?.user?.id) {
      fetchPinnedUsers()
      fetchAdminAssignedUsers()
      fetchManagerialUsers()
      fetchCategories()
    }
  }, [session?.user?.id])

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/categories', { cache: 'no-store' })
      if (!response.ok) throw new Error('Failed to fetch categories')
      const data = await response.json()
      setCategories(data || [])
    } catch (error) {
      console.error('Error fetching categories:', error)
    }
  }

  const fetchPinnedUsers = async () => {
    if (!session?.user?.id) return
    try {
      const pinned = await sanityFetch<{ _id: string }[]>({
        query: `*[_type == "user" && $currentAdminId in pinnedBy[]._ref && isActive == true && isArchived != true]{_id}`,
        params: { currentAdminId: session.user.id },
      })
      setPinnedUserIds((pinned || []).map(u => u._id))
    } catch (error) {
      console.error('Error fetching pinned users:', error)
    }
  }

  const fetchAdminAssignedUsers = async () => {
    if (session?.user?.role !== 'admin') return
    try {
      const assigned = await sanityFetch<{ _id: string }[]>({
        query: `*[_type == "user" && isActive == true && isArchived != true && role != "admin"]{_id}`,
      })
      setAdminAssignedUserIds((assigned || []).map(u => u._id))
    } catch (error) {
      console.error('Error fetching admin assigned users:', error)
    }
  }

  const fetchManagerialUsers = async () => {
    if (!session?.user?.id || session.user.role !== 'manager') return
    try {
      const teamQuery = `*[_type == "team" && manager._ref == $userId && isActive == true].members[]->_id`
      const projectsQuery = `*[_type == "project" && $userId in assignedUsers[role == "Project Manager"].user._ref && isActive == true].assignedUsers[].user->_id`

      const [teamIds, projectIds] = await Promise.all([
        sanityFetch<string[]>({ query: teamQuery, params: { userId: session.user.id } }),
        sanityFetch<string[]>({ query: projectsQuery, params: { userId: session.user.id } })
      ])

      const selfId = session.user.id
      setTeamMemberIds(Array.from(new Set((teamIds || []).filter(id => id && id !== selfId))))
      setProjectUserIds(Array.from(new Set((projectIds || []).filter(id => id && id !== selfId))))
    } catch (error) {
      console.error('Error fetching managerial users:', error)
    }
  }

  useEffect(() => {
    if (session?.user?.id) {
      fetchPendingTimesheets()
    }
  }, [session, selectedCategory, pinnedUserIds, adminAssignedUserIds, teamMemberIds, projectUserIds])

  const fetchPendingTimesheets = async () => {
    setLoading(true)
    try {
      let filterParts = ['status == "submitted"', 'user._ref != $loggedInUserId']
      let queryParams: any = { loggedInUserId: session?.user?.id }

      if (selectedCategory === 'pinned_people' && pinnedUserIds.length > 0) {
        filterParts.push(`user._ref in $pinnedUserIds`)
        queryParams.pinnedUserIds = pinnedUserIds
      } else if (selectedCategory === 'team_members' && teamMemberIds.length > 0) {
        filterParts.push(`user._ref in $teamMemberIds`)
        queryParams.teamMemberIds = teamMemberIds
      } else if (selectedCategory === 'project_members' && projectUserIds.length > 0) {
        filterParts.push(`user._ref in $projectUserIds`)
        queryParams.projectUserIds = projectUserIds
      } else if (selectedCategory && !['pinned_people', 'team_members', 'project_members'].includes(selectedCategory)) {
        // Filter by job category (user's job category)
        filterParts.push(`user->jobCategory._ref == $selectedCategory`)
        queryParams.selectedCategory = selectedCategory
      } else {
        // Default case for "Everyone"
        if (session?.user?.role === 'admin') {
          if (adminAssignedUserIds.length > 0) {
            filterParts.push(`user._ref in $adminAssignedUserIds`)
            queryParams.adminAssignedUserIds = adminAssignedUserIds
          }
        } else if (session?.user?.role === 'manager') {
          const combinedIds = [...new Set([...teamMemberIds, ...projectUserIds])]
          if (combinedIds.length > 0) {
            filterParts.push(`user._ref in $combinedIds`)
            queryParams.combinedIds = combinedIds
          } else {
            filterParts.push('false')
          }
        } else {
          filterParts.push('false')
        }
      }

      const fullFilterQuery = filterParts.join(' && ')

      const timesheets = await sanityFetch<PendingTimesheet[]>({
        query: `*[_type == "timesheet" && ${fullFilterQuery}] | order(user->firstName asc, weekStart desc) {
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
        }`,
        params: queryParams,
      })

      setRawTimesheets(timesheets || [])
    } catch (error) {
      console.error('Error fetching pending timesheets:', error)
      toast.error('Failed to load pending timesheets')
    } finally {
      setLoading(false)
    }
  }

  const groupTimesheetsForApproval = (timesheets: PendingTimesheet[], groupBy: 'week' | 'person' | 'project'): ApprovalEntry[] => {
    const approvalMap: { [key: string]: ApprovalEntry } = {}

    if (groupBy === 'project') {
      // For project grouping, we need to group by user-project-week
      timesheets.forEach(ts => {
        if (!ts.user || !ts.entries) return

        // Group entries by project within each timesheet
        const projectHoursMap: { [projectId: string]: { project: { _id: string; name: string }; totalHours: number; billableHours: number } } = {}
        
        ts.entries.forEach(entry => {
          if (!entry.project) return
          const projectId = entry.project._id
          
          if (!projectHoursMap[projectId]) {
            projectHoursMap[projectId] = {
              project: entry.project,
              totalHours: 0,
              billableHours: 0,
            }
          }
          
          projectHoursMap[projectId].totalHours += entry.hours || 0
          if (entry.isBillable) {
            projectHoursMap[projectId].billableHours += entry.hours || 0
          }
        })

        // Create approval entries for each project
        Object.values(projectHoursMap).forEach(({ project, totalHours, billableHours }) => {
          const key = `${ts.user._id}-${project._id}-${ts.weekStart}`

          if (!approvalMap[key]) {
            approvalMap[key] = {
              user: ts.user,
              project,
              week: ts.weekStart,
              weekEnd: ts.weekEnd,
              totalHours: 0,
              billableHours: 0,
              timesheets: [],
            }
          }

          approvalMap[key].totalHours += totalHours
          approvalMap[key].billableHours += billableHours
          if (!approvalMap[key].timesheets.includes(ts)) {
            approvalMap[key].timesheets.push(ts)
          }
        })
      })
    } else {
      // For week and person grouping
      timesheets.forEach(ts => {
        if (!ts.user) return

        const key = `${ts.user._id}-${ts.weekStart}`

        if (!approvalMap[key]) {
          approvalMap[key] = {
            user: ts.user,
            week: ts.weekStart,
            weekEnd: ts.weekEnd,
            totalHours: 0,
            billableHours: 0,
            timesheets: [],
          }
        }

        approvalMap[key].totalHours += ts.totalHours || 0
        approvalMap[key].billableHours += ts.billableHours || 0
        approvalMap[key].timesheets.push(ts)
      })
    }

    return Object.values(approvalMap)
  }

  const pendingApprovals = useMemo(() => {
    return groupTimesheetsForApproval(rawTimesheets, groupBy)
  }, [rawTimesheets, groupBy])

  // Grouping functions
  const groupedByPerson = useMemo(() => {
    const groups: { [key: string]: ApprovalEntry[] } = {}
    pendingApprovals.forEach(approval => {
      const key = approval.user._id
      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(approval)
    })
    return Object.entries(groups).sort(([keyA, arrA], [keyB, arrB]) => {
      const nameA = `${arrA[0].user.firstName} ${arrA[0].user.lastName}`.toLowerCase()
      const nameB = `${arrB[0].user.firstName} ${arrB[0].user.lastName}`.toLowerCase()
      return nameA.localeCompare(nameB)
    })
  }, [pendingApprovals])

  const groupedByWeek = useMemo(() => {
    const groups: { [key: string]: ApprovalEntry[] } = {}
    pendingApprovals.forEach(approval => {
      const key = approval.week
      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(approval)
    })
    return Object.entries(groups).sort(([keyA], [keyB]) => {
      const weekA = parseISO(keyA).getTime()
      const weekB = parseISO(keyB).getTime()
      return weekB - weekA // Sort weeks in descending order (latest first)
    })
  }, [pendingApprovals])

  const groupedByProject = useMemo(() => {
    const groups: { [key: string]: ApprovalEntry[] } = {}
    pendingApprovals.forEach(approval => {
      if (approval.project) {
        const key = approval.project._id
        if (!groups[key]) {
          groups[key] = []
        }
        groups[key].push(approval)
      }
    })
    return Object.entries(groups).sort(([keyA, arrA], [keyB, arrB]) => {
      const projectA = arrA[0].project!.name.toLowerCase()
      const projectB = arrB[0].project!.name.toLowerCase()
      return projectA.localeCompare(projectB)
    })
  }, [pendingApprovals])

  // Flatten all approvals for single table view
  const allApprovalsFlat = useMemo(() => {
    const flat: (ApprovalEntry & { groupKey: string; groupLabel: string })[] = []

    if (groupBy === 'person') {
      groupedByPerson.forEach(([personId, approvals]) => {
        const groupLabel = `${approvals[0].user.firstName} ${approvals[0].user.lastName}`
        approvals.forEach(approval => {
          flat.push({ ...approval, groupKey: personId, groupLabel })
        })
      })
    } else if (groupBy === 'project') {
      groupedByProject.forEach(([projectId, approvals]) => {
        const groupLabel = approvals[0].project!.name
        approvals.forEach(approval => {
          flat.push({ ...approval, groupKey: projectId, groupLabel })
        })
      })
    } else {
      groupedByWeek.forEach(([weekString, approvals]) => {
        const groupLabel = `${format(parseISO(weekString), 'MMM d, yyyy')} - ${format(endOfWeek(parseISO(weekString), { weekStartsOn: 1 }), 'MMM d, yyyy')}`
        approvals.forEach(approval => {
          flat.push({ ...approval, groupKey: weekString, groupLabel })
        })
      })
    }

    return flat
  }, [groupBy, groupedByPerson, groupedByProject, groupedByWeek])

  useEffect(() => {
    setSelectedCategory(null)
  }, [groupBy])

  const calculateBillablePercentage = (billableHours: number, totalHours: number) => {
    if (totalHours === 0) return '0.00'
    const percentage = (billableHours / totalHours) * 100
    return percentage.toFixed(2)
  }

  const handleApproveAll = async () => {
    const timesheetIds = rawTimesheets.map(ts => ts._id)

    if (timesheetIds.length === 0) {
      toast.error('No timesheets to approve.')
      return
    }

    if (!confirm(`Are you sure you want to approve ${timesheetIds.length} timesheet(s)?`)) {
      return
    }

    try {
      const response = await fetch('/api/timesheets/bulk-approve', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timesheetIds }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to approve timesheets.')
      }

      const result = await response.json()
      toast.success(`Approved ${result.approvedCount} timesheet(s)!`)
      fetchPendingTimesheets()
    } catch (error: any) {
      console.error('Error approving timesheets:', error)
      toast.error(error.message)
    }
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Pending Approvals</h1>

      <div className="mb-4 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="flex-1 max-w-xs">
          <label htmlFor="group-by" className="block text-sm font-medium text-gray-700 mb-1">Group by:</label>
          <select
            id="group-by"
            className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-transparent focus:border-black sm:text-sm rounded-md"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as 'week' | 'person' | 'project')}
          >
            <option value="week">Week</option>
            <option value="person">People</option>
            <option value="project">Project</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-4 items-end">
          <div className="min-w-[200px]">
            <label htmlFor="category-filter" className="block text-sm font-medium text-gray-700 mb-1"></label>
            <select
              id="category-filter"
              className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-transparent focus:border-black sm:text-sm rounded-md"
              value={selectedCategory || ''}
              onChange={(e) => setSelectedCategory(e.target.value || null)}
            >
              <option value="">Everyone</option>
              {pinnedUserIds.length > 0 && (
                <option value="pinned_people">My Pinned People</option>
              )}
              {session?.user?.role === 'manager' && teamMemberIds.length > 0 && (
                <option value="team_members">My Team Members</option>
              )}
              {session?.user?.role === 'manager' && projectUserIds.length > 0 && (
                <option value="project_members">My Assigned Projects</option>
              )}
              {categories.map(cat => (
                <option key={cat._id} value={cat._id}>{cat.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-48 bg-gray-200 rounded animate-pulse"></div>
      ) : pendingApprovals.length === 0 ? (
        <p className="text-gray-500">No pending approvals found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white">
            <tbody>
              {allApprovalsFlat.map((approval, index) => {
                const isNewGroup = index === 0 || allApprovalsFlat[index - 1].groupKey !== approval.groupKey
                const billablePercentage = calculateBillablePercentage(approval.billableHours, approval.totalHours)
                const uniqueKey = `${approval.user._id}-${approval.project?._id || 'all'}-${approval.week}-${index}`

                return (
                  <Fragment key={uniqueKey}>
                    {isNewGroup && (
                      <tr className="bg-[#eee]" key={`${uniqueKey}-header`}>
                        <td colSpan={groupBy === 'project' ? 3 : 2} className="py-2 px-4 text-sm">
                          {approval.groupLabel}
                        </td>
                      </tr>
                    )}
                    <tr
                      key={`${uniqueKey}-row`}
                      className="group cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => {
                        router.push(`/admin/timesheets/pending/${approval.user._id}__${approval.week}`)
                      }}
                    >
                      {groupBy === 'person' && (
                        <td className="py-2 px-4 capitalize text-[#2a59c1] underline">
                          {format(parseISO(approval.week), 'MMM d, yyyy')} - {format(endOfWeek(parseISO(approval.week), { weekStartsOn: 1 }), 'MMM d, yyyy')}
                        </td>
                      )}
                      {groupBy === 'project' && (
                        <>
                          <td className="py-2 px-4 capitalize text-[#2a59c1] underline">
                            {`${approval.user.firstName} ${approval.user.lastName}`}
                          </td>
                          <td className="py-2 px-4 capitalize text-[#2a59c1] underline">
                            {format(parseISO(approval.week), 'MMM d, yyyy')} - {format(endOfWeek(parseISO(approval.week), { weekStartsOn: 1 }), 'MMM d, yyyy')}
                          </td>
                        </>
                      )}
                      {groupBy === 'week' && (
                        <td className="py-2 px-4 capitalize text-[#2a59c1] underline">
                          {`${approval.user.firstName} ${approval.user.lastName}`}
                        </td>
                      )}
                      <td className="py-2 px-4 text-right font-semibold">
                        {formatSimpleTime(approval.totalHours)}
                        <span className="text-xs text-gray-500 ml-1">
                          ({billablePercentage}% billable)
                        </span>
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4">
        <button
          onClick={handleApproveAll}
          className="btn-primary px-4 py-2 text-sm font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50"
          disabled={loading || rawTimesheets.length === 0}
        >
          Approve Timesheets
        </button>
      </div>
    </div>
  )
}
