'use client'

import { useEffect, useState, useMemo, Fragment } from 'react'
import { sanityFetch } from '@/lib/sanity'
import { formatSimpleTime } from '@/lib/time'
import { format, startOfWeek, endOfWeek, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

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
    assignedUsers?: Array<{
      _id: string
    }>
  }
  task: {
    _id: string
    name: string
    isBillable: boolean
    jobCategory: {
      _id: string;
      name: string;
    }
  }
  date: string
  hours: number
  isApproved: boolean
  isLocked: boolean
}

interface ApprovalEntry {
  user: { _id: string; firstName: string; lastName: string }
  project?: { _id: string; name: string }
  week: string
  totalBillableHours: number
  totalNonBillableHours: number
  entries: TimeEntry[]
}

export default function PendingApproval() {
  const { data: session } = useSession()
  const router = useRouter()
  const [rawTimeEntries, setRawTimeEntries] = useState<TimeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [groupBy, setGroupBy] = useState<'week' | 'person' | 'project'>('week') // Default to week
  const [categories, setCategories] = useState<{ _id: string; name: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [pinnedUserIds, setPinnedUserIds] = useState<string[]>([]);
  const [adminAssignedUserIds, setAdminAssignedUserIds] = useState<string[]>([]);
  const [teamMemberIds, setTeamMemberIds] = useState<string[]>([]);
  const [projectUserIds, setProjectUserIds] = useState<string[]>([]);

  useEffect(() => {
    if (session?.user?.id) {
      fetchCategories();
      fetchPinnedUsers();
      fetchAdminAssignedUsers();
      fetchManagerialUsers();
    }
  }, [session?.user?.id]);

  const fetchCategories = async () => {
    try {
      const cats = await sanityFetch<{ _id: string; name: string }[]>(
        {
          query: `*[_type == "jobcategory"]{_id, name} | order(name asc)`
        }
      );
      setCategories(cats);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error('Failed to load categories for filter.');
    }
  };

  const fetchPinnedUsers = async () => {
    if (!session?.user?.id) return;
    try {
      const pinned = await sanityFetch<{ _id: string }[]>({
        query: `*[_type == "user" && $currentAdminId in pinnedBy[]._ref && isActive == true && isArchived != true]{_id}`,
        params: { currentAdminId: session.user.id },
      });
      setPinnedUserIds((pinned || []).map(u => u._id));
    } catch (error) {
      console.error('Error fetching pinned users:', error);
    }
  };

  const fetchAdminAssignedUsers = async () => {
    if (session?.user?.role !== 'admin') return;
    try {
      const assigned = await sanityFetch<{ _id: string }[]>({
        query: `*[_type == "user" && isActive == true && isArchived != true && role != "admin"]{_id}`,
      });
      setAdminAssignedUserIds((assigned || []).map(u => u._id));
    } catch (error) {
      console.error('Error fetching admin assigned users:', error);
    }
  };

  const fetchManagerialUsers = async () => {
    if (!session?.user?.id || session.user.role !== 'manager') return;
    try {
      const teamQuery = `*[_type == "team" && manager._ref == $userId && isActive == true].members[]->_id`;
      const projectsQuery = `*[_type == "project" && $userId in assignedUsers[role == "Project Manager"].user._ref && isActive == true].assignedUsers[].user->_id`;

      const [teamIds, projectIds] = await Promise.all([
        sanityFetch<string[]>({ query: teamQuery, params: { userId: session.user.id } }),
        sanityFetch<string[]>({ query: projectsQuery, params: { userId: session.user.id } })
      ]);

      const selfId = session.user.id;
      setTeamMemberIds(Array.from(new Set((teamIds || []).filter(id => id && id !== selfId))));
      setProjectUserIds(Array.from(new Set((projectIds || []).filter(id => id && id !== selfId))));
    } catch (error) {
      console.error('Error fetching managerial users:', error);
    }
  };

  useEffect(() => {
    if (session?.user?.id) {
      fetchPendingApprovals();
    }
  }, [session, selectedCategory, pinnedUserIds, adminAssignedUserIds, teamMemberIds, projectUserIds]);

  const fetchPendingApprovals = async () => {
    setLoading(true)
    try {
      // Only show submitted weeks (submittedAt exists) that are pending approval
      // Unsubmitted weeks (no submittedAt) are shown in the Unsubmitted tab
      let filterParts = ['isApproved == false', 'defined(submittedAt)', 'user._ref != $loggedInUserId'];
      let queryParams: any = { loggedInUserId: session?.user?.id };

      if (selectedCategory === 'pinned_people' && pinnedUserIds.length > 0) {
        filterParts.push(`user._ref in $pinnedUserIds`);
        queryParams.pinnedUserIds = pinnedUserIds;
      } else if (selectedCategory === 'team_members' && teamMemberIds.length > 0) {
        filterParts.push(`user._ref in $teamMemberIds`);
        queryParams.teamMemberIds = teamMemberIds;
      } else if (selectedCategory === 'project_members' && projectUserIds.length > 0) {
        filterParts.push(`user._ref in $projectUserIds`);
        queryParams.projectUserIds = projectUserIds;
      } else if (selectedCategory && !['pinned_people', 'team_members', 'project_members'].includes(selectedCategory)) {
        filterParts.push(`task->jobCategory._ref == $selectedCategory`);
        queryParams.selectedCategory = selectedCategory;
      } else {
        // Default case for "Everyone"
        // For managers, this shows their team and project members, plus time entries from projects they manage.
        // For admins, all users.
        if (session?.user?.role === 'admin') {
          if (adminAssignedUserIds.length > 0) {
            filterParts.push(`user._ref in $adminAssignedUserIds`);
            queryParams.adminAssignedUserIds = adminAssignedUserIds;
          }
        } else if (session?.user?.role === 'manager') {
          // For managers: include time entries from projects they manage, for team members and project users
          filterParts.push(`$userId in project->assignedUsers[role == "Project Manager"].user._ref && (user._ref in $teamMemberIds || user._ref in $projectUserIds)`);
          queryParams.teamMemberIds = teamMemberIds;
          queryParams.projectUserIds = projectUserIds;
          queryParams.userId = session.user.id;
        } else {
          // If a non-admin/manager has no assigned users, show nothing.
          filterParts.push('false');
        }
      }

      const fullFilterQuery = filterParts.join(' && ');

      const timeEntries = await sanityFetch<TimeEntry[]>(
        {
          query: `*[_type == "timeEntry" && ${fullFilterQuery}] | order(user->firstName asc, project->name asc, date asc) {
            _id,
            user->{_id, firstName, lastName},
            project->{_id, name, assignedUsers[role == "Project Manager"]->{_id}},
            task->{_id, name, isBillable, jobCategory->{_id, name}},
            date,
            hours,
            isApproved,
            isLocked,
            submittedAt
          }`,
          params: queryParams,
        }
      )
      setRawTimeEntries(timeEntries || [])
    } catch (error) {
      console.error('Error fetching pending approvals:', error)
      toast.error('Failed to load pending approvals')
    } finally {
      setLoading(false)
    }
  }

  const groupTimeEntriesForApproval = (entries: TimeEntry[], groupBy: 'week' | 'person' | 'project'): ApprovalEntry[] => {
    const approvalMap: { [key: string]: ApprovalEntry } = {}

    entries.forEach(entry => {
      if (!entry.user) return; 

      const weekStart = startOfWeek(parseISO(entry.date), { weekStartsOn: 1 })
      const weekString = format(weekStart, 'yyyy-MM-dd')
      
      let key: string;
      if (groupBy === 'project') {
        if (!entry.project) return; 
        key = `${entry.user._id}-${entry.project._id}-${weekString}`
      } else {
        key = `${entry.user._id}-${weekString}`
      }

      if (!approvalMap[key]) {
        approvalMap[key] = {
          user: entry.user,
          week: weekString,
          totalBillableHours: 0,
          totalNonBillableHours: 0,
          entries: [],
        }
        if (groupBy === 'project') {
          approvalMap[key].project = entry.project;
        }
      }

      if (entry.task.isBillable) {
        approvalMap[key].totalBillableHours += entry.hours
      } else {
        approvalMap[key].totalNonBillableHours += entry.hours
      }
      approvalMap[key].entries.push(entry)
    })

    return Object.values(approvalMap)
  }

  const pendingApprovals = useMemo(() => {
    return groupTimeEntriesForApproval(rawTimeEntries, groupBy);
  }, [rawTimeEntries, groupBy]);

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

  const groupedByProject = useMemo(() => {
    const groups: { [key: string]: ApprovalEntry[] } = {}
    pendingApprovals.forEach(approval => {
      if(approval.project) {
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

  const groupedByWeek = useMemo(() => {
    const groups: { [key: string]: ApprovalEntry[] } = {}
    pendingApprovals.forEach(approval => {
      const key = approval.week
      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(approval)
    })
    return Object.entries(groups).sort(([keyA, arrA], [keyB, arrB]) => {
      const weekA = parseISO(arrA[0].week).getTime()
      const weekB = parseISO(arrB[0].week).getTime()
      return weekB - weekA // Sort weeks in descending order (latest first)
    })
  }, [pendingApprovals])

  // Flatten all approvals for single table view
  const allApprovalsFlat = useMemo(() => {
    const flat: (ApprovalEntry & { groupKey: string; groupLabel: string })[] = [];
    
    if (groupBy === 'person') {
      groupedByPerson.forEach(([personId, approvals]) => {
        const groupLabel = `${approvals[0].user.firstName} ${approvals[0].user.lastName}`;
        approvals.forEach(approval => {
          flat.push({ ...approval, groupKey: personId, groupLabel });
        });
      });
    } else if (groupBy === 'project') {
      groupedByProject.forEach(([projectId, approvals]) => {
        const groupLabel = approvals[0].project!.name;
        approvals.forEach(approval => {
          flat.push({ ...approval, groupKey: projectId, groupLabel });
        });
      });
    } else {
      groupedByWeek.forEach(([weekString, approvals]) => {
        const groupLabel = `${format(parseISO(weekString), 'MMM d, yyyy')} - ${format(endOfWeek(parseISO(weekString), { weekStartsOn: 1 }), 'MMM d, yyyy')}`;
        approvals.forEach(approval => {
          flat.push({ ...approval, groupKey: weekString, groupLabel });
        });
      });
    }
    
    return flat;
  }, [groupBy, groupedByPerson, groupedByProject, groupedByWeek]);

  useEffect(() => {
    setSelectedCategory(null);
  }, [groupBy]);

  const calculateBillablePercentage = (billableHours: number, totalHours: number) => {
    if (totalHours === 0) {
      return '0.00';
    }
    const percentage = (billableHours / totalHours) * 100;
    return percentage.toFixed(2);
  };

  const approvableEntries = useMemo(() => {
    if (!session?.user?.id) return [];

    const isAdmin = (session.user as any)?.role === 'admin'
    const isSanityAdmin = (session.user as any)?.isSanityAdmin

    if (session.user.role === 'manager') {
      // Managers approve entries for projects they manage
      return rawTimeEntries.filter(entry => 
        entry.project?.assignedUsers?.some((pm: any) => pm && pm._id === session.user.id)
      );
    }
    
    if (isAdmin || isSanityAdmin) {
      // Admins and Sanity admins approve entries for all users they can see (which is all non-admins)
      return rawTimeEntries.filter(entry => entry.user && adminAssignedUserIds.includes(entry.user._id));
    }

    return []; // Default to no entries for other roles
  }, [rawTimeEntries, session, adminAssignedUserIds]);

  const handleApproveAll = async () => {
    const entryIdsToApprove = approvableEntries.map(entry => entry._id);

    if (entryIdsToApprove.length === 0) {
      toast.error('No timesheets to approve.');
      return;
    }

    if (!confirm(`Are you sure you want to approve ${entryIdsToApprove.length} time entries?`)) {
      return;
    }

    try {
      const response = await fetch('/api/time-entries/bulk-approve', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryIds: entryIdsToApprove }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to approve timesheets.');
      }

      toast.success('Selected timesheets approved successfully!');
      fetchPendingApprovals(); // Refresh the list
    } catch (error: any) {
      console.error('Error approving timesheets:', error);
      toast.error(error.message);
    }
  };

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
                const isNewGroup = index === 0 || allApprovalsFlat[index - 1].groupKey !== approval.groupKey;
                const totalHours = approval.totalBillableHours + approval.totalNonBillableHours;
                const billablePercentage = calculateBillablePercentage(approval.totalBillableHours, totalHours);
                const uniqueKey = `${approval.user._id}-${approval.project?._id || 'all'}-${approval.week}-${index}`;

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
                      className={`group cursor-pointer hover:bg-gray-50 transition-colors`}
                      onClick={() => {
                        const projectId = approval.project ? approval.project._id : 'all';
                        router.push(`/admin/time-entries/pending/${approval.user._id}__${projectId}__${approval.week}`)
                      }}
                    >
                      {groupBy === 'person' &&
                        <td className="py-2 px-4 capitalize text-[#2a59c1] underline">{format(parseISO(approval.week), 'MMM d, yyyy')} - {format(endOfWeek(parseISO(approval.week), { weekStartsOn: 1 }), 'MMM d, yyyy')}</td>
                      }
                      {groupBy === 'project' &&
                        <>
                          <td className="py-2 px-4 capitalize text-[#2a59c1] underline">{`${approval.user.firstName} ${approval.user.lastName}`}</td>
                          <td className="py-2 px-4 capitalize text-[#2a59c1] underline">{format(parseISO(approval.week), 'MMM d, yyyy')} - {format(endOfWeek(parseISO(approval.week), { weekStartsOn: 1 }), 'MMM d, yyyy')}</td>
                        </>
                      }
                      {groupBy === 'week' &&
                        <td className="py-2 px-4 capitalize text-[#2a59c1] underline">{`${approval.user.firstName} ${approval.user.lastName}`}</td>
                      }

                      <td className="py-2 px-4 text-right font-semibold">
                        {formatSimpleTime(totalHours)}
                        <span className="text-xs text-gray-500 ml-1">
                          ({billablePercentage}% billable)
                        </span>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4">
        <button
          onClick={handleApproveAll}
          className="btn-primary px-4 py-2 text-sm font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50"
          disabled={loading || approvableEntries.length === 0}
        >
          Approve Timesheets
        </button>
      </div>
          </div>
        )
      }
