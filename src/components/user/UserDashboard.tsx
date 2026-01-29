'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { FiClock, FiPlay, FiPause, FiCheck, FiPlus, FiEdit2, FiTrash2, FiSend, FiX, FiChevronLeft, FiChevronRight, FiCalendar } from 'react-icons/fi'
import { sanityFetch, client } from '@/lib/sanity'
import { USER_DASHBOARD_QUERY } from '@/lib/queries'
import { formatSimpleTime, formatDecimalHours } from '@/lib/time'
import { format, startOfWeek, endOfWeek, isSameDay, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isSameMonth, subDays, addDays } from 'date-fns'
import toast from 'react-hot-toast'

interface DashboardData {
  user: any
  thisWeekHours: number
  todayHours: number
  runningTimer: any
  recentEntries: Array<{
    _id: string
    project: {
      _id: string
      name: string
      code?: string
      client?: { name: string }
    }
    task?: {
      _id: string
      name: string
      isBillable: boolean
    }
    date: string
    hours: number
    notes?: string
    isBillable: boolean
    isRunning: boolean
    isApproved: boolean
    isLocked: boolean
    submittedAt?: string
  }>
}

interface UserDashboardProps {
  userId: string
  initialData?: DashboardData
}

interface Task {
  _id: string
  name: string
  isBillable?: boolean
  isArchived?: boolean
}

interface ProjectWithTasks {
  _id: string
  name: string
  tasks?: Task[]
}

// Empty row represents a project-task combination to show in the week view without entries
interface EmptyRow {
  projectId: string
  projectName: string
  taskId: string
  taskName: string
}

