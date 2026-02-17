'use client'

import { Suspense, useState, useEffect, useMemo, useRef } from 'react'
import DashboardLayout from '@/components/layouts/DashboardLayout'
import { useSession } from 'next-auth/react'
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, startOfMonth, endOfMonth, addMonths, subMonths, startOfYear, endOfYear, addYears, subYears } from 'date-fns'
import { sanityFetch } from '@/lib/sanity'
import { TIMESHEET_REPORT_QUERY, TIMESHEET_REPORT_QUERY_FOR_CLIENT, TIMESHEET_REPORT_QUERY_FOR_PROJECT, TIMESHEET_REPORT_QUERY_FOR_TASK, USER_TIMESHEET_REPORT_QUERY, MANAGER_TIMESHEET_REPORT_QUERY } from '@/lib/queries'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import SubTabButton from '@/components/layouts/report/time/SubTabButton'
import SubTabContent from '@/components/layouts/report/time/SubTabContent'
import ReportDateNavigation from '@/components/layouts/report/time/ReportDateNavigation'
import DateFilter from '@/components/layouts/report/time/DateFilter'
import ReportStatsData from '@/components/layouts/report/time/ReportStatsData'
import { FilterActiveProject, FilterDetailedReport, FilterExport, FilterPrint } from '@/components/layouts/report/time/SubTabFilters'
import { SaveReport } from '@/components/layouts/report/time/SaveReport'
import { usePageTitle } from '@/lib/pageTitleImpl'

