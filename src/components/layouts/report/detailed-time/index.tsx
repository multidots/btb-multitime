'use client'

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { FiX, FiChevronDown, FiChevronUp, FiChevronLeft, FiChevronRight, FiPrinter, FiFilter } from 'react-icons/fi'
import { sanityFetch } from '@/lib/sanity'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { SaveReport } from '../time/SaveReport'
import {
	TIMESHEET_REPORT_QUERY,
	TIMESHEET_REPORT_QUERY_CURSOR,
	TIMESHEET_REPORT_COUNT_QUERY,
	TIMESHEET_REPORT_TOTAL_HOURS_QUERY,
	TIMESHEET_REPORT_QUERY_FOR_CLIENT,
	TIMESHEET_REPORT_QUERY_FOR_PROJECT,
	TIMESHEET_REPORT_QUERY_FOR_PROJECTS,
	TIMESHEET_REPORT_QUERY_FOR_TASKS,
	USER_TIMESHEET_REPORT_QUERY,
	MANAGER_TIMESHEET_REPORT_QUERY
} from '@/lib/queries'
import { formatSimpleTime, hoursToDecimal, formatDecimalHours } from '@/lib/time'

interface FilterTag {
	id: string
	name: string
	clientId?: string  // Used for projects to filter by selected client
}

interface TimeEntry {
	_id: string
	date: string
	hours: number
	client: { _id: string; name: string }
	project: { _id: string; name: string }
	task: { _id: string; name: string }
	user: { _id: string; firstName: string; lastName: string }
	notes?: string
	timesheetHours?: number
}

interface GroupedEntries {
	[key: string]: {
		entries: TimeEntry[]
		totalHours: number
		totalTimesheetHours: number
		label: string
		sortKey: string
	}
}

interface DetailedTimeReportProps {
	userId?: string // Current user's ID
	userRole?: 'admin' | 'manager' | 'user' // Current user's role
}