export default function UserDashboard({ userId, initialData }: UserDashboardProps) {
  const { data: session } = useSession()
  const [data, setData] = useState<DashboardData | null>(initialData || null)
  const [loading, setLoading] = useState(!initialData)
  const [timerRunning, setTimerRunning] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [selectedProject, setSelectedProject] = useState('')
  const [selectedTask, setSelectedTask] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null)
  const [entryStartTimerLoadingId, setEntryStartTimerLoadingId] = useState<string | null>(null)
  const [entryDeleteLoadingId, setEntryDeleteLoadingId] = useState<string | null>(null)

  // Manual entry form state
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [manualEntryData, setManualEntryData] = useState({
    projectId: '',
    taskId: '',
    date: format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    hours: '',
    notes: ''
  })
  const [hoursDisplay, setHoursDisplay] = useState('') // For H:MM format display

  // Edit entry state
  const [editingEntry, setEditingEntry] = useState<any>(null)

  // Timer notes state
  const [timerNotes, setTimerNotes] = useState('')

  // Modal state
  const [showTimeEntryModal, setShowTimeEntryModal] = useState(false)
  const [timeEntryMode, setTimeEntryMode] = useState<'timer' | 'manual'>('timer')

  // Calendar state - Initialize from localStorage or default to current week
  const [selectedDate, setSelectedDate] = useState(() => {
    if (typeof window !== 'undefined' && userId) {
      const stored = localStorage.getItem(`timesheet_viewed_week_${userId}`)
      if (stored) {
        const parsedDate = parseISO(stored)
        if (!isNaN(parsedDate.getTime())) {
          return parsedDate
        }
      }
    }
    return startOfWeek(new Date(), { weekStartsOn: 1 })
  })
  const [currentWeek, setCurrentWeek] = useState(() => {
    if (typeof window !== 'undefined' && userId) {
      const stored = localStorage.getItem(`timesheet_viewed_week_${userId}`)
      if (stored) {
        const parsedDate = parseISO(stored)
        if (!isNaN(parsedDate.getTime())) {
          return startOfWeek(parsedDate, { weekStartsOn: 1 })
        }
      }
    }
    return startOfWeek(new Date(), { weekStartsOn: 1 })
  })
  const [viewMode, setViewMode] = useState<'calendar' | 'week'>('week') // View mode: calendar or week table
  const [inlineEditingCell, setInlineEditingCell] = useState<{ projectId: string; taskId: string; dayIndex: number } | null>(null);
  const [inlineEditingValue, setInlineEditingValue] = useState('');
  const [inlineEditingOriginalValue, setInlineEditingOriginalValue] = useState('');
  const [savingCellId, setSavingCellId] = useState<string | null>(null);
  
  // State for Add Row modal (week view)
  const [showAddRowModal, setShowAddRowModal] = useState(false);
  const [addRowSelectedProject, setAddRowSelectedProject] = useState('');
  const [addRowSelectedTask, setAddRowSelectedTask] = useState('');
  const [addRowTasks, setAddRowTasks] = useState<Task[]>([]);
  const [projectsWithTasks, setProjectsWithTasks] = useState<ProjectWithTasks[]>([]);
  
  // Empty rows to show in week view (from previous week or manually added)
  const [emptyRows, setEmptyRows] = useState<EmptyRow[]>([]);
  
  // State for copying previous week rows
  const [copyingPreviousWeekRows, setCopyingPreviousWeekRows] = useState(false);

  // Check if there's a running timer for the selected date
  const hasRunningTimerForSelectedDate = () => {
    if (!data?.runningTimer) return false
    const selectedDateStr = format(selectedDate, 'yyyy-MM-dd')
    const runningTimerDateStr = format(new Date(data.runningTimer.startTime), 'yyyy-MM-dd')
    return selectedDateStr === runningTimerDateStr
  }

  // Helper function to refresh dashboard data
  const refreshDashboardData = async (weekOverride?: Date): Promise<DashboardData | null> => {
    setActionLoading('refresh-data')
    try {
      const today = new Date()
      const weekToUse = weekOverride || currentWeek
      const params = {
        userId,
        weekStart: format(startOfWeek(weekToUse, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        weekEnd: format(endOfWeek(weekToUse, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        today: format(today, 'yyyy-MM-dd'),
      }

      const dashboardData = await sanityFetch<DashboardData>({
        query: USER_DASHBOARD_QUERY,
        params,
      })

      setData(dashboardData)

      // Ensure selectedDate is within the current week (but don't reset if we're navigating)
      const currentWeekStart = startOfWeek(weekToUse, { weekStartsOn: 1 })
      const currentWeekEnd = endOfWeek(weekToUse, { weekStartsOn: 1 })
      if (selectedDate < currentWeekStart || selectedDate > currentWeekEnd) {
        // Only reset if selectedDate is not within reasonable bounds (more than a week away)
        const oneWeekAgo = new Date(currentWeekStart)
        oneWeekAgo.setDate(currentWeekStart.getDate() - 7)
        const oneWeekFromNow = new Date(currentWeekEnd)
        oneWeekFromNow.setDate(currentWeekEnd.getDate() + 7)

        if (selectedDate < oneWeekAgo || selectedDate > oneWeekFromNow) {
          setSelectedDate(currentWeekStart)
        }
      }

      if (dashboardData.runningTimer) {
        setTimerRunning(true)
        setSelectedProject(dashboardData.runningTimer.project._id)
        setSelectedTask(dashboardData.runningTimer.task?._id || '')
        // Always calculate elapsed time from the timer's start time
        // This ensures the timer continues correctly even after page refresh
        const start = new Date(dashboardData.runningTimer.startTime)
        const elapsedSeconds = Math.floor((Date.now() - start.getTime()) / 1000)
        setElapsedTime(Math.max(0, elapsedSeconds)) // Ensure non-negative
      } else {
        setTimerRunning(false)
        setElapsedTime(0)
      }

      return dashboardData
    } catch (error) {
      console.error('Error refreshing dashboard data:', error)
      toast.error('Failed to refresh dashboard data')
      return null
    } finally {
      setActionLoading(null)
    }
  }

  // Helper function to optimistically update dashboard data
  const updateDashboardOptimistically = (updateFn: (prevData: DashboardData) => DashboardData) => {
    setData(prevData => {
      if (!prevData) return prevData
      return updateFn(prevData)
    })
  }

  // Helper function to add a new time entry to recent entries
  const addTimeEntryToRecent = (newEntry: any) => {
    updateDashboardOptimistically(prevData => ({
      ...prevData,
      recentEntries: [newEntry, ...prevData.recentEntries].slice(0, 7) // Keep only latest 7 entries
    }))
  }

  // Helper function to update an existing entry in recent entries
  const updateTimeEntryInRecent = (entryId: string, updatedEntry: any) => {
    updateDashboardOptimistically(prevData => ({
      ...prevData,
      recentEntries: prevData.recentEntries.map(entry =>
        entry._id === entryId ? updatedEntry : entry
      )
    }))
  }

  // Helper function to remove an entry from recent entries
  const removeTimeEntryFromRecent = (entryId: string) => {
    updateDashboardOptimistically(prevData => ({
      ...prevData,
      recentEntries: prevData.recentEntries.filter(entry => entry._id !== entryId)
    }))
  }

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (timeEntryMode === 'timer') {
      // Timer mode validation
      if (!selectedProject) {
        toast.error('Please select a project')
        return
      }
      if (!selectedTask) {
        toast.error('Please select a task')
        return
      }
      await handleStartTimer()
    } else {
      // Manual entry mode validation
      if (!manualEntryData.projectId || !manualEntryData.taskId || !manualEntryData.hours) {
        toast.error('Please fill in all required fields')
        return
      }
      await handleManualEntry(e)
    }
  }

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const today = new Date()
        const params = {
          userId,
          weekStart: format(startOfWeek(currentWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
          weekEnd: format(endOfWeek(currentWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
          today: format(today, 'yyyy-MM-dd'),
        }

        const dashboardData = await sanityFetch<DashboardData>({
          query: USER_DASHBOARD_QUERY,
          params,
        })

        setData(dashboardData)

        // Ensure selectedDate is within the current week (but don't reset if we're navigating)
        const currentWeekStart = startOfWeek(currentWeek, { weekStartsOn: 1 })
        const currentWeekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 })
        if (selectedDate < currentWeekStart || selectedDate > currentWeekEnd) {
          // Only reset if selectedDate is not within reasonable bounds (more than a week away)
          const oneWeekAgo = new Date(currentWeekStart)
          oneWeekAgo.setDate(currentWeekStart.getDate() - 7)
          const oneWeekFromNow = new Date(currentWeekEnd)
          oneWeekFromNow.setDate(currentWeekEnd.getDate() + 7)

          if (selectedDate < oneWeekAgo || selectedDate > oneWeekFromNow) {
            setSelectedDate(currentWeekStart)
          }
        }

        if (dashboardData.runningTimer) {
          setTimerRunning(true)
          setSelectedProject(dashboardData.runningTimer.project._id)
          setSelectedTask(dashboardData.runningTimer.task?._id || '')
          // Always calculate elapsed time from the timer's start time
          // This ensures the timer continues correctly even after page refresh
          const start = new Date(dashboardData.runningTimer.startTime)
          const elapsedSeconds = Math.floor((Date.now() - start.getTime()) / 1000)
          setElapsedTime(Math.max(0, elapsedSeconds)) // Ensure non-negative
        } else {
          setTimerRunning(false)
          setElapsedTime(0)
        }

        // Ensure we have a selected date with entries after initial data loads
        if (dashboardData.recentEntries && dashboardData.recentEntries.length > 0) {
          const today = new Date()
          const currentWeekStart = startOfWeek(currentWeek, { weekStartsOn: 1 })
          const currentWeekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 })

          // First, check if today is in this week and has entries
          if (today >= currentWeekStart && today <= currentWeekEnd) {
            const todayStr = format(today, 'yyyy-MM-dd')
            const hasEntriesToday = dashboardData.recentEntries.some((entry: any) => entry.date === todayStr)
            if (hasEntriesToday) {
              setSelectedDate(today)
              return
            }
          }

          // Otherwise, find the most recent date with entries within the current week
          const weekEntries = dashboardData.recentEntries.filter((entry: any) => {
            const entryDate = parseISO(entry.date)
            return entryDate >= currentWeekStart && entryDate <= currentWeekEnd
          })

          if (weekEntries.length > 0) {
            const sortedDates = [...new Set(weekEntries.map((entry: any) => entry.date))].sort().reverse()
            if (sortedDates.length > 0) {
              const mostRecentDateWithEntries = parseISO(sortedDates[0])
              setSelectedDate(mostRecentDateWithEntries)
              return
            }
          }
        }

        // If no entries or no entries in current week, keep the current selectedDate (start of week)
      } catch (error) {
        console.error('Error fetching dashboard data:', error)
        toast.error('Failed to load dashboard data')
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
  }, [userId, currentWeek])

  // Persist current week to localStorage for page refresh persistence
  useEffect(() => {
    if (userId) {
      localStorage.setItem(
        `timesheet_viewed_week_${userId}`,
        format(currentWeek, 'yyyy-MM-dd')
      )
    }
  }, [currentWeek, userId])

  // Update elapsed time
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>

    if (hasRunningTimerForSelectedDate()) {
      interval = setInterval(() => {
        setElapsedTime((prev) => prev + 1)
      }, 1000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [hasRunningTimerForSelectedDate])

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    // Always show HH:MM:SS format, including when less than 1 minute
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Normalize H:MM format or decimal format - convert decimal to H:MM and normalize minutes >= 60 to hours
  const normalizeTimeInput = (input: string): string | null => {
    if (!input || input.trim() === '') return null

    // Check for decimal format (e.g., "2.2")
    const decimalMatch = input.match(/^(\d*\.?\d+)$/)
    if (decimalMatch) {
      const decimalValue = parseFloat(decimalMatch[1])
      if (isNaN(decimalValue) || decimalValue < 0 || decimalValue > 24) {
        return null // Invalid range
      }

      // Convert decimal to H:MM
      const hours = Math.floor(decimalValue)
      const minutes = Math.round((decimalValue - hours) * 60)

      // Check if total exceeds 24:00
      if (hours > 24 || (hours === 24 && minutes > 0)) {
        return null // Invalid - exceeds 24:00
      }

      // Return normalized format
      return `${hours}:${minutes.toString().padStart(2, '0')}`
    }

    // Check for H:MM format or partial format like "2:" or "2:3"
    const timeMatch = input.match(/^(\d+):?(\d*)$/)
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10)
      let minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0

      // Handle single digit minutes (e.g., "2:3" -> "2:30")
      if (timeMatch[2] && timeMatch[2].length === 1) {
        minutes = minutes * 10
      }

      // Convert excess minutes to hours
      if (minutes >= 60) {
        const additionalHours = Math.floor(minutes / 60)
        hours += additionalHours
        minutes = minutes % 60
      }

      // Check if total exceeds 24:00
      if (hours > 24 || (hours === 24 && minutes > 0)) {
        return null // Invalid - exceeds 24:00
      }

      // Return normalized format
      return `${hours}:${minutes.toString().padStart(2, '0')}`
    }

    return null
  }

  // Convert H:MM format to decimal hours
  const parseTimeInput = (input: string): number | null => {
    if (!input || input.trim() === '') return null
    
    // First normalize the input (handle minutes >= 60)
    const normalized = normalizeTimeInput(input)
    if (!normalized) return null
    
    // Parse the normalized input
    const timeMatch = normalized.match(/^(\d+):(\d{2})$/)
    if (timeMatch) {
      const hours = parseInt(timeMatch[1], 10)
      const minutes = parseInt(timeMatch[2], 10)
      return hours + (minutes / 60)
    }
    
    return null
  }

  // Check if H:MM format is valid
  const isValidTimeFormat = (timeInput: string) => {
    if (!timeInput || timeInput.trim() === '') return true // Empty is valid (required field)
    const parsed = parseTimeInput(timeInput)
    return parsed !== null && parsed > 0 && parsed <= 24
  }

  const getSelectedProjectData = () => {
    return data?.user?.assignedProjects?.find((project: any) => project._id === selectedProject)
  }

  const getSelectedTaskData = () => {
    const projectData = getSelectedProjectData()
    return projectData?.tasks?.find((task: any) => task._id === selectedTask)
  }

  const handleProjectChange = (projectId: string) => {
    setSelectedProject(projectId)
    setSelectedTask('') // Reset task selection when project changes
  }

  const handleStartTimer = async () => {
    if (!selectedProject) {
      toast.error('Please select a project')
      return
    }

    if (!selectedTask) {
      toast.error('Please select a task')
      return
    }

    setActionLoading('start-timer')

    try {
      const response = await fetch('/api/time-entries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: selectedProject,
          taskId: selectedTask,
          startTime: new Date().toISOString(),
          notes: timerNotes.trim() || '',
          entryType: 'timer',
          date: format(selectedDate, 'yyyy-MM-dd'),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to start timer')
      }

      const newEntry = await response.json()

      // Optimistic update - add the new timer entry to recent entries
      const optimisticEntry = {
        ...newEntry,
        isRunning: true,
        project: data?.user?.assignedProjects?.find((p: any) => p._id === selectedProject),
        task: data?.user?.assignedProjects?.find((p: any) => p._id === selectedProject)?.tasks?.find((t: any) => t._id === selectedTask)
      }
      addTimeEntryToRecent(optimisticEntry)

      setTimerRunning(true)
      setElapsedTime(0)
      setTimerNotes('') // Clear notes after starting timer
      setShowTimeEntryModal(false) // Close modal
      setTimeEntryMode('timer') // Reset mode
      setSelectedProject('') // Reset selections
      setSelectedTask('')
      toast.success('Timer started')

      // Update dashboard data in background
      await refreshDashboardData()
    } catch (error) {
      console.error('Error starting timer:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to start timer')
    } finally {
      setActionLoading(null)
    }
  }

  const handleStopTimer = async () => {
    if (!data?.runningTimer) return Promise.resolve()

    setActionLoading('stop-timer')

    try {
      const hours = elapsedTime / 3600
      // If less than 1 minute, set to 0 hours
      const calculatedHours = elapsedTime < 60 ? 0 : formatDecimalHours(hours)

      console.log('Sending stop timer request:', {
        timerId: data.runningTimer._id,
        elapsedTime,
        calculatedHours,
        runningTimer: data.runningTimer
      })

      const response = await fetch(`/api/time-entries/${data.runningTimer._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'stop',
          hours: calculatedHours,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to stop timer')
      }

      const updatedEntry = await response.json()

      // Optimistic update - update the running timer entry
      const optimisticEntry = {
        ...updatedEntry,
        isRunning: false,
        project: data.runningTimer.project,
        task: data.runningTimer.task
      }
      updateTimeEntryInRecent(data.runningTimer._id, optimisticEntry)

      setTimerRunning(false)
      setElapsedTime(0)
      setTimerNotes('') // Clear notes after stopping timer
      toast.success('Timer stopped')

      // Update dashboard data in background
      await refreshDashboardData()
    } catch (error) {
      console.error('Error stopping timer:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to stop timer')
      throw error // Re-throw so the calling function knows it failed
    } finally {
      setActionLoading(null)
    }
  }

  // Stop timer without reloading page (for use when starting another timer)
  const stopTimerWithoutReload = async () => {
    if (!data?.runningTimer) return Promise.resolve()

    setActionLoading('stop-timer-background')

    try {
      // If timer ran for less than 1 minute, treat it as 0:00
      const hours = elapsedTime / 3600
      // If less than 1 minute, set to 0 hours
      const calculatedHours = elapsedTime < 60 ? 0 : formatDecimalHours(hours)

      console.log('Stopping timer without reload:', {
        timerId: data.runningTimer._id,
        elapsedTime,
        calculatedHours,
      })

      const response = await fetch(`/api/time-entries/${data.runningTimer._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'stop',
          hours: calculatedHours,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to stop timer')
      }

      const updatedEntry = await response.json()

      // Optimistic update - update the running timer entry
      const optimisticEntry = {
        ...updatedEntry,
        isRunning: false,
        project: data.runningTimer.project,
        task: data.runningTimer.task
      }
      updateTimeEntryInRecent(data.runningTimer._id, optimisticEntry)

      setTimerRunning(false)
      setElapsedTime(0)
      setTimerNotes('') // Clear notes after stopping timer
      toast.success('Previous timer stopped')

      // Update dashboard data in background
      await refreshDashboardData()

      return true // Indicate success
    } catch (error) {
      console.error('Error stopping timer without reload:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to stop previous timer')
      return false // Indicate failure
    } finally {
      setActionLoading(null)
    }
  }

  const handleManualEntry = async (e: React.FormEvent) => {
    e.preventDefault()

    // Parse hours from H:MM format
    const hoursValue = parseTimeInput(hoursDisplay || manualEntryData.hours)
    
    if (!manualEntryData.projectId || !manualEntryData.taskId || !manualEntryData.hours || hoursValue === null || isNaN(hoursValue) || hoursValue <= 0 || hoursValue > 24) {
      toast.error('Please fill in all fields. Hours must be in H:MM format (e.g., 2:30). Range: 0:01 to 24:00.')
      return
    }
    
    // Round to 2 decimal places
    const roundedHours = formatDecimalHours(hoursValue)

    setActionLoading('manual-entry')

    try {
      const response = await fetch('/api/time-entries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: manualEntryData.projectId,
          taskId: manualEntryData.taskId,
          date: manualEntryData.date,
          hours: roundedHours,
          notes: manualEntryData.notes,
          entryType: 'manual',
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create time entry')
      }

      const newEntry = await response.json()

      // Optimistic update - add the new entry to recent entries
      const optimisticEntry = {
        ...newEntry,
        isRunning: false,
        project: data?.user?.assignedProjects?.find((p: any) => p._id === manualEntryData.projectId),
        task: data?.user?.assignedProjects?.find((p: any) => p._id === manualEntryData.projectId)?.tasks?.find((t: any) => t._id === manualEntryData.taskId)
      }
      addTimeEntryToRecent(optimisticEntry)

      toast.success('Time entry created successfully')
      setShowTimeEntryModal(false) // Close modal
      setTimeEntryMode('timer') // Reset mode
      setSelectedProject('') // Reset selections
      setSelectedTask('')
      setTimerNotes('')
      setManualEntryData({
        projectId: '',
        taskId: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        hours: '',
        notes: ''
      })

      // Update dashboard data in background
      await refreshDashboardData()
    } catch (error) {
      console.error('Error creating manual entry:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to create time entry')
    } finally {
      setActionLoading(null)
    }
  }

  const handleEditEntry = (entry: any) => {
    // Check if entry is locked (approved) - pending entries can be edited
    if (entry.isLocked && entry.isApproved) {
      toast.error('Cannot edit entry that has been approved')
      return
    }
    
    // Check if ANY entries in the same week are approved
    const entryDate = parseISO(entry.date)
    const weekStart = format(startOfWeek(entryDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const weekEnd = format(endOfWeek(entryDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const weekEntries = data?.recentEntries?.filter((e: any) => 
      e.date >= weekStart && e.date <= weekEnd
    ) || []
    const hasApprovedInWeek = weekEntries.some((e: any) => e.isApproved && e.isLocked)
    
    if (hasApprovedInWeek) {
      toast.error('Cannot edit entries in a week that has approved entries')
      return
    }

    setEditingEntry(entry)

    // Auto-populate with the current entry's project and task details
    const projectId = entry.project?._id || ''
    const taskId = entry.task?._id || ''

    console.log('Editing entry:', {
      entryId: entry._id,
      projectId,
      projectName: entry.project?.name,
      taskId,
      taskName: entry.task?.name
    })

    const hoursValue = entry.hours.toString()
    setManualEntryData({
      projectId: projectId,
      taskId: taskId,
      date: entry.date,
      hours: hoursValue,
      notes: entry.notes || ''
    })
    // Set display format
    setHoursDisplay(formatSimpleTime(entry.hours))

    // Also set the timer mode selections for consistency
    setSelectedProject(projectId)
    setSelectedTask(taskId)

    setTimeEntryMode('manual')
    setShowTimeEntryModal(true)
  }

  const handleUpdateEntry = async (e: React.FormEvent) => {
    e.preventDefault()

    // Parse hours from H:MM format
    const hoursValue = parseTimeInput(hoursDisplay || manualEntryData.hours)
    
    if (!editingEntry || !manualEntryData.projectId || !manualEntryData.taskId || !manualEntryData.hours || hoursValue === null || isNaN(hoursValue) || hoursValue <= 0 || hoursValue > 24) {
      toast.error('Please fill in all required fields. Hours must be in H:MM format (e.g., 2:30). Range: 0:01 to 24:00.')
      return
    }
    
    // Round to 2 decimal places
    const roundedHours = formatDecimalHours(hoursValue)

    // Check if entry is locked (approved) - pending entries can be updated
    if (editingEntry.isLocked && editingEntry.isApproved) {
      toast.error('Cannot update entry that has been approved')
      return
    }

    setActionLoading('update-entry')

    try {
      const response = await fetch(`/api/time-entries/${editingEntry._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update',
          projectId: manualEntryData.projectId,
          taskId: manualEntryData.taskId || null,
          date: manualEntryData.date,
          hours: roundedHours,
          notes: manualEntryData.notes,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update time entry')
      }

      const updatedEntry = await response.json()

      // Optimistic update - update the entry in recent entries
      const optimisticEntry = {
        ...updatedEntry,
        isRunning: editingEntry.isRunning || false,
        project: data?.user?.assignedProjects?.find((p: any) => p._id === manualEntryData.projectId),
        task: data?.user?.assignedProjects?.find((p: any) => p._id === manualEntryData.projectId)?.tasks?.find((t: any) => t._id === manualEntryData.taskId)
      }
      updateTimeEntryInRecent(editingEntry._id, optimisticEntry)

      toast.success('Time entry updated successfully')
      setShowTimeEntryModal(false)
      setTimeEntryMode('timer')
      setEditingEntry(null)
      setSelectedProject('')
      setSelectedTask('')
      setTimerNotes('')
      setManualEntryData({
        projectId: '',
        taskId: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        hours: '',
        notes: ''
      })

      // Update dashboard data in background
      await refreshDashboardData()
    } catch (error) {
      console.error('Error updating entry:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to update time entry')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDeleteEntry = async (entryId: string, skipConfirm = false) => {
    // Find the entry to check if it's locked (approved) - pending entries can be deleted
    const entry = data?.recentEntries?.find((e: any) => e._id === entryId)
    if (entry?.isLocked && entry?.isApproved) {
      toast.error('Cannot delete entry that has been approved')
      return
    }
    
    // Check if ANY entries in the same week are approved
    if (entry) {
      const entryDate = parseISO(entry.date)
      const weekStart = format(startOfWeek(entryDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
      const weekEnd = format(endOfWeek(entryDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
      const weekEntries = data?.recentEntries?.filter((e: any) => 
        e.date >= weekStart && e.date <= weekEnd
      ) || []
      const hasApprovedInWeek = weekEntries.some((e: any) => e.isApproved && e.isLocked)
      
      if (hasApprovedInWeek) {
        toast.error('Cannot delete entries in a week that has approved entries')
        return
      }
    }

    if (!skipConfirm && !confirm('Are you sure you want to delete this time entry?')) return

    setEntryDeleteLoadingId(entryId)

    try {
      const response = await fetch(`/api/time-entries/${entryId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete time entry')
      }

      // Optimistic update - remove the entry from recent entries
      removeTimeEntryFromRecent(entryId)

      toast.success('Time entry deleted successfully')

      // Update dashboard data in background
      await refreshDashboardData()
    } catch (error) {
      console.error('Error deleting entry:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to delete time entry')
    } finally {
      setEntryDeleteLoadingId(null)
    }
  }

  const handleSubmitWeek = async () => {
    // Refresh data first to ensure we have the latest entries
    const freshData = await refreshDashboardData()

    const weekStart = format(startOfWeek(currentWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const weekEnd = format(endOfWeek(currentWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd')

    // Get current week's entries that are not already approved/locked
    // Use freshData from refreshDashboardData() to avoid stale closure issues
    const entriesToSubmit = freshData?.recentEntries?.filter((entry: any) =>
      entry.date >= weekStart && entry.date <= weekEnd && !(entry.isApproved && entry.isLocked)
    ) || []

    console.log('Current week entries for submission:', {
      weekStart,
      weekEnd,
      totalEntries: entriesToSubmit.length,
      currentWeek: format(currentWeek, 'yyyy-MM-dd'),
      selectedDate: format(selectedDate, 'yyyy-MM-dd'),
      allEntries: freshData?.recentEntries?.length || 0,
      entries: entriesToSubmit.map((e: any) => ({ id: e._id, date: e.date, approved: e.isApproved, locked: e.isLocked, hours: e.hours }))
    })

    if (entriesToSubmit.length === 0) {
      toast.error('No time entries found for this week to submit')
      return
    }

    const isResubmit = entriesToSubmit.some((entry: any) => entry.submittedAt && !entry.isApproved) && 
                       entriesToSubmit.some((entry: any) => !entry.submittedAt)
    const actionText = isResubmit ? 'resubmit' : 'submit'
    const confirmMessage = isResubmit
      ? `Resubmit this week's ${entriesToSubmit.length} time entries for approval?`
      : `Submit this week's ${entriesToSubmit.length} time entries for approval?`

    if (!confirm(confirmMessage)) return

    setActionLoading('submit-week')

    try {
      // Debug logging
      console.log('Submitting week:', { weekStart, weekEnd, entriesToSubmit: entriesToSubmit.length })

      // Use submit-week endpoint for both submit and resubmit
      const response = await fetch('/api/time-entries/submit-week', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: weekStart,
          endDate: weekEnd,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('Submit week API error:', errorData)
        throw new Error(errorData.error || 'Failed to submit week')
      }

      const result = await response.json()
      console.log('Submit week API response:', result)

      toast.success(result.message || `Week ${actionText}ted for approval`)

      // Refresh dashboard data to reflect the changes
      await refreshDashboardData()
    } catch (error) {
      console.error('Error submitting week:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to submit week for approval')
    } finally {
      setActionLoading(null)
    }
  }

  // Group time entries by date
  const groupEntriesByDate = (entries: any[]) => {
    const grouped: { [key: string]: any[] } = {}

    entries.forEach((entry) => {
      const dateKey = entry.date // Assuming date is in YYYY-MM-DD format
      if (!grouped[dateKey]) {
        grouped[dateKey] = []
      }
      grouped[dateKey].push(entry)
    })

    // Sort dates in descending order (most recent first)
    const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())

    return sortedDates.map(date => ({
      date,
      entries: grouped[date],
      totalHours: grouped[date].reduce((sum, entry) => sum + calculateCurrentHours(entry), 0)
    }))
  }

  // Group time entries by project and task within each day (Harvest style)
  const getDayColumnData = (dayGroup: any) => {
    const projectTaskGroups: { [key: string]: any } = {}

    dayGroup.entries.forEach((entry: any) => {
      const key = `${entry.project?._id || 'no-project'}-${entry.task?._id || 'no-task'}`
      if (!projectTaskGroups[key]) {
        projectTaskGroups[key] = {
          projectId: entry.project?._id || '',
          projectName: entry.project?.name || 'No Project',
          projectCode: entry.project?.code || '',
          taskId: entry.task?._id || '',
          taskName: entry.task?.name || 'No Task',
          color: '#3b82f6',
          entries: []
        }
      }
      projectTaskGroups[key].entries.push(entry)
    })

    // Convert to array and sort by project name, then task name
    return Object.values(projectTaskGroups).map((group: any) => ({
      ...group,
      totalHours: group.entries.reduce((sum: number, entry: any) => sum + calculateCurrentHours(entry), 0)
    })).sort((a: any, b: any) => {
      const projectCompare = a.projectName.localeCompare(b.projectName)
      if (projectCompare !== 0) return projectCompare
      return a.taskName.localeCompare(b.taskName)
    })
  }

  // Group time entries by project (project-wise view)
  const groupEntriesByProject = (entries: any[]) => {
    const projectGroups: { [key: string]: any } = {}

    entries.forEach((entry) => {
      const projectId = entry.project?._id || 'no-project'

      // Debug logging to see what project data looks like
      if (entry.project) {
        console.log('Entry project data:', {
          id: entry.project._id,
          name: entry.project.name,
          code: entry.project.code,
          client: entry.project.client
        })
      } else {
        console.log('Entry missing project data:', entry)
      }

      if (!projectGroups[projectId]) {
        projectGroups[projectId] = {
          projectId: entry.project?._id || '',
          projectName: entry.project?.name || 'Unnamed Project',
          projectCode: entry.project?.code || '',
          clientName: entry.project?.client?.name || '',
          color: '#3b82f6',
          entries: []
        }

        // Log when we create a group to help debug
        console.log('Creating project group:', {
          projectId: entry.project?._id,
          projectName: entry.project?.name,
          projectCode: entry.project?.code
        })
      }
      projectGroups[projectId].entries.push(entry)
    })

    // Convert to array and sort by project name
    return Object.values(projectGroups).map((group: any) => ({
      ...group,
      totalHours: group.entries.reduce((sum: number, entry: any) => sum + calculateCurrentHours(entry), 0),
      entries: group.entries.sort((a: any, b: any) => {
        // Sort entries within project by date (most recent first)
        return new Date(b.date).getTime() - new Date(a.date).getTime()
      })
    })).sort((a: any, b: any) => a.projectName.localeCompare(b.projectName))
  }

  // Group entries by project and task for week view table
  // Combine entries with same project/task, show combined hours
  const getWeekViewEntries = () => {
    const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 })
    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const day = startOfWeek(currentWeek, { weekStartsOn: 1 })
      return addDays(day, i)
    })

    // Use filtered currentWeekEntries instead of data?.recentEntries
    // currentWeekEntries already excludes unsubmitted entries from weeks with approved entries
    const weekEntries = currentWeekEntries.filter((entry: any) => {
      const entryDate = parseISO(entry.date)
      return entryDate >= weekStart && entryDate <= weekEnd
    })

    // Group by project and task (combine entries with same project/task)
    const entriesByProjectAndTask: Record<string, { 
      project: { _id: string, name: string, code?: string }, 
      task: { _id: string, name: string }, 
      days: number[],
      dayEntries: Array<{ date: string, entries: any[] }> // Store entries for each day
    }> = {}

    weekEntries.forEach((entry: any) => {
      const key = `${entry.project?._id || 'no-project'}-${entry.task?._id || 'no-task'}`
      if (!entriesByProjectAndTask[key]) {
        entriesByProjectAndTask[key] = {
          project: entry.project || { _id: '', name: 'No Project' },
          task: entry.task || { _id: '', name: 'No Task' },
          days: Array(7).fill(0),
          dayEntries: weekDays.map(day => ({ date: format(day, 'yyyy-MM-dd'), entries: [] }))
        }
      }
      
      const dayIndex = weekDays.findIndex(day => format(day, 'yyyy-MM-dd') === entry.date)
      if (dayIndex !== -1) {
        entriesByProjectAndTask[key].days[dayIndex] += calculateCurrentHours(entry)
        entriesByProjectAndTask[key].dayEntries[dayIndex].entries.push(entry)
      }
    })

    // Add empty rows that don't have entries yet (for week view)
    emptyRows.forEach(emptyRow => {
      const key = `${emptyRow.projectId}-${emptyRow.taskId}`;
      if (!entriesByProjectAndTask[key]) {
        entriesByProjectAndTask[key] = {
          project: { _id: emptyRow.projectId, name: emptyRow.projectName },
          task: { _id: emptyRow.taskId, name: emptyRow.taskName },
          days: Array(7).fill(0),
          dayEntries: weekDays.map(day => ({ date: format(day, 'yyyy-MM-dd'), entries: [] }))
        };
      }
    });

    // Convert to array and sort by project name, then task name
    const entriesArray = Object.values(entriesByProjectAndTask).sort((a, b) => {
      const projectCompare = a.project.name.localeCompare(b.project.name)
      if (projectCompare !== 0) return projectCompare
      return a.task.name.localeCompare(b.task.name)
    })

    return { entriesByProjectAndTask: entriesArray, weekDays }
  }

  const handleInlineEditSave = async () => {
    if (!inlineEditingCell) return;

    // Skip API call if value hasn't changed
    if (inlineEditingValue.trim() === inlineEditingOriginalValue.trim()) {
      setInlineEditingCell(null);
      setInlineEditingValue('');
      setInlineEditingOriginalValue('');
      return;
    }

    const { projectId, taskId, dayIndex } = inlineEditingCell;

    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const day = startOfWeek(currentWeek, { weekStartsOn: 1 })
      return addDays(day, i)
    });
    const targetDate = weekDays[dayIndex];
    const dateString = format(targetDate, 'yyyy-MM-dd');

    const { entriesByProjectAndTask } = getWeekViewEntries();
    const rowData = entriesByProjectAndTask.find(row => row.project._id === projectId && row.task._id === taskId);
    const dayEntriesForCell = rowData ? rowData.dayEntries[dayIndex]?.entries || [] : [];
    
    // Trim and check if empty
    const trimmedValue = inlineEditingValue.trim();
    
    // If input is empty, exit edit mode without saving (or delete if entries exist)
    if (!trimmedValue) {
        if (dayEntriesForCell.length > 0) {
            const cellId = `${projectId}-${taskId}-${dayIndex}`;
            setSavingCellId(cellId);
            // Optimistically remove entries from UI
            updateDashboardOptimistically(prevData => ({
              ...prevData,
              recentEntries: prevData.recentEntries.filter(e => 
                !(e.project._id === projectId && e.task?._id === taskId && e.date === dateString)
              )
            }));
        setInlineEditingCell(null);
        setInlineEditingValue('');
            
            // Delete from server in background
            const deletePromises = dayEntriesForCell
              .filter(entry => !(entry.isLocked && entry.isApproved))
              .map(async (entry: any) => {
                try {
                  const response = await fetch(`/api/time-entries/${entry._id}`, {
                    method: 'DELETE',
                  });
                  if (!response.ok) throw new Error('Failed to delete entry');
                } catch (error) {
                  console.error('Error deleting entry:', error);
                  throw error;
                }
              });
            Promise.all(deletePromises)
              .then(() => {
                toast.success('Entry deleted');
                // No refresh needed - optimistic update already removed entries
              })
              .catch(() => {
                toast.error('Failed to delete entry');
                refreshDashboardData(); // Refresh on error to revert
              })
              .finally(() => {
                setSavingCellId(null);
              });
        } else {
            setInlineEditingCell(null);
            setInlineEditingValue('');
        }
        return;
    }
    
    // Try to parse the input
    const hoursValue = parseTimeInput(trimmedValue);
    
    // If parse failed, show error but don't exit edit mode
    if (hoursValue === null) {
        toast.error('Invalid time format. Use H:MM (e.g., 2:30) or decimal (e.g., 2.5).');
        return;
    }
    
    // Validate range
    if (isNaN(hoursValue) || hoursValue < 0 || hoursValue > 24) {
        toast.error('Hours must be between 0 and 24.');
        return;
    }
    
    // If value is 0, delete entries
    if (hoursValue === 0 && dayEntriesForCell.length > 0) {
        const cellId = `${projectId}-${taskId}-${dayIndex}`;
        setSavingCellId(cellId);
        // Optimistically remove entries from UI
        updateDashboardOptimistically(prevData => ({
          ...prevData,
          recentEntries: prevData.recentEntries.filter(e => 
            !(e.project._id === projectId && e.task?._id === taskId && e.date === dateString)
          )
        }));
        setInlineEditingCell(null);
        setInlineEditingValue('');
        
        // Delete from server in background
        const deletePromises = dayEntriesForCell
          .filter(entry => !(entry.isLocked && entry.isApproved))
          .map(async (entry: any) => {
            try {
              const response = await fetch(`/api/time-entries/${entry._id}`, {
                method: 'DELETE',
              });
              if (!response.ok) throw new Error('Failed to delete entry');
            } catch (error) {
              console.error('Error deleting entry:', error);
              throw error;
            }
          });
        Promise.all(deletePromises)
          .then(() => {
            toast.success('Entry deleted');
            // No refresh needed - optimistic update already removed entries
          })
          .catch(() => {
            toast.error('Failed to delete entry');
            refreshDashboardData(); // Refresh on error to revert
          })
          .finally(() => {
            setSavingCellId(null);
          });
        return;
    }

    const roundedHours = formatDecimalHours(hoursValue);

    if (dayEntriesForCell.length > 0) {
        // If there are multiple entries, delete all except the first one, then update the first
        const firstEntry = dayEntriesForCell[0];
        
        if (firstEntry.isLocked && firstEntry.isApproved) {
            toast.error('Cannot update entry that has been approved');
            setInlineEditingCell(null);
            setInlineEditingValue('');
            return;
        }

        const cellId = `${projectId}-${taskId}-${dayIndex}`;
        setSavingCellId(cellId);
        // Optimistically update the entry in UI
        updateDashboardOptimistically(prevData => {
          const filtered = prevData.recentEntries.filter(e => 
            !(e.project._id === projectId && e.task?._id === taskId && e.date === dateString && e._id !== firstEntry._id)
          );
          return {
            ...prevData,
            recentEntries: filtered.map(e => 
              e._id === firstEntry._id ? { ...e, hours: roundedHours } : e
            )
          };
        });
        setInlineEditingCell(null);
        setInlineEditingValue('');

        // Update on server in background
        (async () => {
          try {
            // Delete all other entries if there are multiple
            if (dayEntriesForCell.length > 1) {
              const deletePromises = dayEntriesForCell
                .slice(1)
                .filter(entry => !(entry.isLocked && entry.isApproved))
                .map(async (entry: any) => {
                  const response = await fetch(`/api/time-entries/${entry._id}`, {
                    method: 'DELETE',
                  });
                  if (!response.ok) throw new Error('Failed to delete entry');
                });
              await Promise.all(deletePromises);
            }

            // Update the first entry
            const response = await fetch(`/api/time-entries/${firstEntry._id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                  action: 'update',
                                  projectId: projectId,
                                  taskId: taskId,
                                  date: dateString,
                                  hours: roundedHours,
                  notes: firstEntry.notes || '',
                  isBillable: firstEntry.isBillable,
                }),
            });
            if (!response.ok) throw new Error('Failed to update entry');
            await response.json();
            toast.success('Entry updated');
            // No refresh needed - optimistic update already shows correct data
        } catch (error) {
            console.error('Error updating entry:', error);
            toast.error('Failed to update entry');
            await refreshDashboardData(); // Refresh on error to revert optimistic update
        } finally {
            setSavingCellId(null);
        }
        })();
    } else if (dayEntriesForCell.length === 0) {
        // Create new entry - show saving state without optimistic update to avoid display issues
        const cellId = `${projectId}-${taskId}-${dayIndex}`;
        setSavingCellId(cellId);
        setInlineEditingCell(null);
        setInlineEditingValue('');

        // Create on server and refresh
        (async () => {
          try {
            const response = await fetch('/api/time-entries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    taskId,
                    date: dateString,
                    hours: roundedHours,
                    notes: '',
                    entryType: 'manual',
                }),
            });
            if (!response.ok) throw new Error('Failed to create entry');
            await response.json();
            toast.success('Entry created');
            await refreshDashboardData(); // Refresh to get real entry from server
          } catch (error) {
            console.error('Error creating entry:', error);
            toast.error('Failed to create entry');
          } finally {
            setSavingCellId(null);
          }
        })();
    }
  };

  // Handle cell click in week view
  const handleWeekViewCellClick = (projectId: string, taskId: string, dayIndex: number, entries: any[], event: React.MouseEvent) => {
    // Always use inline editing - sum up hours if multiple entries exist
    setInlineEditingCell({ projectId, taskId, dayIndex });
    if (entries.length > 0) {
      // Sum up all hours from multiple entries
      const totalHours = entries.reduce((sum, entry) => sum + (calculateCurrentHours(entry) || 0), 0);
      const formattedTime = formatSimpleTime(totalHours);
      setInlineEditingValue(formattedTime);
      setInlineEditingOriginalValue(formattedTime);
    } else {
      setInlineEditingValue('');
      setInlineEditingOriginalValue('');
    }
  }

  const handleDeleteProjectTaskRow = async (projectId: string, taskId: string) => {
    // Get all entries for this project-task combination across all days in the week
    const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
    const weekStartStr = format(weekStart, 'yyyy-MM-dd');
    const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

    // Get all entries for this project-task in the current week
    const { entriesByProjectAndTask } = getWeekViewEntries();
    const rowData = entriesByProjectAndTask.find(row => row.project._id === projectId && row.task._id === taskId);
    
    if (!rowData) {
      toast.error('No entries found to delete');
      return;
    }

    // Get all entries from all days
    const projectTaskEntries = rowData.dayEntries.flatMap(dayEntry => dayEntry.entries || []);

    if (projectTaskEntries.length === 0) {
      toast.error('No entries found to delete');
      return;
    }

    // Check if any entry is locked (approved)
    const hasLockedEntries = projectTaskEntries.some((e: any) => e.isLocked && e.isApproved);
    if (hasLockedEntries) {
      toast.error('Cannot delete entries that have been approved');
      return;
    }

    // Confirm deletion
    if (!confirm('Are you sure you want to delete all entries from this row?')) {
      return;
    }

    const rowId = `${projectId}-${taskId}`;
    setDeletingRowId(rowId);
    try {
      // Delete all entries silently (without individual toasts)
      const deletePromises = projectTaskEntries.map(async (entry: any) => {
        try {
          const response = await fetch(`/api/time-entries/${entry._id}`, {
            method: 'DELETE',
          });
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to delete time entry');
          }
        } catch (error) {
          console.error('Error deleting entry:', error);
          throw error;
        }
      });
      await Promise.all(deletePromises);
      toast.success('Deleted the selected row entries');
      await refreshDashboardData();
    } catch (error) {
      console.error('Error deleting entries:', error);
      toast.error('Failed to delete some entries');
    } finally {
      setDeletingRowId(null);
    }
  };

  // Get entries for selected date
  const getSelectedDateEntries = () => {
    const selectedDateStr = format(selectedDate, 'yyyy-MM-dd')
    const dayEntries = data?.recentEntries?.filter((entry: any) => entry.date === selectedDateStr) || []
    
    // Filter out unsubmitted entries from weeks that have approved entries
    return dayEntries.filter((entry: any) => {
      // If entry is approved, include it
      if (entry.isApproved && entry.isLocked) {
        return true
      }
      
      // If entry is unsubmitted, check if its week has any approved entries
      if (!entry.submittedAt) {
        const entryDate = parseISO(entry.date)
        const weekStart = format(startOfWeek(entryDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
        const weekEnd = format(endOfWeek(entryDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
        
        const weekHasApproved = data?.recentEntries?.some((e: any) => 
          e.date >= weekStart && 
          e.date <= weekEnd && 
          e.isApproved && 
          e.isLocked
        )
        // Exclude unsubmitted entries from weeks with approved entries
        return !weekHasApproved
      }
      
      // Include submitted/pending entries
      return true
    })
  }

  // Get auto-fill project and task for new entries
  // Returns project and task from last entry for selected date, or first available project/task
  const getAutoFillProjectAndTask = () => {
    // Get ALL entries for the selected date (without filtering for display purposes)
    // This ensures we can auto-fill even if entries are filtered out for display
    const selectedDateStr = format(selectedDate, 'yyyy-MM-dd')
    const allDayEntries = data?.recentEntries?.filter((entry: any) => entry.date === selectedDateStr) || []
    
    // If there are entries for the selected date, use the last entry's project and task
    // Use the last entry regardless of approval status for auto-fill purposes
    if (allDayEntries.length > 0) {
      // Sort by creation time to get the most recent entry
      const sortedEntries = [...allDayEntries].sort((a: any, b: any) => {
        const dateA = a._createdAt || a.createdAt || ''
        const dateB = b._createdAt || b.createdAt || ''
        return dateB.localeCompare(dateA)
      })
      const lastEntry = sortedEntries[0]
      if (lastEntry.project?._id && lastEntry.task?._id) {
        return {
          projectId: lastEntry.project._id,
          taskId: lastEntry.task._id
        }
      }
    }
    
    // Otherwise, use the first project and its first task
    const assignedProjects = data?.user?.assignedProjects || []
    if (assignedProjects.length > 0) {
      const firstProject = assignedProjects[0]
      const firstTask = firstProject.tasks && firstProject.tasks.length > 0 ? firstProject.tasks[0] : null
      return {
        projectId: firstProject._id,
        taskId: firstTask?._id || ''
      }
    }
    
    return { projectId: '', taskId: '' }
  }

  // Calendar functions
  const navigateDay = (direction: 'prev' | 'next') => {
    const newDate = direction === 'next' 
      ? addDays(selectedDate, 1) 
      : subDays(selectedDate, 1);
    setSelectedDate(newDate);
    // Also update the week if needed to ensure data is available
    const newWeekStart = startOfWeek(newDate, { weekStartsOn: 1 });
    const currentWeekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
    if (newWeekStart.getTime() !== currentWeekStart.getTime()) {
      setCurrentWeek(newDate);
      refreshDashboardData(newDate);
    }
    // Update manual entry date
    setManualEntryData(prev => ({ ...prev, date: format(newDate, 'yyyy-MM-dd') }));
  };

  const navigateWeek = async (direction: 'prev' | 'next') => {
    const newWeek = new Date(currentWeek)
    newWeek.setDate(currentWeek.getDate() + (direction === 'next' ? 7 : -7))

    // Update currentWeek first
    setCurrentWeek(newWeek)

    // Refresh data for the new week - pass the new week to ensure correct data is fetched
    const dashboardData = await refreshDashboardData(newWeek)

    if (!dashboardData) {
      // If data fetch failed, fallback to start of week
      setSelectedDate(startOfWeek(newWeek, { weekStartsOn: 1 }))
      return
    }

    // After data is loaded, automatically select a date with entries or today if in this week
    const today = new Date()
    const weekStart = startOfWeek(newWeek, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(newWeek, { weekStartsOn: 1 })

    // First, check if today is in this week and has entries
    if (today >= weekStart && today <= weekEnd) {
      const todayStr = format(today, 'yyyy-MM-dd')
      const hasEntriesToday = dashboardData.recentEntries?.some((entry: any) => entry.date === todayStr)
      if (hasEntriesToday) {
        setSelectedDate(today)
        return
      }
    }

    // Otherwise, find the first date with entries
    if (dashboardData.recentEntries && dashboardData.recentEntries.length > 0) {
      const sortedDates = [...new Set(dashboardData.recentEntries.map((entry: any) => entry.date))].sort()
      if (sortedDates.length > 0) {
        const firstDateWithEntries = parseISO(sortedDates[0])
        setSelectedDate(firstDateWithEntries)
        return
      }
    }

    // Fallback to start of week
    setSelectedDate(weekStart)
  }

  const goToToday = async () => {
    const today = new Date()
    const todayWeek = startOfWeek(today, { weekStartsOn: 1 })

    // Only update currentWeek if it's different
    if (format(currentWeek, 'yyyy-MM-dd') !== format(todayWeek, 'yyyy-MM-dd')) {
      setCurrentWeek(todayWeek)
    }

    setSelectedDate(today)

    // Refresh data for today
    await refreshDashboardData()
  }

  // Generate calendar days for current week
  const getWeekDays = () => {
    const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 }) // Monday
    const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 }) // Sunday

    return eachDayOfInterval({ start: weekStart, end: weekEnd })
  }

  // Check if entry is from today (handle both regular entries and running timers)
  const isTodayEntry = (entry: any) => {
    if (entry.isRunning) {
      // For running timers, use startTime to determine if it's today's timer
      return isToday(parseISO(entry.startTime))
    }
    return entry.date && isSameDay(parseISO(entry.date), new Date())
  }

  // Fetch projects with their tasks for Add Row modal
  const fetchProjectsWithTasks = async () => {
    try {
      const projectList = await sanityFetch<ProjectWithTasks[]>({
        query: `*[_type == "project" && isActive == true && $userId in assignedUsers[isActive == true].user._ref]{_id, name, tasks[]->{_id, name, isBillable, isArchived}}`,
        params: { userId },
      });
      setProjectsWithTasks(projectList);
    } catch (error) {
      console.error('Error fetching projects with tasks:', error);
      toast.error('Failed to load projects.');
    }
  };

  // Fetch previous week's project-task combinations for current week auto-population
  const fetchPreviousWeekRows = async (showToast = false) => {
    if (!userId) return;
    
    const previousWeekStart = format(subDays(startOfWeek(currentWeek, { weekStartsOn: 1 }), 7), 'yyyy-MM-dd');
    const previousWeekEnd = format(subDays(endOfWeek(currentWeek, { weekStartsOn: 1 }), 7), 'yyyy-MM-dd');
    
    try {
      const previousEntries = await sanityFetch<Array<{
        _id: string
        project: { _id: string; name: string }
        task: { _id: string; name: string }
      }>>({
        query: `*[_type == "timeEntry" && user._ref == $userId && date >= $startDate && date <= $endDate] | order(project.name asc) { 
          _id, 
          project->{_id, name}, 
          task->{_id, name}
        }`,
        params: { 
          userId, 
          startDate: previousWeekStart, 
          endDate: previousWeekEnd 
        },
      });
      
      // Extract unique project-task combinations
      const uniqueRows: EmptyRow[] = [];
      const seenKeys = new Set<string>();
      
      // Add existing entries to seen keys
      const { entriesByProjectAndTask } = getWeekViewEntries();
      entriesByProjectAndTask.forEach(row => {
        seenKeys.add(`${row.project._id}-${row.task._id}`);
      });
      
      // Add existing empty rows to seen keys
      emptyRows.forEach(row => {
        seenKeys.add(`${row.projectId}-${row.taskId}`);
      });
      
      previousEntries.forEach(entry => {
        if (!entry.project || !entry.task) return;
        const key = `${entry.project._id}-${entry.task._id}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          uniqueRows.push({
            projectId: entry.project._id,
            projectName: entry.project.name,
            taskId: entry.task._id,
            taskName: entry.task.name,
          });
        }
      });
      
      setEmptyRows(prev => [...prev, ...uniqueRows]);
      
      if (showToast) {
        if (uniqueRows.length > 0) {
          toast.success(`Copied ${uniqueRows.length} row(s) from previous week`);
        } else {
          toast('No new rows to copy from previous week');
        }
      }
    } catch (error) {
      console.error('Error fetching previous week rows:', error);
      if (showToast) {
        toast.error('Failed to copy rows from previous week');
      }
    }
  };

  // Manual handler for copying previous week rows
  const handleCopyPreviousWeekRows = async () => {
    setCopyingPreviousWeekRows(true);
    await fetchPreviousWeekRows(true);
    setCopyingPreviousWeekRows(false);
  };

  // Clear empty rows when changing weeks or view mode
  useEffect(() => {
    // Clear empty rows when switching weeks
    setEmptyRows([]);
  }, [currentWeek, viewMode]);

  // Handle Add Row - add a new project-task combination as an empty row
  const handleAddRow = () => {
    if (!addRowSelectedProject || !addRowSelectedTask) {
      toast.error('Please select both a project and a task.');
      return;
    }
    
    // Find project and task names
    const project = projectsWithTasks.find(p => p._id === addRowSelectedProject);
    const task = project?.tasks?.find(t => t._id === addRowSelectedTask);
    
    if (!project || !task) {
      toast.error('Invalid project or task selected.');
      return;
    }
    
    // Check if row already exists in entries or empty rows
    const key = `${addRowSelectedProject}-${addRowSelectedTask}`;
    const existsInEntries = data?.recentEntries?.some(e => `${e.project._id}-${e.task?._id}` === key);
    const existsInEmptyRows = emptyRows.some(r => `${r.projectId}-${r.taskId}` === key);
    
    if (existsInEntries || existsInEmptyRows) {
      toast.error('This project-task combination already exists in the timesheet.');
      setShowAddRowModal(false);
      setAddRowSelectedProject('');
      setAddRowSelectedTask('');
      return;
    }
    
    // Add to empty rows
    setEmptyRows(prev => [...prev, {
      projectId: addRowSelectedProject,
      projectName: project.name,
      taskId: addRowSelectedTask,
      taskName: task.name,
    }]);
    
    toast.success('Row added. You can now enter time for this project-task.');
    setShowAddRowModal(false);
    setAddRowSelectedProject('');
    setAddRowSelectedTask('');
  };

  // Handle project selection in Add Row modal
  const handleAddRowProjectChange = (projectId: string) => {
    setAddRowSelectedProject(projectId);
    setAddRowSelectedTask('');
    
    const project = projectsWithTasks.find(p => p._id === projectId);
    const tasks = (project?.tasks || []).filter(t => !t.isArchived);
    setAddRowTasks(tasks);
  };

  // Handle delete empty row (row without entries, just from emptyRows state)
  const handleDeleteEmptyRow = (projectId: string, taskId: string) => {
    setEmptyRows(prev => prev.filter(r => !(r.projectId === projectId && r.taskId === taskId)));
    toast.success('Row removed');
  };

  const handleCopyPreviousDayEntries = async () => {
    if (!userId) {
      toast.error('You must be logged in to copy entries.');
      return;
    }

    const currentDayStr = format(selectedDate, 'yyyy-MM-dd');
    setActionLoading('copy-entries');

    try {
      // Find the most recent day with entries (looking back up to 30 days)
      let sourceDate = subDays(selectedDate, 1);
      let sourceDayStr = format(sourceDate, 'yyyy-MM-dd');
      let sourceEntries: any[] = [];

      // Try up to 30 days back to find entries
      for (let i = 0; i < 30; i++) {
        const dayEntries = await sanityFetch<any[]>(
          {
            query: `*[_type == "timeEntry" && user._ref == $userId && date == $sourceDayStr] | order(project.name asc, task.name asc) { _id, user->{_id, firstName, lastName}, project->{_id, name}, task->{_id, name}, date, hours, notes, isBillable }`,
            params: { userId, sourceDayStr },
          }
        );

        if (dayEntries.length > 0) {
          sourceEntries = dayEntries;
          break;
        }

        // Move to previous day
        sourceDate = subDays(sourceDate, 1);
        sourceDayStr = format(sourceDate, 'yyyy-MM-dd');
      }

      if (sourceEntries.length === 0) {
        toast.error('No time entries found in the last 30 days.');
        setActionLoading(null);
        return;
      }

      if (!confirm(`Copy all time entries from ${format(sourceDate, 'MMM d, yyyy')} to ${format(selectedDate, 'MMM d, yyyy')}?`)) {
        setActionLoading(null);
        return;
      }

      // Create new entries for current day
      const createPromises = sourceEntries.map(entry =>
        fetch('/api/time-entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: entry.project._id,
            taskId: entry.task._id,
            date: currentDayStr,
            hours: entry.hours,
            notes: entry.notes || '',
            entryType: 'manual',
          }),
        })
      );

      const responses = await Promise.all(createPromises);
      const failedResponses = responses.filter(response => !response.ok);

      if (failedResponses.length > 0) {
        throw new Error(`Failed to copy ${failedResponses.length} entries`);
      }

      toast.success(`Successfully copied ${sourceEntries.length} entries from ${format(sourceDate, 'MMM d, yyyy')}.`);
      await refreshDashboardData(); // Refresh the view
    } catch (error: any) {
      console.error('Error copying previous day entries:', error);
      toast.error(error.message || 'Failed to Copy rows from most recent timesheet entries.');
    } finally {
      setActionLoading(null);
    }
  };

  // Calculate current hours for any entry (existing hours + elapsed time for running timers)
  const calculateCurrentHours = (entry: any) => {
    if (entry.isRunning && entry.startTime) {
      const elapsed = (Date.now() - new Date(entry.startTime).getTime()) / (1000 * 60 * 60)
      const existingHours = entry.hours || 0
      return existingHours + elapsed
    }
    return entry.hours || 0
  }

  // Handle start timer from existing entry - continues timing in the same entry
  const handleStartTimerFromEntry = async (entry: any) => {
    if (!entry.project?._id || !entry.task?._id) {
      toast.error('Cannot start timer: Missing project or task information')
      return
    }

    setEntryStartTimerLoadingId(entry._id)

    try {
      // If there's a running timer that's different from the entry we're starting, stop it first
      if (data?.runningTimer && data.runningTimer._id !== entry._id) {
        console.log('Stopping existing timer before starting new one')
        const stopSuccess = await stopTimerWithoutReload()
        if (!stopSuccess) {
          return
        }
      }

      // Start timer in the existing entry (don't modify existing hours)
      const response = await fetch(`/api/time-entries/${entry._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'start_timer',
          startTime: new Date().toISOString(),
          entryType: 'timer',
          // Keep existing notes and hours, don't modify them
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to start timer')
      }

      const updatedEntry = await response.json()

      // Optimistic update - update the entry to show as running
      const optimisticEntry = {
        ...updatedEntry,
        isRunning: true,
        project: entry.project,
        task: entry.task
      }
      updateTimeEntryInRecent(entry._id, optimisticEntry)

      toast.success('Timer started from existing entry')

      // Update local state to reflect the running timer
      setTimerRunning(true)
      // Don't reset elapsed time - calculate from the new startTime
      const newStartTime = new Date(updatedEntry.startTime || entry.startTime || new Date())
      setElapsedTime(0) // Reset to 0 since we just started a fresh timer session
      setTimerNotes('') // Clear notes
      setShowTimeEntryModal(false) // Close modal if open
      setTimeEntryMode('timer') // Reset mode
      setSelectedProject(entry.project._id) // Set to the project we're timing
      setSelectedTask(entry.task._id) // Set to the task we're timing

      // Update dashboard data in background
      await refreshDashboardData()
    } catch (error) {
      console.error('Error starting timer from entry:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to start timer')
    } finally {
      setEntryStartTimerLoadingId(null)
    }
  }

  if (loading) {
    return <div>Loading...</div>
  }

  const weeklyCapacity = data?.user?.capacity || 40
  const weeklyProgress = ((data?.thisWeekHours || 0) / weeklyCapacity) * 100

  const weekStart = format(startOfWeek(currentWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const weekEnd = format(endOfWeek(currentWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  // Filter entries: exclude unsubmitted entries from weeks that have approved entries
  const currentWeekEntries = data?.recentEntries?.filter((entry: any) => {
    const entryDate = parseISO(entry.date)
    const entryWeekStart = format(startOfWeek(entryDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const entryWeekEnd = format(endOfWeek(entryDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    
    // Include entry if it's in the current viewed week
    if (entry.date < weekStart || entry.date > weekEnd) {
      return false
    }
    
    // If entry is approved, include it
    if (entry.isApproved && entry.isLocked) {
      return true
    }
    
    // If entry is unsubmitted, check if its week has any approved entries
    if (!entry.submittedAt) {
      const weekHasApproved = data?.recentEntries?.some((e: any) => 
        e.date >= entryWeekStart && 
        e.date <= entryWeekEnd && 
        e.isApproved && 
        e.isLocked
      )
      // Exclude unsubmitted entries from weeks with approved entries
      return !weekHasApproved
    }
    
    // Include submitted/pending entries
    return true
  }) || []

  // Check week status: pending = submittedAt exists but not approved, approved = isApproved && isLocked
  const isWeekPending = currentWeekEntries.length > 0 && currentWeekEntries.some((entry: any) => entry.submittedAt && !entry.isApproved)
  const isWeekApproved = currentWeekEntries.length > 0 && currentWeekEntries.every((entry: any) => entry.isApproved && entry.isLocked)
  const isWeekLocked = currentWeekEntries.length > 0 && currentWeekEntries.every((entry: any) => entry.isLocked && entry.isApproved) // Only true if approved
  
  // If ANY entry in the week is approved, disable all editing/resubmission
  const hasAnyApprovedEntries = currentWeekEntries.length > 0 && currentWeekEntries.some((entry: any) => entry.isApproved && entry.isLocked)
  
  // Check if it's a past week by comparing week start dates
  const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const viewedWeekStart = startOfWeek(currentWeek, { weekStartsOn: 1 })
  const isPastWeek = viewedWeekStart < currentWeekStart
  const isCurrentWeek = viewedWeekStart.getTime() === currentWeekStart.getTime()
  
  // For day view, check if the selected day is in the past and has locked (approved) entries
  const isPastDay = selectedDate < new Date() && !isToday(selectedDate)
  const selectedDateEntries = getSelectedDateEntries()
  const isDayLocked = selectedDateEntries.length > 0 && selectedDateEntries.every((entry: any) => entry.isLocked && entry.isApproved)
  
  // Check if week needs resubmission (some entries have submittedAt, some don't, or entries were modified)
  const needsResubmit = isWeekPending && currentWeekEntries.some((entry: any) => !entry.submittedAt)
  
  // Disable add entry if:
  // - Week is approved (locked) - even in current week
  // - Day is approved (locked) - even in current day
  // - ANY entries in the week are approved (prevents adding to weeks with approved entries)
  const shouldDisableAddEntry = isWeekLocked || isDayLocked || hasAnyApprovedEntries

  // console.warn('manualEntryData', manualEntryData)
  return (
    <div className="space-y-6">
      {/* Welcome and Stats Section */}
      <div className="bg-white rounded-lg shadow-custom p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <h2 className="text-2xl font-bold text-gray-900 mb-4 md:mb-0">
            Welcome back, {data?.user?.firstName}!
          </h2>
          <div className="grid grid-cols-3 gap-4 text-center hidden">
            <div>
              <p className="text-sm text-gray-500">Todayy</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatSimpleTime(data?.todayHours || 0)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">This Week</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatSimpleTime(data?.thisWeekHours || 0)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Projects</p>
              <p className="text-2xl font-bold text-gray-900">
                {data?.user?.assignedProjects?.length || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Timer Section */}
      {/* <div className="bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg shadow-custom-lg p-8 text-white">
        <div className="flex flex-col md:flex-row items-center justify-between">
          <div className="flex flex-col space-y-4 w-full md:w-auto">
            {!hasRunningTimerForSelectedDate() ? (
              <button
                onClick={() => {
                  setTimeEntryMode('timer')
                  // Sync manual entry date to selectedDate in case user switches to manual mode
                  const autoFill = getAutoFillProjectAndTask()
                  setManualEntryData(prev => ({ ...prev, date: format(selectedDate, 'yyyy-MM-dd') }))
                  // Auto-fill project and task if available
                  if (autoFill.projectId) {
                    setSelectedProject(autoFill.projectId)
                    if (autoFill.taskId) {
                      setSelectedTask(autoFill.taskId)
                    }
                  }
                  setShowTimeEntryModal(true)
                }}
                disabled={actionLoading !== null}
                className="btn-secondary flex items-center justify-center px-6 py-3 bg-white text-primary-700 rounded-lg font-medium hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FiPlay className="w-5 h-5 mr-2" />
                Start Timer
              </button>
            ) : (
              <button
                onClick={handleStopTimer}
                disabled={actionLoading === 'stop-timer'}
                className="flex items-center justify-center px-6 py-3 bg-white text-red-600 rounded-lg font-medium hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === 'stop-timer' ? (
                  <div className="w-5 h-5 mr-2 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                ) : (
                  <FiPause className="w-5 h-5 mr-2" />
                )}
                {actionLoading === 'stop-timer' ? 'Stopping...' : 'Stop Timer'}
              </button>
            )}
          </div>
          <div className="mb-6 md:mb-0">
            <p className="text-sm opacity-90 mb-2">Current Timer</p>
            <div className="text-5xl font-bold font-mono">
              {hasRunningTimerForSelectedDate() ? formatTime(elapsedTime) : '00:00:00'}
            </div>
          </div>
         
        </div>
      </div> */}

      {/* Add Row Modal (for week view) */}
      {showAddRowModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Add Row</h3>
              <button
                onClick={() => {
                  setShowAddRowModal(false);
                  setAddRowSelectedProject('');
                  setAddRowSelectedTask('');
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              <p className="text-sm text-gray-500 mb-4">
                Select a project and task to add a new row. You can then enter time directly in the cells.
              </p>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="addRowProject" className="block text-sm font-medium text-gray-700">
                    Project
                  </label>
                  <select
                    id="addRowProject"
                    value={addRowSelectedProject}
                    onChange={(e) => handleAddRowProjectChange(e.target.value)}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-1 focus:ring-transparent focus:border-black sm:text-sm rounded-md"
                  >
                    <option value="">Select Project</option>
                    {projectsWithTasks.map(project => (
                      <option key={project._id} value={project._id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label htmlFor="addRowTask" className="block text-sm font-medium text-gray-700">
                    Task
                  </label>
                  <select
                    id="addRowTask"
                    value={addRowSelectedTask}
                    onChange={(e) => setAddRowSelectedTask(e.target.value)}
                    disabled={!addRowSelectedProject}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-transparent focus:border-black sm:text-sm rounded-md disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">Select Task</option>
                    {addRowTasks.filter(t => t.isBillable).length > 0 && (
                      <optgroup label="Billable">
                        {addRowTasks.filter(t => t.isBillable).map(task => (
                          <option key={task._id} value={task._id}>
                            {task.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {addRowTasks.filter(t => !t.isBillable).length > 0 && (
                      <optgroup label="Non-billable">
                        {addRowTasks.filter(t => !t.isBillable).map(task => (
                          <option key={task._id} value={task._id}>
                            {task.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
                
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddRowModal(false);
                      setAddRowSelectedProject('');
                      setAddRowSelectedTask('');
                    }}
                    className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-transparent focus:border-black"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddRow}
                    disabled={!addRowSelectedProject || !addRowSelectedTask}
                    className="btn-primary px-4 py-2 border border-transparent text-sm font-semibold rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add Row
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Time Entry Modal */}
      {showTimeEntryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <div className="flex items-center space-x-3 flex-wrap">
                {!editingEntry && (
                <button
                  onClick={() => {
                    const newMode = timeEntryMode === 'timer' ? 'manual' : 'timer'
                    setTimeEntryMode(newMode)
                    // Sync date and project/task to manual mode when switching
                    if (newMode === 'manual') {
                      // If project/task are already selected in timer mode, sync them
                      const projectId = selectedProject || manualEntryData.projectId
                      const taskId = selectedTask || manualEntryData.taskId
                      setManualEntryData(prev => ({ 
                        ...prev, 
                        date: format(selectedDate, 'yyyy-MM-dd'),
                        projectId: projectId,
                        taskId: taskId
                      }))
                    }
                  }}
                  disabled={actionLoading !== null}
                  className="text-sm px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {timeEntryMode === 'timer' ? 'Switch to Manual' : 'Switch to Timer'}
                </button>
                )}
                <div className="flex items-center space-x-3">
                  <h3 className="text-lg font-medium text-gray-900">
                    {editingEntry ? 'Edit Time Entry' : (timeEntryMode === 'timer' ? 'Start Timer' : 'Add Manual Time Entry')}
                  </h3>
                  {editingEntry && (
                    <div className="flex items-center space-x-2 flex-wrap">
                      <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded-full">
                        Editing: {editingEntry.task?.name || 'No Task'}
                      </span>
                      {editingEntry.task && (
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          editingEntry.task.isBillable
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {editingEntry.task.isBillable ? 'Billable' : 'Non-Billable'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setShowTimeEntryModal(false)
                  setTimeEntryMode('timer')
                  setEditingEntry(null)
                  setSelectedProject('')
                  setSelectedTask('')
                  setTimerNotes('')
                  setManualEntryData({
                    projectId: '',
                    taskId: '',
                    date: format(selectedDate, 'yyyy-MM-dd'),
                    hours: '',
                    notes: ''
                  })
                  setHoursDisplay('')
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <FiX className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              <form onSubmit={editingEntry ? handleUpdateEntry : handleModalSubmit} className="space-y-6">
                {/* Project Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Project</label>
                  <select
                    value={timeEntryMode === 'timer' ? selectedProject : manualEntryData.projectId}
                    onChange={(e) => {
                      if (timeEntryMode === 'timer') {
                        handleProjectChange(e.target.value)
                      } else {
                        setManualEntryData(prev => ({ ...prev, projectId: e.target.value, taskId: '' }))
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-transparent focus:border-black"
                    required
                  >
                    <option value="">
                      {data?.user?.assignedProjects?.length > 0 ? 'Select a project' : 'No projects assigned'}
                    </option>
                    {data?.user?.assignedProjects?.map((project: any) => (
                      <option key={project._id} value={project._id}>
                        {project.code ? `[${project.code}] ` : ''}
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Task Selection */}
                {(timeEntryMode === 'timer' ? selectedProject : manualEntryData.projectId) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Task</label>
                    <select
                      value={timeEntryMode === 'timer' ? selectedTask : manualEntryData.taskId}
                      onChange={(e) => {
                        if (timeEntryMode === 'timer') {
                          setSelectedTask(e.target.value)
                        } else {
                          setManualEntryData(prev => ({ ...prev, taskId: e.target.value }))
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-transparent focus:border-black"
                      required
                    >
                      <option value="">Select a task</option>
                      {/* Generate task options based on selected project */}
                      {(() => {
                        const selectedProjectId = timeEntryMode === 'timer' ? selectedProject : manualEntryData.projectId
                        const projectData = selectedProjectId
                          ? data?.user?.assignedProjects?.find((project: any) => project._id === selectedProjectId)
                          : null

                        if (!projectData || !projectData.tasks || projectData.tasks.length === 0) {
                          return <option value="">No tasks available for this project</option>
                        }

                        const currentTaskId = timeEntryMode === 'timer' ? selectedTask : manualEntryData.taskId

                        // Filter out archived tasks, then separate by billable status
                        const activeTasks = (projectData.tasks || []).filter((task: any) => !task.isArchived)
                        const billableTasks = activeTasks.filter((task: any) => task.isBillable === true)
                        const nonBillableTasks = activeTasks.filter((task: any) => task.isBillable === false)

                        const taskOptions = []

                        // Add current task first if editing and not already in the lists
                        if (editingEntry && currentTaskId) {
                          const currentTask = projectData.tasks.find((task: any) => task._id === currentTaskId)
                          if (currentTask && !billableTasks.some((task: any) => task._id === currentTaskId) && !nonBillableTasks.some((task: any) => task._id === currentTaskId)) {
                            taskOptions.push(
                              <option key={currentTask._id} value={currentTask._id}>
                                &nbsp;&nbsp;{currentTask.name} (Current Task)
                              </option>
                            )
                          }
                        }

                        // Add billable tasks section
                        if (billableTasks.length > 0) {
                          taskOptions.push(
                            <option key="billable-section" disabled className="font-semibold text-gray-500 bg-gray-50">
                              Billable Tasks
                            </option>
                          )
                          billableTasks.forEach((task: any) => {
                            taskOptions.push(
                              <option key={task._id} value={task._id}>
                                &nbsp;&nbsp;{task.name}
                              </option>
                            )
                          })
                        }

                        // Add non-billable tasks section
                        if (nonBillableTasks.length > 0) {
                          taskOptions.push(
                            <option key="non-billable-section" disabled className="font-semibold text-gray-500 bg-gray-50">
                              Non-Billable Tasks
                            </option>
                          )
                          nonBillableTasks.forEach((task: any) => {
                            taskOptions.push(
                              <option key={task._id} value={task._id}>
                                &nbsp;&nbsp;{task.name}
                              </option>
                            )
                          })
                        }

                        return taskOptions
                      })()}
                    </select>
                  </div>
                )}

                {/* Manual Entry Specific Fields */}
                {timeEntryMode === 'manual' && (
                  <>
                    {/* Date field - only show when editing an entry */}
                    {editingEntry && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                        <input
                          type="date"
                          value={manualEntryData.date}
                          onChange={(e) => setManualEntryData(prev => ({ ...prev, date: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-transparent focus:border-black"
                          required
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Hours (format: H:MM)</label>
                        <input
                          type="text"
                          value={hoursDisplay || manualEntryData.hours}
                          onChange={(e) => {
                            const input = e.target.value
                            setHoursDisplay(input)
                            setManualEntryData(prev => ({ ...prev, hours: input }))
                          }}
                          onBlur={(e) => {
                            const input = e.target.value.trim()
                            if (!input) {
                              setHoursDisplay('')
                              setManualEntryData(prev => ({ ...prev, hours: '' }))
                              return
                            }
                            
                            // Normalize the input (convert minutes >= 60 to hours)
                            const normalized = normalizeTimeInput(input)
                            if (normalized) {
                              // Parse to validate and get decimal for storage
                              const parsed = parseTimeInput(normalized)
                              if (parsed !== null && !isNaN(parsed) && parsed > 0 && parsed <= 24) {
                                // Store the decimal value (rounded to 2 decimals)
                                const rounded = formatDecimalHours(parsed)
                                setManualEntryData(prev => ({ ...prev, hours: rounded.toString() }))
                                // Display the normalized H:MM format (preserves exact minutes)
                                setHoursDisplay(normalized)
                              } else {
                                // Keep the input but mark as invalid
                                setHoursDisplay(input)
                              }
                            } else {
                              // Keep the input but mark as invalid
                              setHoursDisplay(input)
                            }
                          }}
                          className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-transparent focus:border-black ${
                            isValidTimeFormat(hoursDisplay || manualEntryData.hours) ? 'border-gray-300' : 'border-red-300'
                          }`}
                          placeholder="2:30"
                          required
                        />
                        <p className="text-xs text-gray-500 mt-1">Enter time in decimal (e.g., 2.2 for 2 hours 12 minutes) or H:MM format (e.g., 8:30)</p>
                      </div>
                  </>
                )}

                {/* Notes Field */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                  <textarea
                    value={timeEntryMode === 'timer' ? timerNotes : manualEntryData.notes}
                    onChange={(e) => {
                      if (timeEntryMode === 'timer') {
                        setTimerNotes(e.target.value)
                      } else {
                        setManualEntryData(prev => ({ ...prev, notes: e.target.value }))
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-transparent focus:border-black"
                    rows={3}
                    placeholder="Optional notes..."
                  />
                </div>

                {/* Submit Buttons */}
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowTimeEntryModal(false)
                      setTimeEntryMode('timer')
                      setEditingEntry(null)
                      setSelectedProject('')
                      setSelectedTask('')
                      setTimerNotes('')
                      setManualEntryData({
                        projectId: '',
                        taskId: '',
                        date: format(new Date(), 'yyyy-MM-dd'),
                        hours: '',
                        notes: ''
                      })
                    }}
                    disabled={actionLoading !== null}
                    className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading !== null}
                    className="btn-primary px-4 py-2 text-sm font-semibold rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  >
                    {actionLoading ? (
                      <>
                        <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        {actionLoading === 'start-timer' ? 'Starting...' :
                         actionLoading === 'manual-entry' ? 'Creating...' :
                         actionLoading === 'update-entry' ? 'Updating...' : 'Loading...'}
                      </>
                    ) : (
                      editingEntry ? 'Update Entry' : (timeEntryMode === 'timer' ? 'Start Timer' : 'Create Entry')
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Time Tracking Controls */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h2 className="text-xl font-semibold text-gray-900">Time Tracking</h2>
      </div>

      {/* Calendar Time Entries View */}
      <div className="bg-white rounded-lg shadow-custom">
        <div className="p-4 md:p-6">
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
            <div className="flex items-center flex-wrap gap-4">
              <div className="flex">
              <button
                onClick={() => actionLoading !== 'refresh-data' && (viewMode === 'calendar' ? navigateDay('prev') : navigateWeek('prev'))}
                disabled={actionLoading === 'refresh-data' || loading}
                className="p-1.5 rounded-s-md border border-[#1d1e1c40] hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                title={viewMode === 'calendar' ? 'Previous day' : 'Previous week'}
              >
                <FiChevronLeft className="w-5 h-5" />
              </button>

              <button
                onClick={() => actionLoading !== 'refresh-data' && (viewMode === 'calendar' ? navigateDay('next') : navigateWeek('next'))}
                disabled={actionLoading === 'refresh-data' || loading}
                className="p-1.5 rounded-e-md border border-l-0 border-[#1d1e1c40] hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                title={viewMode === 'calendar' ? 'Next day' : 'Next week'}
              >
                <FiChevronRight className="w-5 h-5" />
              </button>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center space-x-2">
                  <h2 className="text-xl font-semibold text-gray-900">
                    {viewMode === 'calendar' ? (
                      isToday(selectedDate) 
                        ? `Today: ${format(selectedDate, 'EEEE, d MMM')}`
                        : format(selectedDate, 'EEEE, d MMM')
                    ) : (
                      (() => {
                        const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 })
                        const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 })
                        const isSameYear = format(weekStart, 'yyyy') === format(weekEnd, 'yyyy')
                        const isSameMonthWeek = format(weekStart, 'MMM yyyy') === format(weekEnd, 'MMM yyyy')
                        const startFormat = isSameMonthWeek ? 'd' : (isSameYear ? 'd MMM' : 'd MMM yyyy')
                        const prefix = isCurrentWeek ? 'This week: ' : ''
                        return `${prefix}${format(weekStart, startFormat)} – ${format(weekEnd, 'd MMM yyyy')}`
                      })()
                    )}
                  </h2>
                  {isWeekApproved && (
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                      Approved
                    </span>
                  )}
                  {hasAnyApprovedEntries && !isWeekApproved && (
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                      Approved
                    </span>
                  )}
                  {isWeekPending && !isWeekApproved && !hasAnyApprovedEntries && (
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">
                      Pending
                    </span>
                  )}
                </div>
              </div>
              {/* Return to today/this week link */}
              {viewMode === 'calendar' ? (
                !isToday(selectedDate) && (
                  <button
                    onClick={goToToday}
                    className="text-[#2a59c1] hover:text-[#2a59c1] hover:underline text-sm font-medium"
                  >
                    Return to today
                  </button>
                )
              ) : (
                !isCurrentWeek && (
                  <button
                    onClick={goToToday}
                      className="text-[#2a59c1] hover:text-[#2a59c1] hover:underline text-sm font-medium"
                  >
                    Return to this week
                  </button>
                )
              )}
              {savingCellId && (
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-md border border-gray-200 ml-4">
                  <div className="w-4 h-4 animate-spin rounded-full border-2 border-primary-600 border-t-transparent"></div>
                  <span className="text-sm text-gray-700">Saving...</span>
                </div>
              )}
            </div>
            <div className="flex items-center space-x-3">
              {/* View Mode Toggle */}
              <div className="flex items-center space-x-2 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('week')}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    viewMode === 'week'
                      ? 'bg-white theme-color shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Week
                </button>
                <button
                  onClick={() => {
                    setViewMode('calendar')
                    // If viewing current week, show today. Otherwise show Monday of the viewed week.
                    const today = new Date()
                    const todayWeekStart = startOfWeek(today, { weekStartsOn: 1 })
                    const currentWeekStart = startOfWeek(currentWeek, { weekStartsOn: 1 })
                    
                    if (format(currentWeekStart, 'yyyy-MM-dd') === format(todayWeekStart, 'yyyy-MM-dd')) {
                      // Current week: show today
                      setSelectedDate(today)
                    } else {
                      // Past or future week: show Monday of that week
                      setSelectedDate(currentWeekStart)
                    }
                  }}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    viewMode === 'calendar'
                      ? 'bg-white theme-color shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Day
                </button>
              </div>
            </div>
          </div>

          {/* View Content */}
          {viewMode === 'calendar' ? (
            <>
              {/* Calendar Grid */}
              <div className="">
                {/* Week Days */}
                <div className="grid grid-cols-7 gap-2 border-b border-gray-200">
                  {/* Calendar days row */}
                  {actionLoading === 'refresh-data' ? (
                    // Loading state for calendar
                    getWeekDays().map((day, index) => (
                      <div
                        key={index}
                        className="p-3 text-center rounded-lg border-2 border-gray-200 min-h-[60px] flex flex-col justify-center animate-pulse"
                      >
                        <div className="text-xs font-medium mb-1 text-gray-400">
                          {format(day, 'EEE')}
                        </div>
                        <div className="text-sm font-semibold mb-1 text-gray-400">
                          {format(day, 'd MMM, yyyy')}
                        </div>
                        <div className="text-xs text-gray-300">
                          <div className="w-8 h-3 bg-gray-200 rounded mx-auto"></div>
                        </div>
                      </div>
                    ))
                  ) : (
                    getWeekDays().map((day, index) => {
                      // Use filtered currentWeekEntries instead of data?.recentEntries
                      // currentWeekEntries already excludes unsubmitted entries from weeks with approved entries
                      const dayEntries = currentWeekEntries.filter((entry: any) =>
                        entry.date === format(day, 'yyyy-MM-dd')
                      )
                      const totalHours = dayEntries.reduce((sum: number, entry: any) => sum + calculateCurrentHours(entry), 0)
                      const isSelected = isSameDay(day, selectedDate)
                      const isDayToday = isToday(day)

                      return (
                        <button
                          key={index}
                          onClick={
                            () => {
                              setSelectedDate(day)
                              // set the manual entry date to the day 
                              setManualEntryData(prev => ({ ...prev, date: format(day, 'yyyy-MM-dd') }))
                              // Check if the selected day is in a different week and refresh data if needed
                              const dayWeekStart = startOfWeek(day, { weekStartsOn: 1 })
                              const currentWeekStart = startOfWeek(currentWeek, { weekStartsOn: 1 })
                              if (dayWeekStart.getTime() !== currentWeekStart.getTime()) {
                                setCurrentWeek(day)
                                refreshDashboardData(day)
                              }
                            }
                          }
                          className={`
                            p-3 text-left min-h-[60px] flex flex-col justify-center hover:theme-color
                            ${isSelected
                              ? 'theme-color border-b-2 theme-color-border font-semibold'
                              : 'border-gray-200 text-gray-700 hover:border-gray-300'
                            }
                            ${isDayToday && !isSelected ? '' : ''}
                          `}
                        >
                          <div className={`text-xs font-medium mb-1 ${isDayToday && isSelected ? 'theme-color' : ''}`}>
                            {format(day, 'EEE')}
                          </div>
                          {/* <div className={`text-sm font-semibold mb-1 ${isDayToday ? 'text-blue-600' : ''}`}>
                            {format(day, 'd MMM, yyyy')} 
                          </div> */}
                          {totalHours > 0 ? (
                            <div className={`text-xs ${isSelected ? 'theme-color font-medium' : ''}`}>
                              {formatSimpleTime(totalHours)}
                            </div>
                          ) : (
                            <div className="text-xs">
                              0:00
                          </div>
                          )}
                          {/* {dayEntries.length > 0 && (
                            <div className={`text-xs mt-1 ${isSelected ? 'text-primary-500' : 'text-gray-400'}`}>
                              {dayEntries.length} {dayEntries.length === 1 ? 'entry' : 'entries'}
                            </div>
                          )} */}
                        </button>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Project-wise Time Entries View */}
              <div className="pt-6">
            {/* <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Time Entries by Project - {format(selectedDate, 'EEEE, MMMM d, yyyy')}
              </h3>
              <div className="text-right">
                <p className="text-sm text-gray-500">
                  {getSelectedDateEntries().length} {getSelectedDateEntries().length === 1 ? 'entry' : 'entries'}
                </p>
                <p className="text-lg font-semibold text-gray-900">
                  {formatSimpleTime(getSelectedDateEntries().reduce((sum, entry) => sum + calculateCurrentHours(entry), 0))} Total
                </p>
              </div>
            </div> */}

            {getSelectedDateEntries().length > 0 ? (
            <div className="space-y-6">
                {groupEntriesByProject(getSelectedDateEntries()).map((projectGroup) => (
                  <div key={projectGroup.projectId} className="border-b border-[#1d1e1c40] pb-4">
                    {/* Project Header */}
                    <div className="flex items-center justify-between md:px-4">
                      <div className="flex items-center space-x-3">
                        {/* <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: projectGroup.color }}
                        /> */}
                        <div>
                          <p className="text-lg font-semibold text-gray-900">
                            {projectGroup.projectName}
                            {projectGroup.projectCode && (
                              <span className="text-sm font-normal text-gray-500 ml-2">
                                ({projectGroup.projectCode})
                              </span>
                            )}
                            {projectGroup.projectName === 'Unnamed Project' && (
                              <span className="text-xs text-amber-600 mt-1">
                                - ⚠ Project data may be missing or incomplete
                              </span>
                            )}
                            {projectGroup.clientName && (
                              <span className="text-sm text-gray-500"> - {projectGroup.clientName}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      {/* <div className="text-right">
                        <p className="text-sm text-gray-500">
                          {projectGroup.entries.length} {projectGroup.entries.length === 1 ? 'entry' : 'entries'}
                        </p>
                        <p className="text-lg font-semibold text-gray-900">
                          {formatSimpleTime(projectGroup.totalHours)}
                        </p>
                      </div> */}
                    </div>

                    {/* Project Entries */}
                    <div className="divide-y divide-[#1d1e1c40]">
                      {projectGroup.entries.map((entry: any) => (
                        <div
                          key={entry._id}
                          className={`md:px-4 py-4 flex justify-between items-center hover:bg-slate-50 ${
                            entry.isRunning ? '' : ''
                          }`}
                        >
                          <div>
                            <div className="flex items-center md:gap-4 flex-wrap gap-2">
                              <p className="font-medium text-gray-900">
                                {projectGroup.projectName} - {entry.task?.name || 'No Task'}
                              </p>
                              <span
                                className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                  entry.isBillable
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {entry.isBillable ? 'Billable' : 'Non-Billable'}
                              </span>
                              {entry.isRunning && (
                                <span className="text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded-full">
                                  Running
                                </span>
                              )}
                            </div>
                            {entry.notes && (
                              <p className="text-sm text-gray-500 mt-1">{entry.notes}</p>
                            )}
                          </div>
                          <div className="flex items-center space-x-4 ml-4">
                            <p className="text-lg font-semibold text-gray-900 md:w-24 text-center md:text-right flex-1">
                              {formatSimpleTime(calculateCurrentHours(entry))}
                            </p>
                            <div className="flex items-center md:space-x-1 flex-wrap">
                              {!entry.isRunning && isTodayEntry(entry) && (
                                <button
                                  onClick={() => handleStartTimerFromEntry(entry)}
                                  disabled={
                                    entryStartTimerLoadingId === entry._id ||
                                    entryDeleteLoadingId === entry._id ||
                                    (entry.isLocked && entry.isApproved) ||
                                    !!data?.runningTimer
                                  }
                                  className="p-2 text-gray-400 hover:theme-color disabled:opacity-50 disabled:cursor-not-allowed"
                                  title={
                                    data?.runningTimer
                                      ? 'Another timer is running'
                                      : 'Start timer'
                                  }
                                >
                                  {entryStartTimerLoadingId === entry._id ? (
                                    <div className="w-4 h-4 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
                                  ) : (
                                    <FiPlay />
                                  )}
                                </button>
                              )}
                              {entry.isRunning && data?.runningTimer?._id === entry._id && (
                                <button
                                  onClick={() => handleStopTimer()}
                                  disabled={actionLoading === 'stop-timer'}
                                  className="p-2 text-red-500 hover:text-red-700 disabled:opacity-50"
                                  title={`Timer started at ${data?.runningTimer?.startTime ? format(new Date(data.runningTimer.startTime), 'h:mm a') : ''}`}
                                >
                                  <FiPause />
                                </button>
                              )}
                              <button
                                onClick={() => handleEditEntry(entry)}
                                disabled={
                                  (entry.isLocked && entry.isApproved) || 
                                  entryStartTimerLoadingId === entry._id || 
                                  entryDeleteLoadingId === entry._id
                                }
                                className="p-2 text-gray-400 hover:theme-color disabled:opacity-50 disabled:cursor-not-allowed"
                                title={
                                  entry.isApproved && entry.isLocked ? 'This entry is approved and cannot be edited.' :
                                  entry.submittedAt && !entry.isApproved ? 'This entry is pending approval but can still be edited.' :
                                  'Edit entry'
                                }
                              >
                                <FiEdit2 />
                              </button>
                              <button
                                onClick={() => handleDeleteEntry(entry._id)}
                                disabled={
                                  (entry.isLocked && entry.isApproved) || 
                                  entryStartTimerLoadingId === entry._id || 
                                  entryDeleteLoadingId === entry._id
                                }
                                className="p-2 text-gray-400 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                title={
                                  entry.isApproved && entry.isLocked ? 'This entry is approved and cannot be deleted.' :
                                  entry.submittedAt && !entry.isApproved ? 'This entry is pending approval but can still be deleted.' :
                                  entryDeleteLoadingId === entry._id ? 'Deleting...' : 'Delete entry'
                                }
                              >
                                {entryDeleteLoadingId === entry._id ? (
                                  <div className="w-4 h-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                                ) : (
                                  <FiTrash2 />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )                )}
              </div>
            ) : (
              <div className="text-center py-12">
                <FiClock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg mb-2">
                  No time entries for {format(selectedDate, 'EEEE, MMMM d, yyyy')}
                </p>
                <p className="text-gray-400 text-sm mb-4">
                  {data?.recentEntries && data.recentEntries.length > 0
                    ? 'Try selecting a different date or add a new time entry'
                    : 'Add a new time entry to get started'
                  }
                </p>
                {data?.recentEntries && data.recentEntries.length > 0 && (
                  <p className="text-xs text-gray-400">
                    This week has {data.recentEntries.length} entries across {[...new Set(data.recentEntries.map(e => e.date))].length} days
                  </p>
                )}
              </div>
            )}

            {/* Buttons section - inside calendar/day view structure */}
            <div className="flex justify-between items-center mt-4 gap-2 flex-wrap">
              <div className="flex space-x-2">
                <button
                  onClick={(e) => {
                    if (shouldDisableAddEntry) {
                      e.preventDefault();
                      e.stopPropagation();
                      return;
                    }
                    // Get auto-fill values
                    const autoFill = getAutoFillProjectAndTask()
                    // Reset form fields for a fresh entry
                    setEditingEntry(null)
                    setSelectedProject(autoFill.projectId)
                    setSelectedTask(autoFill.taskId)
                    setTimerNotes('')
                    setHoursDisplay('')
                    setManualEntryData({
                      projectId: autoFill.projectId,
                      taskId: autoFill.taskId,
                      date: format(selectedDate, 'yyyy-MM-dd'),
                      hours: '',
                      notes: ''
                    })
                    setTimeEntryMode('manual')
                    setShowTimeEntryModal(true)
                  }}
                  disabled={shouldDisableAddEntry}
                  className={`btn-primary px-4 py-2 border border-transparent text-sm font-semibold rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 flex items-center gap-2 ${shouldDisableAddEntry ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={shouldDisableAddEntry ? (isWeekApproved ? 'Cannot add entries to approved weeks' : 'Cannot add entries to approved weeks') : 'Add a new time entry'}
                >
                  <FiPlus className="w-4 h-4" />
                  Add Time Entry
                </button>
                {/* Show "Copy rows" button only if no entries for the selected day */}
                {!shouldDisableAddEntry && getSelectedDateEntries().length === 0 && (
                  <button
                    onClick={handleCopyPreviousDayEntries}
                    disabled={actionLoading === 'copy-entries'}
                    className="px-4 py-2 border border-gray-300 text-sm font-semibold rounded-md bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Copy time entries from the most recent previous day with entries"
                  >
                    {actionLoading === 'copy-entries' ? (
                      <div className="w-4 h-4 animate-spin rounded-full border-2 border-gray-600 border-t-transparent" />
                    ) : (
                      <FiClock className="w-4 h-4" />
                    )}
                    {actionLoading === 'copy-entries' ? 'Copying...' : 'Copy rows from most recent timesheet'}
                  </button>
                )}
              </div>
              
              {/* Submit Week for Approval button - day view */}
              <button
                onClick={handleSubmitWeek}
                disabled={actionLoading === 'submit-week' || isWeekApproved || currentWeekEntries.length === 0 || hasAnyApprovedEntries}
                className={`btn-secondary px-4 py-2 border border-transparent text-sm font-semibold rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-transparent flex ${(isWeekApproved || currentWeekEntries.length === 0 || hasAnyApprovedEntries) ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={
                  isWeekApproved ? 'Week has been approved' :
                  hasAnyApprovedEntries ? 'Cannot submit unsubmitted entries after some entries are already approved' :
                  needsResubmit ? 'Resubmit all entries for this week for approval' :
                  isWeekPending ? 'Resubmit all entries for this week for approval' :
                  currentWeekEntries.length === 0 ? 'There are no entries for the week to submit' :
                  'Submit all entries for this week for approval'
                }
              >
                {actionLoading === 'submit-week' ? (
                  <>
                    <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-gray-600 border-t-transparent" />
                    Submitting...
                  </>
                ) : (
                  needsResubmit || isWeekPending ? 'Resubmit Week for Approval' : 'Submit Week for Approval'
                )}
              </button>
            </div>
              </div>
            </>
          ) : (
            /* Week View Table */
            <div className="relative">
              <div className="overflow-x-auto">
                {actionLoading === 'refresh-data' ? (
                  <div className="h-48 bg-gray-200 rounded animate-pulse"></div>
                ) : (
                  <>
                    {(() => {
                      const { entriesByProjectAndTask, weekDays } = getWeekViewEntries()
                    
                    return entriesByProjectAndTask.length > 0 ? (
                      <>
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="text-left text-gray-500">
                              <th className="p-3 font-medium">Project</th>
                              {weekDays.map((day, index) => (
                                <th 
                                  key={day.toString()} 
                                  className="p-3 min-w-[80px] font-medium text-center"
                                >
                                  {format(day, 'EEE')}<br/>{format(day, 'd MMM')}
                                </th>
                              ))}
                              <th className="p-3 font-medium text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entriesByProjectAndTask.map(({ project, task, days, dayEntries }) => {
                              // Check if any entry in this row is locked (approved) or pending
                              const allEntries = dayEntries.flatMap(de => de.entries)
                              const isRowLocked = allEntries.some((e: any) => e.isLocked && e.isApproved)
                              const isRowPending = allEntries.some((e: any) => e.submittedAt && !e.isApproved)
                              const hasEntries = allEntries.length > 0
                              
                              // Check if this is an empty row (from emptyRows state, no entries)
                              const isEmptyRow = !hasEntries && emptyRows.some(r => r.projectId === project._id && r.taskId === task._id)

                              return (
                                <tr key={`${project._id}-${task._id}`} className="border-t">
                                  <td className="p-3">
                                    <span className="font-bold">
                                      {project.name}
                                    </span> - {task.name}
                                  </td>
                                  {days.map((hours, i) => {
                                    const dayDate = weekDays[i]
                                    const dayDateStr = format(dayDate, 'yyyy-MM-dd')
                                    const dayEntriesForCell = dayEntries[i]?.entries || []
                                    const isDayLocked = dayEntriesForCell.some((e: any) => e.isLocked && e.isApproved)
                                    const canEdit = !isDayLocked && !shouldDisableAddEntry
                                    const hasEntries = dayEntriesForCell.length > 0
                                    const hasMultipleEntries = dayEntriesForCell.length > 1
                                    const cellId = `${project._id}-${task._id}-${i}`;
                                    const isSaving = savingCellId === cellId;
                                    const isEditing = inlineEditingCell &&
                                      inlineEditingCell.projectId === project._id &&
                                      inlineEditingCell.taskId === task._id &&
                                      inlineEditingCell.dayIndex === i;

                                    return (
                                      <td
                                        key={i}
                                        className={`p-1 text-center border bg-gray-100 relative ${
                                          canEdit && !isSaving ? 'cursor-pointer hover:bg-gray-200' : 'cursor-not-allowed opacity-50'
                                        } ${isSaving ? 'opacity-75' : ''}`}
                                        onClick={(e) => {
                                          if (canEdit && !isSaving) {
                                            handleWeekViewCellClick(project._id, task._id, i, dayEntriesForCell, e)
                                          }
                                        }}
                                        title={
                                          isSaving ? 'Saving...' :
                                          hasAnyApprovedEntries ? 'This week has approved entries and cannot be edited.' :
                                          isDayLocked ? 'This entry is approved and cannot be edited.' :
                                          isRowPending && hasEntries ? 'This entry is pending approval but can still be edited.' :
                                          hasMultipleEntries ? `Click to view ${dayEntriesForCell.length} entries` :
                                          hasEntries ? (canEdit ? 'Click to edit entry' : 'Cannot edit this entry') :
                                          canEdit ? 'Click to add time entry' :
                                          'Cannot add entry'
                                        }
                                      >
                                        {isEditing ? (() => {
                                            const trimmedValue = inlineEditingValue.trim();
                                            const hoursValue = trimmedValue ? parseTimeInput(trimmedValue) : null;
                                            const isValid = hoursValue !== null && !isNaN(hoursValue) && hoursValue >= 0 && hoursValue <= 24;
                                            const isEmpty = !trimmedValue;
                                            const borderColor = isEmpty ? 'focus:!border-black' : isValid ? 'focus:!border-black' : 'focus:!border-red-500';
                                            
                                            return (
                                              <input
                                                type="text"
                                                value={inlineEditingValue}
                                                onChange={(e) => setInlineEditingValue(e.target.value)}
                                                onBlur={handleInlineEditSave}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter') handleInlineEditSave();
                                                  if (e.key === 'Escape') {
                                                    setInlineEditingCell(null);
                                                    setInlineEditingValue('');
                                                  }
                                                }}
                                                autoFocus
                                                className={`w-[70px] py-1.5 focus:ring-0 focus:!shadow-none focus:!outline-none text-center bg-white border ${borderColor} rounded transition-colors`}
                                              />
                                            );
                                          })() : (
                                            <span>{hours > 0 ? formatSimpleTime(hours) : '0:00'}</span>
                                          )
                                        }
                                      </td>
                                    )
                                  })}
                                  <td className="p-3 text-right font-bold">
                                    <div className="flex items-center justify-end gap-2">
                                      <span>{formatSimpleTime(days.reduce((a, b) => a + b, 0))}</span>
                                      {/* Delete button for rows with entries */}
                                      {hasEntries && !isRowLocked && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteProjectTaskRow(project._id, task._id);
                                          }}
                                          disabled={deletingRowId === `${project._id}-${task._id}`}
                                          className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                          title="Delete all entries for this project-task"
                                        >
                                          {deletingRowId === `${project._id}-${task._id}` ? (
                                            <div className="w-4 h-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                                          ) : (
                                            <FiTrash2 className="w-4 h-4" />
                                          )}
                                        </button>
                                      )}
                                      {/* Delete button for empty rows (no entries, just from emptyRows) */}
                                      {isEmptyRow && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteEmptyRow(project._id, task._id);
                                          }}
                                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                                          title="Remove this row"
                                        >
                                          <FiTrash2 className="w-4 h-4" />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-gray-300 bg-gray-50">
                              <td className="p-3 font-bold text-gray-900">Total</td>
                              {weekDays.map((day, index) => {
                                const dayDateStr = format(day, 'yyyy-MM-dd');
                                // Calculate total for this day across all project-task rows
                                const dayTotal = entriesByProjectAndTask.reduce((sum, row) => {
                                  const dayEntries = row.dayEntries[index]?.entries || [];
                                  const dayHours = dayEntries.reduce((entrySum: number, entry: any) => {
                                    return entrySum + (calculateCurrentHours(entry) || 0);
                                  }, 0);
                                  return sum + dayHours;
                                }, 0);
                                return (
                                  <td key={index} className="p-3 text-center font-bold text-gray-900">
                                    {dayTotal > 0 ? formatSimpleTime(dayTotal) : ''}
                                  </td>
                                );
                              })}
                              <td className="p-3 text-right font-bold text-gray-900">
                                  {formatSimpleTime(
                                  entriesByProjectAndTask.reduce((sum, row) => {
                                    return sum + row.days.reduce((a, b) => a + b, 0);
                                  }, 0)
                                )}
                              </td>
                            </tr>
                          </tfoot>
                        </table>

                        {/* Buttons section - inside table structure */}
                        <div className="flex justify-between items-center mt-4 gap-2 flex-wrap">
                          <div className="flex space-x-2">
                            {viewMode === 'week' ? (
                              // Week view: Show "Add Row" button and optionally "Copy from Previous Timesheet" button
                              <>
                                <button
                                  onClick={(e) => {
                                    if (shouldDisableAddEntry) {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      return;
                                    }
                                    fetchProjectsWithTasks();
                                    setShowAddRowModal(true);
                                  }}
                                  disabled={shouldDisableAddEntry}
                                  className={`btn-primary px-4 py-2 border border-transparent text-sm font-semibold rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 flex items-center gap-2 ${shouldDisableAddEntry ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  title={shouldDisableAddEntry ? (isWeekApproved ? 'Cannot add entries to approved weeks' : 'Cannot add entries to approved weeks') : 'Add a new row to enter time'}
                                >
                                  <FiPlus className="w-4 h-4" />
                                  Add Row
                                </button>
                                {/* Show "Copy from Previous Timesheet" button when no project rows available */}
                                {(() => {
                                  const { entriesByProjectAndTask } = getWeekViewEntries();
                                  const hasActualEntries = entriesByProjectAndTask.some(row => row.days.some(hours => hours > 0));
                                  return !hasActualEntries && !shouldDisableAddEntry && (
                                    <button
                                      onClick={handleCopyPreviousWeekRows}
                                      disabled={copyingPreviousWeekRows}
                                      className="px-4 py-2 border border-gray-300 text-sm font-semibold rounded-md bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                      title="Copy project-task rows from the previous week's timesheet"
                                    >
                                      {copyingPreviousWeekRows ? (
                                        <div className="w-4 h-4 animate-spin rounded-full border-2 border-gray-600 border-t-transparent" />
                                      ) : (
                                        <FiClock className="w-4 h-4" />
                                      )}
                                      Copy rows from most recent timesheet
                                    </button>
                                  );
                                })()}
                              </>
                            ) : (
                              // Calendar/Day view: Show "Add Time Entry" button first, then conditionally "Copy from Previous" button
                              <>
                                <button
                                  onClick={(e) => {
                                    if (shouldDisableAddEntry) {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      return;
                                    }
                                    // Reset form fields for a fresh entry
                                    setEditingEntry(null)
                                    // Get auto-fill values
                                    const autoFill = getAutoFillProjectAndTask()
                                    setSelectedProject(autoFill.projectId)
                                    setSelectedTask(autoFill.taskId)
                                    setTimerNotes('')
                                    setHoursDisplay('')
                                    setManualEntryData({
                                      projectId: autoFill.projectId,
                                      taskId: autoFill.taskId,
                                      date: format(selectedDate, 'yyyy-MM-dd'),
                                      hours: '',
                                      notes: ''
                                    })
                                    setTimeEntryMode('manual')
                                    setShowTimeEntryModal(true)
                                  }}
                                  disabled={shouldDisableAddEntry}
                                  className={`btn-primary px-4 py-2 border border-transparent text-sm font-semibold rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 flex items-center gap-2 ${shouldDisableAddEntry ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  title={shouldDisableAddEntry ? (isWeekApproved ? 'Cannot add entries to approved weeks' : 'Cannot add entries to approved weeks') : 'Add a new time entry'}
                                >
                                  <FiPlus className="w-4 h-4" />
                                  Add Time Entry
                                </button>
                                {/* Show "Copy rows" button only if no entries for the selected day */}
                                {!shouldDisableAddEntry && getSelectedDateEntries().length === 0 && (
                                  <button
                                    onClick={handleCopyPreviousDayEntries}
                                    disabled={actionLoading === 'copy-entries'}
                                    className="px-4 py-2 border border-gray-300 text-sm font-semibold rounded-md bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Copy time entries from the most recent previous day with entries"
                                  >
                                    {actionLoading === 'copy-entries' ? (
                                      <div className="w-4 h-4 animate-spin rounded-full border-2 border-gray-600 border-t-transparent" />
                                    ) : (
                                      <FiClock className="w-4 h-4" />
                                    )}
                                    {actionLoading === 'copy-entries' ? 'Copying...' : 'Copy rows from most recent timesheet'}
                                  </button>
                                )}
                              </>
                            )}

                            {savingCellId && (
                              <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-md border border-gray-200">
                                <div className="w-4 h-4 animate-spin rounded-full border-2 border-primary-600 border-t-transparent"></div>
                                <span className="text-sm text-gray-700">Saving...</span>
                              </div>
                            )}
                          </div>

                          <button
                            onClick={handleSubmitWeek}
                            disabled={actionLoading === 'submit-week' || isWeekApproved || currentWeekEntries.length === 0 || hasAnyApprovedEntries}
                            className={`btn-secondary px-4 py-2 border border-transparent text-sm font-semibold rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-transparent flex ${(isWeekApproved || currentWeekEntries.length === 0 || hasAnyApprovedEntries) ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title={
                              isWeekApproved ? 'Week has been approved' :
                              hasAnyApprovedEntries ? 'Cannot submit unsubmitted entries after some entries are already approved' :
                              needsResubmit ? 'Resubmit all entries for this week for approval' :
                              isWeekPending ? 'Resubmit all entries for this week for approval' :
                              currentWeekEntries.length === 0 ? 'There are no entries for the week to submit' :
                              'Submit all entries for this week for approval'
                            }
                          >
                            {actionLoading === 'submit-week' ? (
                              <>
                                <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-gray-600 border-t-transparent" />
                                Submitting...
                              </>
                            ) : (
                              needsResubmit || isWeekPending ? 'Resubmit Week for Approval' : 'Submit Week for Approval'
                            )}
                          </button>
                        </div>
                        
                      </>
                    ) : (
                      <>
                        <div className="text-center py-12">
                          <FiClock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                          <p className="text-gray-500 text-lg mb-2">
                            No time entries for this week
                          </p>
                          <p className="text-gray-400 text-sm mb-4">
                            Use the "Add Row" button to add a project-task row
                          </p>
                          <p className="text-xs text-gray-400">
                            Once you have rows, you can click on cells to enter time directly
                          </p>
                        </div>
                        
                        {/* Buttons section - when no entries */}
                        <div className="flex justify-between items-center mt-4 gap-2 flex-wrap">
                          <div className="flex space-x-2">
                            <button
                              onClick={(e) => {
                                if (shouldDisableAddEntry) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  return;
                                }
                                fetchProjectsWithTasks();
                                setShowAddRowModal(true);
                              }}
                              disabled={shouldDisableAddEntry}
                              className={`btn-primary px-4 py-2 border border-transparent text-sm font-semibold rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 flex items-center gap-2 ${shouldDisableAddEntry ? 'opacity-50 cursor-not-allowed' : ''}`}
                              title={shouldDisableAddEntry ? (isWeekApproved ? 'Cannot add entries to approved weeks' : 'Cannot add entries to approved weeks') : 'Add a new row to enter time'}
                            >
                              <FiPlus className="w-4 h-4" />
                              Add Row
                            </button>
                            {/* Show "Copy from Previous Timesheet" button when no project rows available */}
                            {!shouldDisableAddEntry && (
                              <button
                                onClick={handleCopyPreviousWeekRows}
                                disabled={copyingPreviousWeekRows}
                                className="px-4 py-2 border border-gray-300 text-sm font-semibold rounded-md bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Copy project-task rows from the previous week's timesheet"
                              >
                                {copyingPreviousWeekRows ? (
                                  <div className="w-4 h-4 animate-spin rounded-full border-2 border-gray-600 border-t-transparent" />
                                ) : (
                                  <FiClock className="w-4 h-4" />
                                )}
                                Copy rows from most recent timesheet
                              </button>
                            )}
                          </div>

                          <button
                            onClick={handleSubmitWeek}
                            disabled={actionLoading === 'submit-week' || isWeekApproved || currentWeekEntries.length === 0 || hasAnyApprovedEntries}
                            className={`btn-secondary px-4 py-2 border border-transparent text-sm font-semibold rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-transparent flex ${(isWeekApproved || currentWeekEntries.length === 0 || hasAnyApprovedEntries) ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title={
                              isWeekApproved ? 'Week has been approved' :
                              hasAnyApprovedEntries ? 'Cannot submit unsubmitted entries after some entries are already approved' :
                              needsResubmit ? 'Resubmit all entries for this week for approval' :
                              isWeekPending ? 'Resubmit all entries for this week for approval' :
                              currentWeekEntries.length === 0 ? 'There are no entries for the week to submit' :
                              'Submit all entries for this week for approval'
                            }
                          >
                            {actionLoading === 'submit-week' ? (
                              <>
                                <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-gray-600 border-t-transparent" />
                                Submitting...
                              </>
                            ) : (
                              needsResubmit || isWeekPending ? 'Resubmit Week for Approval' : 'Submit Week for Approval'
                            )}
                          </button>
                        </div>
                      </>
                    )
                    })()}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      
    </div>
  )
}

