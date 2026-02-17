'use client'

import { Suspense, useState, useEffect, useMemo, useRef } from 'react'
import DashboardLayout from '@/components/layouts/DashboardLayout'
import { useSession } from 'next-auth/react'
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, startOfMonth, endOfMonth, addMonths, subMonths, startOfYear, endOfYear, addYears, subYears } from 'date-fns'
import { sanityFetch } from '@/lib/sanity'
import { USER_TIME_REPORT_QUERY, TIME_REPORT_QUERY, MANAGER_TEAM_MEMBERS_QUERY, TEAM_TIME_REPORT_QUERY, TIME_REPORT_QUERY_FOR_CLIENT, TIME_REPORT_QUERY_FOR_PROJECT, TIME_REPORT_QUERY_FOR_TASK, TIMESHEET_REPORT_QUERY, TIMESHEET_REPORT_QUERY_FOR_CLIENT, TIMESHEET_REPORT_QUERY_FOR_PROJECT, TIMESHEET_REPORT_QUERY_FOR_TASK, USER_TIMESHEET_REPORT_QUERY, MANAGER_TIMESHEET_REPORT_QUERY } from '@/lib/queries'
import { useRouter, useSearchParams } from 'next/navigation'
import SubTabButton from '@/components/layouts/report/time/SubTabButton'
import SubTabContent from '@/components/layouts/report/time/SubTabContent'
import ReportDateNavigation from '@/components/layouts/report/time/ReportDateNavigation'
import DateFilter from '@/components/layouts/report/time/DateFilter'
import ReportStatsData from '@/components/layouts/report/time/ReportStatsData'
import { FilterActiveProject, FilterExport, FilterPrint } from '@/components/layouts/report/time/SubTabFilters'
import { SaveReport } from '@/components/layouts/report/time/SaveReport'

