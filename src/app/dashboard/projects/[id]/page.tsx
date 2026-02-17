'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subWeeks, addWeeks, subMonths, addMonths, subYears, addYears } from 'date-fns'
import DashboardLayout from '@/components/layouts/DashboardLayout'
import { PROJECT_QUERY } from '@/lib/queries'
import { sanityFetch } from '@/lib/sanity'
import { formatSimpleTime } from '@/lib/time'
import { Project, Task, User } from '@/types'
import SingleProjectChart from '@/components/layouts/project/SingleProjectChart'
import { FiCalendar, FiCheckSquare, FiUsers, FiChevronLeft, FiChevronRight, FiChevronDown, FiX } from 'react-icons/fi'

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { data: session } = useSession()
  const projectId = params.id as string
  
  // Determine role from session
  const userRole = session?.user?.role || 'user'
  const dashboardRole = userRole === 'admin' || userRole === 'manager' ? userRole : 'user'
  const isAdminOrManager = userRole === 'admin' || userRole === 'manager'
  const projectsRoute = isAdminOrManager ? '/admin/projects' : '/dashboard/projects'

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'tasks' | 'team'>('tasks')
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const [expandedTeamMembers, setExpandedTeamMembers] = useState<Set<string>>(new Set())
  const [isActionDropdownOpen, setIsActionDropdownOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  
  // Date filter state
  const [dateFilterType, setDateFilterType] = useState<'week' | 'month' | 'year' | 'all' | 'custom'>('all')
  const [customStartDate, setCustomStartDate] = useState<string>('')
  const [customEndDate, setCustomEndDate] = useState<string>('')
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false)
  const [isCustomRangeOpen, setIsCustomRangeOpen] = useState(false)
  const [baseFilterType, setBaseFilterType] = useState<'week' | 'month' | 'year' | null>(null)

  useEffect(() => {
    const fetchProject = async () => {
      try {
        setLoading(true)
        setError(null)
        
        const projectData = await sanityFetch<Project>({
          query: PROJECT_QUERY,
          params: { id: projectId }
        })

        if (projectData) {
          setProject(projectData)
        } else {
          setError('Project not found')
        }
      } catch (err) {
        console.error('Error fetching project:', err)
        setError('Failed to load project')
      } finally {
        setLoading(false)
      }
    }

    if (projectId) {
      fetchProject()
    }
  }, [projectId])

  // Calculate date range based on filter type - MUST be before early returns
  const getDateRange = useMemo(() => {
    const now = new Date()
    
    switch (dateFilterType) {
      case 'week':
        return {
          startDate: startOfWeek(now, { weekStartsOn: 1 }),
          endDate: endOfWeek(now, { weekStartsOn: 1 })
        }
      case 'month':
        return {
          startDate: startOfMonth(now),
          endDate: endOfMonth(now)
        }
      case 'year':
        return {
          startDate: startOfYear(now),
          endDate: endOfYear(now)
        }
      case 'custom':
        return {
          startDate: customStartDate ? new Date(customStartDate) : null,
          endDate: customEndDate ? new Date(customEndDate) : null
        }
      case 'all':
      default:
        return {
          startDate: null,
          endDate: null
        }
    }
  }, [dateFilterType, customStartDate, customEndDate])

  // Close dropdown when clicking outside - MUST be before early returns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      if (isFilterDropdownOpen && !target.closest('.date-filter-dropdown')) {
        setIsFilterDropdownOpen(false)
      }
      if (isActionDropdownOpen && !target.closest('.action-dropdown')) {
        setIsActionDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isFilterDropdownOpen, isActionDropdownOpen])

  // Action handlers
  // const handleArchive = async () => {
  //   // TODO: Implement archive functionality
  //   setIsActionDropdownOpen(false)
  //   // Add your archive logic here
  // }

  // const handleDuplicate = async () => {
  //   // TODO: Implement duplicate functionality
  //   setIsActionDropdownOpen(false)
  //   // Add your duplicate logic here
  // }

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      setIsActionDropdownOpen(false)
      setIsDeleting(true)
      
      try {
        const response = await fetch(`/api/projects/${projectId}`, {
          method: 'DELETE'
        })
        
        const data = await response.json()
        
        if (response.ok) {
          // Redirect to projects list after successful deletion
          router.push(projectsRoute)
        } else {
          // Handle API error responses
          setIsDeleting(false)
          alert(data.error || data.message || 'Failed to delete project')
        }
      } catch (error) {
        console.error('Error deleting project:', error)
        setIsDeleting(false)
        alert('Failed to delete project. Please try again.')
      }
    }
  }

  // Toggle accordion functions
  const toggleTask = (taskId: string) => {
    setExpandedTasks(prev => {
      const newSet = new Set(prev)
      if (newSet.has(taskId)) {
        newSet.delete(taskId)
      } else {
        newSet.add(taskId)
      }
      return newSet
    })
  }

  const toggleTeamMember = (userId: string) => {
    setExpandedTeamMembers(prev => {
      const newSet = new Set(prev)
      if (newSet.has(userId)) {
        newSet.delete(userId)
      } else {
        newSet.add(userId)
      }
      return newSet
    })
  }

  // Filter time entries based on date range - Regular function (not a hook)
  const filterTimeEntryByDate = (timeEntry: any) => {
    if (!timeEntry.date) return false
    if (dateFilterType === 'all') return true
    
    const entryDate = new Date(timeEntry.date)
    const { startDate, endDate } = getDateRange
    
    if (!startDate || !endDate) return true
    
    return entryDate >= startDate && entryDate <= endDate
  }

  // Get filter label for display - Regular function (not a hook)
  const getFilterLabel = () => {
    const { startDate, endDate } = getDateRange
    
    // If we have a baseFilterType, use it for formatting (even if dateFilterType is 'custom')
    const displayType = baseFilterType || dateFilterType
    
    switch (displayType) {
      case 'week':
        return startDate ? format(startDate, 'MMM d') + ' - ' + format(endDate!, 'MMM d, yyyy') : 'This Week'
      case 'month':
        return startDate ? format(startDate, 'MMMM yyyy') : 'This Month'
      case 'year':
        return startDate ? format(startDate, 'yyyy') : 'This Year'
      case 'custom':
        return startDate && endDate 
          ? format(startDate, 'MMM d') + ' - ' + format(endDate, 'MMM d, yyyy')
          : 'Custom Range'
      case 'all':
      default:
        return 'All Time'
    }
  }

  // Helper function to build detailed report URL
  const buildDetailedReportUrl = (taskId?: string, userId?: string) => {
    const { startDate, endDate } = getDateRange
    const basePath = '/dashboard/reports'
    const currentUserId = session?.user?.id
    const now = new Date()
    
    const params: string[] = []
    
    // Add date range - always include dates (use 'all time' range if no dates set)
    if (startDate && endDate) {
      params.push(`start_date=${format(startDate, 'yyyy-MM-dd')}`)
      params.push(`end_date=${format(endDate, 'yyyy-MM-dd')}`)
    } else {
      // When dateFilterType is 'all', use a very wide date range (matching detailed report behavior)
      params.push(`start_date=2000-01-01`)
      params.push(`end_date=${format(now, 'yyyy-MM-dd')}`)
    }
    
    // Add client filter (always include if available)
    if (project?.client?._id) {
      params.push(`clients[]=${project.client._id}`)
    }
    
    // Add project filter (always include if available)
    if (projectId) {
      params.push(`projects[]=${projectId}`)
    }
    
    // Add task filter (for task section)
    if (taskId) {
      params.push(`tasks[]=${taskId}`)
    }
    
    // Add user filter (for team section or if no specific user, use current user)
    if (userId) {
      params.push(`user[]=${userId}`)
    } else if (currentUserId && !userId) {
      // For dashboard, always filter by current user if no specific user provided
      params.push(`user[]=${currentUserId}`)
    }
    
    // Add entry type
    params.push('entry_type=timesheet')
    
    return `${basePath}/detailed?${params.filter(Boolean).join('&')}`
  }

  // Early returns AFTER all hooks
  if (loading) {
    return (
      <DashboardLayout role={dashboardRole}>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading project...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (error || !project) {
    return (
      <DashboardLayout role={dashboardRole}>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Project Not Found</h2>
            <p className="text-gray-600 mb-4">{error || 'The project you are looking for does not exist.'}</p>
            <button
              onClick={() => router.push(projectsRoute)}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
            >
              Back to Projects
            </button>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout role={dashboardRole}>
      <div className="space-y-6">
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        {/* Project Details */}
        <div className="bg-white rounded-lg shadow">
          {/* Header Section */}
          <div className="p-6 border-b border-gray-200">
            <div className="space-y-4 flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 capitalize">{project.name}</h1>
                <span className="project-timeline flex items-center space-x-2 mt-2">
                  <span className="project-timeline-icon">
                    <FiCalendar />
                  </span>
                  <span className="project-timeline-start">{project.dates?.startDate ? format(new Date(project.dates.startDate), 'MMM d, yyyy') : 'No start date'}</span>
                  <span className="project-timeline-separator"> - </span>
                  <span className="project-timeline-end">{project.dates?.endDate ? format(new Date(project.dates.endDate), 'MMM d, yyyy') : 'No end date'}</span>
                </span>
              </div>
              <div className="project-action flex items-center space-x-3">
                {isAdminOrManager && (
                  <button 
                    onClick={() => router.push(`${projectsRoute}?edit=${projectId}`)}
                    className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <span>Edit Project</span>
                  </button>
                )}
                {/* Action Dropdown */}
                {/* <div className="relative action-dropdown">
                  <button
                    onClick={() => !isDeleting && setIsActionDropdownOpen(!isActionDropdownOpen)}
                    disabled={isDeleting}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 flex items-center space-x-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-gray-50"
                  >
                    <span>{isDeleting ? 'Deleting...' : 'Action'}</span>
                    {!isDeleting && (
                      <FiChevronDown 
                        className={`w-4 h-4 transition-transform duration-200 ${isActionDropdownOpen ? 'transform rotate-180' : ''}`}
                      />
                    )}
                    {isDeleting && (
                      <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                    )}
                  </button>
                  
                  {isActionDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
                      <button
                        onClick={handleArchive}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={true}
                      >
                        <span>Archive</span>
                      </button>
                      <button
                        onClick={handleDuplicate}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={true}
                      >
                        <span>Duplicate</span>
                      </button>
                      <div className="border-t border-gray-100"></div>
                      <button
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
                      </button>
                    </div>
                  )}
                </div> */}
              </div>
              

            </div>
          </div>

          <SingleProjectChart project={project as Project} />
          <div className="p-6 border-b border-gray-200">
            <div className="project-info grid grid-cols-5 gap-4">
              <div className="client border border-gray-200 rounded-lg p-4 bg-gray-50">
                <label className="text-sm font-medium text-gray-500">Client</label>
                <p className="mt-1 text-lg text-gray-900 capitalize">
                  {project.client?.name || 'No client assigned'}
                </p>
              </div>
              <div className="budget border border-gray-200 rounded-lg p-4 bg-gray-50">
                <label className="text-sm font-medium text-gray-500">Budget</label>
                <p>{project.budget?.totalProjectHours ? formatSimpleTime(Number(project.budget.totalProjectHours)) : 'No budget assigned'}</p>
              </div>
              <div className="spent border border-gray-200 rounded-lg p-4 bg-gray-50">
                <label className="text-sm font-medium text-gray-500">Spent</label>
              <p>{project.totalHours ? formatSimpleTime(Number(project.totalHours)) : 'No spent hours'}</p>
              </div>
              <div className="billable-hours border border-gray-200 rounded-lg p-4 bg-gray-50">
                <label className="text-sm font-medium text-gray-500">Billable Hours</label>
                <p>{project.totalBillableHours ? formatSimpleTime(Number(project.totalBillableHours)) : 'No billable hours'}</p>
              </div>
              <div className="non-billable-hours border border-gray-200 rounded-lg p-4 bg-gray-50">
                <label className="text-sm font-medium text-gray-500">Non-Billable Hours</label>
                <p>{(() => {
                  const nonBillableHours = (project.totalHours || 0) - (project.totalBillableHours || 0)
                  return nonBillableHours > 0 ? formatSimpleTime(nonBillableHours) : 'No non-billable hours'
                })()}</p>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="border-b border-gray-200 overflow-y-hidden overflow-x-auto">
            <nav className="-mb-px flex space-x-8 px-6">
              <button
                onClick={() => setActiveTab('tasks')}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                  activeTab === 'tasks'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <FiCheckSquare className="w-5 h-5" />
                <span>Tasks</span>
                {project.tasks && project.tasks.length > 0 && (
                  <span className="ml-2 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">
                    {project.tasks.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('team')}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                  activeTab === 'team'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <FiUsers className="w-5 h-5" />
                <span>Team</span>
                {project.assignedUsers && project.assignedUsers.length > 0 && (
                  <span className="ml-2 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">
                    {project.assignedUsers.length}
                  </span>
                )}
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {/* Date Filter */}
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                {/* Date Navigation (for week/month/year) */}
                {(dateFilterType === 'week' || dateFilterType === 'month' || dateFilterType === 'year' || baseFilterType !== null) && (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const { startDate, endDate } = getDateRange
                        if (!startDate || !endDate) return
                        
                        const filterType = baseFilterType || dateFilterType
                        if (filterType !== 'week' && filterType !== 'month' && filterType !== 'year') return
                        
                        let newStart: Date
                        let newEnd: Date
                        
                        if (filterType === 'week') {
                          newStart = subWeeks(startDate, 1)
                          newEnd = subWeeks(endDate, 1)
                        } else if (filterType === 'month') {
                          newStart = subMonths(startDate, 1)
                          newEnd = subMonths(endDate, 1)
                        } else {
                          newStart = subYears(startDate, 1)
                          newEnd = subYears(endDate, 1)
                        }
                        
                        setCustomStartDate(format(newStart, 'yyyy-MM-dd'))
                        setCustomEndDate(format(newEnd, 'yyyy-MM-dd'))
                        setDateFilterType('custom')
                        setBaseFilterType(filterType)
                      }}
                      className="p-1 rounded hover:bg-gray-100"
                    >
                      <FiChevronLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    
                    <span className="text-sm font-medium text-gray-700 min-w-[200px] text-center">
                      {getFilterLabel()}
                    </span>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const { startDate, endDate } = getDateRange
                        if (!startDate || !endDate) return
                        
                        const filterType = baseFilterType || dateFilterType
                        if (filterType !== 'week' && filterType !== 'month' && filterType !== 'year') return
                        
                        let newStart: Date
                        let newEnd: Date
                        
                        if (filterType === 'week') {
                          newStart = addWeeks(startDate, 1)
                          newEnd = addWeeks(endDate, 1)
                        } else if (filterType === 'month') {
                          newStart = addMonths(startDate, 1)
                          newEnd = addMonths(endDate, 1)
                        } else {
                          newStart = addYears(startDate, 1)
                          newEnd = addYears(endDate, 1)
                        }
                        
                        setCustomStartDate(format(newStart, 'yyyy-MM-dd'))
                        setCustomEndDate(format(newEnd, 'yyyy-MM-dd'))
                        setDateFilterType('custom')
                        setBaseFilterType(filterType)
                      }}
                      className="p-1 rounded hover:bg-gray-100"
                    >
                      <FiChevronRight className="w-5 h-5 text-gray-600" />
                    </button>
                  </div>
                )}
                
                {/* Filter Dropdown */}
                {!(dateFilterType === 'custom' && baseFilterType === null) && (
                  <div className="relative date-filter-dropdown">
                    <button
                      onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                      className="flex items-center space-x-2 px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-transparent focus:border-black"
                    >
                      <span>{getFilterLabel()}</span>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    
                    {isFilterDropdownOpen && (
                    <div className="absolute z-50 mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-1">
                      <button
                        onClick={() => {
                          setDateFilterType('week')
                          setBaseFilterType('week')
                          setCustomStartDate('')
                          setCustomEndDate('')
                          setIsFilterDropdownOpen(false)
                        }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-black hover:text-white ${
                          dateFilterType === 'week' || baseFilterType === 'week' ? 'bg-black text-white font-medium' : 'text-gray-700'
                        }`}
                      >
                        Week
                      </button>
                      <button
                        onClick={() => {
                          setDateFilterType('month')
                          setBaseFilterType('month')
                          setCustomStartDate('')
                          setCustomEndDate('')
                          setIsFilterDropdownOpen(false)
                        }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-black hover:text-white ${
                          dateFilterType === 'month' || baseFilterType === 'month' ? 'bg-black text-white font-medium' : 'text-gray-700'
                        }`}
                      >
                        Month
                      </button>
                      <button
                        onClick={() => {
                          setDateFilterType('year')
                          setBaseFilterType('year')
                          setCustomStartDate('')
                          setCustomEndDate('')
                          setIsFilterDropdownOpen(false)
                        }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-black hover:text-white ${
                          dateFilterType === 'year' || baseFilterType === 'year' ? 'bg-gray-50 text-primary-600 font-medium' : 'text-gray-700'
                        }`}
                      >
                        Year
                      </button>
                      <button
                        onClick={() => {
                          setDateFilterType('all')
                          setBaseFilterType(null)
                          setCustomStartDate('')
                          setCustomEndDate('')
                          setIsFilterDropdownOpen(false)
                        }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-black hover:text-white ${
                          dateFilterType === 'all' ? 'bg-black text-white font-medium' : 'text-gray-700'
                        }`}
                      >
                        All
                      </button>
                      <div className="border-t border-gray-100"></div>
                      <button
                        onClick={() => {
                          setDateFilterType('custom')
                          setBaseFilterType(null)
                          setIsFilterDropdownOpen(false)
                        }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-black hover:text-white ${
                          dateFilterType === 'custom' && baseFilterType === null ? 'bg-gray-50 text-primary-600 font-medium' : 'text-gray-700'
                        }`}
                      >
                        Custom
                      </button>
                    </div>
                  )}
                  </div>
                )}

                {/* Custom Date Range Picker - side by side layout when Custom is selected */}
                {dateFilterType === 'custom' && baseFilterType === null && (
                  <div className="flex items-center space-x-3">
                    <span className="text-sm text-gray-700">View report from</span>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <span className="text-sm text-gray-700">to</span>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (customStartDate && customEndDate) {
                          // Ensure the filter type is set to custom (it should already be)
                          setDateFilterType('custom')
                          setBaseFilterType(null)
                          setIsFilterDropdownOpen(false)
                          // The filter is automatically applied via getDateRange which uses customStartDate and customEndDate
                        }
                      }}
                      className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      disabled={!customStartDate || !customEndDate}
                    >
                      Update report
                    </button>
                    <button
                      onClick={() => {
                        setDateFilterType('all')
                        setBaseFilterType(null)
                        setCustomStartDate('')
                        setCustomEndDate('')
                        setIsFilterDropdownOpen(false)
                      }}
                      className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                      title="Change filter type"
                    >
                      <FiX className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            {activeTab === 'tasks' && (
              <div className="space-y-4">
                {project.tasks && project.tasks.length > 0 ? (
                  <div className="space-y-3">
                    {[...project.tasks].sort((a: any, b: any) => {
                      // Sort: billable tasks first (true = -1), then non-billable (false = 1)
                      if (a.isBillable === b.isBillable) return 0
                      return a.isBillable ? -1 : 1
                    }).map((task: any) => {
                      const isExpanded = expandedTasks.has(task._id)
                      
                      // Calculate filtered total hours for this task based on date filter
                      const taskFilteredTotalHours = (() => {
                        if (!task.timeEntries || !Array.isArray(task.timeEntries)) return 0
                        
                        const filteredTimeEntries = task.timeEntries.filter(filterTimeEntryByDate)
                        return filteredTimeEntries.reduce((sum: number, te: any) => {
                          return sum + (te.hours || 0)
                        }, 0)
                      })()
                      
                      return (
                        <div
                          key={task._id}
                          className="border border-gray-200 rounded-lg hover:bg-gray-50 overflow-hidden"
                        >
                          <div
                            className="flex items-center justify-between p-4 cursor-pointer"
                            onClick={() => toggleTask(task._id)}
                          >
                            <div className="flex-1">
                              <div className="flex items-center space-x-3">
                                <div className="flex-shrink-0">
                                  <FiChevronDown 
                                    className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isExpanded ? 'transform rotate-180' : ''}`}
                                  />
                                </div>
                                <div className="flex-1">
                                  <div className="accordion-header flex items-center justify-between">
                                    <div className="left-side flex items-center space-x-2">
                                      <h3 className="text-sm font-medium text-gray-900 capitalize">{task.name}</h3>
                                      {task.isBillable && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                          Billable
                                        </span>
                                      )}
                                    </div>
                                    <div className="right-side flex items-center space-x-3">
                                      {task.estimatedHours && (
                                        <span className="text-xs text-gray-500">
                                          Estimated: {task.estimatedHours} hrs
                                        </span>
                                      )}
                                      {taskFilteredTotalHours > 0 && (
                                        <a 
                                          href={buildDetailedReportUrl(task._id)}
                                          className="text-xs text-[#2a59c1] hover:text-[#2a59c1] hover:underline"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          Total: {taskFilteredTotalHours.toFixed(1)} hrs
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="accordion-content px-4 pb-4 border-t border-gray-200 bg-gray-50">
                              <div className="pt-4">
                                {task.description && (
                                  <p className="text-sm text-gray-500 mb-3">
                                    {task.description}
                                  </p>
                                )}
                                <div className="flex items-center space-x-4">
                                  
                                  {/* show which user added how many hours in total */}
                                  {task.timeEntries && task.timeEntries.length > 0 && (() => {
                                    // Filter time entries by date range
                                    const filteredTimeEntries = task.timeEntries.filter(filterTimeEntryByDate)
                                    
                                    if (filteredTimeEntries.length === 0) return null
                                    
                                    return (
                                      <div className="text-xs text-gray-500 flex flex-wrap gap-2 capitalize">
                                        {(() => {
                                          // Group time entries by user and sum hours
                                          const userHoursMap = new Map<string, { user: any, totalHours: number }>()
                                          
                                          filteredTimeEntries.forEach((timeEntry: any) => {
                                          const userId = timeEntry.user?._id || timeEntry.user?._ref
                                          if (!userId) return
                                          
                                          if (userHoursMap.has(userId)) {
                                            // Add to existing user's hours
                                            const existing = userHoursMap.get(userId)!
                                            existing.totalHours += timeEntry.hours || 0
                                          } else {
                                            // Create new entry for user
                                            userHoursMap.set(userId, {
                                              user: timeEntry.user,
                                              totalHours: timeEntry.hours || 0
                                            })
                                          }
                                        })
                                        
                                        // Convert map to array for rendering
                                        return Array.from(userHoursMap.values()).map((entry, index, array) => {
                                          const entryUserId = entry.user?._id || entry.user?._ref
                                          return (
                                            <span key={entryUserId || index}>
                                              {entry.user?.firstName || ''} {entry.user?.lastName || ''}:{' '}
                                              <a 
                                                href={buildDetailedReportUrl(task._id, entryUserId)}
                                                className="text-[#2a59c1] hover:text-[#2a59c1] hover:underline"
                                              >
                                                {formatSimpleTime(entry.totalHours)}
                                              </a>
                                              {index < array.length - 1 && <span className="mx-1 text-gray-400">•</span>}
                                            </span>
                                          )
                                        })
                                      })()}
                                    </div>
                                  )
                                  })()}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FiCheckSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-sm text-gray-500">No tasks assigned to this project</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'team' && (
              <div className="space-y-4">
                {project.assignedUsers && project.assignedUsers.length > 0 ? (
                  <div className="space-y-3">
                    {project.assignedUsers.map((assignedUser: any, index: number) => {
                      const user = assignedUser.user
                      if (!user || !assignedUser.isActive) return null
                      
                      const userId = user._id || user._ref || `${index}`
                      const isExpanded = expandedTeamMembers.has(userId)
                      
                      // Calculate total hours for this user
                      const userTotalHours = (() => {
                        if (!userId || !project.tasks) return 0
                        
                        let total = 0
                        project.tasks.forEach((task: any) => {
                          if (!task.timeEntries || !Array.isArray(task.timeEntries)) return
                          
                          const userTimeEntries = task.timeEntries.filter((timeEntry: any) => {
                            const timeEntryUserId = timeEntry.user?._id || timeEntry.user?._ref
                            const matchesUser = timeEntryUserId === userId
                            const matchesDate = filterTimeEntryByDate(timeEntry)
                            return matchesUser && matchesDate
                          })
                          
                          total += userTimeEntries.reduce((sum: number, te: any) => {
                            return sum + (te.hours || 0)
                          }, 0)
                        })
                        
                        return total
                      })()
                      
                      return (
                        <div
                          key={`${user._id}-${index}`}
                          className="border border-gray-200 rounded-lg hover:bg-gray-50 overflow-hidden"
                        >
                          <div
                            className="flex items-center justify-between p-4 cursor-pointer"
                            onClick={() => toggleTeamMember(userId)}
                          >
                            <div className="flex items-center space-x-3 justify-between w-full">
                              <div className="flex-shrink-0">
                                <FiChevronDown 
                                  className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isExpanded ? 'transform rotate-180' : ''}`}
                                />
                              </div>
                              <div className="flex-1">
                                <div className="accordion-header flex items-center justify-between">
                                  <div className="left-side flex items-center space-x-2">
                                    <h3 className="text-sm font-medium text-gray-900 capitalize">
                                      {user.firstName} {user.lastName}
                                    </h3>
                                    {assignedUser.role && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                        {assignedUser.role}
                                      </span>
                                    )}
                                  </div>
                                  <div className="right-side">
                                    {userTotalHours > 0 && (
                                      <a 
                                        href={buildDetailedReportUrl(undefined, userId)}
                                        className="team-total-input-hour text-xs text-[#2a59c1] hover:text-[#2a59c1] hover:underline"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        Total: {userTotalHours.toFixed(1)} hrs
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="accordion-content px-4 pb-4 border-t border-gray-200 bg-gray-50">
                              <div className="pt-4">
                                <p className="text-sm text-gray-500">{user.email}</p>
                                {/* show total time this user added in this project for specific task */}
                                {(() => {
                                  // Get time entries from project.tasks and filter by this user
                                  const userId = user._id || user._ref
                                  if (!userId || !project.tasks) return null
                                  
                                  // Group time entries by task and sum hours for this user
                                  const taskHoursMap = new Map<string, { taskId: string, taskName: string, totalHours: number }>()
                                  
                                  // Loop through all tasks in the project
                                  project.tasks.forEach((task: any) => {
                                    if (!task.timeEntries || !Array.isArray(task.timeEntries)) return
                                    
                                    // Filter time entries for this specific user and date range
                                    const userTimeEntries = task.timeEntries.filter((timeEntry: any) => {
                                      const timeEntryUserId = timeEntry.user?._id || timeEntry.user?._ref
                                      const matchesUser = timeEntryUserId === userId
                                      const matchesDate = filterTimeEntryByDate(timeEntry)
                                      return matchesUser && matchesDate
                                    })
                                    
                                    if (userTimeEntries.length > 0) {
                                      const taskId = task._id
                                      const taskName = task.name || 'Unknown Task'
                                      
                                      // Sum hours for this task
                                      const totalHours = userTimeEntries.reduce((sum: number, te: any) => {
                                        return sum + (te.hours || 0)
                                      }, 0)
                                      
                                      if (taskHoursMap.has(taskId)) {
                                        // Add to existing task's hours (shouldn't happen, but just in case)
                                        const existing = taskHoursMap.get(taskId)!
                                        existing.totalHours += totalHours
                                      } else {
                                        // Create new entry for task
                                        taskHoursMap.set(taskId, {
                                          taskId,
                                          taskName: taskName,
                                          totalHours: totalHours
                                        })
                                      }
                                    }
                                  })
                                  
                                  // Convert map to array for rendering
                                  const taskEntries = Array.from(taskHoursMap.values())
                                  
                                  // Calculate total hours across all tasks for this user
                                  const userTotalHours = taskEntries.reduce((sum, entry) => sum + entry.totalHours, 0)
                                  // setUserTotalInputHours(userTotalHours)
                                  
                                  if (taskEntries.length === 0) return null
                                  
                                  return (
                                    <div className="mt-2 space-y-1">
                                      {/* Task breakdown */}
                                      <div className="text-xs text-gray-500 flex flex-wrap gap-2 capitalize">
                                        {taskEntries.map((entry, index, array) => (
                                          <span key={`task-${index}`} className="inline-flex items-center">
                                            <span className="font-medium capitalize">{entry.taskName}</span>:{' '}
                                            <a 
                                              href={buildDetailedReportUrl(entry.taskId, userId)}
                                              className="text-[#2a59c1] hover:text-[#2a59c1] hover:underline"
                                            >
                                              {formatSimpleTime(entry.totalHours)}
                                            </a>
                                            {index < array.length - 1 && <span className="mx-1 text-gray-400">•</span>}
                                          </span>
                                        ))}
                                      </div>
                                      {/* Total hours */}
                                      <div className="text-xs font-medium text-gray-700">
                                        Total: {userTotalHours.toFixed(1)} hrs
                                      </div>
                                    </div>
                                  )
                                })()}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FiUsers className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-sm text-gray-500">No team members assigned to this project</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