export default function DetailedTimeReport({ userId, userRole = 'admin' }: DetailedTimeReportProps) {
	const searchParams = useSearchParams()
	
	const [timeframe, setTimeframe] = useState('year')
	const [includeArchived, setIncludeArchived] = useState(false)
	const [selectedClients, setSelectedClients] = useState<FilterTag[]>([])
	const [selectedProjects, setSelectedProjects] = useState<FilterTag[]>([])
	const [selectedTasks, setSelectedTasks] = useState<FilterTag[]>([])
	const [customStartDate, setCustomStartDate] = useState('')
	const [customEndDate, setCustomEndDate] = useState('')
	
	// For managers: store their team member IDs
	const [teamMemberIds, setTeamMemberIds] = useState<string[]>([])

	// Search states
	const [clientSearch, setClientSearch] = useState('')
	const [projectSearch, setProjectSearch] = useState('')
	const [taskSearch, setTaskSearch] = useState('')

	// Dropdown visibility states
	const [showClientDropdown, setShowClientDropdown] = useState(false)
	const [showProjectDropdown, setShowProjectDropdown] = useState(false)
	const [showTaskDropdown, setShowTaskDropdown] = useState(false)

	// Track if an item was just selected (to prevent clearing valid selections)
	const [justSelectedClient, setJustSelectedClient] = useState(false)
	const [justSelectedProject, setJustSelectedProject] = useState(false)
	const [justSelectedTask, setJustSelectedTask] = useState(false)

	// Refs for click outside handling
	const clientRef = useRef<HTMLDivElement>(null)
	const projectRef = useRef<HTMLDivElement>(null)
	const taskRef = useRef<HTMLDivElement>(null)

	// Data from Sanity
	const [availableClients, setAvailableClients] = useState<FilterTag[]>([])
	const [availableProjects, setAvailableProjects] = useState<FilterTag[]>([])
	const [availableTasks, setAvailableTasks] = useState<FilterTag[]>([])
	const [isLoading, setIsLoading] = useState(true)

	// Report results
	const [reportData, setReportData] = useState<TimeEntry[]>([])
	const [timesheetEntries, setTimesheetEntries] = useState<any[]>([])
	const [showReport, setShowReport] = useState(false)
	const [isLoadingReport, setIsLoadingReport] = useState(false)
	const [groupBy, setGroupBy] = useState<'date' | 'client' | 'project' | 'task' | 'person'>('date')
	const [activeProjectsOnly, setActiveProjectsOnly] = useState(false)
	const [showExportDropdown, setShowExportDropdown] = useState(false)
	const [isExporting, setIsExporting] = useState(false)
	const exportRef = useRef<HTMLDivElement>(null)
	
	// Track if URL params have been loaded
	const [urlParamsLoaded, setUrlParamsLoaded] = useState(false)
	const [shouldAutoRun, setShouldAutoRun] = useState(false)
	const hasAutoRunRef = useRef(false)

	// Pagination for "All" timeframe (cursor-based to avoid API slice limits)
	const REPORT_PAGE_SIZE = 100
	const [reportPage, setReportPage] = useState(0)
	const [reportTotalPages, setReportTotalPages] = useState<number | null>(null)
	const [reportTotalHours, setReportTotalHours] = useState<number | null>(null)
	const [isPaginatedReport, setIsPaginatedReport] = useState(false)
	const reportPageCursorsRef = useRef<Record<number, { weekStart: string; _id: string } | null>>({ 0: null })
	
	// Collapsible groups state (for UI only - doesn't affect export)
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
	const previousGroupKeysRef = useRef<string>('')
	
	// Filter visibility toggle (hide filters when showing results)
	// Initialize to false if URL params exist (will auto-run report)
	const [showFilters, setShowFilters] = useState(() => {
		const hasUrlParams = searchParams.get('timeframe') || 
			searchParams.get('from') || 
			searchParams.get('start_date') || 
			searchParams.get('end_date') || 
			searchParams.get('clients') || 
			searchParams.get('clients[]') || 
			searchParams.get('projects[]') || 
			searchParams.get('tasks[]') ||
			searchParams.get('tasks') ||
			searchParams.get('users')
		return !hasUrlParams
	})
	
	// Fetch team members for managers
	useEffect(() => {
		const fetchTeamMembers = async () => {
			if (userRole === 'manager' && userId) {
				try {
					// Fetch teams where the current user is the manager
					const teamsQuery = `*[_type == "team" && manager._ref == $managerId && isActive == true]{
						members[]->{_id}
					}`
					const teams = await sanityFetch<{ members: { _id: string }[] }[]>({
						query: teamsQuery,
						params: { managerId: userId }
					})
					
					// Collect all team member IDs
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
		}
		
		fetchTeamMembers()
	}, [userId, userRole])

	// Clear selected projects that don't belong to selected clients when client selection changes
	useEffect(() => {
		if (selectedClients.length > 0 && selectedProjects.length > 0) {
			const selectedClientIds = selectedClients.map(c => c.id)
			const validProjects = selectedProjects.filter(p => 
				p.clientId && selectedClientIds.includes(p.clientId)
			)
			// Only update if there are projects to remove
			if (validProjects.length !== selectedProjects.length) {
				setSelectedProjects(validProjects)
			}
		}
	}, [selectedClients]) // eslint-disable-line react-hooks/exhaustive-deps

	// Function to build URL with current filters and reload page
	const runReportWithReload = useCallback(() => {
		const params = new URLSearchParams()
		
		// Store the timeframe selection
		params.set('timeframe', timeframe)
		
		// Get the date range based on timeframe
		const { start, end } = getDateRange()
		params.set('start_date', start)
		params.set('end_date', end)
		
		params.set('active_projects', activeProjectsOnly ? 'true' : 'false')
		
		if (includeArchived) params.set('include_archived', 'true')
		if (groupBy !== 'date') params.set('group_by', groupBy)
		
		// Use array notation for clients, projects, tasks
		selectedClients.forEach(c => params.append('clients[]', c.id))
		selectedProjects.forEach(p => params.append('projects[]', p.id))
		selectedTasks.forEach(t => params.append('tasks[]', t.id))
		
		// Reload page with new URL
		window.location.href = `${window.location.pathname}?${params.toString()}`
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [timeframe, customStartDate, customEndDate, includeArchived, selectedClients, selectedProjects, selectedTasks, groupBy, activeProjectsOnly])

	// Fetch data from Sanity on mount
	useEffect(() => {
		const fetchData = async () => {
			setIsLoading(true)
			try {
				const archivedFilter = includeArchived ? '' : '&& isArchived != true'
				
				// Check URL params for specific IDs to fetch
				const urlClientIds = searchParams.getAll('clients[]').filter(Boolean)
				const urlProjectIds = searchParams.getAll('projects[]').filter(Boolean)
				const urlTaskIds = searchParams.getAll('tasks[]').filter(Boolean)
				
				// Fetch clients
				const clientsQuery = `
					*[_type == "client" && !(_id in path("drafts.**")) ${archivedFilter}] | order(name asc) {
						"id": _id,
						name
					}
				`
				
				// Fetch projects (include clientId for filtering by selected client)
				const projectsQuery = `
					*[_type == "project" && !(_id in path("drafts.**")) ${includeArchived ? '' : '&& isActive == true'}] | order(name asc) {
						"id": _id,
						name,
						"clientId": client._ref
					}
				`
				
				// Fetch tasks
				const tasksQuery = `
					*[_type == "task" && !(_id in path("drafts.**")) ${archivedFilter}] | order(name asc) {
						"id": _id,
						name
					}
				`
				
				// Fetch specific items by ID from URL params (regardless of active status)
				const urlClientsQuery = urlClientIds.length > 0 ? `
					*[_type == "client" && _id in $clientIds] {
						"id": _id,
						name
					}
				` : null
				
				const urlProjectsQuery = urlProjectIds.length > 0 ? `
					*[_type == "project" && _id in $projectIds] {
						"id": _id,
						name,
						"clientId": client._ref
					}
				` : null
				
				const urlTasksQuery = urlTaskIds.length > 0 ? `
					*[_type == "task" && _id in $taskIds] {
						"id": _id,
						name
					}
				` : null
				
				const [clients, projects, tasks, urlClients, urlProjects, urlTasks] = await Promise.all([
					sanityFetch<FilterTag[]>({ query: clientsQuery }),
					sanityFetch<FilterTag[]>({ query: projectsQuery }),
					sanityFetch<FilterTag[]>({ query: tasksQuery }),
					urlClientsQuery ? sanityFetch<FilterTag[]>({ query: urlClientsQuery, params: { clientIds: urlClientIds } }) : Promise.resolve([]),
					urlProjectsQuery ? sanityFetch<FilterTag[]>({ query: urlProjectsQuery, params: { projectIds: urlProjectIds } }) : Promise.resolve([]),
					urlTasksQuery ? sanityFetch<FilterTag[]>({ query: urlTasksQuery, params: { taskIds: urlTaskIds } }) : Promise.resolve([]),
				])
				
				setAvailableClients(clients || [])
				setAvailableProjects(projects || [])
				setAvailableTasks(tasks || [])
				
				// After data is loaded, check if we need to restore filters from URL
				if (!urlParamsLoaded) {
					const urlTimeframe = searchParams.get('timeframe')
					const urlStartDate = searchParams.get('start_date')
					const urlEndDate = searchParams.get('end_date')
					const urlIncludeArchived = searchParams.get('include_archived') === 'true'
					const urlGroupBy = searchParams.get('group_by') as typeof groupBy
					const urlActiveProjects = searchParams.get('active_projects')
					
					// Set timeframe from URL (week, month, year, all, custom)
					if (urlTimeframe) {
						setTimeframe(urlTimeframe)
						// For custom timeframe, also set the custom date inputs
						if (urlTimeframe === 'custom' && urlStartDate && urlEndDate) {
							setCustomStartDate(urlStartDate)
							setCustomEndDate(urlEndDate)
						}
					} else if (urlStartDate && urlEndDate) {
						// If no timeframe but dates are provided, treat as custom
						setTimeframe('custom')
						setCustomStartDate(urlStartDate)
						setCustomEndDate(urlEndDate)
					}
					
					if (urlIncludeArchived) setIncludeArchived(urlIncludeArchived)
					if (urlGroupBy) setGroupBy(urlGroupBy)
					if (urlActiveProjects === 'true') setActiveProjectsOnly(true)
					
					// Set selected items from URL (using the specifically fetched items)
					if (urlClients && urlClients.length > 0) {
						setSelectedClients(urlClients)
					}
					if (urlProjects && urlProjects.length > 0) {
						setSelectedProjects(urlProjects)
					}
					if (urlTasks && urlTasks.length > 0) {
						setSelectedTasks(urlTasks)
					}
					
					setUrlParamsLoaded(true)
					
					// Auto-run report if there are URL params
					const hasUrlParams = urlTimeframe || urlStartDate || urlClientIds.length > 0 || urlProjectIds.length > 0 || urlTaskIds.length > 0
					if (hasUrlParams) {
						setShouldAutoRun(true)
					}
				}
			} catch (error) {
				console.error('Error fetching filter data:', error)
			} finally {
				setIsLoading(false)
			}
		}
		
		fetchData()
	}, [includeArchived, searchParams, urlParamsLoaded])

	const timeframeOptions = [
		{ value: 'week', label: 'Week' },
		{ value: 'month', label: 'Month' },
		{ value: 'year', label: 'Year' },
		{ value: 'all', label: 'All' },
		{ value: 'custom', label: 'Custom' },
	]

	const groupByOptions = [
		{ value: 'date', label: 'Date' },
		{ value: 'client', label: 'Client' },
		{ value: 'project', label: 'Project' },
		{ value: 'task', label: 'Task' },
		{ value: 'person', label: 'Person' },
	]

	// Get date range based on timeframe
	const getDateRange = useCallback(() => {
		const now = new Date()
		switch (timeframe) {
			case 'week':
				return { start: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'), end: format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd') }
			case 'month':
				return { start: format(startOfMonth(now), 'yyyy-MM-dd'), end: format(endOfMonth(now), 'yyyy-MM-dd') }
			case 'year':
				return { start: format(startOfYear(now), 'yyyy-MM-dd'), end: format(endOfYear(now), 'yyyy-MM-dd') }
			case 'custom':
				// Validate custom dates - if not set, use current week as fallback
				if (!customStartDate || !customEndDate) {
					return { start: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'), end: format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd') }
				}
				return { start: customStartDate, end: customEndDate }
			case 'all':
			default:
				return { start: '2000-01-01', end: format(now, 'yyyy-MM-dd') }
		}
	}, [timeframe, customStartDate, customEndDate])

	// Get current date range for SaveReport
	const currentDateRange = useMemo(() => getDateRange(), [getDateRange])

	// Normalize weekStart for cursor (GROQ expects comparable string, e.g. YYYY-MM-DD)
	const normalizeCursorWeekStart = useCallback((weekStart: unknown): string => {
		if (weekStart == null) return ''
		if (typeof weekStart === 'string') {
			const match = weekStart.match(/^(\d{4}-\d{2}-\d{2})/)
			return match ? match[1] : weekStart
		}
		if (weekStart instanceof Date) return format(weekStart, 'yyyy-MM-dd')
		return String(weekStart)
	}, [])

	// Run report function
	// Run report based on current filters (used for auto-run from URL params)
	const runReport = useCallback(async () => {
		setIsLoadingReport(true)
		setShowReport(true)
		setShowFilters(false) // Hide filters by default when showing results
		
		try {
			const { start, end } = getDateRange()

			// get user id from url (for admin filter)
			const urlUserId = searchParams.getAll('user[]').filter(Boolean) || ['unknown']

			// Check if we should use pagination (timeframe === 'all' and no filters applied)
			const shouldUsePagination = timeframe === 'all' && 
				selectedClients.length === 0 && 
				selectedProjects.length === 0 && 
				selectedTasks.length === 0 &&
				!(userRole === 'user' && userId) &&
				!(userRole === 'manager' && teamMemberIds.length > 0) &&
				!(userRole === 'admin' && urlUserId.length > 0 && urlUserId[0] !== 'unknown')

			if (shouldUsePagination) {
				// Enable pagination for "All" timeframe
				setIsPaginatedReport(true)
				setReportPage(0)
				setReportTotalPages(null)
				setReportTotalHours(null)
				reportPageCursorsRef.current = { 0: null }

				// Fetch total count and total hours in parallel
				const [countResult, totalHoursResult] = await Promise.all([
					sanityFetch<number>({
						query: TIMESHEET_REPORT_COUNT_QUERY,
						params: { startDate: start, endDate: end }
					}),
					sanityFetch<{ totalHours: number }>({
						query: TIMESHEET_REPORT_TOTAL_HOURS_QUERY,
						params: { startDate: start, endDate: end }
					})
				])

				const totalCount = countResult || 0
				const totalPages = Math.ceil(totalCount / REPORT_PAGE_SIZE)
				setReportTotalPages(totalPages)
				setReportTotalHours(totalHoursResult?.totalHours ?? null)

				// Load first page using cursor-based pagination
				const firstPageParams = {
					startDate: start,
					endDate: end,
					pageSize: REPORT_PAGE_SIZE,
					lastWeekStart: null,
					lastId: null
				}
				const firstPageRaw = await sanityFetch<any[]>({
					query: TIMESHEET_REPORT_QUERY_CURSOR,
					params: firstPageParams
				})
				const firstPage = firstPageRaw || []
				setTimesheetEntries(firstPage)
				setReportData([])

				// Store cursor for next page if we got a full page
				if (firstPage.length > 0) {
					const last = firstPage[firstPage.length - 1]
					reportPageCursorsRef.current[1] = {
						weekStart: normalizeCursorWeekStart(last.weekStart),
						_id: last._id
					}
				}
				return
			}

			// Disable pagination for non-"All" timeframes
			setIsPaginatedReport(false)
			setReportPage(0)
			setReportTotalPages(null)
			setReportTotalHours(null)

			// Build timesheet query: single-user view always uses user's timesheets (then filter by client/project/task)
			let timesheetQuery = ''
			let timesheetParams: any = { startDate: start, endDate: end }
			const isSingleUserView = userRole === 'user' && userId

			if (isSingleUserView) {
				// Dashboard single-user: always fetch this user's timesheets only; filter by client/project/task below
				timesheetQuery = USER_TIMESHEET_REPORT_QUERY
				timesheetParams.userId = userId
			} else if (selectedProjects.length > 0) {
				// Prefer project filter when projects are selected (so 1 client + 1 project shows only that project)
				const projectIds = selectedProjects.map(p => p.id)
				timesheetQuery = TIMESHEET_REPORT_QUERY_FOR_PROJECTS
				timesheetParams.projectIds = projectIds
			} else if (selectedTasks.length > 0) {
				// Prefer task filter when tasks are selected (so 1 client + 1 task shows only that task)
				const taskIds = selectedTasks.map(t => t.id)
				timesheetQuery = TIMESHEET_REPORT_QUERY_FOR_TASKS
				timesheetParams.taskIds = taskIds
			} else if (selectedClients.length > 0) {
				const clientIds = selectedClients.map(c => c.id)
				timesheetQuery = TIMESHEET_REPORT_QUERY_FOR_CLIENT
				timesheetParams.clientId = clientIds[0] // Use first client for now
			} else if (userRole === 'manager' && teamMemberIds.length > 0) {
				timesheetQuery = MANAGER_TIMESHEET_REPORT_QUERY
				timesheetParams.managerId = userId
			} else if (userRole === 'admin' && urlUserId.length > 0 && urlUserId[0] !== 'unknown') {
				timesheetQuery = USER_TIMESHEET_REPORT_QUERY
				timesheetParams.userId = urlUserId[0]
			} else {
				timesheetQuery = TIMESHEET_REPORT_QUERY
			}

			const timesheetsRaw = await sanityFetch<any[]>({
				query: timesheetQuery,
				params: timesheetParams
			})

			let timesheets = timesheetsRaw || []

			// Single-user view with client/project/task filters: keep only entries matching those filters
			if (isSingleUserView && timesheets.length > 0 && (selectedClients.length > 0 || selectedProjects.length > 0 || selectedTasks.length > 0)) {
				const clientIds = new Set(selectedClients.map(c => c.id))
				const projectIds = new Set(selectedProjects.map(p => p.id))
				const taskIds = new Set(selectedTasks.map(t => t.id))
				timesheets = timesheets.map((ts: any) => {
					if (!ts.entries || !Array.isArray(ts.entries)) return { ...ts, entries: [] }
					const filteredEntries = ts.entries.filter((e: any) => {
						if (clientIds.size > 0 && (!e.project?.client?._id || !clientIds.has(e.project.client._id))) return false
						if (projectIds.size > 0 && (!e.project?._id || !projectIds.has(e.project._id))) return false
						if (taskIds.size > 0 && (!e.task?._id || !taskIds.has(e.task._id))) return false
						return true
					})
					return { ...ts, entries: filteredEntries }
				}).filter((ts: any) => (ts.entries?.length ?? 0) > 0)
			}

			// When task filter was used with client filter (e.g. client + task in URL), restrict to selected clients only
			if (timesheets.length > 0 && selectedTasks.length > 0 && selectedClients.length > 0) {
				const clientIds = new Set(selectedClients.map(c => c.id))
				timesheets = timesheets.map((ts: any) => {
					if (!ts.entries || !Array.isArray(ts.entries)) return { ...ts, entries: [] }
					const filteredEntries = ts.entries.filter((e: any) =>
						e.project?.client?._id && clientIds.has(e.project.client._id)
					)
					return { ...ts, entries: filteredEntries }
				}).filter((ts: any) => (ts.entries?.length ?? 0) > 0)
			}

			// When task filter was used with project filter (e.g. project + task in URL), restrict to selected tasks only
			// This ensures task filtering works even when projects are selected (since projects are prioritized in query selection)
			if (timesheets.length > 0 && selectedTasks.length > 0 && selectedProjects.length > 0) {
				const taskIds = new Set(selectedTasks.map(t => t.id))
				timesheets = timesheets.map((ts: any) => {
					if (!ts.entries || !Array.isArray(ts.entries)) return { ...ts, entries: [] }
					const filteredEntries = ts.entries.filter((e: any) =>
						e.task?._id && taskIds.has(e.task._id)
					)
					return { ...ts, entries: filteredEntries }
				}).filter((ts: any) => (ts.entries?.length ?? 0) > 0)
			}

			// When user[] is in URL (admin filtering by specific user(s)), show only those users' timesheets
			const validUrlUserIds = urlUserId.filter((id): id is string => !!id && id !== 'unknown')
			if (timesheets.length > 0 && validUrlUserIds.length > 0) {
				const urlUserSet = new Set(validUrlUserIds)
				timesheets = timesheets.filter((ts: any) => {
					const tsUserId = ts.user?._id
					return tsUserId && urlUserSet.has(tsUserId)
				})
			}
			
			setReportData([])
			setTimesheetEntries(timesheets)
		} catch (error) {
			console.error('Error running report:', error)
		} finally {
			setIsLoadingReport(false)
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedClients, selectedProjects, selectedTasks, activeProjectsOnly, timeframe, customStartDate, customEndDate, userId, userRole, teamMemberIds])
	
	// Auto-run report if URL params were loaded (ref prevents double run in Strict Mode)
	useEffect(() => {
		if (shouldAutoRun && !isLoading && !hasAutoRunRef.current) {
			hasAutoRunRef.current = true
			setShouldAutoRun(false)
			runReport()
		}
	}, [shouldAutoRun, isLoading, runReport])

	// Load a page when "All" uses cursor-based pagination
	const loadReportPage = useCallback(async (page: number) => {
		setIsLoadingReport(true)
		try {
			const { start, end } = getDateRange()
			const baseParams = { startDate: start, endDate: end, pageSize: REPORT_PAGE_SIZE }

			// Build cursor chain if we're jumping to a page we haven't visited (e.g. page 5)
			if (page > 0 && reportPageCursorsRef.current[page] === undefined) {
				for (let p = 0; p < page; p++) {
					const cur = reportPageCursorsRef.current[p] ?? null
					const buildParams: Record<string, unknown> = {
						...baseParams,
						lastWeekStart: cur?.weekStart ?? null,
						lastId: cur?._id ?? null
					}
					const raw = await sanityFetch<any[]>({
						query: TIMESHEET_REPORT_QUERY_CURSOR,
						params: buildParams
					})
					const arr = raw || []
					if (arr.length > 0) {
						const last = arr[arr.length - 1]
						reportPageCursorsRef.current[p + 1] = { weekStart: normalizeCursorWeekStart(last.weekStart), _id: last._id }
					}
				}
			}

			const cursor = reportPageCursorsRef.current[page] ?? null
			const params: Record<string, unknown> = {
				...baseParams,
				lastWeekStart: cursor?.weekStart ?? null,
				lastId: cursor?._id ?? null
			}
			const timesheetsRaw = await sanityFetch<any[]>({
				query: TIMESHEET_REPORT_QUERY_CURSOR,
				params
			})
			const list = timesheetsRaw || []
			// Page returned no data – last page with data is page-1; correct total and go back to that page
			if (list.length === 0 && page > 0) {
				// Only override total pages if we didn't get it from count (e.g. count query failed)
				setReportTotalPages((prev) => (prev == null ? page : prev))
				const prevCursor = reportPageCursorsRef.current[page - 1] ?? null
				const prevParams: Record<string, unknown> = {
					...baseParams,
					lastWeekStart: prevCursor?.weekStart ?? null,
					lastId: prevCursor?._id ?? null
				}
				const prevRaw = await sanityFetch<any[]>({
					query: TIMESHEET_REPORT_QUERY_CURSOR,
					params: prevParams
				})
				setTimesheetEntries(prevRaw || [])
				setReportPage(page - 1)
			} else {
				setTimesheetEntries(list)
				setReportPage(page)
				if (list.length > 0) {
					const last = list[list.length - 1]
					reportPageCursorsRef.current[page + 1] = { weekStart: normalizeCursorWeekStart(last.weekStart), _id: last._id }
				}
				// Total pages is set from count on initial run; only override if this is the last page and we didn't have count
				if (list.length < REPORT_PAGE_SIZE && reportTotalPages == null) {
					setReportTotalPages(page + 1)
				}
			}
		} catch (error) {
			console.error('Error loading report page:', error)
		} finally {
			setIsLoadingReport(false)
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [normalizeCursorWeekStart, reportTotalPages])

	// Flatten timesheet entries and match to time entries
	const reportDataWithTimesheets = useMemo(() => {
		// Flatten timesheet entries
		const flattenedTimesheetEntries: any[] = []
		timesheetEntries.forEach(timesheet => {
			if (timesheet.entries && Array.isArray(timesheet.entries)) {
				timesheet.entries.forEach((entry: any) => {
					flattenedTimesheetEntries.push({
						...entry,
						user: timesheet.user,
					})
				})
			}
		})
		
		// Helper function to normalize dates for comparison
		const normalizeDate = (date: any): string | null => {
			if (!date) return null
			// If it's already a string in YYYY-MM-DD format, return it
			if (typeof date === 'string') {
				// Extract YYYY-MM-DD from various formats (e.g., "2024-01-15" or "2024-01-15T00:00:00.000Z")
				const match = date.match(/(\d{4}-\d{2}-\d{2})/)
				return match ? match[1] : null
			}
			// If it's a Date object, format it
			if (date instanceof Date) {
				return format(date, 'yyyy-MM-dd')
			}
			return null
		}
		
		// Helper function to check if two entries match
		const entriesMatch = (entry: TimeEntry, tsEntry: any): boolean => {
			// Normalize dates for comparison
			const entryDate = normalizeDate(entry.date)
			const tsEntryDate = normalizeDate(tsEntry.date)
			
			// Compare dates (normalized to YYYY-MM-DD)
			if (entryDate !== tsEntryDate) {
				return false
			}
			
			// Compare users
			const entryUserId = entry.user?._id
			const tsEntryUserId = tsEntry.user?._id
			if (entryUserId !== tsEntryUserId) {
				return false
			}
			
			// Compare projects
			const entryProjectId = entry.project?._id
			const tsEntryProjectId = tsEntry.project?._id
			if (entryProjectId !== tsEntryProjectId) {
				return false
			}
			
			// Compare tasks - handle null/undefined cases (both null/undefined should match)
			const entryTaskId = entry.task?._id || null
			const tsEntryTaskId = tsEntry.task?._id || null
			if (entryTaskId !== tsEntryTaskId) {
				return false
			}
			
			return true
		}
		
		// Track which timesheet entries have been matched to avoid double-counting
		const matchedTimesheetEntryIndices = new Set<number>()
		
		// First, match timesheet entries to existing time entries
		const matchedEntries = reportData.map(entry => {
			// Find matching timesheet entries that haven't been matched yet (same date, user, project, task)
			const matchingTimesheetEntries = flattenedTimesheetEntries
				.map((tsEntry, index) => ({ tsEntry, index }))
				.filter(({ tsEntry, index }) => 
					!matchedTimesheetEntryIndices.has(index) && entriesMatch(entry, tsEntry)
				)
			
			// Take the first unmatched timesheet entry and mark it as matched
			const firstMatchingEntry = matchingTimesheetEntries[0]
			if (firstMatchingEntry) {
				matchedTimesheetEntryIndices.add(firstMatchingEntry.index)
			}
			
			const timesheetHours = firstMatchingEntry 
				? formatDecimalHours(hoursToDecimal(firstMatchingEntry.tsEntry.hours || 0))
				: 0
			// Prefer notes from timesheet when matched, then time entry
			const notes = (firstMatchingEntry?.tsEntry?.notes ?? entry.notes) ?? ''
			
			return {
				...entry,
				notes,
				timesheetHours: timesheetHours || 0
			}
		})
		
		// Second, add timesheet entries that don't have matching time entries (or weren't matched)
		const unmatchedTimesheetEntries = flattenedTimesheetEntries
			.map((tsEntry, index) => ({ tsEntry, index }))
			.filter(({ tsEntry, index }) => {
				// Include if not matched to any time entry AND not already matched in the first pass
				return !matchedTimesheetEntryIndices.has(index) && 
					!reportData.some(entry => entriesMatch(entry, tsEntry))
			})
			.map(({ tsEntry }) => tsEntry)
		
		// Convert unmatched timesheet entries to TimeEntry format
		const timesheetOnlyEntries: TimeEntry[] = unmatchedTimesheetEntries.map(tsEntry => ({
			_id: `timesheet-${tsEntry._key || Date.now()}-${Math.random()}`,
			date: tsEntry.date,
			hours: 0, // No time entry hours, only timesheet hours
			client: tsEntry.project?.client || { _id: '', name: 'No client' },
			project: tsEntry.project || { _id: '', name: 'No project' },
			task: tsEntry.task || { _id: '', name: 'No task' },
			user: tsEntry.user || { _id: '', firstName: '', lastName: '' },
			notes: tsEntry.notes || '',
			timesheetHours: hoursToDecimal(tsEntry.hours || 0)
		}))
		
		// Combine matched entries with timesheet-only entries
		return [...matchedEntries, ...timesheetOnlyEntries]
	}, [reportData, timesheetEntries])
	
	// Group entries based on groupBy selection
	const groupedData: GroupedEntries = useMemo(() => {
		return reportDataWithTimesheets.reduce((acc, entry) => {
			let key: string
			let label: string
			let sortKey: string

			switch (groupBy) {
				case 'client':
					key = entry.client?._id || 'no-client'
					label = entry.client?.name || 'No client'
					sortKey = label.toLowerCase()
					break
				case 'project':
					key = entry.project?._id || 'no-project'
					label = entry.project?.name || 'No project'
					sortKey = label.toLowerCase()
					break
				case 'task':
					key = entry.task?._id || 'no-task'
					label = entry.task?.name || 'No task'
					sortKey = label.toLowerCase()
					break
				case 'person':
					key = entry.user?._id || 'unknown'
					label = entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : 'Unknown'
					sortKey = label.toLowerCase()
					break
				case 'date':
				default:
					key = entry.date
					label = format(new Date(entry.date), 'dd/MM/yyyy')
					sortKey = entry.date // ISO date format sorts correctly
					break
			}

			if (!acc[key]) {
				acc[key] = { entries: [], totalHours: 0, totalTimesheetHours: 0, label, sortKey }
			}
			acc[key].entries.push(entry)
			acc[key].totalHours += hoursToDecimal(entry.hours)
			acc[key].totalTimesheetHours += hoursToDecimal(entry.timesheetHours || 0)
			return acc
		}, {} as GroupedEntries)
	}, [reportDataWithTimesheets, groupBy])

	// Sort grouped data
	const sortedGroupedData = Object.entries(groupedData).sort(([, a], [, b]) => {
		if (groupBy === 'date') {
			// Sort dates descending (newest first)
			return b.sortKey.localeCompare(a.sortKey)
		}
		// Sort other groupings alphabetically ascending
		return a.sortKey.localeCompare(b.sortKey)
	})

	// Toggle group collapse/expand (UI only - doesn't affect data or exports)
	const toggleGroup = useCallback((key: string) => {
		setCollapsedGroups(prev => {
			const next = new Set(prev)
			if (next.has(key)) {
				next.delete(key)
			} else {
				next.add(key)
			}
			return next
		})
	}, [])

	// Collapse all groups whenever report data actually changes (including pagination)
	// Use a ref to track group keys and only collapse when they actually change
	useEffect(() => {
		if (sortedGroupedData.length > 0) {
			// Create a stable string representation of group keys
			const currentGroupKeys = sortedGroupedData.map(([key]) => key).sort().join(',')
			
			// Only collapse if the group keys have actually changed (new data or new page)
			if (currentGroupKeys !== previousGroupKeysRef.current) {
				const allGroupKeys = new Set(sortedGroupedData.map(([key]) => key))
				setCollapsedGroups(allGroupKeys)
				previousGroupKeysRef.current = currentGroupKeys
			}
		} else {
			// Clear collapsed groups when report data is cleared
			setCollapsedGroups(new Set())
			previousGroupKeysRef.current = ''
		}
	}, [sortedGroupedData])

	// Calculate totals
	const totalHours = reportDataWithTimesheets.reduce((sum, entry) => sum + hoursToDecimal(entry.hours), 0)
	const totalTimesheetHours = reportDataWithTimesheets.reduce((sum, entry) => sum + hoursToDecimal(entry.timesheetHours || 0), 0)
	// When "All" is selected, show grand total across all pages; otherwise show current page/set total
	const displayTotalHours = isPaginatedReport && reportTotalHours != null ? reportTotalHours : totalTimesheetHours
	const uniqueClients = [...new Set(reportDataWithTimesheets.map(e => e.client?._id).filter(Boolean))]

	// Click outside handler - clears invalid search text
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (clientRef.current && !clientRef.current.contains(event.target as Node)) {
				setShowClientDropdown(false)
				// Clear search if no matching item exists and nothing was just selected
				if (!justSelectedClient && clientSearch) {
					const matches = availableClients.some(c => 
						c.name.toLowerCase() === clientSearch.toLowerCase()
					)
					if (!matches) {
						setClientSearch('')
					}
				}
				setJustSelectedClient(false)
			}
			if (projectRef.current && !projectRef.current.contains(event.target as Node)) {
				setShowProjectDropdown(false)
				if (!justSelectedProject && projectSearch) {
					const matches = availableProjects.some(p => 
						p.name.toLowerCase() === projectSearch.toLowerCase()
					)
					if (!matches) {
						setProjectSearch('')
					}
				}
				setJustSelectedProject(false)
			}
			if (taskRef.current && !taskRef.current.contains(event.target as Node)) {
				setShowTaskDropdown(false)
				if (!justSelectedTask && taskSearch) {
					const matches = availableTasks.some(t => 
						t.name.toLowerCase() === taskSearch.toLowerCase()
					)
					if (!matches) {
						setTaskSearch('')
					}
				}
				setJustSelectedTask(false)
			}
			if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
				setShowExportDropdown(false)
			}
		}
		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [clientSearch, projectSearch, taskSearch, availableClients, availableProjects, availableTasks, justSelectedClient, justSelectedProject, justSelectedTask])

	// Export functions
	const getExportData = useCallback(() => {
		const { start, end } = getDateRange()
		const dateRangeStr = `${format(new Date(start), 'dd-MM-yyyy')}_to_${format(new Date(end), 'dd-MM-yyyy')}`
		
		// Prepare flat data for export (timesheet hours + notes)
		const exportRows = sortedGroupedData.flatMap(([, { entries }]) =>
			entries.map(entry => ({
				Date: format(new Date(entry.date), 'dd/MM/yyyy'),
				Client: entry.client?.name || 'No client',
				Project: entry.project?.name || 'No project',
				Task: entry.task?.name || 'No task',
				Person: entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : 'Unknown',
				Hours: entry.timesheetHours || 0,
				Notes: entry.notes || '',
			}))
		)
		
		return { exportRows, dateRangeStr }
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sortedGroupedData, timeframe, customStartDate, customEndDate])

	// Fetch all timesheet data for export when "All" is selected (paginated report)
	const fetchAllDataForExport = useCallback(async (): Promise<{ exportRows: Array<{ Date: string; Client: string; Project: string; Task: string; Person: string; Hours: number; Notes: string }>; dateRangeStr: string }> => {
		const { start, end } = getDateRange()
		const dateRangeStr = `${format(new Date(start), 'dd-MM-yyyy')}_to_${format(new Date(end), 'dd-MM-yyyy')}`
		const allTimesheets: any[] = []
		let cursor: { weekStart: string; _id: string } | null = null
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const params: Record<string, unknown> = {
				startDate: start,
				endDate: end,
				pageSize: REPORT_PAGE_SIZE,
				lastWeekStart: cursor?.weekStart ?? null,
				lastId: cursor?._id ?? null
			}
			const list = await sanityFetch<any[]>({
				query: TIMESHEET_REPORT_QUERY_CURSOR,
				params
			})
			const batch = list || []
			allTimesheets.push(...batch)
			if (batch.length < REPORT_PAGE_SIZE || batch.length === 0) break
			const last = batch[batch.length - 1]
			cursor = { weekStart: normalizeCursorWeekStart(last.weekStart), _id: last._id }
		}
		const flatEntries: any[] = []
		allTimesheets.forEach(ts => {
			(ts.entries || []).forEach((entry: any) => {
				flatEntries.push({ ...entry, user: ts.user })
			})
		})
		const exportRows = flatEntries.map(entry => ({
			Date: format(new Date(entry.date), 'dd/MM/yyyy'),
			Client: entry.project?.client?.name || 'No client',
			Project: entry.project?.name || 'No project',
			Task: entry.task?.name || 'No task',
			Person: entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : 'Unknown',
			Hours: hoursToDecimal(entry.hours || 0),
			Notes: entry.notes || ''
		}))
		return { exportRows, dateRangeStr }
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [normalizeCursorWeekStart])

	const exportToCSV = useCallback(async () => {
		if (isPaginatedReport) {
			setIsExporting(true)
			setShowExportDropdown(false)
			try {
				const { exportRows, dateRangeStr } = await fetchAllDataForExport()
				if (exportRows.length === 0) {
					alert('No data to export')
					return
				}
				const totalHours = reportTotalHours ?? exportRows.reduce((s, r) => s + (r.Hours ?? 0), 0)
				const headers = ['Date', 'Client', 'Project', 'Task', 'Person', 'Hours', 'Notes']
				const csvContent = [
					headers.join(','),
					...exportRows.map(row =>
						headers.map(header => {
							const value = row[header as keyof typeof row]
							const strValue = String(value ?? '')
							if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
								return `"${strValue.replace(/"/g, '""')}"`
							}
							return strValue
						}).join(',')
					),
					'',
					`,,,,Total,${totalHours.toFixed(2)},`
				].join('\n')
				const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
				const link = document.createElement('a')
				link.href = URL.createObjectURL(blob)
				link.download = `detailed-time-report_${dateRangeStr}.csv`
				link.click()
				URL.revokeObjectURL(link.href)
			} finally {
				setIsExporting(false)
			}
			return
		}
		const { exportRows, dateRangeStr } = getExportData()
		if (exportRows.length === 0) {
			alert('No data to export')
			return
		}
		const headers = ['Date', 'Client', 'Project', 'Task', 'Person', 'Hours', 'Notes']
		const csvContent = [
			headers.join(','),
			...exportRows.map(row =>
				headers.map(header => {
					const value = row[header as keyof typeof row]
					const strValue = String(value ?? '')
					if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
						return `"${strValue.replace(/"/g, '""')}"`
					}
					return strValue
				}).join(',')
			),
			'',
			`,,,,Total,${totalTimesheetHours.toFixed(2)},`
		].join('\n')
		const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
		const link = document.createElement('a')
		link.href = URL.createObjectURL(blob)
		link.download = `detailed-time-report_${dateRangeStr}.csv`
		link.click()
		URL.revokeObjectURL(link.href)
		setShowExportDropdown(false)
	}, [getExportData, totalTimesheetHours, isPaginatedReport, reportTotalHours, fetchAllDataForExport])

	const exportToExcel = useCallback(async () => {
		if (isPaginatedReport) {
			setIsExporting(true)
			setShowExportDropdown(false)
			try {
				const { exportRows, dateRangeStr } = await fetchAllDataForExport()
				if (exportRows.length === 0) {
					alert('No data to export')
					return
				}
				const totalHours = reportTotalHours ?? exportRows.reduce((s, r) => s + (r.Hours ?? 0), 0)
				const dataWithTotal = [
					...exportRows,
					{ Date: '', Client: '', Project: '', Task: '', Person: 'Total', Hours: totalHours, Notes: '' }
				]
				const ws = XLSX.utils.json_to_sheet(dataWithTotal)
				ws['!cols'] = [
					{ wch: 12 }, { wch: 25 }, { wch: 30 }, { wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 40 }
				]
				const wb = XLSX.utils.book_new()
				XLSX.utils.book_append_sheet(wb, ws, 'Time Report')
				XLSX.writeFile(wb, `detailed-time-report_${dateRangeStr}.xlsx`)
			} finally {
				setIsExporting(false)
			}
			return
		}
		const { exportRows, dateRangeStr } = getExportData()
		if (exportRows.length === 0) {
			alert('No data to export')
			return
		}
		const dataWithTotal = [
			...exportRows,
			{ Date: '', Client: '', Project: '', Task: '', Person: 'Total', Hours: totalTimesheetHours, Notes: '' }
		]
		const ws = XLSX.utils.json_to_sheet(dataWithTotal)
		ws['!cols'] = [
			{ wch: 12 }, { wch: 25 }, { wch: 30 }, { wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 40 }
		]
		const wb = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(wb, ws, 'Time Report')
		XLSX.writeFile(wb, `detailed-time-report_${dateRangeStr}.xlsx`)
		setShowExportDropdown(false)
	}, [getExportData, totalTimesheetHours, isPaginatedReport, reportTotalHours, fetchAllDataForExport])

	const exportToPDF = useCallback(async () => {
		if (isPaginatedReport) {
			setIsExporting(true)
			setShowExportDropdown(false)
			try {
				const { exportRows, dateRangeStr } = await fetchAllDataForExport()
				if (exportRows.length === 0) {
					alert('No data to export')
					return
				}
				const totalHours = reportTotalHours ?? exportRows.reduce((s, r) => s + (r.Hours ?? 0), 0)
				const { start, end } = getDateRange()
				const doc = new jsPDF('landscape')
				doc.setFontSize(18)
				doc.text('Detailed Time Report', 14, 20)
				doc.setFontSize(11)
				doc.setTextColor(100)
				doc.text(`Period: ${format(new Date(start), 'dd/MM/yyyy')} - ${format(new Date(end), 'dd/MM/yyyy')}`, 14, 28)
				doc.text(`Total Hours: ${totalHours.toFixed(2)}`, 14, 35)
				doc.text(`Clients: ${selectedClients.length > 0 ? selectedClients.map(c => c.name).join(', ') : 'All'}`, 14, 42)
				autoTable(doc, {
					startY: 52,
					head: [['Date', 'Client', 'Project', 'Task', 'Person', 'Hours', 'Notes']],
					body: [
						...exportRows.map(row => [
							row.Date,
							row.Client,
							row.Project,
							row.Task,
							row.Person,
							(row.Hours ?? 0).toFixed(2),
							row.Notes ?? ''
						]),
						['', '', '', '', 'Total', totalHours.toFixed(2), '']
					],
					styles: { fontSize: 9, cellPadding: 3 },
					headStyles: { fillColor: [55, 65, 81], textColor: 255, fontStyle: 'bold' },
					footStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontStyle: 'bold' },
					alternateRowStyles: { fillColor: [249, 250, 251] },
					columnStyles: {
						0: { cellWidth: 25 }, 1: { cellWidth: 40 }, 2: { cellWidth: 45 }, 3: { cellWidth: 40 },
						4: { cellWidth: 35 }, 5: { cellWidth: 22, halign: 'right' }, 6: { cellWidth: 55, halign: 'left' }
					},
					didParseCell: (data) => {
						if (data.row.index === exportRows.length && data.section === 'body') {
							data.cell.styles.fillColor = [243, 244, 246]
							data.cell.styles.fontStyle = 'bold'
						}
					}
				})
				const pageCount = doc.getNumberOfPages()
				for (let i = 1; i <= pageCount; i++) {
					doc.setPage(i)
					doc.setFontSize(8)
					doc.setTextColor(150)
					doc.text(
						`Generated on ${format(new Date(), 'dd/MM/yyyy HH:mm')} | Page ${i} of ${pageCount}`,
						doc.internal.pageSize.getWidth() / 2,
						doc.internal.pageSize.getHeight() - 10,
						{ align: 'center' }
					)
				}
				doc.save(`detailed-time-report_${dateRangeStr}.pdf`)
			} finally {
				setIsExporting(false)
			}
			return
		}
		const { exportRows, dateRangeStr } = getExportData()
		const { start, end } = getDateRange()
		
		if (exportRows.length === 0) {
			alert('No data to export')
			return
		}
		
		// Create PDF document (landscape for better table fit)
		const doc = new jsPDF('landscape')
		
		// Add title
		doc.setFontSize(18)
		doc.text('Detailed Time Report', 14, 20)
		
		// Add date range
		doc.setFontSize(11)
		doc.setTextColor(100)
		doc.text(`Period: ${format(new Date(start), 'dd/MM/yyyy')} - ${format(new Date(end), 'dd/MM/yyyy')}`, 14, 28)
		
		// Add summary info (single Total Hours from timesheet)
		doc.text(`Total Hours: ${totalTimesheetHours.toFixed(2)}`, 14, 35)
		doc.text(`Clients: ${selectedClients.length > 0 ? selectedClients.map(c => c.name).join(', ') : 'All'}`, 14, 42)
		
		// Create table (Hours + Notes)
		autoTable(doc, {
			startY: 52,
			head: [['Date', 'Client', 'Project', 'Task', 'Person', 'Hours', 'Notes']],
			body: [
				...exportRows.map(row => [
					row.Date,
					row.Client,
					row.Project,
					row.Task,
					row.Person,
					(row.Hours ?? 0).toFixed(2),
					row.Notes ?? ''
				]),
				// Total row
				['', '', '', '', 'Total', totalTimesheetHours.toFixed(2), '']
			],
			styles: {
				fontSize: 9,
				cellPadding: 3,
			},
			headStyles: {
				fillColor: [55, 65, 81], // gray-700
				textColor: 255,
				fontStyle: 'bold',
			},
			footStyles: {
				fillColor: [243, 244, 246], // gray-100
				textColor: [17, 24, 39], // gray-900
				fontStyle: 'bold',
			},
			alternateRowStyles: {
				fillColor: [249, 250, 251], // gray-50
			},
			columnStyles: {
				0: { cellWidth: 25 }, // Date
				1: { cellWidth: 40 }, // Client
				2: { cellWidth: 45 }, // Project
				3: { cellWidth: 40 }, // Task
				4: { cellWidth: 35 }, // Person
				5: { cellWidth: 22, halign: 'right' }, // Hours
				6: { cellWidth: 55, halign: 'left' }, // Notes
			},
			didParseCell: (data) => {
				// Style the total row
				if (data.row.index === exportRows.length && data.section === 'body') {
					data.cell.styles.fillColor = [243, 244, 246]
					data.cell.styles.fontStyle = 'bold'
				}
			},
		})
		
		// Add footer with generation date
		const pageCount = doc.getNumberOfPages()
		for (let i = 1; i <= pageCount; i++) {
			doc.setPage(i)
			doc.setFontSize(8)
			doc.setTextColor(150)
			doc.text(
				`Generated on ${format(new Date(), 'dd/MM/yyyy HH:mm')} | Page ${i} of ${pageCount}`,
				doc.internal.pageSize.getWidth() / 2,
				doc.internal.pageSize.getHeight() - 10,
				{ align: 'center' }
			)
		}
		
		// Download file
		doc.save(`detailed-time-report_${dateRangeStr}.pdf`)
		setShowExportDropdown(false)
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [getExportData, totalTimesheetHours, selectedClients, isPaginatedReport, reportTotalHours, fetchAllDataForExport])

	const handlePrint = useCallback(() => {
		const { start, end } = getDateRange()
		
		if (sortedGroupedData.length === 0) {
			alert('No data to print')
			return
		}

		const escapeHtml = (str: string) =>
			String(str)
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')

		// Get headers based on groupBy
		const getHeaders = () => {
			const headers = []
			if (groupBy !== 'date') headers.push('Date')
			if (groupBy !== 'client') headers.push('Client')
			if (groupBy !== 'project') headers.push('Project')
			if (groupBy !== 'task') headers.push('Task')
			if (groupBy !== 'person') headers.push('Person')
			headers.push('Hours')
			return headers
		}

		const headers = getHeaders()
		const colCount = headers.length

		// Get group label based on groupBy
		const getGroupByLabel = () => {
			switch (groupBy) {
				case 'client': return 'Client'
				case 'project': return 'Project'
				case 'task': return 'Task'
				case 'person': return 'Person'
				default: return 'Date'
			}
		}

		// Create print-friendly HTML
		const printContent = `
			<!DOCTYPE html>
			<html>
			<head>
				<title>Detailed Time Report</title>
				<style>
					* {
						margin: 0;
						padding: 0;
						box-sizing: border-box;
					}
					body {
						font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
						font-size: 12px;
						line-height: 1.4;
						color: #111827;
						padding: 20px;
					}
					.header {
						margin-bottom: 24px;
						padding-bottom: 16px;
						border-bottom: 2px solid #e5e7eb;
					}
					.header h1 {
						font-size: 24px;
						font-weight: 600;
						margin-bottom: 8px;
					}
					.header .date-range {
						font-size: 14px;
						color: #6b7280;
						margin-bottom: 12px;
					}
					.summary {
						display: flex;
						gap: 32px;
						margin-bottom: 8px;
					}
					.summary-item {
						display: flex;
						gap: 8px;
					}
					.summary-label {
						color: #6b7280;
					}
					.summary-value {
						font-weight: 500;
					}
					.total-hours {
						font-size: 32px;
						font-weight: 700;
						margin-bottom: 4px;
					}
					.total-label {
						font-size: 14px;
						color: #6b7280;
					}
					table {
						width: 100%;
						border-collapse: collapse;
						margin-top: 16px;
					}
					th {
						text-align: left;
						padding: 10px 12px;
						background-color: #f3f4f6;
						border-bottom: 2px solid #d1d5db;
						font-weight: 600;
						font-size: 11px;
						text-transform: uppercase;
						color: #4b5563;
					}
					th:last-child {
						text-align: right;
					}
					td {
						padding: 8px 12px;
						border-bottom: 1px solid #e5e7eb;
					}
					td:last-child {
						text-align: right;
					}
					.group-row {
						background-color: #f9fafb;
					}
					.group-row td {
						font-weight: 600;
						color: #374151;
						padding: 6px 12px;
					}
					.total-row {
						background-color: #f3f4f6;
						border-top: 2px solid #9ca3af;
					}
					.total-row td {
						font-weight: 700;
						padding: 10px 12px;
					}
					.notes-row td {
						padding: 2px 12px 10px 12px;
						font-size: 11px;
						color: #6b7280;
						border-bottom: 1px solid #e5e7eb;
						text-align: left;
					}
					.notes-cell {
						padding-left: 12px !important;
					}
					.footer {
						margin-top: 24px;
						padding-top: 12px;
						border-top: 1px solid #e5e7eb;
						font-size: 10px;
						color: #9ca3af;
						text-align: center;
					}
					@media print {
						body {
							padding: 0;
						}
						.no-print {
							display: none;
						}
					}
				</style>
			</head>
			<body>
				<div class="header">
					<h1>Detailed Time Report</h1>
					<div class="date-range">
						${format(new Date(start), 'MMMM d, yyyy')} - ${format(new Date(end), 'MMMM d, yyyy')}
					</div>
					<div style="display: flex; justify-content: space-between; align-items: flex-end;">
						<div>
							<div class="total-label">Total Hours</div>
							<div class="total-hours">${totalTimesheetHours.toFixed(2)}</div>
						</div>
						<div style="text-align: right;">
							<div class="summary">
								<div class="summary-item">
									<span class="summary-label">Grouped by:</span>
									<span class="summary-value">${getGroupByLabel()}</span>
								</div>
							</div>
							<div class="summary">
								<div class="summary-item">
									<span class="summary-label">Clients:</span>
									<span class="summary-value">${selectedClients.length > 0 ? selectedClients.map(c => c.name).join(', ') : 'All'}</span>
								</div>
							</div>
							<div class="summary">
								<div class="summary-item">
									<span class="summary-label">Projects:</span>
									<span class="summary-value">${selectedProjects.length > 0 ? selectedProjects.map(p => p.name).join(', ') : 'All'}</span>
								</div>
							</div>
							<div class="summary">
								<div class="summary-item">
									<span class="summary-label">Tasks:</span>
									<span class="summary-value">${selectedTasks.length > 0 ? selectedTasks.map(t => t.name).join(', ') : 'All'}</span>
								</div>
							</div>
						</div>
					</div>
				</div>

				<table>
					<thead>
						<tr>
							${headers.map(h => `<th>${h}</th>`).join('')}
						</tr>
					</thead>
					<tbody>
						${sortedGroupedData.map(([, { entries, totalTimesheetHours: groupTimesheetTotal, label }]) => {
							return `
								<tr class="group-row">
									<td colspan="${colCount - 1}">${label}</td>
									<td>${groupTimesheetTotal.toFixed(2)}</td>
								</tr>
								${entries.map(entry => {
									const cells = []
									if (groupBy !== 'date') cells.push(format(new Date(entry.date), 'dd/MM/yyyy'))
									if (groupBy !== 'client') cells.push(entry.client?.name || 'No client')
									if (groupBy !== 'project') cells.push(entry.project?.name || 'No project')
									if (groupBy !== 'task') cells.push(entry.task?.name || 'No task')
									if (groupBy !== 'person') cells.push(entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : 'Unknown')
									cells.push(hoursToDecimal(entry.timesheetHours || 0).toFixed(2))
									const notes = entry.notes ? escapeHtml(String(entry.notes)) : ''
									return `<tr>${cells.map(c => `<td>${escapeHtml(String(c))}</td>`).join('')}</tr>
								${notes ? `<tr class="notes-row"><td colspan="${colCount}" class="notes-cell">${notes}</td></tr>` : ''}`
								}).join('')}
							`
						}).join('')}
						<tr class="total-row">
							<td colspan="${colCount - 1}" style="text-align: right;">Total</td>
							<td>${totalTimesheetHours.toFixed(2)}</td>
						</tr>
					</tbody>
				</table>

				<div class="footer">
					Generated on ${format(new Date(), 'MMMM d, yyyy \'at\' h:mm a')}
				</div>
			</body>
			</html>
		`

		// Open print window
		const printWindow = window.open('', '_blank', 'width=900,height=700')
		if (printWindow) {
			printWindow.document.write(printContent)
			printWindow.document.close()
			
			// Wait for content to load then print
			printWindow.onload = () => {
				printWindow.focus()
				printWindow.print()
			}
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sortedGroupedData, totalTimesheetHours, selectedClients, selectedProjects, selectedTasks, groupBy])

	// Filter functions
	const filteredClients = availableClients.filter(
		c => !selectedClients.find(s => s.id === c.id) && 
		c.name.toLowerCase().includes(clientSearch.toLowerCase())
	)

	// Filter projects: exclude already selected, match search term, and filter by selected clients
	const filteredProjects = availableProjects.filter(p => {
		// Exclude already selected projects
		if (selectedProjects.find(s => s.id === p.id)) return false
		// Match search term
		if (!p.name.toLowerCase().includes(projectSearch.toLowerCase())) return false
		// If clients are selected, only show projects belonging to those clients
		if (selectedClients.length > 0) {
			return selectedClients.some(client => client.id === p.clientId)
		}
		return true
	})

	const filteredTasks = availableTasks.filter(
		t => !selectedTasks.find(s => s.id === t.id) && 
		t.name.toLowerCase().includes(taskSearch.toLowerCase())
	)

	// Helper function to clear invalid search text
	const clearInvalidSearch = (
		searchText: string,
		availableItems: FilterTag[],
		setSearch: (value: string) => void
	) => {
		if (searchText) {
			const matches = availableItems.some(item => 
				item.name.toLowerCase() === searchText.toLowerCase()
			)
			if (!matches) {
				setSearch('')
			}
		}
	}

	// Add/Remove functions
	const addClient = (client: FilterTag) => {
		setSelectedClients([...selectedClients, client])
		setClientSearch('')
		setJustSelectedClient(true)
		setShowClientDropdown(false)
		// Reset flag after a short delay to allow blur handlers to check it
		setTimeout(() => setJustSelectedClient(false), 100)
	}

	const removeClient = (id: string) => {
		setSelectedClients(selectedClients.filter(c => c.id !== id))
	}

	const addProject = (project: FilterTag) => {
		setSelectedProjects([...selectedProjects, project])
		setProjectSearch('')
		setJustSelectedProject(true)
		setShowProjectDropdown(false)
		setTimeout(() => setJustSelectedProject(false), 100)
	}

	const removeProject = (id: string) => {
		setSelectedProjects(selectedProjects.filter(p => p.id !== id))
	}

	const addTask = (task: FilterTag) => {
		setSelectedTasks([...selectedTasks, task])
		setTaskSearch('')
		setJustSelectedTask(true)
		setShowTaskDropdown(false)
		setTimeout(() => setJustSelectedTask(false), 100)
	}

	const removeTask = (id: string) => {
		setSelectedTasks(selectedTasks.filter(t => t.id !== id))
	}

	// Keyboard handlers for better UX
	const handleClientKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter' && filteredClients.length > 0) {
			e.preventDefault()
			addClient(filteredClients[0])
		} else if (e.key === 'Escape') {
			setClientSearch('')
			setShowClientDropdown(false)
		}
	}

	const handleProjectKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter' && filteredProjects.length > 0) {
			e.preventDefault()
			addProject(filteredProjects[0])
		} else if (e.key === 'Escape') {
			setProjectSearch('')
			setShowProjectDropdown(false)
		}
	}

	const handleTaskKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter' && filteredTasks.length > 0) {
			e.preventDefault()
			addTask(filteredTasks[0])
		} else if (e.key === 'Escape') {
			setTaskSearch('')
			setShowTaskDropdown(false)
		}
	}

	// Helper to safely format date range for display
	const formatDateRangeDisplay = () => {
		const { start, end } = currentDateRange
		// Check if dates are valid (not empty and parseable)
		if (!start || !end) return null
		const startDate = new Date(start)
		const endDate = new Date(end)
		if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null
		return `${format(startDate, 'MMMM d, yyyy')} - ${format(endDate, 'MMMM d, yyyy')}`
	}

	const dateRangeDisplay = formatDateRangeDisplay()

	return (
		<div className="space-y-6 relative">
			{/* Loading Overlay */}
			{isLoadingReport && (
				<div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-50 flex items-center justify-center rounded-lg">
					<div className="flex flex-col items-center gap-3 bg-white p-6 rounded-lg shadow-lg">
						<div className="w-10 h-10 border-4 border-gray-200 border-t-primary-600 rounded-full animate-spin"></div>
						<span className="text-sm font-medium text-gray-600">Loading report...</span>
					</div>
				</div>
			)}
			{/* Header - only show when report results are visible */}
			{showReport && (
				<div className="flex items-center justify-between flex-wrap gap-2">
					<div className="flex items-center gap-4">
						<h2 className="text-2xl font-semibold text-gray-900">Detailed time report</h2>
						{dateRangeDisplay && <div className="text-sm text-gray-500">{dateRangeDisplay}</div>}
					</div>
					<div className="flex items-center gap-3">
						{/* Save report button */}
						{sortedGroupedData.length > 0 && (
							<SaveReport reportType="detailed_time" startDate={currentDateRange.start} endDate={currentDateRange.end} timeframe={timeframe} clients={selectedClients} projects={selectedProjects} tasks={selectedTasks} />
						)}
						{/* Filter toggle button */}
						<button
							type="button"
							onClick={() => setShowFilters(!showFilters)}
							className={`group min-w-[155px] flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-300 rounded-md py-2 px-3 transition-colors ${showFilters ? 'theme-color-bg theme-color-border' : ''}`}
						>
							<FiFilter className="w-4 h-4 transition-transform duration-300 group-hover:rotate-12" />
							{showFilters ? 'Hide filters' : 'Show filters'}
							{showFilters ? <FiChevronUp className="w-4 h-4" /> : <FiChevronDown className="w-4 h-4" />}
						</button>
					</div>
				</div>
			)}
			
			{/* Filter Container */}
			{showFilters && (
			<div className="space-y-5">
				{/* Timeframe */}
				<div className="flex items-center gap-4">
					<label className="w-24 text-sm font-medium text-gray-700">Timeframe</label>
					<div className="flex items-center gap-3">
						<div className="relative">
							<select
								value={timeframe}
								onChange={(e) => {
									setTimeframe(e.target.value)
									// Reset custom dates if switching away from custom
									if (e.target.value !== 'custom') {
										setCustomStartDate('')
										setCustomEndDate('')
									}
								}}
								className="appearance-none bg-white border border-gray-300 rounded-md py-2 pl-3 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-transparent focus:border-black min-w-[180px]"
							>
								{timeframeOptions.map(option => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
							<FiChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
						</div>
						
						{/* Custom Date Pickers */}
						{timeframe === 'custom' && (
							<div className="flex items-center gap-2">
								<input
									type="date"
									value={customStartDate}
									onChange={(e) => setCustomStartDate(e.target.value)}
									className="bg-white border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-transparent focus:border-black"
									placeholder="Start date"
								/>
								<span className="text-gray-500 text-sm">to</span>
								<input
									type="date"
									value={customEndDate}
									onChange={(e) => setCustomEndDate(e.target.value)}
									className="bg-white border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-transparent focus:border-black"
									placeholder="End date"
								/>
							</div>
						)}
					</div>
				</div>

				{/* Include Archived Checkbox */}
				<div className="flex items-center gap-4">
					<div className="w-24"></div>
					<label className="flex items-center gap-2 cursor-pointer">
						<input
							type="checkbox"
							checked={includeArchived}
							onChange={(e) => setIncludeArchived(e.target.checked)}
							className="w-4 h-4 rounded border-gray-300 theme-color focus:ring-transparent focus:border-black"
						/>
						<span className="text-sm text-gray-700">Include archived items in filters</span>
					</label>
				</div>

				{/* Clients */}
				<div className="flex items-start gap-4">
					<label className="w-24 text-sm font-medium text-gray-700 pt-2">Clients</label>
					<div className="flex-1 relative" ref={clientRef}>
						<div 
							className={`min-h-[42px] items-center pl-2 bg-white rounded-md flex flex-wrap gap-2 cursor-text rounded-md text-sm focus:!outline-none focus:!ring-0 border-solid border-gray-300 border border-1`}
							onClick={() => setShowClientDropdown(true)}
						>
							{selectedClients.map(client => (
								<span
									key={client.id}
									className="inline-flex items-center gap-1 bg-gray-100 text-gray-800 text-sm px-2 py-1 rounded z-10"
								>
									{client.name}
									<button
										type="button"
										onClick={(e) => { e.stopPropagation(); removeClient(client.id) }}
										className="text-gray-500 hover:text-gray-700"
									>
										<FiX className="w-3.5 h-3.5" />
									</button>
								</span>
							))}
							<input
								type="text"
								value={clientSearch}
								onChange={(e) => setClientSearch(e.target.value)}
								onFocus={() => setShowClientDropdown(true)}
								onBlur={(e) => {
									// Check if focus moved to dropdown item
									const relatedTarget = e.relatedTarget as HTMLElement
									if (!relatedTarget || !clientRef.current?.contains(relatedTarget)) {
										if (!justSelectedClient && clientSearch) {
											clearInvalidSearch(clientSearch, availableClients, setClientSearch)
										}
										setJustSelectedClient(false)
									}
								}}
								onKeyDown={handleClientKeyDown}
								placeholder={selectedClients.length === 0 ? "Select clients..." : ""}
								className="w-auto border-none outline-none focus:ring-0 text-sm focus:border-none border-left-1 border-gray-300 focus:border-black p-0"
							/>
						</div>
						{showClientDropdown && filteredClients.length > 0 && (
							<div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-auto">
								{filteredClients.map(client => (
									<div
										key={client.id}
										onMouseDown={(e) => {
											// Prevent blur from firing before click
											e.preventDefault()
											setJustSelectedClient(true)
										}}
										onClick={() => addClient(client)}
										className="px-3 py-2 text-sm hover:bg-black hover:text-white cursor-pointer"
									>
										{client.name}
									</div>
								))}
							</div>
						)}
					</div>
				</div>

				{/* Projects */}
				<div className="flex items-start gap-4">
					<label className="w-24 text-sm font-medium text-gray-700 pt-2">Projects</label>
					<div className="flex-1 relative" ref={projectRef}>
						<div 
							className={`min-h-[42px] items-center pl-2 bg-white rounded-md flex flex-wrap gap-2 cursor-text rounded-md text-sm focus:!outline-none focus:!ring-0 border-solid border-gray-300 border border-1`}
							onClick={() => setShowProjectDropdown(true)}
						>
							{selectedProjects.map(project => (
								<span
									key={project.id}
									className="inline-flex items-center gap-1 bg-gray-100 text-gray-800 text-sm px-2 py-1 rounded"
								>
									{project.name}
									<button
										type="button"
										onClick={(e) => { e.stopPropagation(); removeProject(project.id) }}
										className="text-gray-500 hover:text-gray-700"
									>
										<FiX className="w-3.5 h-3.5" />
									</button>
								</span>
							))}
							<input
								type="text"
								value={projectSearch}
								onChange={(e) => setProjectSearch(e.target.value)}
								onFocus={() => setShowProjectDropdown(true)}
								onBlur={(e) => {
									// Check if focus moved to dropdown item
									const relatedTarget = e.relatedTarget as HTMLElement
									if (!relatedTarget || !projectRef.current?.contains(relatedTarget)) {
										if (!justSelectedProject && projectSearch) {
											clearInvalidSearch(projectSearch, availableProjects, setProjectSearch)
										}
										setJustSelectedProject(false)
									}
								}}
								onKeyDown={handleProjectKeyDown}
								placeholder={selectedProjects.length === 0 ? "Select projects..." : ""}
								className="w-auto border-none outline-none focus:ring-0 text-sm focus:border-none border-left-1 border-gray-300 focus:border-black p-0"
							/>
						</div>
						{showProjectDropdown && filteredProjects.length > 0 && (
							<div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-auto">
								{filteredProjects.map(project => (
									<div
										key={project.id}
										onMouseDown={(e) => {
											// Prevent blur from firing before click
											e.preventDefault()
											setJustSelectedProject(true)
										}}
										onClick={() => addProject(project)}
										className="px-3 py-2 text-sm hover:bg-black hover:text-white cursor-pointer"
									>
										{project.name}
									</div>
								))}
							</div>
						)}
					</div>
				</div>

				{/* Tasks */}
				<div className="flex items-start gap-4">
					<label className="w-24 text-sm font-medium text-gray-700 pt-2">Tasks</label>
					<div className="flex-1 relative" ref={taskRef}>
						<div 
								className={`min-h-[42px] items-center pl-3 bg-white rounded-md flex flex-wrap gap-2 cursor-text rounded-md text-sm focus:!outline-none focus:!ring-0 border-solid border-gray-300 border border-1`}
							onClick={() => setShowTaskDropdown(true)}
						>
							{selectedTasks.map(task => (
								<span
									key={task.id}
									className="inline-flex items-center gap-1 bg-gray-100 text-gray-800 text-sm px-2 py-1 rounded whitespace-nowrap"
								>
									{task.name}
									<button
										type="button"
										onClick={(e) => { e.stopPropagation(); removeTask(task.id) }}
										className="text-gray-500 hover:text-gray-700"
									>
										<FiX className="w-3.5 h-3.5" />
									</button>
								</span>
							))}
							<input
								type="text"
								value={taskSearch}
								onChange={(e) => setTaskSearch(e.target.value)}
								onFocus={() => setShowTaskDropdown(true)}
								onBlur={(e) => {
									// Check if focus moved to dropdown item
									const relatedTarget = e.relatedTarget as HTMLElement
									if (!relatedTarget || !taskRef.current?.contains(relatedTarget)) {
										if (!justSelectedTask && taskSearch) {
											clearInvalidSearch(taskSearch, availableTasks, setTaskSearch)
										}
										setJustSelectedTask(false)
									}
								}}
								onKeyDown={handleTaskKeyDown}
								placeholder={selectedTasks.length === 0 ? "Select tasks..." : ""}
								className="w-auto border-none outline-none focus:ring-0 text-sm focus:border-none border-left-1 border-gray-300 focus:border-black p-0"
							/>
						</div>
						{showTaskDropdown && filteredTasks.length > 0 && (
							<div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-auto">
								{filteredTasks.map(task => (
									<div
										key={task.id}
										onMouseDown={(e) => {
											// Prevent blur from firing before click
											e.preventDefault()
											setJustSelectedTask(true)
										}}
										onClick={() => addTask(task)}
										className="px-3 py-2 text-sm hover:bg-black hover:text-white cursor-pointer"
									>
										{task.name}
									</div>
								))}
							</div>
						)}
					</div>
				</div>

				{/* Run Report Button */}
				<div className="flex items-center gap-4">
					<div className="w-24"></div>
					<button
						type="button"
						onClick={runReportWithReload}
						disabled={isLoadingReport}
							className="btn-primary bg-green-700 hover:bg-green-800 disabled:bg-green-400 text-white font-medium py-2 px-4 rounded-md transition-colors text-sm"
					>
						{isLoadingReport ? 'Loading...' : 'Run report'}
					</button>
					{/* cancel report button to hide filters*/}
					{
						showReport && (
							<button
								type="button"
								onClick={() => setShowFilters(false)}
								className="btn-secondary bg-red-700 hover:bg-red-800 disabled:bg-red-400 text-white font-medium py-2 px-4 rounded-md transition-colors text-sm"
							>
								Cancel
							</button>
						)
					}
				</div>
			</div>
			)}

			{/* Report Results */}
			{showReport && (
				<div className="space-y-6">
					{/* Summary Header */}
					<div className="flex justify-between items-start">
						<div>
							<p className="text-sm text-gray-600">Total hours</p>
							<p className="text-2xl font-bold text-gray-900">{formatSimpleTime(displayTotalHours)}</p>
						</div>
						<div className="text-right space-y-1">
							<div className="flex gap-8">
								<span className="text-gray-600 min-w-[65px] text-left">Clients</span>
								<span className="font-medium text-gray-900">
									{selectedClients.length > 0 ? selectedClients.map(c => c.name).join(', ') : 'All clients'}
								</span>
							</div>
							<div className="flex gap-8">
								<span className="text-gray-600 min-w-[65px] text-left">Projects</span>
								<span className="font-medium text-gray-900">
									{selectedProjects.length > 0 ? selectedProjects.map(p => p.name).join(', ') : 'All projects'}
								</span>
							</div>
							<div className="flex gap-8">
								<span className="text-gray-600 min-w-[65px] text-left">Tasks</span>
								<span className="font-medium text-gray-900">
									{selectedTasks.length > 0 ? selectedTasks.map(t => t.name).join(', ') : 'All tasks'}
								</span>
							</div>
						</div>
					</div>

					{/* Controls Row */}
					<div className="flex lg:justify-between justify-end items-center flex-wrap gap-2">
						<div className="flex items-center gap-4">
							{/* Group By Dropdown */}
							<div className="relative">
								<select
									value={groupBy}
									onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
									className="appearance-none bg-white border border-gray-300 rounded-md py-2 pl-3 pr-10 text-sm focus:outline-none focus:ring-0 focus:ring-tranperant focus:border-black cursor-pointer"
								>
									{groupByOptions.map(option => (
										<option key={option.value} value={option.value}>
											Group by: {option.label}
										</option>
									))}
								</select>
								<FiChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
							</div>

							{/* Active Projects Only Checkbox */}
							<label className="flex items-center gap-2 cursor-pointer">
								<input
									type="checkbox"
									checked={activeProjectsOnly}
									onChange={(e) => setActiveProjectsOnly(e.target.checked)}
									className="w-4 h-4 rounded theme-color border-gray-300 outline-none focus:ring-transparent focus:border-black"
								/>
								<span className="text-sm text-gray-700">Active projects only</span>
							</label>
						</div>

						<div className="flex items-center gap-2">
							{/* Export Dropdown */}
							<div className="relative" ref={exportRef}>
								<button
									type="button"
									onClick={() => !isExporting && setShowExportDropdown(!showExportDropdown)}
									disabled={isExporting}
									className="flex items-center gap-2 bg-white border border-gray-300 rounded-md py-2 px-3 text-sm hover:bg-gray-50 disabled:opacity-70 disabled:cursor-wait min-w-[100px] justify-center"
								>
									{isExporting ? (
										<>
											<span className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
											<span>Exporting...</span>
										</>
									) : (
										<>
											Export
											<FiChevronDown className="w-4 h-4 text-gray-400" />
										</>
									)}
								</button>
								{showExportDropdown && !isExporting && (
									<div className="absolute right-0 mt-1 w-32 bg-white border border-gray-300 rounded-md shadow-lg z-10">
										<button 
											type="button"
											onClick={exportToCSV}
											className="w-full text-left px-3 py-2 text-sm hover:bg-black hover:text-white"
										>
											CSV
										</button>
										<button 
											type="button"
											onClick={exportToExcel}
											className="w-full text-left px-3 py-2 text-sm hover:bg-black hover:text-white"
										>
											Excel
										</button>
										<button 
											type="button"
											onClick={exportToPDF}
											className="w-full text-left px-3 py-2 text-sm hover:bg-black hover:text-white"
										>
											PDF
										</button>
									</div>
								)}
							</div>

							{/* Print Button */}
							<button
								type="button"
								onClick={handlePrint}
								className="p-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
								title="Print report"
							>
								<FiPrinter className="w-5 h-5 text-gray-600" />
							</button>
						</div>
					</div>

					{/* Time Entries Table */}
					<div className="bg-white overflow-hidden overflow-x-auto">
						<table className="w-full">
							<thead>
								<tr className="border-b border-zink-800 bg-[#eee]">
									{groupBy !== 'date' && (
										<th className="text-left py-2 px-4 text-sm font-normal text-[#1d1e1c]">Date</th>
									)}
									{groupBy !== 'client' && (
										<th className="text-left py-2 px-4 text-sm font-normal text-[#1d1e1c]">Client</th>
									)}
									{groupBy !== 'project' && (
										<th className="text-left py-2 px-4 text-sm font-normal text-[#1d1e1c]">Project</th>
									)}
									{groupBy !== 'task' && (
										<th className="text-left py-2 px-4 text-sm font-normal text-[#1d1e1c]">Task</th>
									)}
									{groupBy !== 'person' && (
										<th className="text-left py-2 px-4 text-sm font-normal text-[#1d1e1c]">Person</th>
									)}
									<th className="text-right py-2 px-4 text-sm font-normal text-[#1d1e1c]">Hours</th>
								</tr>
							</thead>
							<tbody className="bg-white">
								{isLoadingReport ? (
									<tr>
										<td colSpan={5} className="py-12 text-center text-gray-500">
											Loading report data...
										</td>
									</tr>
								) : sortedGroupedData.length === 0 ? (
									<tr>
										<td colSpan={5} className="py-12 text-center text-gray-500">
											No time entries found for the selected filters
										</td>
									</tr>
								) : (
									<>
										{sortedGroupedData.map(([key, { entries, totalHours: groupTotal, totalTimesheetHours: groupTimesheetTotal, label }]) => {
											// Calculate dynamic colSpan based on visible columns
											const visibleCols = [
												groupBy !== 'date',
												groupBy !== 'client',
												groupBy !== 'project',
												groupBy !== 'task',
												groupBy !== 'person'
											].filter(Boolean).length
											const groupColSpan = visibleCols
											const isCollapsed = collapsedGroups.has(key)
											
											return (
											<React.Fragment key={key}>
												{/* Group Header Row - Clickable to toggle collapse/expand */}
												<tr 
													className="bg-[#eee] cursor-pointer hover:bg-[#ddd] transition-colors"
													onClick={() => toggleGroup(key)}
													title={isCollapsed ? 'Click to expand' : 'Click to collapse'}
												>
													<td colSpan={groupColSpan} className="py-2 px-4 text-sm text-[#1d1e1c] capitalize">
														<div className="flex items-center gap-2">
															{isCollapsed ? (
																<FiChevronRight className="w-4 h-4 text-gray-600 flex-shrink-0" />
															) : (
																<FiChevronDown className="w-4 h-4 text-gray-600 flex-shrink-0" />
															)}
															<span>{label}</span>
														</div>
													</td>
													{/* <td className="py-2 px-4 text-sm text-[#1d1e1c] capitalize text-right">
														{groupTotal.toFixed(2)}
													</td> */}
													<td className="py-2 px-4 text-sm text-[#1d1e1c] capitalize text-right">
														{formatSimpleTime(groupTimesheetTotal)}
													</td>
												</tr>
												{/* Entry Rows - Only show if not collapsed */}
												{!isCollapsed && entries.map(entry => (
													<React.Fragment key={entry._id}>
													<tr className="hover:bg-gray-50 transition-colors">
														{groupBy !== 'date' && (
															<td className="py-2 px-4 text-gray-900">
																{format(new Date(entry.date), 'dd/MM/yyyy')}
															</td>
														)}
														{groupBy !== 'client' && (
															<td className="py-2 px-4 text-gray-900">
																{entry.client?.name || 'No client'}
															</td>
														)}
														{groupBy !== 'project' && (
															<td className="py-2 px-4 text-gray-900">
																{entry.project?.name || 'No project'}
															</td>
														)}
														{groupBy !== 'task' && (
															<td className="py-2 px-4 text-gray-900">
																{entry.task?.name || 'No task'}
															</td>
														)}
														{groupBy !== 'person' && (
															<td className="py-2 px-4 text-gray-900">
																{entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : 'Unknown'}
															</td>
														)}
														{/* <td className="py-2 px-4 text-gray-900 text-right">
															{hoursToDecimal(entry.hours).toFixed(2)}
														</td> */}
														<td className="py-2 px-4 text-gray-900 text-right">
															{formatSimpleTime(entry.timesheetHours || 0)}
														</td>
													</tr>
													<tr className='border-none'>
														{groupBy !== 'date' && <td></td>}
														<td className='pt-1 pb-3 px-4 text-sm text-gray-900 max-w-xs empty:p-0' colSpan={groupColSpan + 1}>{entry.notes || ''}</td>
														<td></td>
													</tr>
													</React.Fragment>
												))}
											</React.Fragment>
											)
										})}
										{/* Total Row */}
										{(() => {
											const visibleCols = [
												groupBy !== 'date',
												groupBy !== 'client',
												groupBy !== 'project',
												groupBy !== 'task',
												groupBy !== 'person'
											].filter(Boolean).length
											return (
												<tr className="">
													<td colSpan={visibleCols} className="py-3 px-4 font-semibold text-gray-900 text-right">
														Total
													</td>
													<td className="py-3 px-4 font-semibold text-gray-900 text-right">
														{formatSimpleTime(totalTimesheetHours)}
													</td>
												</tr>
											)
										})()}
									</>
								)}
							</tbody>
						</table>
					</div>

					{/* Pagination for "All" – at bottom of table, #0b1014 shade */}
					{isPaginatedReport && (
						<div className="flex items-center justify-center gap-3 py-3">
							<button
								type="button"
								onClick={() => loadReportPage(reportPage - 1)}
								disabled={reportPage === 0 || isLoadingReport}
								className="flex items-center gap-1.5 px-2 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-gray-500"
							>
								<FiChevronLeft className="w-4 h-4" />
								Previous
							</button>
							<div className="flex items-center gap-1">
								{(() => {
									const currentPage = reportPage + 1
									const totalPages = reportTotalPages ?? Math.max(reportPage + 3, 3)
									const maxVisible = 3
									// Always show 3 page numbers when total >= 3; sliding window centered on current when possible
									const numVisible = Math.min(maxVisible, totalPages)
									const startPage = totalPages <= maxVisible
										? 1
										: Math.max(1, Math.min(currentPage - 1, totalPages - numVisible + 1))
									const pages = Array.from(
										{ length: numVisible },
										(_, i) => startPage + i
									)
									return pages.map((p) => {
										const isActive = p === currentPage
										return (
											<button
												key={p}
												type="button"
												onClick={() => loadReportPage(p - 1)}
												disabled={isLoadingReport}
												className={`min-w-[36px] h-9 px-2.5 text-sm font-medium rounded-md transition-colors ${
													isActive
														? 'bg-[#0b1014] text-white'
														: 'text-[#0b1014] bg-transparent hover:underline'
												} disabled:opacity-50 disabled:cursor-not-allowed`}
											>
												{p}
											</button>
										)
									})
								})()}
							</div>
							<button
								type="button"
								onClick={() => loadReportPage(reportPage + 1)}
								disabled={timesheetEntries.length < REPORT_PAGE_SIZE || isLoadingReport}
								className="flex items-center gap-1.5 px-2 py-2 text-sm font-medium text-[#0b1014] hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:text-gray-500"
							>
								Next
								<FiChevronRight className="w-4 h-4" />
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	)
}