function ReportsPageContent() {
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // Extract and validate filter parameters from URL
  const clientId = (() => {
    const id = searchParams.get('client_id')
    return id && id !== 'unknown' && id.trim() !== '' ? id : null
  })()
  const projectId = (() => {
    const id = searchParams.get('project_id')
    return id && id !== 'unknown' && id.trim() !== '' ? id : null
  })()
  const taskId = (() => {
    const id = searchParams.get('task_id')
    return id && id !== 'unknown' && id.trim() !== '' ? id : null
  })()
  const userId = (() => {
    const id = searchParams.get('user_id')
    return id && id !== 'unknown' && id.trim() !== '' ? id : null
  })()
  const tab = searchParams.get('tab')
  
  const validTabs: ('clients' | 'projects' | 'tasks' | 'team')[] = ['clients', 'projects', 'tasks', 'team']
  
  // Determine the correct tab based on filters
  const getTabFromFilters = (): 'clients' | 'projects' | 'tasks' | 'team' => {
    if (clientId) {
      return 'projects'
    } else if (projectId) {
      return 'tasks'
    } else if (taskId) {
      return 'projects'
    } else if (userId) {
      return 'projects'
    } else {
      // No filter active, use URL tab parameter or default to 'clients'
      const tabFromUrl = tab as 'clients' | 'projects' | 'tasks' | 'team' | null
      return tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : 'clients'
    }
  }
  
  // Initialize activeSubTab based on active filters or URL tab parameter
  const [activeSubTab, setActiveSubTab] = useState<'clients' | 'projects' | 'tasks' | 'team'>(getTabFromFilters)
  
  // Sync URL tab parameter on initial load based on filters
  const initialTabSyncDoneRef = useRef(false)
  useEffect(() => {
    if (initialTabSyncDoneRef.current) return
    initialTabSyncDoneRef.current = true
    
    const determinedTab = getTabFromFilters()
    const currentTabInUrl = searchParams.get('tab')
    
    // Update URL if tab doesn't match the determined tab
    if (currentTabInUrl !== determinedTab) {
      const params = new URLSearchParams(searchParams.toString())
      params.set('tab', determinedTab)
      router.replace(`?${params.toString()}`, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Get filter type from URL
  const filterKind = (searchParams.get('kind') as 'week' | 'month' | 'year' | 'all' | 'custom') || 'week'
  
  // Helper to get default date range based on filter kind
  const getDefaultDateRange = (kind: string, baseDate: Date = new Date()) => {
    switch (kind) {
      case 'month':
        return { start: startOfMonth(baseDate), end: endOfMonth(baseDate) }
      case 'year':
        return { start: startOfYear(baseDate), end: endOfYear(baseDate) }
      case 'all':
        return { start: new Date('2020-01-01'), end: new Date() }
      case 'custom':
        return { start: startOfWeek(baseDate, { weekStartsOn: 1 }), end: endOfWeek(baseDate, { weekStartsOn: 1 }) }
      case 'week':
      default:
        return { start: startOfWeek(baseDate, { weekStartsOn: 1 }), end: endOfWeek(baseDate, { weekStartsOn: 1 }) }
    }
  }

  // Initialize report dates from URL or use defaults based on filter kind
  const [reportStartDate, setReportStartDate] = useState<Date>(() => {
    const startDateParam = searchParams.get('from')
    if (startDateParam) {
      const parsed = new Date(startDateParam)
      if (!isNaN(parsed.getTime())) return parsed
    }
    return getDefaultDateRange(filterKind).start
  })
  
  const [reportEndDate, setReportEndDate] = useState<Date>(() => {
    const endDateParam = searchParams.get('till')
    if (endDateParam) {
      const parsed = new Date(endDateParam)
      if (!isNaN(parsed.getTime())) return parsed
    }
    return getDefaultDateRange(filterKind).end
  })

  const [timeEntries, setTimeEntries] = useState<any[]>([])
  const [timesheetEntries, setTimesheetEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [subtabLoading, setSubtabLoading] = useState(false)
  
  // For managers: store their team member IDs
  const [teamMemberIds, setTeamMemberIds] = useState<string[]>([])
  const [teamMembersLoaded, setTeamMembersLoaded] = useState(false)
  
  // Fetch team members for managers
  useEffect(() => {
    const fetchTeamMembers = async () => {
      const userRole = session?.user?.role
      const userId = session?.user?.id
      
      if (userRole === 'manager' && userId) {
        try {
          const teams = await sanityFetch<{ members: { _id: string }[] }[]>({
            query: MANAGER_TEAM_MEMBERS_QUERY,
            params: { managerId: userId }
          })
          
          const memberIds: string[] = []
          teams?.forEach(team => {
            team.members?.forEach(member => {
              if (member._id && !memberIds.includes(member._id)) {
                memberIds.push(member._id)
              }
            })
          })
          
          // Include the manager themselves
          if (!memberIds.includes(userId)) {
            memberIds.push(userId)
          }
          
          setTeamMemberIds(memberIds)
        } catch (error) {
          console.error('Error fetching team members:', error)
        }
      }
      setTeamMembersLoaded(true)
    }
    
    if (session?.user?.id) {
      fetchTeamMembers()
    }
  }, [session?.user?.id, session?.user?.role])
  
  // Initialize showActiveProjectsOnly from URL or localStorage
  const [showActiveProjectsOnly, setShowActiveProjectsOnly] = useState<boolean>(() => {
    const urlValue = searchParams.get('active_projects')
    if (urlValue !== null) {
      return urlValue === 'true'
    }
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('reportActiveProjectsOnly')
      return stored === 'true'
    }
    return false
  })

  // Track if we're currently restoring params (to prevent loops)
  const isRestoringRef = useRef(false)
  
  // Restore URL params from sessionStorage when URL has no params
  useEffect(() => {
    if (isRestoringRef.current) return
    
    const currentParams = searchParams.toString()
    
    if (!currentParams || currentParams === '') {
      const savedParams = sessionStorage.getItem('userReportsPageParams')
      if (savedParams) {
        isRestoringRef.current = true
        router.replace(`?${savedParams}`, { scroll: false })
        setTimeout(() => {
          isRestoringRef.current = false
        }, 100)
        return
      }
    }
  }, [searchParams, router])
  
  // Update URL with reportStartDate and reportEndDate when dates change
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    const currentStartDate = params.get('from')
    const currentEndDate = params.get('till')
    const newStartDate = format(reportStartDate, 'yyyy-MM-dd')
    const newEndDate = format(reportEndDate, 'yyyy-MM-dd')
    
    if (currentStartDate !== newStartDate || currentEndDate !== newEndDate) {
      if (!params.has('tab')) {
        params.set('tab', 'clients')
      }
      if (!params.has('kind')) {
        params.set('kind', 'week')
      }
      params.set('from', newStartDate)
      params.set('till', newEndDate)
      params.set('active_projects', showActiveProjectsOnly ? 'true' : 'false')
      router.push(`?${params.toString()}`, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportStartDate, reportEndDate])

  // Sync report dates when URL params change (from DateFilter selection)
  useEffect(() => {
    const fromParam = searchParams.get('from')
    const tillParam = searchParams.get('till')
    
    if (fromParam) {
      const parsed = new Date(fromParam)
      if (!isNaN(parsed.getTime()) && format(reportStartDate, 'yyyy-MM-dd') !== fromParam) {
        setReportStartDate(parsed)
      }
    }
    
    if (tillParam) {
      const parsed = new Date(tillParam)
      if (!isNaN(parsed.getTime()) && format(reportEndDate, 'yyyy-MM-dd') !== tillParam) {
        setReportEndDate(parsed)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])
  
  // Track if user has manually changed tab (to avoid overriding their choice)
  const userChangedTabRef = useRef(false)
  
  // Update activeSubTab when URL filter parameters change
  useEffect(() => {
    if (userChangedTabRef.current) return
    
    if (clientId) {
      setActiveSubTab('projects')
    } else if (projectId) {
      setActiveSubTab('tasks')
    } else if (taskId) {
      setActiveSubTab('projects')
    } else if (userId) {
      setActiveSubTab('projects')
    } else {
      setActiveSubTab('clients')
    }
  }, [clientId, projectId, taskId, userId, searchParams, validTabs])

  // Reset the userChangedTabRef when filters change (so filter-based tab switching works again)
  useEffect(() => {
    userChangedTabRef.current = false
  }, [clientId, projectId, taskId, userId])

  // Save URL params to sessionStorage whenever they change
  useEffect(() => {
    const currentParams = searchParams.toString()
    if (currentParams && currentParams !== '') {
      sessionStorage.setItem('userReportsPageParams', currentParams)
    }
  }, [searchParams])

  // Handler to update both state and URL
  const handleTabChange = (tab: 'clients' | 'projects' | 'tasks' | 'team') => {
    setSubtabLoading(true)
    userChangedTabRef.current = true
    setActiveSubTab(tab)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    router.push(`?${params.toString()}`, { scroll: false })
  }

  // Turn off subtab loading after tab change renders with a smooth delay
  useEffect(() => {
    if (subtabLoading) {
      const timer = setTimeout(() => {
        setSubtabLoading(false)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [activeSubTab])

  // Handler to update active projects filter
  const handleActiveProjectsChange = (checked: boolean) => {
    setShowActiveProjectsOnly(checked)
    
    const params = new URLSearchParams(searchParams.toString())
    if (checked) {
      params.set('active_projects', 'true')
    } else {
      params.delete('active_projects')
    }
    router.push(`?${params.toString()}`, { scroll: false })
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('reportActiveProjectsOnly', String(checked))
    }
  }

  // Sync URL with localStorage value on initial load
  const activeProjectsSyncDoneRef = useRef(false)
  useEffect(() => {
    if (activeProjectsSyncDoneRef.current) return
    activeProjectsSyncDoneRef.current = true
    
    const urlValue = searchParams.get('active_projects')
    if (urlValue === null && typeof window !== 'undefined') {
      const stored = localStorage.getItem('reportActiveProjectsOnly')
      if (stored === 'true') {
        const params = new URLSearchParams(searchParams.toString())
        params.set('active_projects', 'true')
        router.replace(`?${params.toString()}`, { scroll: false })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync showActiveProjectsOnly when URL changes
  useEffect(() => {
    const urlValue = searchParams.get('active_projects')
    if (urlValue !== null) {
      const newValue = urlValue === 'true'
      setShowActiveProjectsOnly(newValue)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Sync activeSubTab from URL
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab') as 'clients' | 'projects' | 'tasks' | 'team' | null
    if (tabFromUrl && validTabs.includes(tabFromUrl)) {
      setActiveSubTab(tabFromUrl)
    }
  }, [searchParams, validTabs])

  useEffect(() => {
    // Wait for team members to load for managers before fetching entries
    if (session?.user?.id && teamMembersLoaded) {
      fetchTimeEntries()
    }
  }, [session, reportStartDate, reportEndDate, teamMembersLoaded, teamMemberIds, clientId, projectId, taskId, userId])

  const fetchTimeEntries = async () => {
    if (!session?.user?.id) return
    
    const userRole = session.user.role
    const currentUserId = session.user.id
    const isRegularUser = userRole === 'user'
    
    setLoading(true)
    try {
      const startDate = format(reportStartDate, 'yyyy-MM-dd')
      const endDate = format(reportEndDate, 'yyyy-MM-dd')
      
      let entries: any[] = []
      let timesheets: any[] = []
      
      // Check for URL filter parameters first
      if (clientId) {
        [entries, timesheets] = await Promise.all([
          sanityFetch<any[]>({
            query: TIME_REPORT_QUERY_FOR_CLIENT,
            params: { startDate, endDate, clientId },
          }),
          sanityFetch<any[]>({
            query: TIMESHEET_REPORT_QUERY_FOR_CLIENT,
            params: { startDate, endDate, clientId },
          }),
        ])
      } else if (projectId) {
        [entries, timesheets] = await Promise.all([
          sanityFetch<any[]>({
            query: TIME_REPORT_QUERY_FOR_PROJECT,
            params: { startDate, endDate, projectId },
          }),
          sanityFetch<any[]>({
            query: TIMESHEET_REPORT_QUERY_FOR_PROJECT,
            params: { startDate, endDate, projectId },
          }),
        ])
      } else if (taskId) {
        [entries, timesheets] = await Promise.all([
          sanityFetch<any[]>({
            query: TIME_REPORT_QUERY_FOR_TASK,
            params: { startDate, endDate, taskId },
          }),
          sanityFetch<any[]>({
            query: TIMESHEET_REPORT_QUERY_FOR_TASK,
            params: { startDate, endDate, taskId },
          }),
        ])
      } else if (userId) {
        [entries, timesheets] = await Promise.all([
          sanityFetch<any[]>({
            query: USER_TIME_REPORT_QUERY,
            params: { startDate, endDate, userId },
          }),
          sanityFetch<any[]>({
            query: USER_TIMESHEET_REPORT_QUERY,
            params: { startDate, endDate, userId },
          }),
        ])
      } else if (userRole === 'admin') {
        [entries, timesheets] = await Promise.all([
          sanityFetch<any[]>({
            query: TIME_REPORT_QUERY,
            params: { startDate, endDate },
          }),
          sanityFetch<any[]>({
            query: TIMESHEET_REPORT_QUERY,
            params: { startDate, endDate },
          }),
        ])
      } else if (userRole === 'manager' && teamMemberIds.length > 0) {
        [entries, timesheets] = await Promise.all([
          sanityFetch<any[]>({
            query: TEAM_TIME_REPORT_QUERY,
            params: { userIds: teamMemberIds, startDate, endDate },
          }),
          sanityFetch<any[]>({
            query: MANAGER_TIMESHEET_REPORT_QUERY,
            params: { startDate, endDate, managerId: currentUserId },
          }),
        ])
      } else {
        [entries, timesheets] = await Promise.all([
          sanityFetch<any[]>({
            query: USER_TIME_REPORT_QUERY,
            params: { userId: currentUserId, startDate, endDate },
          }),
          sanityFetch<any[]>({
            query: USER_TIMESHEET_REPORT_QUERY,
            params: { startDate, endDate, userId: currentUserId },
          }),
        ])
      }
      
      // For regular users with URL filters, filter to only show their own entries
      if (isRegularUser && (clientId || projectId || taskId)) {
        entries = entries.filter(entry => entry.user?._id === currentUserId)
        timesheets = (timesheets || []).filter((t: any) => t.user?._id === currentUserId)
      }
      
      // For managers with URL filters, filter to only show their team's entries
      if (userRole === 'manager' && teamMemberIds.length > 0 && (clientId || projectId || taskId)) {
        entries = entries.filter(entry => teamMemberIds.includes(entry.user?._id))
        timesheets = (timesheets || []).filter((t: any) => teamMemberIds.includes(t.user?._id))
      }
      
      setTimeEntries(entries || [])
      setTimesheetEntries(timesheets || [])
    } catch (error) {
      console.error('Error fetching time entries:', error)
    } finally {
      setLoading(false)
    }
  }

  // Navigate to previous period based on filter type
  const handlePreviousPeriod = () => {
    let newStart: Date
    let newEnd: Date
    
    switch (filterKind) {
      case 'month':
        newStart = startOfMonth(subMonths(reportStartDate, 1))
        newEnd = endOfMonth(subMonths(reportStartDate, 1))
        break
      case 'year':
        newStart = startOfYear(subYears(reportStartDate, 1))
        newEnd = endOfYear(subYears(reportStartDate, 1))
        break
      case 'week':
      default:
        const prevWeek = subWeeks(reportStartDate, 1)
        newStart = startOfWeek(prevWeek, { weekStartsOn: 1 })
        newEnd = endOfWeek(prevWeek, { weekStartsOn: 1 })
        break
    }
    
    setReportStartDate(newStart)
    setReportEndDate(newEnd)
  }

  // Navigate to next period based on filter type
  const handleNextPeriod = () => {
    let newStart: Date
    let newEnd: Date
    
    switch (filterKind) {
      case 'month':
        newStart = startOfMonth(addMonths(reportStartDate, 1))
        newEnd = endOfMonth(addMonths(reportStartDate, 1))
        break
      case 'year':
        newStart = startOfYear(addYears(reportStartDate, 1))
        newEnd = endOfYear(addYears(reportStartDate, 1))
        break
      case 'week':
      default:
        const nextWeek = addWeeks(reportStartDate, 1)
        newStart = startOfWeek(nextWeek, { weekStartsOn: 1 })
        newEnd = endOfWeek(nextWeek, { weekStartsOn: 1 })
        break
    }
    
    setReportStartDate(newStart)
    setReportEndDate(newEnd)
  }

  // Return to current period based on filter type
  const handleReturnToCurrentPeriod = () => {
    const { start, end } = getDefaultDateRange(filterKind)
    setReportStartDate(start)
    setReportEndDate(end)
  }

  // Helper function to check if a project is active
  const isProjectActive = (project: any) => {
    return (project?.isActive ?? true) && !(project?.isArchived ?? false)
  }

  // Flatten timesheet entries to individual entries with user info
  const flattenedTimesheetEntries = useMemo(() => {
    const flattened: any[] = []
    timesheetEntries.forEach(timesheet => {
      if (timesheet.entries && Array.isArray(timesheet.entries)) {
        timesheet.entries.forEach((entry: any) => {
          flattened.push({
            ...entry,
            user: timesheet.user,
            timesheetStatus: timesheet.status,
          })
        })
      }
    })
    return flattened
  }, [timesheetEntries])

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const filteredEntries = showActiveProjectsOnly
      ? timeEntries.filter(entry => isProjectActive(entry.project))
      : timeEntries
    
    const totalHours = filteredEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0)
    const billableHours = filteredEntries
      .filter(entry => entry.isBillable)
      .reduce((sum, entry) => sum + (entry.hours || 0), 0)
    const nonBillableHours = totalHours - billableHours
    const billablePercentage = totalHours > 0 ? (billableHours / totalHours) * 100 : 0

    const filteredTimesheetEntries = showActiveProjectsOnly
      ? flattenedTimesheetEntries.filter(entry => isProjectActive(entry.project))
      : flattenedTimesheetEntries
    const timesheetHours = filteredTimesheetEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0)
    const timesheetBillableHours = filteredTimesheetEntries
      .filter(entry => entry.isBillable)
      .reduce((sum, entry) => sum + (entry.hours || 0), 0)
    const timesheetNonBillableHours = timesheetHours - timesheetBillableHours
    const timesheetBillablePercentage = timesheetHours > 0 ? (timesheetBillableHours / timesheetHours) * 100 : 0

    return {
      totalHours,
      billableHours,
      nonBillableHours,
      billablePercentage,
      timesheetHours,
      timesheetBillableHours,
      timesheetNonBillableHours,
      timesheetBillablePercentage,
    }
  }, [timeEntries, flattenedTimesheetEntries, showActiveProjectsOnly])

  // Group data by Clients
  const clientsData = useMemo(() => {
    const grouped: Record<string, { name: string; hours: number; billableHours: number; timesheetHours: number; timesheetBillableHours: number; clientId: string }> = {}
    
    const filteredEntries = showActiveProjectsOnly 
      ? timeEntries.filter(entry => isProjectActive(entry.project))
      : timeEntries
    
    filteredEntries.forEach(entry => {
      const cid = entry.project?.client?._id || 'unknown'
      const clientName = entry.project?.client?.name || 'Unknown Client'
      
      if (!grouped[cid]) {
        grouped[cid] = { name: clientName, hours: 0, billableHours: 0, timesheetHours: 0, timesheetBillableHours: 0, clientId: cid }
      }
      
      grouped[cid].hours += entry.hours || 0
      if (entry.isBillable) {
        grouped[cid].billableHours += entry.hours || 0
      }
    })
    
    const filteredTimesheetEntries = showActiveProjectsOnly
      ? flattenedTimesheetEntries.filter(entry => isProjectActive(entry.project))
      : flattenedTimesheetEntries
    filteredTimesheetEntries.forEach(entry => {
      const cid = entry.project?.client?._id || 'unknown'
      const clientName = entry.project?.client?.name || 'Unknown Client'
      
      if (!grouped[cid]) {
        grouped[cid] = { name: clientName, hours: 0, billableHours: 0, timesheetHours: 0, timesheetBillableHours: 0, clientId: cid }
      }
      
      grouped[cid].timesheetHours += entry.hours || 0
      if (entry.isBillable) {
        grouped[cid].timesheetBillableHours += entry.hours || 0
      }
    })
    
    return Object.values(grouped).sort((a, b) => b.hours - a.hours)
  }, [timeEntries, flattenedTimesheetEntries, showActiveProjectsOnly])

  // Group data by Projects
  const projectsData = useMemo(() => {
    const grouped: Record<string, { name: string; clientName: string; hours: number; billableHours: number; timesheetHours: number; timesheetBillableHours: number; clientId: string; projectId: string; isActive: boolean }> = {}
    
    timeEntries.forEach(entry => {
      const pid = entry.project?._id || 'unknown'
      const projectName = entry.project?.name || 'Unknown Project'
      const clientName = entry.project?.client?.name || 'Unknown Client'
      const clientId = entry.project?.client?._id || 'unknown'
      const projectIsActive = isProjectActive(entry.project)
      
      if (!grouped[pid]) {
        grouped[pid] = { name: projectName, clientName: clientName, hours: 0, billableHours: 0, timesheetHours: 0, timesheetBillableHours: 0, clientId: clientId, projectId: pid, isActive: projectIsActive }
      }
      
      grouped[pid].hours += entry.hours || 0
      if (entry.isBillable) {
        grouped[pid].billableHours += entry.hours || 0
      }
    })
    
    flattenedTimesheetEntries.forEach(entry => {
      const pid = entry.project?._id || 'unknown'
      const projectName = entry.project?.name || 'Unknown Project'
      const clientName = entry.project?.client?.name || 'Unknown Client'
      const clientId = entry.project?.client?._id || 'unknown'
      const projectIsActive = isProjectActive(entry.project)
      
      if (!grouped[pid]) {
        grouped[pid] = { name: projectName, clientName: clientName, hours: 0, billableHours: 0, timesheetHours: 0, timesheetBillableHours: 0, clientId: clientId, projectId: pid, isActive: projectIsActive }
      }
      
      grouped[pid].timesheetHours += entry.hours || 0
      if (entry.isBillable) {
        grouped[pid].timesheetBillableHours += entry.hours || 0
      }
    })
    
    let result = Object.values(grouped)
    
    if (showActiveProjectsOnly) {
      result = result.filter(project => project.isActive)
    }
    
    return result.sort((a, b) => b.hours - a.hours)
  }, [timeEntries, flattenedTimesheetEntries, showActiveProjectsOnly])

  // Group data by Tasks (with users who worked on each task)
  const tasksData = useMemo(() => {
    const grouped: Record<string, { 
      name: string; 
      hours: number; 
      billableHours: number; 
      timesheetHours: number;
      timesheetBillableHours: number;
      taskId: string;
      users: { 
        userId: string; 
        name: string; 
        firstName: string;
        lastName: string;
        hours: number; 
        billableHours: number;
        timesheetHours: number;
        timesheetBillableHours: number;
      }[] 
    }> = {}
    
    const filteredEntries = showActiveProjectsOnly 
      ? timeEntries.filter(entry => isProjectActive(entry.project))
      : timeEntries
    
    filteredEntries.forEach(entry => {
      const tid = entry.task?._id || 'unknown'
      const taskName = entry.task?.name || 'Unknown Task'
      const odooUserId = entry.user?._id || 'unknown'
      const userName = entry.user 
        ? `${entry.user.firstName || ''} ${entry.user.lastName || ''}`.trim() || 'Unknown User'
        : 'Unknown User'
      const firstName = entry.user?.firstName || ''
      const lastName = entry.user?.lastName || ''
      
      if (!grouped[tid]) {
        grouped[tid] = { 
          name: taskName, 
          hours: 0, 
          billableHours: 0, 
          timesheetHours: 0,
          timesheetBillableHours: 0,
          taskId: tid,
          users: []
        }
      }
      
      grouped[tid].hours += entry.hours || 0
      if (entry.isBillable) {
        grouped[tid].billableHours += entry.hours || 0
      }
      
      let userInTask = grouped[tid].users.find(u => u.userId === odooUserId)
      if (!userInTask) {
        userInTask = { 
          userId: odooUserId, 
          name: userName, 
          firstName,
          lastName,
          hours: 0, 
          billableHours: 0,
          timesheetHours: 0,
          timesheetBillableHours: 0
        }
        grouped[tid].users.push(userInTask)
      }
      
      userInTask.hours += entry.hours || 0
      if (entry.isBillable) {
        userInTask.billableHours += entry.hours || 0
      }
    })
    
    const filteredTimesheetEntries = showActiveProjectsOnly
      ? flattenedTimesheetEntries.filter(entry => isProjectActive(entry.project))
      : flattenedTimesheetEntries
    
    filteredTimesheetEntries.forEach(entry => {
      const tid = entry.task?._id || 'unknown'
      const taskName = entry.task?.name || 'Unknown Task'
      const odooUserId = entry.user?._id || 'unknown'
      const userName = entry.user 
        ? `${entry.user.firstName || ''} ${entry.user.lastName || ''}`.trim() || 'Unknown User'
        : 'Unknown User'
      const firstName = entry.user?.firstName || ''
      const lastName = entry.user?.lastName || ''
      
      if (!grouped[tid]) {
        grouped[tid] = { 
          name: taskName, 
          hours: 0, 
          billableHours: 0, 
          timesheetHours: 0,
          timesheetBillableHours: 0,
          taskId: tid,
          users: []
        }
      }
      
      grouped[tid].timesheetHours += entry.hours || 0
      if (entry.isBillable) {
        grouped[tid].timesheetBillableHours += entry.hours || 0
      }
      
      let userInTask = grouped[tid].users.find(u => u.userId === odooUserId)
      if (!userInTask) {
        userInTask = { 
          userId: odooUserId, 
          name: userName, 
          firstName,
          lastName,
          hours: 0, 
          billableHours: 0,
          timesheetHours: 0,
          timesheetBillableHours: 0
        }
        grouped[tid].users.push(userInTask)
      }
      
      userInTask.timesheetHours += entry.hours || 0
      if (entry.isBillable) {
        userInTask.timesheetBillableHours += entry.hours || 0
      }
    })
    
    Object.values(grouped).forEach(task => {
      task.users.sort((a, b) => b.hours - a.hours)
    })
    
    return Object.values(grouped).sort((a, b) => b.hours - a.hours)
  }, [timeEntries, flattenedTimesheetEntries, showActiveProjectsOnly])

  // State for cached project/client/task/user info (to avoid hydration mismatch)
  const [cachedProjectInfo, setCachedProjectInfo] = useState<{ name: string; clientName: string; clientId: string } | null>(null)
  const [cachedClientInfo, setCachedClientInfo] = useState<{ name: string; clientId: string } | null>(null)
  const [cachedTaskInfo, setCachedTaskInfo] = useState<{ name: string; id: string } | null>(null)
  const [cachedUserInfo, setCachedUserInfo] = useState<{ name: string; id: string } | null>(null)

  // Get current project info from time entries
  const projectInfoFromEntries = useMemo(() => {
    if (!projectId) return null
    const entry = timeEntries.find(e => e.project?._id === projectId)
    if (!entry) return null
    return {
      name: entry.project?.name || 'Unknown Project',
      clientName: entry.project?.client?.name || 'Unknown Client',
      clientId: entry.project?.client?._id || 'unknown'
    }
  }, [projectId, timeEntries])

  // Get current client info from time entries
  const clientInfoFromEntries = useMemo(() => {
    if (!clientId) return null
    const entry = timeEntries.find(e => e.project?.client?._id === clientId)
    if (!entry) return null
    return {
      name: entry.project?.client?.name || 'Unknown Client',
      clientId: entry.project?.client?._id || 'unknown'
    }
  }, [clientId, timeEntries])

  // Get current task info from time entries
  const taskInfoFromEntries = useMemo(() => {
    if (!taskId) return null
    const entry = timeEntries.find(e => e.task?._id === taskId)
    if (!entry) return null
    return {
      name: entry.task?.name || 'Unknown Task',
      id: entry.task?._id || 'unknown'
    }
  }, [taskId, timeEntries])

  // Get current user info from time entries
  const userInfoFromEntries = useMemo(() => {
    if (!userId) return null
    const entry = timeEntries.find(e => e.user?._id === userId)
    if (!entry) return null
    const userName = entry.user
      ? `${entry.user.firstName || ''} ${entry.user.lastName || ''}`.trim() || 'Unknown User'
      : 'Unknown User'
    return {
      name: userName,
      id: entry.user?._id || 'unknown'
    }
  }, [userId, timeEntries])

  // Load cached info from localStorage on mount and when IDs change
  useEffect(() => {
    if (projectId) {
      try {
        const storedProjects = JSON.parse(localStorage.getItem('reportProjectsCache') || '{}')
        if (storedProjects[projectId]) {
          setCachedProjectInfo(storedProjects[projectId])
        }
      } catch (e) {
        console.error('Error reading project info from localStorage:', e)
      }
    } else {
      setCachedProjectInfo(null)
    }
  }, [projectId])

  useEffect(() => {
    if (clientId) {
      try {
        const storedClients = JSON.parse(localStorage.getItem('reportClientsCache') || '{}')
        if (storedClients[clientId]) {
          setCachedClientInfo(storedClients[clientId])
        }
      } catch (e) {
        console.error('Error reading client info from localStorage:', e)
      }
    } else {
      setCachedClientInfo(null)
    }
  }, [clientId])

  useEffect(() => {
    if (taskId) {
      try {
        const storedTasks = JSON.parse(localStorage.getItem('reportTasksCache') || '{}')
        if (storedTasks[taskId]) {
          setCachedTaskInfo(storedTasks[taskId])
        }
      } catch (e) {
        console.error('Error reading task info from localStorage:', e)
      }
    } else {
      setCachedTaskInfo(null)
    }
  }, [taskId])

  useEffect(() => {
    if (userId) {
      try {
        const storedUsers = JSON.parse(localStorage.getItem('reportUsersCache') || '{}')
        if (storedUsers[userId]) {
          setCachedUserInfo(storedUsers[userId])
        }
      } catch (e) {
        console.error('Error reading user info from localStorage:', e)
      }
    } else {
      setCachedUserInfo(null)
    }
  }, [userId])

  // Save to localStorage when we get info from time entries
  useEffect(() => {
    if (projectId && projectInfoFromEntries) {
      try {
        const storedProjects = JSON.parse(localStorage.getItem('reportProjectsCache') || '{}')
        storedProjects[projectId] = projectInfoFromEntries
        localStorage.setItem('reportProjectsCache', JSON.stringify(storedProjects))
        setCachedProjectInfo(projectInfoFromEntries)
      } catch (e) {
        console.error('Error saving project info to localStorage:', e)
      }
    }
  }, [projectId, projectInfoFromEntries])

  useEffect(() => {
    if (clientId && clientInfoFromEntries) {
      try {
        const storedClients = JSON.parse(localStorage.getItem('reportClientsCache') || '{}')
        storedClients[clientId] = clientInfoFromEntries
        localStorage.setItem('reportClientsCache', JSON.stringify(storedClients))
        setCachedClientInfo(clientInfoFromEntries)
      } catch (e) {
        console.error('Error saving client info to localStorage:', e)
      }
    }
  }, [clientId, clientInfoFromEntries])

  useEffect(() => {
    if (taskId && taskInfoFromEntries) {
      try {
        const storedTasks = JSON.parse(localStorage.getItem('reportTasksCache') || '{}')
        storedTasks[taskId] = taskInfoFromEntries
        localStorage.setItem('reportTasksCache', JSON.stringify(storedTasks))
        setCachedTaskInfo(taskInfoFromEntries)
      } catch (e) {
        console.error('Error saving task info to localStorage:', e)
      }
    }
  }, [taskId, taskInfoFromEntries])

  useEffect(() => {
    if (userId && userInfoFromEntries) {
      try {
        const storedUsers = JSON.parse(localStorage.getItem('reportUsersCache') || '{}')
        storedUsers[userId] = userInfoFromEntries
        localStorage.setItem('reportUsersCache', JSON.stringify(storedUsers))
        setCachedUserInfo(userInfoFromEntries)
      } catch (e) {
        console.error('Error saving user info to localStorage:', e)
      }
    }
  }, [userId, userInfoFromEntries])

  // Use info from entries if available, otherwise fall back to cached
  const currentProjectInfo = projectInfoFromEntries || cachedProjectInfo
  const currentClientInfo = clientInfoFromEntries || cachedClientInfo
  const currentTaskInfo = taskInfoFromEntries || cachedTaskInfo
  const currentUserInfo = userInfoFromEntries || cachedUserInfo

  // Group data by Team (Users) - for single user this shows their own data
  const teamData = useMemo(() => {
    const grouped: Record<string, { 
      name: string; 
      hours: number; 
      billableHours: number; 
      timesheetHours: number;
      timesheetBillableHours: number;
      userId: string;
      tasks: {
        taskId: string;
        name: string;
        hours: number;
        billableHours: number;
        timesheetHours: number;
        timesheetBillableHours: number;
      }[]
    }> = {}
    
    const filteredEntries = showActiveProjectsOnly 
      ? timeEntries.filter(entry => isProjectActive(entry.project))
      : timeEntries
    
    filteredEntries.forEach(entry => {
      const uid = entry.user?._id || 'unknown'
      const userName = entry.user 
        ? `${entry.user.firstName || ''} ${entry.user.lastName || ''}`.trim() || 'Unknown User'
        : 'Unknown User'
      const taskId = entry.task?._id || 'unknown'
      const taskName = entry.task?.name || 'Unknown Task'
      
      if (!grouped[uid]) {
        grouped[uid] = { 
          name: userName, 
          hours: 0, 
          billableHours: 0, 
          timesheetHours: 0,
          timesheetBillableHours: 0,
          userId: uid,
          tasks: []
        }
      }
      
      grouped[uid].hours += entry.hours || 0
      if (entry.isBillable) {
        grouped[uid].billableHours += entry.hours || 0
      }
      
      let taskForUser = grouped[uid].tasks.find(t => t.taskId === taskId)
      if (!taskForUser) {
        taskForUser = {
          taskId,
          name: taskName,
          hours: 0,
          billableHours: 0,
          timesheetHours: 0,
          timesheetBillableHours: 0
        }
        grouped[uid].tasks.push(taskForUser)
      }
      
      taskForUser.hours += entry.hours || 0
      if (entry.isBillable) {
        taskForUser.billableHours += entry.hours || 0
      }
    })
    
    const filteredTimesheetEntries = showActiveProjectsOnly
      ? flattenedTimesheetEntries.filter(entry => isProjectActive(entry.project))
      : flattenedTimesheetEntries
    
    filteredTimesheetEntries.forEach(entry => {
      const uid = entry.user?._id || 'unknown'
      const userName = entry.user 
        ? `${entry.user.firstName || ''} ${entry.user.lastName || ''}`.trim() || 'Unknown User'
        : 'Unknown User'
      const taskId = entry.task?._id || 'unknown'
      const taskName = entry.task?.name || 'Unknown Task'
      
      if (!grouped[uid]) {
        grouped[uid] = { 
          name: userName, 
          hours: 0, 
          billableHours: 0, 
          timesheetHours: 0,
          timesheetBillableHours: 0,
          userId: uid,
          tasks: []
        }
      }
      
      grouped[uid].timesheetHours += entry.hours || 0
      if (entry.isBillable) {
        grouped[uid].timesheetBillableHours += entry.hours || 0
      }
      
      let taskForUser = grouped[uid].tasks.find(t => t.taskId === taskId)
      if (!taskForUser) {
        taskForUser = {
          taskId,
          name: taskName,
          hours: 0,
          billableHours: 0,
          timesheetHours: 0,
          timesheetBillableHours: 0
        }
        grouped[uid].tasks.push(taskForUser)
      }
      
      taskForUser.timesheetHours += entry.hours || 0
      if (entry.isBillable) {
        taskForUser.timesheetBillableHours += entry.hours || 0
      }
    })
    
    Object.values(grouped).forEach(user => {
      user.tasks.sort((a, b) => b.hours - a.hours)
    })
    
    return Object.values(grouped).sort((a, b) => b.hours - a.hours)
  }, [timeEntries, flattenedTimesheetEntries, showActiveProjectsOnly])

  // Get current tab data
  const getCurrentTabData = () => {
    switch (activeSubTab) {
      case 'clients':
        return clientsData
      case 'projects':
        return projectsData
      case 'tasks':
        return tasksData
      case 'team':
        return teamData
      default:
        return []
    }
  }

  const currentTabData = getCurrentTabData()
  const maxHours = currentTabData.length > 0 
    ? Math.max(...currentTabData.map(item => item.hours))
    : 0

  const dashboardRole = session?.user?.role === 'admin' || session?.user?.role === 'manager' ? session.user.role : 'user'
  
  return (
    <DashboardLayout role={dashboardRole}>
      <div className="space-y-6 bg-white rounded-lg shadow p-6">
        {/* Main Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-4">
            <span className="border-b-2 theme-color theme-color-border whitespace-nowrap pb-3 px-1 text-sm font-medium">
              Time
            </span>
            <a 
              href="/dashboard/reports/detailed"
              className="border-b-2 border-transparent text-gray-500 hover:theme-color hover:theme-color-border whitespace-nowrap pb-3 px-1 text-sm font-medium"
            >
              Detailed time
            </a>
            <a 
              href="/dashboard/reports/saved"
              className="border-b-2 border-transparent text-gray-500 hover:theme-color hover:theme-color-border whitespace-nowrap pb-3 px-1 text-sm font-medium"
            >
              Saved reports
            </a>
          </nav>
        </div>

        {/* Report Content */}
        <div className="space-y-6">
          <div className="">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
              <ReportDateNavigation 
                handlePreviousPeriod={handlePreviousPeriod} 
                handleNextPeriod={handleNextPeriod} 
                handleReturnToCurrentPeriod={handleReturnToCurrentPeriod}
                startDate={reportStartDate} 
                endDate={reportEndDate} 
                loading={loading}
                filterKind={filterKind}
              />
              <div className="flex items-center space-x-3">
                <SaveReport 
                  reportType="time"
                  startDate={reportStartDate}
                  endDate={reportEndDate}
                  timeframe={filterKind}
                  showActiveProjectsOnly={showActiveProjectsOnly}
                />
                <DateFilter />
              </div>
            </div>

            {/* No data message - show when neither legacy time entries nor timesheet hours exist */}
            {!loading && summaryStats.totalHours === 0 && summaryStats.timesheetHours === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-gray-500 text-lg mb-2">You have no hours recorded for this time period.</p>
                <p className="text-gray-400">
                  Track your time under{' '}
                  <a href="/dashboard/timesheet" className="text-blue-500 hover:text-blue-700 underline">
                    Time Tracking
                  </a>
                  .
                </p>
              </div>
            ) : (
              <div className="relative">
                <div className="flex items-left gap-2 flex-col mb-8">
                  {/* if client_id in the url and project_id in the url, then show the link to go back */}
                  {(clientId || projectId || taskId || userId) && (
                    <div className="text-md text-gray-500 capitalize">
                      <a href={`/dashboard/reports?from=${format(reportStartDate, 'yyyy-MM-dd')}&kind=${filterKind}&till=${format(reportEndDate, 'yyyy-MM-dd')}${showActiveProjectsOnly ? '&active_projects=true' : ''}`} className="text-blue-500 hover:text-blue-700">
                        <span>Time Report</span>
                      </a>
                      {/* if project_id in the url then show the client name with the link */}
                      {projectId && currentProjectInfo && (
                        <>
                        <span> / </span>
                        <a href={`/dashboard/reports?client_id=${currentProjectInfo.clientId}&from=${format(reportStartDate, 'yyyy-MM-dd')}&kind=${filterKind}&till=${format(reportEndDate, 'yyyy-MM-dd')}${showActiveProjectsOnly ? '&active_projects=true' : ''}`} className="text-blue-500 hover:text-blue-700">
                          <span>{currentProjectInfo.clientName}</span>
                        </a>
                        </>
                      )}
                    </div>
                  )}
                  {/* now show the client name or project name based on which one is available in the url */}
                  {clientId && currentClientInfo && (
                    <div className="text-xl text-black font-bold">
                      <span>{currentClientInfo.name}</span>
                    </div>
                  )}
                  {projectId && currentProjectInfo && (
                    <div className="text-xl text-black font-bold">
                      <span>{currentProjectInfo.name}</span>
                    </div>
                  )}
                  {taskId && currentTaskInfo && (
                    <div className="text-xl text-black font-bold">
                      <span>{currentTaskInfo.name}</span>
                    </div>
                  )}
                  {/* show user name if user_id is in the url */}
                  {userId && currentUserInfo && (
                    <div className="text-xl text-black font-bold">
                      <span>{currentUserInfo.name}</span>
                    </div>
                  )}
                </div>
                
                <ReportStatsData summaryStats={summaryStats} userRole={session?.user?.role} />

                {/* Sub-tabs and Actions */}
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div className="flex space-x-1 border-b border-gray-200">
                    {/* Show all tabs if no filter is active */}
                    {!clientId && !projectId && !taskId && !userId && (
                      <SubTabButton setActiveSubTab={handleTabChange} activeSubTab={activeSubTab} tab="clients" />
                    )}
                    {/* Show projects tab: always except when projectId filter is active */}
                    {!projectId && (
                      <SubTabButton setActiveSubTab={handleTabChange} activeSubTab={activeSubTab} tab="projects" />
                    )}
                    {/* Show tasks tab: always except when taskId filter is active */}
                    {!taskId && (
                      <SubTabButton setActiveSubTab={handleTabChange} activeSubTab={activeSubTab} tab="tasks" />
                    )}
                    {/* Show team tab: always except when userId filter is active */}
                    {!userId && (
                      <SubTabButton setActiveSubTab={handleTabChange} activeSubTab={activeSubTab} tab="team" />
                    )}
                  </div>
                    <div className="flex items-center ml-auto flex-wrap gap-2 md:gap-3">
                    {(activeSubTab === 'projects' || activeSubTab === 'clients') && (
                      <FilterActiveProject 
                        checked={showActiveProjectsOnly} 
                        onChange={handleActiveProjectsChange} 
                      />
                    )}
                    <a 
                      href={`/dashboard/reports/detailed?start_date=${format(reportStartDate, 'yyyy-MM-dd')}&end_date=${format(reportEndDate, 'yyyy-MM-dd')}`}
                      className="px-2 md:px-4 py-1 md:py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors focus:outline-none focus:ring-1 focus:ring-transparent focus:border-black"
                    >
                      Detailed report
                    </a>
                    <FilterExport 
                      startDate={reportStartDate}
                      endDate={reportEndDate}
                      filterKind={filterKind}
                      summaryStats={summaryStats}
                      activeSubTab={activeSubTab}
                      currentTabData={currentTabData}
                    />
                    <FilterPrint 
                      startDate={reportStartDate}
                      endDate={reportEndDate}
                      filterKind={filterKind}
                      summaryStats={summaryStats}
                      activeSubTab={activeSubTab}
                      currentTabData={currentTabData}
                    />
                  </div>
                </div>

                {/* Data Table */}
                <div className="overflow-x-auto relative">
                  <SubTabContent currentTabData={currentTabData} maxHours={maxHours} activeSubTab={activeSubTab} basePath="/dashboard/reports" currentUserId={session?.user?.id} userRole={session?.user?.role} />
                  {/* Subtab loading overlay */}
                  {subtabLoading && (
                    <div className="absolute inset-0 bg-white bg-opacity-80 z-10 pointer-events-none" />
                  )}
                </div>

                {/* Loading Overlay */}
                {loading && (
                  <div className="absolute inset-0 bg-white bg-opacity-50 z-10 pointer-events-none" />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

export default function ReportsPage() {
  return (
    <Suspense fallback={
      <DashboardLayout role="user">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-gray-500">Loading reports...</div>
        </div>
      </DashboardLayout>
    }>
      <ReportsPageContent />
    </Suspense>
  )
}