function ReportsPageContent() {
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [subtabLoading, setSubtabLoading] = useState(false)

  usePageTitle('Reports')

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
    const clientIdValue = searchParams.get('client_id')
    const projectIdValue = searchParams.get('project_id')
    const taskIdValue = searchParams.get('task_id')
    const userIdValue = searchParams.get('user_id')
    
    if (clientIdValue && clientIdValue !== 'unknown' && clientIdValue.trim() !== '') {
      return 'projects'
    } else if (projectIdValue && projectIdValue !== 'unknown' && projectIdValue.trim() !== '') {
      return 'tasks'
    } else if (taskIdValue && taskIdValue !== 'unknown' && taskIdValue.trim() !== '') {
      return 'projects'
    } else if (userIdValue && userIdValue !== 'unknown' && userIdValue.trim() !== '') {
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
        // For custom, use existing dates or default to current week
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

  const [timesheetEntries, setTimesheetEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  
  // Initialize showActiveProjectsOnly from URL or localStorage
  const [showActiveProjectsOnly, setShowActiveProjectsOnly] = useState<boolean>(() => {
    const urlValue = searchParams.get('active_projects')
    if (urlValue !== null) {
      return urlValue === 'true'
    }
    // Check localStorage as fallback (only on client side)
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('reportActiveProjectsOnly')
      return stored === 'true'
    }
    return false
  })
  
  // Keep weekStart/weekEnd for backward compatibility with some components
  const weekStart = useMemo(() => startOfWeek(reportStartDate, { weekStartsOn: 1 }), [reportStartDate])
  const weekEnd = useMemo(() => endOfWeek(reportStartDate, { weekStartsOn: 1 }), [reportStartDate])

  // Track if we're currently restoring params (to prevent loops)
  const isRestoringRef = useRef(false)
  
  // Restore URL params from sessionStorage when URL has no params (on mount or when cleared by navigation)
  useEffect(() => {
    // Prevent restoration loop
    if (isRestoringRef.current) return
    
    const currentParams = searchParams.toString()
    
    // If URL has no params (or only empty), try to restore from sessionStorage
    if (!currentParams || currentParams === '') {
      const savedParams = sessionStorage.getItem('reportsPageParams')
      if (savedParams) {
        isRestoringRef.current = true
        router.replace(`?${savedParams}`, { scroll: false })
        // Reset the flag after a short delay
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
    
    // Only update URL if dates have changed (avoids infinite loops)
    if (currentStartDate !== newStartDate || currentEndDate !== newEndDate) {
      // Only set tab and kind if they don't already exist (preserve existing params)
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
  
  // Save URL params to sessionStorage whenever they change
  useEffect(() => {
    const currentParams = searchParams.toString()
    if (currentParams && currentParams !== '') {
      sessionStorage.setItem('reportsPageParams', currentParams)
    }
  }, [searchParams])


  // Track if user manually changed the tab
  const userChangedTabRef = useRef(false)

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

  // Handler to update active projects filter - updates state, URL, and localStorage
  const handleActiveProjectsChange = (checked: boolean) => {
    setShowActiveProjectsOnly(checked)
    
    // Update URL
    const params = new URLSearchParams(searchParams.toString())
    if (checked) {
      params.set('active_projects', 'true')
    } else {
      params.delete('active_projects')
    }
    router.push(`?${params.toString()}`, { scroll: false })
    
    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('reportActiveProjectsOnly', String(checked))
    }
  }

  // Sync URL with localStorage value on initial load (if not already in URL)
  const activeProjectsSyncDoneRef = useRef(false)
  useEffect(() => {
    if (activeProjectsSyncDoneRef.current) return
    activeProjectsSyncDoneRef.current = true
    
    const urlValue = searchParams.get('active_projects')
    // If URL doesn't have the param but localStorage has it as true, update URL
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

  // Sync showActiveProjectsOnly when URL changes (e.g., browser back/forward)
  useEffect(() => {
    const urlValue = searchParams.get('active_projects')
    if (urlValue !== null) {
      const newValue = urlValue === 'true'
      setShowActiveProjectsOnly(newValue)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Update activeSubTab when filter parameters change (but not when user manually changes tab)
  useEffect(() => {
    // If user manually changed the tab, respect their choice from URL
    if (userChangedTabRef.current) {
      const tabFromUrl = searchParams.get('tab') as 'clients' | 'projects' | 'tasks' | 'team' | null
      if (tabFromUrl && validTabs.includes(tabFromUrl)) {
        setActiveSubTab(tabFromUrl)
      }
      return
    }
    
    // Check if there's an explicit tab parameter in URL - if so, respect it
    const tabFromUrl = searchParams.get('tab') as 'clients' | 'projects' | 'tasks' | 'team' | null
    if (tabFromUrl && validTabs.includes(tabFromUrl)) {
      setActiveSubTab(tabFromUrl)
      return
    }
    
    // No explicit tab in URL, set tab based on active filters
    if (clientId) {
      setActiveSubTab('projects')
    } else if (projectId) {
      setActiveSubTab('tasks')
    } else if (taskId) {
      setActiveSubTab('projects')
    } else if (userId) {
      setActiveSubTab('projects')
    } else {
      // No filter active, default to 'clients'
      setActiveSubTab('clients')
    }
  }, [clientId, projectId, taskId, userId, searchParams, validTabs])

  // Reset the userChangedTabRef when filters change (so filter-based tab switching works again)
  useEffect(() => {
    userChangedTabRef.current = false
  }, [clientId, projectId, taskId, userId])

  useEffect(() => {
    if (session?.user?.id) {
      fetchTimeEntries()
    }
  }, [session, reportStartDate, reportEndDate, clientId, projectId, taskId, userId])

  const fetchTimeEntries = async () => {
    setLoading(true)
    try {
      const startDate = format(reportStartDate, 'yyyy-MM-dd')
      const endDate = format(reportEndDate, 'yyyy-MM-dd')
      
      let timesheets: any[] = []
      
      if (clientId) {
        timesheets = await sanityFetch<any[]>({
          query: TIMESHEET_REPORT_QUERY_FOR_CLIENT,
          params: { startDate, endDate, clientId },
        })
      } else if (projectId) {
        timesheets = await sanityFetch<any[]>({
          query: TIMESHEET_REPORT_QUERY_FOR_PROJECT,
          params: { startDate, endDate, projectId },
        })
      } else if (taskId) {
        timesheets = await sanityFetch<any[]>({
          query: TIMESHEET_REPORT_QUERY_FOR_TASK,
          params: { startDate, endDate, taskId },
        })
      } else if (userId) {
        timesheets = await sanityFetch<any[]>({
          query: USER_TIMESHEET_REPORT_QUERY,
          params: { startDate, endDate, userId },
        })
      } else {
        if (session?.user?.role === 'manager') {
          timesheets = await sanityFetch<any[]>({
            query: MANAGER_TIMESHEET_REPORT_QUERY,
            params: { startDate, endDate, managerId: session?.user?.id },
          })
        } else {
          timesheets = await sanityFetch<any[]>({
            query: TIMESHEET_REPORT_QUERY,
            params: { startDate, endDate },
          })
        }
      }
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

  // Helper function to check if a project is active (not archived and isActive)
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

  // Calculate summary stats (timesheet data only)
  const summaryStats = useMemo(() => {
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
      totalHours: timesheetHours,
      billableHours: timesheetBillableHours,
      nonBillableHours: timesheetNonBillableHours,
      billablePercentage: timesheetBillablePercentage,
      timesheetHours,
      timesheetBillableHours,
      timesheetNonBillableHours,
      timesheetBillablePercentage,
    }
  }, [flattenedTimesheetEntries, showActiveProjectsOnly])

  // Group data by Clients (timesheet data only)
  const clientsData = useMemo(() => {
    const grouped: Record<string, { name: string; hours: number; billableHours: number; timesheetHours: number; timesheetBillableHours: number; clientId: string }> = {}
    const filteredTimesheetEntries = showActiveProjectsOnly
      ? flattenedTimesheetEntries.filter(entry => isProjectActive(entry.project))
      : flattenedTimesheetEntries

    filteredTimesheetEntries.forEach(entry => {
      const clientId = entry.project?.client?._id || 'unknown'
      const clientName = entry.project?.client?.name || 'Unknown Client'
      const hrs = entry.hours || 0
      const billable = entry.isBillable ? hrs : 0

      if (!grouped[clientId]) {
        grouped[clientId] = { name: clientName, hours: 0, billableHours: 0, timesheetHours: 0, timesheetBillableHours: 0, clientId: clientId }
      }
      grouped[clientId].hours += hrs
      grouped[clientId].billableHours += billable
      grouped[clientId].timesheetHours += hrs
      grouped[clientId].timesheetBillableHours += billable
    })

    return Object.values(grouped).sort((a, b) => b.hours - a.hours)
  }, [flattenedTimesheetEntries, showActiveProjectsOnly])

  // Group data by Projects (timesheet data only)
  const projectsData = useMemo(() => {
    const grouped: Record<string, { name: string; clientName: string; hours: number; billableHours: number; timesheetHours: number; timesheetBillableHours: number; clientId: string, projectId: string, isActive: boolean }> = {}
    const filteredTimesheetEntries = showActiveProjectsOnly
      ? flattenedTimesheetEntries.filter(entry => isProjectActive(entry.project))
      : flattenedTimesheetEntries

    filteredTimesheetEntries.forEach(entry => {
      const projectId = entry.project?._id || 'unknown'
      const projectName = entry.project?.name || 'Unknown Project'
      const clientName = entry.project?.client?.name || 'Unknown Client'
      const clientId = entry.project?.client?._id || 'unknown'
      const projectIsActive = isProjectActive(entry.project)
      const hrs = entry.hours || 0
      const billable = entry.isBillable ? hrs : 0

      if (!grouped[projectId]) {
        grouped[projectId] = { name: projectName, clientName: clientName, hours: 0, billableHours: 0, timesheetHours: 0, timesheetBillableHours: 0, clientId: clientId, projectId: projectId, isActive: projectIsActive }
      }
      grouped[projectId].hours += hrs
      grouped[projectId].billableHours += billable
      grouped[projectId].timesheetHours += hrs
      grouped[projectId].timesheetBillableHours += billable
    })

    let result = Object.values(grouped)
    if (showActiveProjectsOnly) {
      result = result.filter(project => project.isActive)
    }
    return result.sort((a, b) => b.hours - a.hours)
  }, [flattenedTimesheetEntries, showActiveProjectsOnly])

  // Group data by Tasks (with users who worked on each task) — timesheet data only
  const tasksData = useMemo(() => {
    const grouped: Record<string, { 
      name: string; 
      hours: number; 
      billableHours: number; 
      timesheetHours: number;
      timesheetBillableHours: number;
      taskId: string;
      clientId?: string;
      projectId?: string;
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
    const filteredTimesheetEntries = showActiveProjectsOnly
      ? flattenedTimesheetEntries.filter(entry => isProjectActive(entry.project))
      : flattenedTimesheetEntries

    filteredTimesheetEntries.forEach(entry => {
      const taskId = entry.task?._id || 'unknown'
      const taskName = entry.task?.name || 'Unknown Task'
      const userId = entry.user?._id || 'unknown'
      const userName = entry.user 
        ? `${entry.user.firstName || ''} ${entry.user.lastName || ''}`.trim() || 'Unknown User'
        : 'Unknown User'
      const firstName = entry.user?.firstName || ''
      const lastName = entry.user?.lastName || ''
      const hrs = entry.hours || 0
      const billable = entry.isBillable ? hrs : 0

      if (!grouped[taskId]) {
        grouped[taskId] = { 
          name: taskName, 
          hours: 0, 
          billableHours: 0, 
          timesheetHours: 0,
          timesheetBillableHours: 0,
          taskId: taskId,
          clientId: entry.project?.client?._id,
          projectId: entry.project?._id,
          users: []
        }
      }
      grouped[taskId].hours += hrs
      grouped[taskId].billableHours += billable
      grouped[taskId].timesheetHours += hrs
      grouped[taskId].timesheetBillableHours += billable

      let userInTask = grouped[taskId].users.find(u => u.userId === userId)
      if (!userInTask) {
        userInTask = { 
          userId, 
          name: userName, 
          firstName,
          lastName,
          hours: 0, 
          billableHours: 0,
          timesheetHours: 0,
          timesheetBillableHours: 0
        }
        grouped[taskId].users.push(userInTask)
      }
      userInTask.hours += hrs
      userInTask.billableHours += billable
      userInTask.timesheetHours += hrs
      userInTask.timesheetBillableHours += billable
    })

    Object.values(grouped).forEach(task => {
      task.users.sort((a, b) => b.hours - a.hours)
    })
    return Object.values(grouped).sort((a, b) => b.hours - a.hours)
  }, [flattenedTimesheetEntries, showActiveProjectsOnly])

  // State for cached project/client/task/user info (to avoid hydration mismatch)
  const [cachedProjectInfo, setCachedProjectInfo] = useState<{ name: string; clientName: string; clientId: string } | null>(null)
  const [cachedClientInfo, setCachedClientInfo] = useState<{ name: string; clientId: string } | null>(null)
  const [cachedTaskInfo, setCachedTaskInfo] = useState<{ name: string; id: string } | null>(null)
  const [cachedUserInfo, setCachedUserInfo] = useState<{ name: string; id: string } | null>(null)

  // Get current project info from timesheet entries
  const projectInfoFromEntries = useMemo(() => {
    if (!projectId) return null
    const entry = flattenedTimesheetEntries.find(e => e.project?._id === projectId)
    if (!entry) return null
    return {
      name: entry.project?.name || 'Unknown Project',
      clientName: entry.project?.client?.name || 'Unknown Client',
      clientId: entry.project?.client?._id || 'unknown'
    }
  }, [projectId, flattenedTimesheetEntries])

  // Get current client info from timesheet entries
  const clientInfoFromEntries = useMemo(() => {
    if (!clientId) return null
    const entry = flattenedTimesheetEntries.find(e => e.project?.client?._id === clientId)
    if (!entry) return null
    return {
      name: entry.project?.client?.name || 'Unknown Client',
      clientId: entry.project?.client?._id || 'unknown'
    }
  }, [clientId, flattenedTimesheetEntries])

  // Get current task info from timesheet entries
  const taskInfoFromEntries = useMemo(() => {
    if (!taskId) return null
    const entry = flattenedTimesheetEntries.find(e => e.task?._id === taskId)
    if (!entry) return null
    return {
      name: entry.task?.name || 'Unknown Task',
      id: entry.task?._id || 'unknown'
    }
  }, [taskId, flattenedTimesheetEntries])

  // Get current user info from timesheet entries
  const userInfoFromEntries = useMemo(() => {
    if (!userId) return null
    const entry = flattenedTimesheetEntries.find(e => e.user?._id === userId)
    if (!entry) return null
    const userName = entry.user
      ? `${entry.user.firstName || ''} ${entry.user.lastName || ''}`.trim() || 'Unknown User'
      : 'Unknown User'
    return {
      name: userName,
      id: entry.user?._id || 'unknown'
    }
  }, [userId, flattenedTimesheetEntries])

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

  // Group data by Team (Users) with tasks they worked on — timesheet data only
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
    const filteredTimesheetEntries = showActiveProjectsOnly
      ? flattenedTimesheetEntries.filter(entry => isProjectActive(entry.project))
      : flattenedTimesheetEntries

    filteredTimesheetEntries.forEach(entry => {
      const userId = entry.user?._id || 'unknown'
      const userName = entry.user 
        ? `${entry.user.firstName || ''} ${entry.user.lastName || ''}`.trim() || 'Unknown User'
        : 'Unknown User'
      const taskId = entry.task?._id || 'unknown'
      const taskName = entry.task?.name || 'Unknown Task'
      const hrs = entry.hours || 0
      const billable = entry.isBillable ? hrs : 0

      if (!grouped[userId]) {
        grouped[userId] = { 
          name: userName, 
          hours: 0, 
          billableHours: 0, 
          timesheetHours: 0,
          timesheetBillableHours: 0,
          userId: userId,
          tasks: []
        }
      }
      grouped[userId].hours += hrs
      grouped[userId].billableHours += billable
      grouped[userId].timesheetHours += hrs
      grouped[userId].timesheetBillableHours += billable

      let taskForUser = grouped[userId].tasks.find(t => t.taskId === taskId)
      if (!taskForUser) {
        taskForUser = {
          taskId,
          name: taskName,
          hours: 0,
          billableHours: 0,
          timesheetHours: 0,
          timesheetBillableHours: 0
        }
        grouped[userId].tasks.push(taskForUser)
      }
      taskForUser.hours += hrs
      taskForUser.billableHours += billable
      taskForUser.timesheetHours += hrs
      taskForUser.timesheetBillableHours += billable
    })

    Object.values(grouped).forEach(user => {
      user.tasks.sort((a, b) => b.hours - a.hours)
    })
    return Object.values(grouped).sort((a, b) => b.hours - a.hours)
  }, [flattenedTimesheetEntries, showActiveProjectsOnly])

  // Get current tab data based on active filters or activeSubTab
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

  return (
    <>
      <DashboardLayout role={session?.user?.role === 'admin' ? 'admin' : 'manager'}>
      <div className="space-y-6 bg-white rounded-lg shadow p-6">
        {/* Main Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-4">
            <span className="border-b-2 theme-color theme-color-border whitespace-nowrap pb-3 px-1 text-sm font-medium">
              Time
            </span>
            <a 
              href="/admin/reports/detailed"
              className="border-b-2 border-transparent text-gray-500 hover:theme-color hover:theme-color-border whitespace-nowrap pb-3 px-1 text-sm font-medium"
            >
              Detailed time
            </a>
            <a 
              href="/admin/reports/saved"
              className="border-b-2 border-transparent text-gray-500 hover:theme-color hover:theme-color-border whitespace-nowrap pb-3 px-1 text-sm font-medium"
            >
              Saved reports
            </a>
          </nav>
        </div>

        {/* Report Content */}
        <div className="space-y-6">
            {/* Week Navigation */}
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
                                    clientId={clientId}
                                    projectId={projectId}
                                    taskId={taskId}
                                    userId={userId}
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
                    <a href="/admin/timesheets" className="text-blue-500 hover:text-blue-700 underline">
                      Timesheets
                    </a>
                    .
                  </p>
                </div>
              ) : (
                /* Summary Stats */
                <div className="relative">
                  <div className="flex items-left gap-2 flex-col mb-8 empty:mb-0">
                    {/* if client_id in the url and project_id in the url, then show the link to go back */}
                    {(clientId || projectId || taskId || userId) && (
                      <div className="text-md text-gray-500 capitalize">
                        <a href={`/admin/reports?from=${format(reportStartDate, 'yyyy-MM-dd')}&kind=${filterKind}&till=${format(reportEndDate, 'yyyy-MM-dd')}${showActiveProjectsOnly ? '&active_projects=true' : ''}`} className="text-blue-500 hover:text-blue-700">
                          <span>Time Report</span>
                        </a>
                        {/* if project_id in the url then show the client name with the link */}
                        {projectId && currentProjectInfo && (
                          <>
                          <span> / </span>
                          <a href={`/admin/reports?client_id=${currentProjectInfo.clientId}&from=${format(reportStartDate, 'yyyy-MM-dd')}&kind=${filterKind}&till=${format(reportEndDate, 'yyyy-MM-dd')}${showActiveProjectsOnly ? '&active_projects=true' : ''}`} className="text-blue-500 hover:text-blue-700">
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
                  
                  <ReportStatsData summaryStats={summaryStats} projectId={projectId} userRole={session?.user?.role} />

                  {/* Sub-tabs and Actions */}
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div className="flex space-x-1 border-b border-gray-200">
                      {/* Show all tabs if no filter is active, otherwise show based on active filter */}
                      {(!clientId && !projectId && !taskId && !userId) ? (
                        <>
                          <SubTabButton setActiveSubTab={handleTabChange} activeSubTab={activeSubTab} tab="clients" />
                          <SubTabButton setActiveSubTab={handleTabChange} activeSubTab={activeSubTab} tab="projects" />
                          <SubTabButton setActiveSubTab={handleTabChange} activeSubTab={activeSubTab} tab="tasks" />
                          <SubTabButton setActiveSubTab={handleTabChange} activeSubTab={activeSubTab} tab="team" />
                        </>
                      ) : (
                        <>
                          {/* Show projects tab if clientId is active, or if taskId/userId is active (but not if projectId is active) */}
                          {(clientId || taskId || userId) && !projectId && (
                            <SubTabButton setActiveSubTab={handleTabChange} activeSubTab={activeSubTab} tab="projects" />
                          )}
                          {/* Show tasks tab if clientId or projectId is active, or if userId is active (but not if taskId is active) */}
                          {(clientId || projectId || userId) && !taskId && (
                            <SubTabButton setActiveSubTab={handleTabChange} activeSubTab={activeSubTab} tab="tasks" />
                          )}
                          {/* Show team tab if clientId, projectId, or taskId is active (but not if userId is active) */}
                          {(clientId || projectId || taskId) && !userId && (
                            <SubTabButton setActiveSubTab={handleTabChange} activeSubTab={activeSubTab} tab="team" />
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex items-center justify-end flex-wrap gap-2 md:gap-4">
                      {/* Show active project filter for all tabs */}
                      {(activeSubTab === 'projects' || activeSubTab === 'clients') && (
                      <FilterActiveProject 
                        checked={showActiveProjectsOnly} 
                        onChange={handleActiveProjectsChange} 
                      />)}
                      <FilterDetailedReport 
                        startDate={reportStartDate}
                        endDate={reportEndDate}
                        timeframe={filterKind}
                      />
                      <FilterExport 
                        startDate={reportStartDate}
                        endDate={reportEndDate}
                        filterKind={filterKind}
                        summaryStats={summaryStats}
                        activeSubTab={activeSubTab}
                        currentTabData={currentTabData}
                        clientName={currentClientInfo?.name}
                        projectName={currentProjectInfo?.name}
                        useTimesheetData={true}
                      />
                      <FilterPrint 
                        startDate={reportStartDate}
                        endDate={reportEndDate}
                        filterKind={filterKind}
                        summaryStats={summaryStats}
                        activeSubTab={activeSubTab}
                        currentTabData={currentTabData}
                        clientName={currentClientInfo?.name}
                        projectName={currentProjectInfo?.name}
                        useTimesheetData={true}
                      />
                    </div>
                  </div>

                  {/* Data Table */}
                  
                  <div className="overflow-x-auto relative">
                    <SubTabContent currentTabData={currentTabData} maxHours={maxHours} activeSubTab={activeSubTab} userRole={session?.user?.role} />
                    {/* loading overlay */}
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
    </>
  )
}


export default function ReportsPage() {
  return (
    <Suspense fallback={
      <DashboardLayout role="manager">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-gray-500">Loading reports...</div>
        </div>
      </DashboardLayout>
    }>
      <ReportsPageContent />
    </Suspense>
  )
}
