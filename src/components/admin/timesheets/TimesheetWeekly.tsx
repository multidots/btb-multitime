'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { formatSimpleTime, formatDecimalHours } from '@/lib/time'
import { format, startOfWeek, endOfWeek, addDays, subDays, isSameWeek, isToday, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { FiChevronLeft, FiChevronRight, FiTrash2, FiX, FiPlus, FiClock, FiPlay, FiSquare, FiPause, FiEdit2 } from 'react-icons/fi'
import { useSession } from 'next-auth/react'

interface TimesheetEntry {
  _key: string
  date: string
  project: {
    _id: string
    name: string
    code?: string
    client?: { _id: string; name: string }
  }
  task?: {
    _id: string
    name: string
    isBillable?: boolean
  }
  hours: number
  notes?: string
  isBillable: boolean
  startTime?: string
  endTime?: string
  isRunning: boolean
  createdAt?: string
  updatedAt?: string
}

interface Timesheet {
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
  status: 'unsubmitted' | 'submitted' | 'approved' | 'rejected'
  entries: TimesheetEntry[]
  totalHours: number
  billableHours: number
  nonBillableHours: number
  hasRunningTimer: boolean
  submittedAt?: string
  approvedBy?: { _id: string; firstName: string; lastName: string }
  approvedAt?: string
  isLocked: boolean
  createdAt: string
  updatedAt?: string
}

interface Project {
  _id: string
  name: string
}

interface Task {
  _id: string
  name: string
  isBillable?: boolean
  isArchived?: boolean
}

interface ProjectWithTasks extends Project {
  tasks?: Task[]
}

interface EmptyRow {
  projectId: string
  projectName: string
  taskId: string
  taskName: string
}

/** Optional server-fetched data for fast first paint (user timesheet page) */
export interface TimesheetWeeklyInitialData {
  timesheet: Timesheet | null
  projects: ProjectWithTasks[]
  weekStart: string
}

interface TimesheetWeeklyProps {
  userId?: string
  initialData?: TimesheetWeeklyInitialData | null
}

export default function TimesheetWeekly({ userId: _userId, initialData }: TimesheetWeeklyProps = {}) {
  const { data: session } = useSession()
  const [timesheet, setTimesheet] = useState<Timesheet | null>(initialData?.timesheet ?? null)
  const [loading, setLoading] = useState(!initialData)
  const skipNextLoadingTrue = useRef(!!initialData)
  const [currentDate, setCurrentDate] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('timesheet_weekly_viewed_week')
      if (stored) {
        const parsedDate = parseISO(stored)
        if (!isNaN(parsedDate.getTime())) {
          return parsedDate
        }
      }
    }
    return new Date()
  })

  const [viewMode, setViewMode] = useState<'week' | 'day'>('week')
  const [projectsWithTasks, setProjectsWithTasks] = useState<ProjectWithTasks[]>(initialData?.projects ?? [])
  const [inlineEditingCell, setInlineEditingCell] = useState<{ projectId: string; projectName: string; taskId: string; taskName: string; dayIndex: number } | null>(null)
  const [inlineEditingValue, setInlineEditingValue] = useState('')
  const [inlineEditingOriginalValue, setInlineEditingOriginalValue] = useState('')
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null)
  const [savingCellId, setSavingCellId] = useState<string | null>(null)
  const [showNewEntryModal, setShowNewEntryModal] = useState(false)
  const [showAddRowModal, setShowAddRowModal] = useState(false)
  const [copyingEntries, setCopyingEntries] = useState(false)
  const [editingEntry, setEditingEntry] = useState<TimesheetEntry | null>(null)
  const [startingTimerEntryKey, setStartingTimerEntryKey] = useState<string | null>(null)
  
  // Add Row modal state
  const [addRowSelectedProject, setAddRowSelectedProject] = useState('')
  const [addRowSelectedTask, setAddRowSelectedTask] = useState('')
  const [addRowTasks, setAddRowTasks] = useState<Task[]>([])
  
  // Copy previous week state
  const [copyingPreviousWeekRows, setCopyingPreviousWeekRows] = useState(false)
  
  // Empty rows state
  const [emptyRows, setEmptyRows] = useState<EmptyRow[]>([])
  const [manuallyAddedRows, setManuallyAddedRows] = useState<EmptyRow[]>([])
  const [deletedRows, setDeletedRows] = useState<string[]>([])
  const [localStorageLoaded, setLocalStorageLoaded] = useState(false)

  // New entry form state
  const [newEntryProject, setNewEntryProject] = useState('')
  const [newEntryTask, setNewEntryTask] = useState('')
  const [newEntryHours, setNewEntryHours] = useState('')
  const [newEntryHoursDisplay, setNewEntryHoursDisplay] = useState('') // For H:MM format display
  const [newEntryHoursError, setNewEntryHoursError] = useState('')
  const [newEntryNotes, setNewEntryNotes] = useState('')
  const [newEntryTasks, setNewEntryTasks] = useState<Task[]>([])
  const [newEntryDate, setNewEntryDate] = useState('') // Day within current week (yyyy-MM-dd)
  const [newEntryMode, setNewEntryMode] = useState<'manual' | 'timer'>('manual') // User only: switch between manual entry and start timer
  const [isSubmittingEntry, setIsSubmittingEntry] = useState(false)
  const [isSubmittingWeek, setIsSubmittingWeek] = useState(false)

  // Timer state
  const [runningTimer, setRunningTimer] = useState<{ entryKey: string; startTime: string; timesheetId?: string; date?: string; existingHours?: number } | null>(null)
  const [timerElapsed, setTimerElapsed] = useState(0)

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const day = startOfWeek(currentDate, { weekStartsOn: 1 })
    return addDays(day, i)
  })

  // When New Entry modal opens without a date, default to first day of week. In day view, keep modal date in sync with selected day.
  useEffect(() => {
    if (!showNewEntryModal) return
    if (viewMode === 'day') {
      setNewEntryDate(format(currentDate, 'yyyy-MM-dd'))
    } else if (!newEntryDate) {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
      setNewEntryDate(format(weekStart, 'yyyy-MM-dd'))
    }
  }, [showNewEntryModal, newEntryDate, currentDate, viewMode])

  // LocalStorage keys
  const getStorageKey = useCallback(() => {
    const weekStart = format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    return `timesheet_weekly_manual_rows_${session?.user?.id || 'guest'}_${weekStart}`
  }, [currentDate, session?.user?.id])

  const getDeletedRowsStorageKey = useCallback(() => {
    const weekStart = format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    return `timesheet_weekly_deleted_rows_${session?.user?.id || 'guest'}_${weekStart}`
  }, [currentDate, session?.user?.id])

  // Load localStorage data
  useEffect(() => {
    if (session?.user?.id && viewMode === 'week') {
      setLocalStorageLoaded(false)
      const weekStart = format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
      const manualRowsKey = `timesheet_weekly_manual_rows_${session.user.id}_${weekStart}`
      const deletedRowsKey = `timesheet_weekly_deleted_rows_${session.user.id}_${weekStart}`
      
      try {
        const stored = localStorage.getItem(manualRowsKey)
        setManuallyAddedRows(stored ? JSON.parse(stored) : [])
        
        const deletedStored = localStorage.getItem(deletedRowsKey)
        setDeletedRows(deletedStored ? JSON.parse(deletedStored) : [])
      } catch (e) {
        console.error('Error loading from localStorage:', e)
        setManuallyAddedRows([])
        setDeletedRows([])
      }
      setTimeout(() => setLocalStorageLoaded(true), 0)
    }
  }, [session?.user?.id, currentDate, viewMode])

  // Save manual rows to localStorage
  useEffect(() => {
    if (session?.user?.id && viewMode === 'week' && localStorageLoaded) {
      try {
        if (manuallyAddedRows.length > 0) {
          localStorage.setItem(getStorageKey(), JSON.stringify(manuallyAddedRows))
        } else {
          localStorage.removeItem(getStorageKey())
        }
      } catch (e) {
        console.error('Error saving to localStorage:', e)
      }
    }
  }, [manuallyAddedRows, session?.user?.id, viewMode, localStorageLoaded, getStorageKey])

  // Save deleted rows to localStorage
  useEffect(() => {
    if (session?.user?.id && viewMode === 'week' && localStorageLoaded) {
      try {
        if (deletedRows.length > 0) {
          localStorage.setItem(getDeletedRowsStorageKey(), JSON.stringify(deletedRows))
        } else {
          localStorage.removeItem(getDeletedRowsStorageKey())
        }
      } catch (e) {
        console.error('Error saving to localStorage:', e)
      }
    }
  }, [deletedRows, session?.user?.id, viewMode, localStorageLoaded, getDeletedRowsStorageKey])

  // Persist current date
  useEffect(() => {
    localStorage.setItem('timesheet_weekly_viewed_week', format(currentDate, 'yyyy-MM-dd'))
  }, [currentDate])

  // Timer tick effect
  useEffect(() => {
    if (!runningTimer) {
      setTimerElapsed(0)
      return
    }

    const interval = setInterval(() => {
      const start = new Date(runningTimer.startTime)
      const elapsed = Math.floor((Date.now() - start.getTime()) / 1000)
      // Include existing hours if this is a restarted timer
      const existingHoursSeconds = (runningTimer.existingHours || 0) * 3600
      setTimerElapsed(elapsed + existingHoursSeconds)
    }, 1000)

    return () => clearInterval(interval)
  }, [runningTimer])

  // Fetch global running timer (across all weeks)
  const fetchGlobalRunningTimer = useCallback(async () => {
    if (!session?.user?.id) return null

    try {
      const response = await fetch(`/api/timesheets/running-timer?userId=${session.user.id}`)
      if (response.ok) {
        const data = await response.json()
        if (data?.runningEntry) {
          // Need to get the existing hours from the timesheet entry
          // We'll fetch the timesheet to get the entry's hours
          const timesheetResponse = await fetch(`/api/timesheets/${data._id}`)
          if (timesheetResponse.ok) {
            const timesheetData = await timesheetResponse.json()
            const entry = timesheetData?.entries?.find((e: any) => e._key === data.runningEntry._key)
            const existingHours = entry?.hours || 0
            
            return {
              entryKey: data.runningEntry._key,
              startTime: data.runningEntry.startTime,
              timesheetId: data._id,
              date: data.runningEntry.date,
              existingHours
            }
          }
          
          return {
            entryKey: data.runningEntry._key,
            startTime: data.runningEntry.startTime,
            timesheetId: data._id,
            date: data.runningEntry.date,
            existingHours: 0
          }
        }
      }
    } catch (error) {
      console.error('Error fetching global running timer:', error)
    }
    return null
  }, [session?.user?.id])

  // Update running timer - check global first, then current week
  useEffect(() => {
    let isMounted = true

    const updateRunningTimer = async () => {
      // First check for global running timer (across all weeks)
      const globalTimer = await fetchGlobalRunningTimer()
      
      if (isMounted) {
        if (globalTimer) {
          setRunningTimer(globalTimer)
        } else if (timesheet?.hasRunningTimer && timesheet.entries) {
          // Fall back to current week's timer if no global timer
          const running = timesheet.entries.find(e => e.isRunning)
          if (running?.startTime) {
            setRunningTimer({ 
              entryKey: running._key, 
              startTime: running.startTime, 
              timesheetId: timesheet._id, 
              date: running.date,
              existingHours: running.hours || 0
            })
          } else {
            setRunningTimer(null)
          }
        } else {
          setRunningTimer(null)
        }
      }
    }

    updateRunningTimer()

    return () => {
      isMounted = false
    }
  }, [timesheet, currentDate, fetchGlobalRunningTimer])

  // Normalize time input
  const normalizeTimeInput = (input: string): string | null => {
    if (!input || input.trim() === '') return null

    const decimalMatch = input.match(/^(\d*\.?\d+)$/)
    if (decimalMatch) {
      const decimalValue = parseFloat(decimalMatch[1])
      if (isNaN(decimalValue) || decimalValue < 0 || decimalValue > 24) return null
      const hours = Math.floor(decimalValue)
      const minutes = Math.round((decimalValue - hours) * 60)
      if (hours > 24 || (hours === 24 && minutes > 0)) return null
      return `${hours}:${minutes.toString().padStart(2, '0')}`
    }

    const timeMatch = input.match(/^(\d+):?(\d*)$/)
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10)
      let minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0
      if (timeMatch[2] && timeMatch[2].length === 1) minutes = minutes * 10
      if (minutes >= 60) {
        hours += Math.floor(minutes / 60)
        minutes = minutes % 60
      }
      if (hours > 24 || (hours === 24 && minutes > 0)) return null
      return `${hours}:${minutes.toString().padStart(2, '0')}`
    }

    return null
  }

  // Parse time input to decimal hours
  const parseTimeInput = (input: string): number | null => {
    if (!input || input.trim() === '') return null
    const normalized = normalizeTimeInput(input)
    if (!normalized) return null
    const timeMatch = normalized.match(/^(\d+):(\d{2})$/)
    if (timeMatch) {
      const hours = parseInt(timeMatch[1], 10)
      const minutes = parseInt(timeMatch[2], 10)
      return hours + (minutes / 60)
    }
    return null
  }

  const isValidTimeFormat = (input: string): boolean => {
    if (!input || input.trim() === '') return true
    const parsed = parseTimeInput(input)
    return parsed !== null && !isNaN(parsed) && parsed > 0 && parsed <= 24
  }

  // Fetch timesheet for current week
  const fetchTimesheet = useCallback(async () => {
    if (!session?.user?.id) return

    if (!skipNextLoadingTrue.current) setLoading(true)
    skipNextLoadingTrue.current = false
    try {
      const weekStart = format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
      
      // First try to get existing timesheet
      const response = await fetch(`/api/timesheets?weekStart=${weekStart}`)
      
      if (response.ok) {
        const data = await response.json()
        if (data) {
          setTimesheet(data)
        } else {
          // Create new timesheet if none exists
          const createResponse = await fetch('/api/timesheets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: weekStart }),
          })
          if (createResponse.ok) {
            const newTimesheet = await createResponse.json()
            setTimesheet(newTimesheet)
          }
        }
      }
    } catch (error) {
      console.error('Error fetching timesheet:', error)
      toast.error('Failed to load timesheet')
    } finally {
      setLoading(false)
    }
  }, [currentDate, session?.user?.id])

  useEffect(() => {
    fetchTimesheet()
  }, [fetchTimesheet])

  // Fetch previous week's timesheet and copy unique project-task rows as empty rows (for week view)
  const fetchPreviousWeekRows = async (showToast = false) => {
    if (!session?.user?.id) return

    const currentWeekStart = format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const previousWeekStart = format(subDays(parseISO(currentWeekStart), 7), 'yyyy-MM-dd')

    try {
      const response = await fetch(`/api/timesheets?weekStart=${previousWeekStart}&forCopy=1`)
      if (!response.ok) return

      const prevTimesheet = await response.json()
      const prevEntries = prevTimesheet?.entries || []

      const seenKeys = new Set<string>()
      timesheet?.entries?.forEach((entry: TimesheetEntry) => {
        seenKeys.add(`${entry.project._id}-${entry.task?._id || 'no-task'}`)
      })
      manuallyAddedRows.forEach(row => {
        seenKeys.add(`${row.projectId}-${row.taskId}`)
      })
      deletedRows.forEach(key => seenKeys.add(key))

      const uniqueRows: EmptyRow[] = []
      prevEntries.forEach((entry: TimesheetEntry) => {
        const taskId = entry.task?._id || 'no-task'
        const taskName = entry.task?.name || 'No Task'
        const key = `${entry.project._id}-${taskId}`
        if (!seenKeys.has(key)) {
          seenKeys.add(key)
          uniqueRows.push({
            projectId: entry.project._id,
            projectName: entry.project.name || 'Unnamed Project',
            taskId,
            taskName
          })
        }
      })

      if (uniqueRows.length > 0) {
        const updatedManual = [...manuallyAddedRows]
        uniqueRows.forEach(row => {
          if (!updatedManual.some(p => p.projectId === row.projectId && p.taskId === row.taskId)) {
            updatedManual.push(row)
          }
        })
        setManuallyAddedRows(updatedManual)
        try {
          localStorage.setItem(getStorageKey(), JSON.stringify(updatedManual))
        } catch (e) {
          console.error('Error saving manual rows to localStorage:', e)
        }
        if (showToast) toast.success(`Copied ${uniqueRows.length} row(s) from previous week`)
      } else if (showToast) {
        toast('No new rows to copy from previous week')
      }
    } catch (error) {
      console.error('Error fetching previous week rows:', error)
      if (showToast) toast.error('Failed to copy rows from previous week')
    }
  }

  // Copy entries from previous day to current day (for day view)
  const copyEntriesToCurrentDay = async () => {
    if (!session?.user?.id || !timesheet) return

    const selectedDateStr = format(currentDate, 'yyyy-MM-dd')
    // Check if current date is Monday (start of week with weekStartsOn: 1)
    const currentWeekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
    const isStartOfWeek = format(currentDate, 'yyyy-MM-dd') === format(currentWeekStart, 'yyyy-MM-dd')
    
    try {
      setCopyingPreviousWeekRows(true)
      
      let sourceEntries: TimesheetEntry[] = []
      let sourceDate: Date | null = null
      
      // First, check the previous day
      const previousDay = subDays(currentDate, 1)
      const previousDayStr = format(previousDay, 'yyyy-MM-dd')
      
      // Check if previous day is in current timesheet
      const previousDayEntries = timesheet.entries?.filter((e: TimesheetEntry) => e.date === previousDayStr) || []
      
      if (previousDayEntries.length > 0) {
        // Previous day has entries, use them
        sourceEntries = previousDayEntries
        sourceDate = previousDay
      } else if (isStartOfWeek) {
        // It's the start of the week and previous day has no entries
        // Find the most recent day with entries (checking backwards from previous day)
        let checkDate = previousDay
        let daysChecked = 0
        const maxDaysToCheck = 14 // Check up to 2 weeks back
        
        while (daysChecked < maxDaysToCheck && sourceEntries.length === 0) {
          const checkDateStr = format(checkDate, 'yyyy-MM-dd')
          
          // Check if this date is in current timesheet
          const checkDateEntries = timesheet.entries?.filter((e: TimesheetEntry) => e.date === checkDateStr) || []
          
          if (checkDateEntries.length > 0) {
            sourceEntries = checkDateEntries
            sourceDate = checkDate
            break
          }
          
          // If not in current timesheet, check if we need to fetch a different timesheet
          const checkWeekStart = format(startOfWeek(checkDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
          const currentWeekStart = format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
          
          if (checkWeekStart !== currentWeekStart) {
            // Need to check a different timesheet
            try {
              const response = await fetch(`/api/timesheets?weekStart=${checkWeekStart}&forCopy=1`)
              if (response.ok) {
                const checkTimesheet = await response.json()
                if (checkTimesheet?.entries) {
                  const entriesForDate = checkTimesheet.entries.filter((e: TimesheetEntry) => e.date === checkDateStr)
                  if (entriesForDate.length > 0) {
                    sourceEntries = entriesForDate
                    sourceDate = checkDate
                    break
                  }
                }
              }
            } catch (error) {
              console.error('Error fetching timesheet for date:', error)
            }
          }
          
          checkDate = subDays(checkDate, 1)
          daysChecked++
        }
      }
      
      if (sourceEntries.length === 0) {
        toast('No previous day with entries found')
        return
      }

      // Get existing entries for the selected day to avoid duplicates
      const existingDayEntries = getDayEntries()
      const seenKeys = new Set<string>()
      existingDayEntries.forEach(entry => {
        // Only track entries with valid tasks
        if (entry.task?._id) {
          seenKeys.add(`${entry.project._id}-${entry.task._id}`)
        }
      })

      // Get unique project-task combinations from the source entries
      // Only include entries that have a valid task
      const uniqueProjectTasks = new Map<string, { projectId: string; taskId: string }>()
      sourceEntries.forEach((entry: TimesheetEntry) => {
        // Only process entries with valid tasks
        if (entry.task?._id) {
          const key = `${entry.project._id}-${entry.task._id}`
          if (!seenKeys.has(key) && !uniqueProjectTasks.has(key)) {
            uniqueProjectTasks.set(key, {
              projectId: entry.project._id,
              taskId: entry.task._id
            })
          }
        }
      })

      if (uniqueProjectTasks.size === 0) {
        toast('No new entries to copy for this day')
        return
      }

      // Create entries for the selected day
      let successCount = 0
      let errorCount = 0
      
      for (const { projectId, taskId } of uniqueProjectTasks.values()) {
        try {
          await addEntry(projectId, taskId, selectedDateStr, 0, '')
          successCount++
        } catch (error) {
          console.error('Error adding entry:', error)
          errorCount++
        }
      }

      // Refresh timesheet to show new entries
      await fetchTimesheet()

      const sourceDateStr = sourceDate ? format(sourceDate, 'MMM d, yyyy') : 'previous day'
      if (successCount > 0) {
        toast.success(`Copied ${successCount} entry/entries from ${sourceDateStr} to ${format(currentDate, 'MMM d, yyyy')}`)
      }
      if (errorCount > 0) {
        toast.error(`Failed to copy ${errorCount} entry/entries`)
      }
    } catch (error) {
      console.error('Error copying entries to current day:', error)
      toast.error('Failed to copy entries from previous day')
    } finally {
      setCopyingPreviousWeekRows(false)
    }
  }

  const handleCopyPreviousWeekRows = async () => {
    if (viewMode === 'day') {
      // For day view, copy entries to the selected day
      await copyEntriesToCurrentDay()
    } else {
      // For week view, copy rows as empty rows
      setCopyingPreviousWeekRows(true)
      try {
        localStorage.removeItem(getDeletedRowsStorageKey())
        setDeletedRows([])
        await fetchPreviousWeekRows(true)
      } finally {
        setCopyingPreviousWeekRows(false)
      }
    }
  }

  // Fetch projects with tasks
  const fetchProjectsWithTasks = async () => {
    try {
      const response = await fetch('/api/projects/with-tasks')
      if (response.ok) {
        const data = await response.json()
        setProjectsWithTasks(data.projects || [])
      } else {
        console.error('Failed to fetch projects')
        setProjectsWithTasks([])
      }
    } catch (error) {
      console.error('Error fetching projects:', error)
      toast.error('Failed to load projects')
      setProjectsWithTasks([])
    }
  }

  // Handle navigation
  const handlePrev = () => {
    if (viewMode === 'week') {
      setCurrentDate(subDays(currentDate, 7))
      setEmptyRows([])
    } else {
      setCurrentDate(subDays(currentDate, 1))
    }
  }

  const handleNext = () => {
    if (viewMode === 'week') {
      setCurrentDate(addDays(currentDate, 7))
      setEmptyRows([])
    } else {
      setCurrentDate(addDays(currentDate, 1))
    }
  }

  // Add entry to timesheet
  const addEntry = async (projectId: string, taskId: string, date: string, hours: number, notes?: string) => {
    if (!timesheet) return null
    
    try {
      const response = await fetch(`/api/timesheets/${timesheet._id}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, taskId, date, hours, notes }),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to add entry')
      }
      
      return await response.json()
    } catch (error) {
      console.error('Error adding entry:', error)
      throw error
    }
  }

  // Update entry in timesheet
  const updateEntry = async (entryKey: string, data: Partial<{ projectId: string; taskId: string; date: string; hours: number; notes: string; action: string }>, timesheetId?: string) => {
    const targetTimesheetId = timesheetId || timesheet?._id
    if (!targetTimesheetId) return
    
    try {
      const response = await fetch(`/api/timesheets/${targetTimesheetId}/entries`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryKey, ...data }),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update entry')
      }
      
      return await response.json()
    } catch (error) {
      console.error('Error updating entry:', error)
      throw error
    }
  }

  // Delete entry from timesheet
  const deleteEntry = async (entryKey: string) => {
    if (!timesheet) return
    
    try {
      const response = await fetch(`/api/timesheets/${timesheet._id}/entries?entryKey=${entryKey}`, {
        method: 'DELETE',
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete entry')
      }
    } catch (error) {
      console.error('Error deleting entry:', error)
      throw error
    }
  }

  // Handle inline edit save
  const handleInlineEditSave = async () => {
    if (!inlineEditingCell || !timesheet) return

    if (inlineEditingValue.trim() === inlineEditingOriginalValue.trim()) {
      setInlineEditingCell(null)
      setInlineEditingValue('')
      setInlineEditingOriginalValue('')
      return
    }

    const { projectId, taskId, dayIndex, projectName, taskName } = inlineEditingCell
    const targetDate = weekDays[dayIndex]
    const dateString = format(targetDate, 'yyyy-MM-dd')

    const existingEntries = (timesheet.entries || []).filter(
      e => e.project._id === projectId && e.task?._id === taskId && e.date === dateString
    )

    const trimmedValue = inlineEditingValue.trim()

    // Empty input - delete entries
    if (!trimmedValue) {
      if (existingEntries.length > 0) {
        const cellId = `${projectId}-${taskId}-${dayIndex}`
        setSavingCellId(cellId)
        setInlineEditingCell(null)
        setInlineEditingValue('')

        try {
          for (const entry of existingEntries) {
            await deleteEntry(entry._key)
          }
          toast.success('Entry deleted')
          await fetchTimesheet()
        } catch (error) {
          toast.error('Failed to delete entry')
        } finally {
          setSavingCellId(null)
        }
      } else {
        setInlineEditingCell(null)
        setInlineEditingValue('')
      }
      return
    }

    const hoursValue = parseTimeInput(trimmedValue)
    if (hoursValue === null) {
      toast.error('Invalid time format. Use H:MM (e.g., 2:30) or decimal (e.g., 2.5).')
      return
    }

    if (isNaN(hoursValue) || hoursValue < 0 || hoursValue > 24) {
      toast.error('Hours must be between 0 and 24.')
      return
    }

    const roundedHours = formatDecimalHours(hoursValue)
    const cellId = `${projectId}-${taskId}-${dayIndex}`
    setSavingCellId(cellId)
    setInlineEditingCell(null)
    setInlineEditingValue('')

    try {
      if (existingEntries.length > 0) {
        // Update first entry, delete rest
        const firstEntry = existingEntries[0]
        await updateEntry(firstEntry._key, { hours: roundedHours })
        
        for (let i = 1; i < existingEntries.length; i++) {
          await deleteEntry(existingEntries[i]._key)
        }
        toast.success('Entry updated')
      } else {
        // Create new entry
        await addEntry(projectId, taskId, dateString, roundedHours)
        toast.success('Entry created')
      }
      await fetchTimesheet()
    } catch (error) {
      toast.error('Failed to save entry')
    } finally {
      setSavingCellId(null)
    }
  }

  // Handle cell click for inline editing
  const handleCellClick = (projectId: string, projectName: string, taskId: string, taskName: string, dayIndex: number) => {
    if (!timesheet) return
    
    const targetDate = viewMode === 'week' ? weekDays[dayIndex] : currentDate
    const dateString = format(targetDate, 'yyyy-MM-dd')
    const existingEntries = (timesheet.entries || []).filter(
      e => e.project._id === projectId && e.task?._id === taskId && e.date === dateString
    )

    setInlineEditingCell({ projectId, projectName, taskId, taskName, dayIndex })
    if (existingEntries.length > 0) {
      const totalHours = existingEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0)
      const formattedTime = formatSimpleTime(totalHours)
      setInlineEditingValue(formattedTime)
      setInlineEditingOriginalValue(formattedTime)
    } else {
      setInlineEditingValue('')
      setInlineEditingOriginalValue('')
    }
  }

  // Delete entire row
  const handleDeleteProjectTaskRow = async (projectId: string, taskId: string) => {
    if (!timesheet) return

    const weekStartStr = timesheet.weekStart
    const weekEndStr = timesheet.weekEnd

    const rowEntries = (timesheet.entries || []).filter(
      e => e.project._id === projectId && e.task?._id === taskId && e.date >= weekStartStr && e.date <= weekEndStr
    )

    if (rowEntries.length === 0) {
      handleDeleteEmptyRow(projectId, taskId)
      return
    }

    if (!confirm('Are you sure you want to delete all entries from this row?')) {
      return
    }

    const rowId = `${projectId}-${taskId}`
    setDeletingRowId(rowId)

    try {
      for (const entry of rowEntries) {
        await deleteEntry(entry._key)
      }
      
      setEmptyRows(prev => prev.filter(r => !(r.projectId === projectId && r.taskId === taskId)))
      setManuallyAddedRows(prev => prev.filter(r => !(r.projectId === projectId && r.taskId === taskId)))
      setDeletedRows(prev => prev.includes(rowId) ? prev : [...prev, rowId])
      
      toast.success('Row deleted')
      await fetchTimesheet()
    } catch (error) {
      toast.error('Failed to delete row')
    } finally {
      setDeletingRowId(null)
    }
  }

  // Delete empty row
  const handleDeleteEmptyRow = (projectId: string, taskId: string) => {
    const rowKey = `${projectId}-${taskId}`
    
    const isFromAutoCopy = emptyRows.some(r => r.projectId === projectId && r.taskId === taskId)
    if (isFromAutoCopy) {
      setDeletedRows(prev => prev.includes(rowKey) ? prev : [...prev, rowKey])
    }
    
    setEmptyRows(prev => prev.filter(r => !(r.projectId === projectId && r.taskId === taskId)))
    setManuallyAddedRows(prev => prev.filter(r => !(r.projectId === projectId && r.taskId === taskId)))
    
    toast.success('Row removed')
  }

  // Add row
  const handleAddRow = () => {
    if (!addRowSelectedProject || !addRowSelectedTask) {
      toast.error('Please select both a project and a task.')
      return
    }
    
    const project = projectsWithTasks.find(p => p._id === addRowSelectedProject)
    const task = project?.tasks?.find(t => t._id === addRowSelectedTask)
    
    if (!project || !task) {
      toast.error('Invalid project or task selected.')
      return
    }
    
    const key = `${addRowSelectedProject}-${addRowSelectedTask}`
    const existsInEntries = (timesheet?.entries || []).some(e => `${e.project._id}-${e.task?._id}` === key)
    const existsInEmptyRows = emptyRows.some(r => `${r.projectId}-${r.taskId}` === key)
    const existsInManualRows = manuallyAddedRows.some(r => `${r.projectId}-${r.taskId}` === key)
    
    if (existsInEntries || existsInEmptyRows || existsInManualRows) {
      toast.error('This project-task combination already exists.')
      setShowAddRowModal(false)
      setAddRowSelectedProject('')
      setAddRowSelectedTask('')
      return
    }
    
    setManuallyAddedRows(prev => [...prev, {
      projectId: addRowSelectedProject,
      projectName: project.name,
      taskId: addRowSelectedTask,
      taskName: task.name,
    }])
    
    toast.success('Row added')
    setShowAddRowModal(false)
    setAddRowSelectedProject('')
    setAddRowSelectedTask('')
  }

  // Handle project change in Add Row modal
  const handleAddRowProjectChange = (projectId: string) => {
    setAddRowSelectedProject(projectId)
    setAddRowSelectedTask('')
    
    const project = projectsWithTasks.find(p => p._id === projectId)
    const tasks = (project?.tasks || []).filter(t => !t.isArchived)
    setAddRowTasks(tasks)
  }

  // Submit week for approval
  const handleSubmitWeekForApproval = async () => {
    if (!timesheet) {
      toast.error('No timesheet to submit')
      return
    }

    if (timesheet.hasRunningTimer) {
      toast.error('Please stop the running timer before submitting')
      return
    }

    const confirmText = `Are you sure you want to submit the week of ${timesheet.weekStart} to ${timesheet.weekEnd} for approval?`
    if (!confirm(confirmText)) return

    setIsSubmittingWeek(true)
    try {
      const response = await fetch(`/api/timesheets/${timesheet._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit' }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to submit')
      }

      toast.success('Week submitted for approval!')
      await fetchTimesheet()
    } catch (error: any) {
      console.error('Error submitting:', error)
      toast.error(error.message || 'Failed to submit')
    } finally {
      setIsSubmittingWeek(false)
    }
  }

  // Timer functions (dateString optional: when starting from modal, use selected day)
  const handleStartTimer = async (projectId: string, taskId: string, dateString?: string) => {
    if (!timesheet) return

    const date = dateString || format(currentDate, 'yyyy-MM-dd')

    try {
      // Stop any running timer before starting a new one
      if (runningTimer) {
        await handleStopTimer()
      }

      const response = await fetch(`/api/timesheets/${timesheet._id}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          taskId,
          date,
          hours: 0,
          isTimer: true,
          startTime: new Date().toISOString()
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to start timer')
      }

      toast.success('Timer started')
      await fetchTimesheet()
      // Refresh global timer after starting
      const globalTimer = await fetchGlobalRunningTimer()
      if (globalTimer) {
        setRunningTimer(globalTimer)
      }
    } catch (error) {
      toast.error('Failed to start timer')
    }
  }

  const handleStartTimerFromModal = async () => {
    if (!newEntryProject || !newEntryTask || !newEntryDate) {
      toast.error('Please select date, project and task')
      return
    }
    setIsSubmittingEntry(true)
    try {
      await handleStartTimer(newEntryProject, newEntryTask, newEntryDate)
      setShowNewEntryModal(false)
      setNewEntryProject('')
      setNewEntryTask('')
      setNewEntryDate('')
      setNewEntryNotes('')
      setNewEntryMode('manual')
    } finally {
      setIsSubmittingEntry(false)
    }
  }

  const handleStopTimer = async () => {
    if (!runningTimer) return
    
    try {
      // Use the timesheetId from runningTimer if available (for global timer), otherwise use current timesheet
      const targetTimesheetId = runningTimer.timesheetId || timesheet?._id
      if (!targetTimesheetId) {
        toast.error('Cannot stop timer: timesheet not found')
        return
      }
      
      await updateEntry(runningTimer.entryKey, { action: 'stop_timer' }, targetTimesheetId)
      toast.success('Timer stopped')
      setRunningTimer(null)
      // Refresh current week's timesheet and refetch global timer
      await fetchTimesheet()
      const globalTimer = await fetchGlobalRunningTimer()
      if (globalTimer) {
        setRunningTimer(globalTimer)
      }
    } catch (error) {
      toast.error('Failed to stop timer')
    }
  }

  // Format timer elapsed time
  const formatTimerElapsed = (seconds: number): string => {
    // Round to integer to avoid floating-point precision issues
    const totalSeconds = Math.floor(seconds)
    const h = Math.floor(totalSeconds / 3600)
    const m = Math.floor((totalSeconds % 3600) / 60)
    const s = totalSeconds % 60
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // New entry form handlers
  const handleNewEntryProjectChange = (projectId: string) => {
    setNewEntryProject(projectId)
    setNewEntryTask('')
    const project = projectsWithTasks.find(p => p._id === projectId)
    setNewEntryTasks((project?.tasks || []).filter(t => !t.isArchived))
  }

  const handleAddNewEntry = async () => {
    if (!timesheet || !newEntryProject || !newEntryTask) {
      toast.error('Please select project and task')
      return
    }

    // Parse hours from H:MM format
    const hoursValue = parseTimeInput(newEntryHoursDisplay || newEntryHours)
    
    if (hoursValue === null || isNaN(hoursValue) || hoursValue <= 0 || hoursValue > 24) {
      setNewEntryHoursError('Hours must be in decimal (e.g., 2.2) or H:MM format (e.g., 2:30). Range: 0:01 to 24:00.')
      return
    } else {
      setNewEntryHoursError('')
    }
    
    // Round to 2 decimal places
    const roundedHours = formatDecimalHours(hoursValue)

    setIsSubmittingEntry(true)
    try {
      const dateString = newEntryDate || format(currentDate, 'yyyy-MM-dd')
      await addEntry(newEntryProject, newEntryTask, dateString, roundedHours, newEntryNotes)
      toast.success('Entry added')
      setShowNewEntryModal(false)
      setNewEntryProject('')
      setNewEntryTask('')
      setNewEntryDate('')
      setNewEntryMode('manual')
      setNewEntryHours('')
      setNewEntryHoursDisplay('')
      setNewEntryHoursError('')
      setNewEntryNotes('')
      await fetchTimesheet()
    } catch (error) {
      toast.error('Failed to add entry')
    } finally {
      setIsSubmittingEntry(false)
    }
  }

  // Build entries by project and task for week view
  const entriesByProjectAndTask = (() => {
    const result: Record<string, { project: { _id: string; name: string }; task: { _id: string; name: string }; days: number[] }> = {}
    
    if (timesheet?.entries) {
      timesheet.entries.forEach(entry => {
        const key = `${entry.project._id}-${entry.task?._id || 'no-task'}`
        if (!result[key]) {
          result[key] = {
            project: entry.project,
            task: entry.task || { _id: 'no-task', name: 'No Task' },
            days: Array(7).fill(0)
          }
        }
        const dayIndex = weekDays.findIndex(day => format(day, 'yyyy-MM-dd') === entry.date)
        if (dayIndex !== -1) {
          result[key].days[dayIndex] += entry.hours
        }
      })
    }
    
    // Add empty rows
    if (viewMode === 'week') {
      const allEmptyRows = [...emptyRows, ...manuallyAddedRows]
      const seenKeys = new Set<string>()
      
      allEmptyRows.forEach(emptyRow => {
        const key = `${emptyRow.projectId}-${emptyRow.taskId}`
        if (!result[key] && !seenKeys.has(key)) {
          seenKeys.add(key)
          result[key] = {
            project: { _id: emptyRow.projectId, name: emptyRow.projectName },
            task: { _id: emptyRow.taskId, name: emptyRow.taskName },
            days: Array(7).fill(0)
          }
        }
      })
    }
    
    return result
  })()

  // Status checks
  const isCurrentWeek = isSameWeek(currentDate, new Date(), { weekStartsOn: 1 })
  const isWeekApproved = timesheet?.status === 'approved'
  const isWeekPending = timesheet?.status === 'submitted'
  const isWeekLocked = timesheet?.isLocked || false
  const hasRunningTimerEntry = timesheet?.hasRunningTimer || false

  const shouldDisableAddEntry = isWeekLocked || isWeekApproved

  // Get day entries for day view
  const getDayEntries = () => {
    if (!timesheet?.entries) return []
    const dateString = format(currentDate, 'yyyy-MM-dd')
    return timesheet.entries.filter(e => e.date === dateString)
  }

  // Group day entries by project (for day view layout matching UserDashboard)
  const groupDayEntriesByProject = (entries: TimesheetEntry[]) => {
    const byProject = new Map<string, { projectId: string; projectName: string; projectCode?: string; clientName?: string; entries: TimesheetEntry[] }>()
    for (const entry of entries) {
      const id = entry.project._id
      if (!byProject.has(id)) {
        byProject.set(id, {
          projectId: id,
          projectName: entry.project.name || 'Unnamed Project',
          projectCode: entry.project.code,
          clientName: entry.project.client?.name,
          entries: []
        })
      }
      byProject.get(id)!.entries.push(entry)
    }
    return Array.from(byProject.values())
  }

  // Allow timer functionality for all roles (user, manager, admin) when viewing their own timesheet
  // If _userId is not provided (e.g., admin/manager viewing from /admin/timesheets), assume own timesheet
  const isUserView = !!(session?.user?.id && (!_userId || _userId === session.user.id))
  const isTodayEntry = (entry: TimesheetEntry) => entry.date === format(new Date(), 'yyyy-MM-dd')

  const handleStartTimerFromEntry = async (entry: TimesheetEntry) => {
    if (!entry.task?._id) return
    setStartingTimerEntryKey(entry._key)
    try {
      // If another timer is running, stop it first (saves time to that row)
      if (runningTimer) {
        await handleStopTimer()
      }
      // Start timer on this existing row (no new entry; time adds to this row when stopped)
      await updateEntry(entry._key, { action: 'start_timer' })
      toast.success('Timer started')
      await fetchTimesheet()
      // Refresh global timer after starting and include existing hours for continuation time
      const globalTimer = await fetchGlobalRunningTimer()
      if (globalTimer) {
        // Include existing hours from the entry for continuation time display
        const existingHours = entry.hours || 0
        setRunningTimer({ ...globalTimer, existingHours })
      } else {
        // If no global timer, check current timesheet
        const updatedTimesheet = await fetch(`/api/timesheets/${timesheet?._id}`).then(r => r.json())
        const running = updatedTimesheet?.entries?.find((e: TimesheetEntry) => e._key === entry._key && e.isRunning)
        if (running?.startTime) {
          const existingHours = entry.hours || 0
          setRunningTimer({ 
            entryKey: running._key, 
            startTime: running.startTime, 
            timesheetId: timesheet?._id, 
            date: running.date,
            existingHours
          })
        }
      }
    } catch (error) {
      toast.error('Failed to start timer')
    } finally {
      setStartingTimerEntryKey(null)
    }
  }

  return (
    <div>
      {/* Running Timer Banner */}
      {runningTimer && (() => {
        const timerDate = runningTimer.date ? parseISO(runningTimer.date) : null
        const currentWeekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
        const currentWeekEnd = endOfWeek(currentDate, { weekStartsOn: 1 })
        const isTimerInCurrentWeek = timerDate && timerDate >= currentWeekStart && timerDate <= currentWeekEnd
        
        return (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span className="font-medium text-green-800">Timer Running</span>
              {!isTimerInCurrentWeek && timerDate && (
                <span className="text-sm text-green-700 font-medium">
                  ({format(timerDate, 'MMM d, yyyy')})
                </span>
              )}
              <span className="text-2xl font-mono text-green-700">{formatTimerElapsed(timerElapsed)}</span>
            </div>
            <button
              onClick={handleStopTimer}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
            >
              <FiSquare className="w-4 h-4" />
              Stop Timer
            </button>
          </div>
        )
      })()}

      {/* Header with navigation */}
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        {viewMode === 'week' && (
          <div className="flex items-center flex-wrap gap-4">
            <div className="flex flex-wrap">
              <button
                onClick={handlePrev}
                disabled={loading}
                className="p-1.5 rounded-s-md border border-[#1d1e1c40] hover:bg-gray-100 disabled:opacity-50"
              >
                <FiChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <button
                onClick={handleNext}
                disabled={loading}
                className="p-1.5 rounded-e-md border border-l-0 border-[#1d1e1c40] hover:bg-gray-100 disabled:opacity-50"
              >
                <FiChevronRight className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <span className="font-medium">
                {(() => {
                  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
                  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 })
                  const isSameMonth = format(weekStart, 'MMM yyyy') === format(weekEnd, 'MMM yyyy')
                  const startFormat = isSameMonth ? 'd' : 'd MMM'
                  const prefix = isCurrentWeek ? 'This week: ' : ''
                  return `${prefix}${format(weekStart, startFormat)} – ${format(weekEnd, 'd MMM yyyy')}`
                })()}
              </span>
              {isWeekApproved && (
                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                  Approved
                </span>
              )}
              {isWeekPending && !isWeekApproved && (
                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">
                  Pending
                </span>
              )}
              {timesheet?.status === 'rejected' && (
                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                  Rejected
                </span>
              )}
            </div>

            {!isCurrentWeek && (
              <button
                className="text-[#2a59c1] hover:underline text-sm font-medium"
                onClick={() => setCurrentDate(startOfWeek(new Date(), { weekStartsOn: 1 }))}
              >
                Return to this week
              </button>
            )}
          </div>
        )}

        {viewMode === 'day' && (
          <div className="flex items-center flex-wrap gap-4">
            <div className="flex flex-wrap">
              <button
                onClick={handlePrev}
                disabled={loading}
                className="p-1.5 rounded-s-md border border-[#1d1e1c40] hover:bg-gray-100 disabled:opacity-50"
              >
                <FiChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <button
                onClick={handleNext}
                disabled={loading}
                className="p-1.5 rounded-e-md border border-l-0 border-[#1d1e1c40] hover:bg-gray-100 disabled:opacity-50"
              >
                <FiChevronRight className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <span className="font-medium">
                {isToday(currentDate)
                  ? `Today: ${format(currentDate, 'EEEE, d MMM')}`
                  : format(currentDate, 'EEEE, d MMM')}
              </span>
              {isWeekApproved && (
                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                  Approved
                </span>
              )}
              {isWeekPending && !isWeekApproved && (
                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">
                  Pending
                </span>
              )}
              {timesheet?.status === 'rejected' && (
                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                  Rejected
                </span>
              )}
            </div>

            {!isToday(currentDate) && (
              <button
                className="text-[#2a59c1] hover:underline text-sm font-medium"
                onClick={() => setCurrentDate(new Date())}
              >
                Return to today
              </button>
            )}
          </div>
        )}

        {/* View Mode Toggle */}
        <div className="flex items-center space-x-2 bg-gray-100 rounded-lg p-1">
          <button
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              viewMode === 'week' ? 'bg-white theme-color shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
            onClick={() => setViewMode('week')}
          >
            Week
          </button>
          <button
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              viewMode === 'day' ? 'bg-white theme-color shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
            onClick={() => {
              setViewMode('day')
              const today = new Date()
              const todayWeekStart = startOfWeek(today, { weekStartsOn: 1 })
              const currentWeekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
              if (format(currentWeekStart, 'yyyy-MM-dd') === format(todayWeekStart, 'yyyy-MM-dd')) {
                setCurrentDate(today)
              } else {
                setCurrentDate(currentWeekStart)
              }
            }}
          >
            Day
          </button>
        </div>
      </div>

      {/* Week View */}
      {viewMode === 'week' && (
        <>
          {loading ? (
            <div className="h-48 bg-gray-200 rounded animate-pulse"></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="p-3 font-medium">Project</th>
                    {weekDays.map((day, index) => (
                      <th
                        key={day.toString()}
                        className={`p-3 font-medium min-w-[80px] text-center ${
                          isToday(day) ? 'theme-color border-b-2 theme-color-border font-semibold' : ''
                        }`}
                      >
                        {format(day, 'EEE')}<br />{format(day, 'd MMM')}
                      </th>
                    ))}
                    <th className="p-3 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(entriesByProjectAndTask).map(({ project, task, days }) => {
                    const hasEntries = days.some(d => d > 0)
                    const isEmptyRow = !hasEntries && (
                      emptyRows.some(r => r.projectId === project._id && r.taskId === task._id) ||
                      manuallyAddedRows.some(r => r.projectId === project._id && r.taskId === task._id)
                    )

                    return (
                      <tr key={`${project._id}-${task._id}`} className="border-t">
                        <td className="p-3 font-normal">
                          <span className="font-bold">{project.name}</span> - {task.name}
                        </td>
                        {days.map((hours, i) => {
                          const isEditing = inlineEditingCell?.projectId === project._id && 
                                          inlineEditingCell?.taskId === task._id && 
                                          inlineEditingCell?.dayIndex === i
                          const cellId = `${project._id}-${task._id}-${i}`
                          const isSaving = savingCellId === cellId

                          return (
                            <td
                              key={i}
                              className={`p-1 text-center border bg-gray-100 hover:bg-gray-200 relative ${
                                shouldDisableAddEntry ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                              } ${isSaving ? 'opacity-75' : ''}`}
                              onClick={() => !shouldDisableAddEntry && !isSaving && handleCellClick(project._id, project.name, task._id, task.name, i)}
                            >
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={inlineEditingValue}
                                  onChange={(e) => setInlineEditingValue(e.target.value)}
                                  onBlur={handleInlineEditSave}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleInlineEditSave()
                                    if (e.key === 'Escape') {
                                      setInlineEditingCell(null)
                                      setInlineEditingValue('')
                                    }
                                  }}
                                  autoFocus
                                  className="w-[70px] py-1.5 text-center bg-white border focus:border-black rounded"
                                />
                              ) : (
                                <span>{hours > 0 ? formatSimpleTime(hours) : '0:00'}</span>
                              )}
                            </td>
                          )
                        })}
                        <td className="p-3 text-right font-bold">
                          <div className="flex items-center justify-end gap-2">
                            <span>{formatSimpleTime(days.reduce((a, b) => a + b, 0))}</span>
                            {(hasEntries || isEmptyRow) && !shouldDisableAddEntry && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (hasEntries) {
                                    handleDeleteProjectTaskRow(project._id, task._id)
                                  } else {
                                    handleDeleteEmptyRow(project._id, task._id)
                                  }
                                }}
                                disabled={deletingRowId === `${project._id}-${task._id}`}
                                className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                              >
                                {deletingRowId === `${project._id}-${task._id}` ? (
                                  <div className="w-4 h-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                                ) : (
                                  <FiTrash2 className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {Object.keys(entriesByProjectAndTask).length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center py-12 text-gray-500">
                        No time entries found for this week.
                      </td>
                    </tr>
                  )}
                </tbody>
                {Object.keys(entriesByProjectAndTask).length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 bg-gray-50">
                      <td className="p-3 font-bold text-gray-900">Total</td>
                      {weekDays.map((day, index) => {
                        const dayDateStr = format(day, 'yyyy-MM-dd')
                        const dayTotal = (timesheet?.entries || [])
                          .filter(e => e.date === dayDateStr)
                          .reduce((sum, entry) => sum + (entry.hours || 0), 0)
                        return (
                          <td key={index} className="p-3 text-center font-bold text-gray-900">
                            {dayTotal > 0 ? formatSimpleTime(dayTotal) : '0:00'}
                          </td>
                        )
                      })}
                      <td className="p-3 text-right font-bold text-gray-900">
                        {formatSimpleTime(timesheet?.totalHours || 0)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </>
      )}

      {/* Day View - design aligned with UserDashboard calendar/day view */}
      {viewMode === 'day' && (
        <>
          {/* Week days row */}
          <div className="grid grid-cols-7 gap-2 border-b border-gray-200">
            {weekDays.map((day) => {
              const isSelected = format(day, 'yyyy-MM-dd') === format(currentDate, 'yyyy-MM-dd')
              const isDayToday = isToday(day)
              const dayTotal = (timesheet?.entries || [])
                .filter(e => e.date === format(day, 'yyyy-MM-dd'))
                .reduce((sum, entry) => sum + (entry.hours || 0), 0)
              return (
                <button
                  key={day.toString()}
                  type="button"
                  onClick={() => setCurrentDate(day)}
                  className={`
                    p-3 text-left min-h-[60px] flex flex-col justify-center hover:theme-color
                    ${isSelected
                      ? 'theme-color border-b-2 theme-color-border font-semibold'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <div className={`text-xs font-medium mb-1 ${isDayToday && isSelected ? 'theme-color' : ''}`}>
                    {format(day, 'EEE')}
                  </div>
                  {dayTotal > 0 ? (
                    <div className={`text-xs ${isSelected ? 'theme-color font-medium' : ''}`}>
                      {formatSimpleTime(dayTotal)}
                    </div>
                  ) : (
                    <div className="text-xs">0:00</div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Project-wise time entries (matching UserDashboard) */}
          <div className="pt-6">
            {getDayEntries().length > 0 ? (
              <div className="space-y-6">
                {groupDayEntriesByProject(getDayEntries()).map((projectGroup) => (
                  <div key={projectGroup.projectId} className="border-b border-[#1d1e1c40] pb-4">
                    <div className="flex items-center justify-between md:px-4">
                      <div className="flex items-center space-x-3">
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
                    </div>

                    <div className="divide-y divide-[#1d1e1c40]">
                      {projectGroup.entries.map((entry) => (
                        <div
                          key={entry._key}
                          className={`md:px-4 py-4 flex justify-between items-center hover:bg-slate-50 ${entry.isRunning ? '' : ''}`}
                        >
                          <div>
                            <div className="flex items-center md:gap-4 flex-wrap gap-2">
                              <p className="font-medium text-gray-900">
                                {projectGroup.projectName} - {entry.task?.name || 'No Task'}
                              </p>
                              <span
                                className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                  entry.isBillable ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
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
                              {entry.isRunning ? (
                                <span className="font-mono text-green-600">{formatTimerElapsed(timerElapsed)}</span>
                              ) : (
                                formatSimpleTime(entry.hours)
                              )}
                            </p>
                            <div className="flex items-center md:space-x-1 flex-wrap">
                              {!entry.isRunning && isUserView && entry.task?._id && (
                                <button
                                  onClick={() => handleStartTimerFromEntry(entry)}
                                  disabled={
                                    startingTimerEntryKey === entry._key ||
                                    shouldDisableAddEntry
                                  }
                                  className="p-2 text-gray-400 hover:theme-color disabled:opacity-50 disabled:cursor-not-allowed"
                                  title={hasRunningTimerEntry ? 'Start timer (stops current timer and adds its time to that row)' : 'Start timer'}
                                >
                                  {startingTimerEntryKey === entry._key ? (
                                    <div className="w-4 h-4 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
                                  ) : (
                                    <FiPlay className="w-4 h-4" />
                                  )}
                                </button>
                              )}
                              {entry.isRunning && (
                                <button
                                  onClick={handleStopTimer}
                                  className="p-2 text-red-500 hover:text-red-700 disabled:opacity-50"
                                  title="Stop timer"
                                >
                                  <FiPause className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => setEditingEntry(entry)}
                                disabled={shouldDisableAddEntry}
                                className="p-2 text-gray-400 hover:theme-color disabled:opacity-50 disabled:cursor-not-allowed"
                                title={shouldDisableAddEntry ? 'Cannot edit' : 'Edit entry'}
                              >
                                <FiEdit2 className="w-4 h-4" />
                              </button>
                              {!shouldDisableAddEntry && (
                                <button
                                  onClick={async () => {
                                    if (confirm('Delete this entry?')) {
                                      await deleteEntry(entry._key)
                                      toast.success('Entry deleted')
                                      await fetchTimesheet()
                                    }
                                  }}
                                  className="p-2 text-gray-400 hover:text-red-600"
                                  title="Delete entry"
                                >
                                  <FiTrash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <FiClock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg mb-2">
                  No time entries for {format(currentDate, 'EEEE, MMMM d, yyyy')}
                </p>
                <p className="text-gray-400 text-sm mb-4">
                  {(timesheet?.entries?.length ?? 0) > 0
                    ? 'Try selecting a different date or add a new time entry'
                    : 'Add a new time entry to get started'}
                </p>
                {(timesheet?.entries?.length ?? 0) > 0 && (
                  <p className="text-xs text-gray-400">
                    This week has {timesheet?.entries?.length ?? 0} entries across{' '}
                    {[...new Set((timesheet?.entries ?? []).map(e => e.date))].length} days
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Footer Actions */}
      <div className="flex justify-between items-center mt-4 gap-2 flex-wrap">
        <div className="flex space-x-2">
          {viewMode === 'week' ? (
            <button
              onClick={() => {
                fetchProjectsWithTasks()
                setShowAddRowModal(true)
              }}
              disabled={shouldDisableAddEntry}
              className={`btn-primary px-4 py-2 text-sm font-semibold rounded-md flex items-center gap-2 ${
                shouldDisableAddEntry ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <FiPlus className="w-4 h-4" />
              Add Row
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  fetchProjectsWithTasks()
                  if (viewMode === 'day') {
                    setNewEntryDate(format(currentDate, 'yyyy-MM-dd'))
                  } else {
                    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
                    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 })
                    const now = new Date()
                    const inWeek = now >= weekStart && now <= weekEnd
                    setNewEntryDate(format(inWeek ? now : weekStart, 'yyyy-MM-dd'))
                  }
                  setNewEntryMode('manual')
                  setShowNewEntryModal(true)
                }}
                disabled={shouldDisableAddEntry}
                className={`btn-primary px-4 py-2 text-sm font-semibold rounded-md flex items-center gap-2 ${
                  shouldDisableAddEntry ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <FiPlus className="w-4 h-4" />
                Add Time Entry
              </button>
              {/* {!hasRunningTimerEntry && !shouldDisableAddEntry && (
                <button
                  onClick={() => {
                    fetchProjectsWithTasks()
                    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
                    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 })
                    const now = new Date()
                    const inWeek = now >= weekStart && now <= weekEnd
                    setNewEntryDate(format(inWeek ? now : weekStart, 'yyyy-MM-dd'))
                    // Allow timer functionality for all roles when viewing own timesheet
                    // If _userId is not provided, assume own timesheet
                    if (session?.user?.id && (!_userId || _userId === session.user.id)) {
                      setNewEntryMode('timer')
                      setShowNewEntryModal(true)
                    } else {
                      setShowAddRowModal(true)
                    }
                  }}
                  className="px-4 py-2 border border-gray-300 text-sm font-semibold rounded-md bg-white hover:bg-gray-50 flex items-center gap-2"
                >
                  <FiPlay className="w-4 h-4" />
                  Start Timere
                </button>
              )} */}
            </>
          )}
          {/* Show "Copy from Previous Timesheet" button when no project rows (week or day view) */}
          {(() => {
            const hasNoEntries = viewMode === 'day' 
              ? getDayEntries().length === 0 
              : Object.keys(entriesByProjectAndTask).length === 0
            return hasNoEntries && !shouldDisableAddEntry && (
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
            )
          })()}

          {savingCellId && (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-md">
              <div className="w-4 h-4 animate-spin rounded-full border-2 border-primary-600 border-t-transparent"></div>
              <span className="text-sm text-gray-700">Saving...</span>
            </div>
          )}
        </div>

        <button
          onClick={handleSubmitWeekForApproval}
          className={`btn-secondary px-4 py-2 text-sm font-semibold rounded-md inline-flex items-center justify-center gap-2 min-w-[200px] ${
            isWeekApproved || !timesheet?.entries?.length || hasRunningTimerEntry || isSubmittingWeek
              ? 'opacity-50 cursor-not-allowed'
              : ''
          }`}
          disabled={isWeekApproved || !timesheet?.entries?.length || hasRunningTimerEntry || isSubmittingWeek}
        >
          {isSubmittingWeek ? (
            <>
              <div className="w-4 h-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {isWeekPending ? 'Resubmitting...' : 'Submitting...'}
            </>
          ) : (
            isWeekPending ? 'Resubmit Week for Approval' : 'Submit Week for Approval'
          )}
        </button>
      </div>

      {/* Add Row Modal */}
      {showAddRowModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowAddRowModal(false)} />
            <div className="relative bg-white rounded-lg p-6 max-w-lg w-full">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Add Row</h3>
                <button onClick={() => setShowAddRowModal(false)} className="text-gray-400 hover:text-gray-600">
                  <FiX className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Project</label>
                  <select
                    value={addRowSelectedProject}
                    onChange={(e) => handleAddRowProjectChange(e.target.value)}
                    className="mt-1 block w-full border-gray-300 rounded-md"
                  >
                    <option value="">Select Project</option>
                    {projectsWithTasks.map(p => (
                      <option key={p._id} value={p._id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Task</label>
                  <select
                    value={addRowSelectedTask}
                    onChange={(e) => setAddRowSelectedTask(e.target.value)}
                    disabled={!addRowSelectedProject}
                    className="mt-1 block w-full border-gray-300 rounded-md disabled:bg-gray-100"
                  >
                    <option value="">Select Task</option>
                    {addRowTasks.map(t => (
                      <option key={t._id} value={t._id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => setShowAddRowModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddRow}
                    disabled={!addRowSelectedProject || !addRowSelectedTask}
                    className="btn-primary px-4 py-2 rounded-md disabled:opacity-50"
                  >
                    Add Row
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Entry Modal - Date picker for week; user view: task grouped by Billable/Non-Billable */}
      {showNewEntryModal && (() => {
        // Allow timer functionality for all roles (user, manager, admin) when viewing their own timesheet
        // If _userId is not provided (e.g., admin/manager viewing from /admin/timesheets), assume own timesheet
        const isUserView = !!(session?.user?.id && (!_userId || _userId === session.user.id))
        const newEntryProjectData = newEntryProject ? projectsWithTasks.find(p => p._id === newEntryProject) : null
        const activeTasksForProject = (newEntryProjectData?.tasks || []).filter(t => !t.isArchived)
        const billableTasks = activeTasksForProject.filter(t => t.isBillable === true)
        const nonBillableTasks = activeTasksForProject.filter(t => t.isBillable === false)
        return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => { setShowNewEntryModal(false); setNewEntryDate(''); setNewEntryMode('manual') }} />
            <div className="relative bg-white rounded-lg p-6 max-w-lg w-full">
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <div className="flex items-center space-x-3 flex-wrap">
                  {isUserView && (
                    <button
                      type="button"
                      onClick={() => setNewEntryMode(prev => prev === 'timer' ? 'manual' : 'timer')}
                      disabled={isSubmittingEntry}
                      className="text-sm px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {newEntryMode === 'timer' ? 'Switch to Manual' : 'Switch to Timer'}
                    </button>
                  )}
                  <h3 className="text-lg font-medium">
                    {isUserView && newEntryMode === 'timer' ? 'Start Timer' : 'Add Time Entry'}
                    {newEntryDate ? ` – ${format(parseISO(newEntryDate), 'EEE, MMM d')}` : ''}
                  </h3>
                </div>
                <button onClick={() => { setShowNewEntryModal(false); setNewEntryDate(''); setNewEntryMode('manual') }} className="text-gray-400 hover:text-gray-600">
                  <FiX className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Project</label>
                  <select
                    value={newEntryProject}
                    onChange={(e) => handleNewEntryProjectChange(e.target.value)}
                    className="mt-1 block w-full border-gray-300 rounded-md focus:ring-transparent focus:border-black"
                  >
                    <option value="">Select Project</option>
                    {projectsWithTasks.map(p => (
                      <option key={p._id} value={p._id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Task</label>
                  <select
                    value={newEntryTask}
                    onChange={(e) => setNewEntryTask(e.target.value)}
                    disabled={!newEntryProject}
                    className="mt-1 block w-full border-gray-300 rounded-md disabled:bg-gray-100 focus:ring-transparent focus:border-black"
                  >
                    <option value="">Select Task</option>
                    {isUserView ? (
                      <>
                        {billableTasks.length > 0 && (
                          <optgroup label="Billable Tasks">
                            {billableTasks.map(t => (
                              <option key={t._id} value={t._id}>&nbsp;&nbsp;{t.name}</option>
                            ))}
                          </optgroup>
                        )}
                        {nonBillableTasks.length > 0 && (
                          <optgroup label="Non-Billable Tasks">
                            {nonBillableTasks.map(t => (
                              <option key={t._id} value={t._id}>&nbsp;&nbsp;{t.name}</option>
                            ))}
                          </optgroup>
                        )}
                        {activeTasksForProject.length === 0 && (
                          <option value="" disabled>No tasks available for this project</option>
                        )}
                      </>
                    ) : (
                      newEntryTasks.map(t => (
                        <option key={t._id} value={t._id}>{t.name}</option>
                      ))
                    )}
                  </select>
                </div>
                
                {(!isUserView || newEntryMode === 'manual') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Hours (decimal or H:MM format)</label>
                  <input
                    type="text"
                    value={newEntryHoursDisplay || newEntryHours}
                    onChange={(e) => {
                      const input = e.target.value
                      setNewEntryHoursDisplay(input)
                      setNewEntryHours(input)
                      setNewEntryHoursError('')
                    }}
                    onBlur={(e) => {
                      const input = e.target.value.trim()
                      if (!input) {
                        setNewEntryHoursDisplay('')
                        setNewEntryHours('')
                        return
                      }

                      const normalized = normalizeTimeInput(input)
                      if (normalized) {
                        const parsed = parseTimeInput(normalized)
                        if (parsed !== null && !isNaN(parsed) && parsed > 0 && parsed <= 24) {
                          const rounded = formatDecimalHours(parsed)
                          setNewEntryHours(rounded.toString())
                          setNewEntryHoursDisplay(normalized)
                          setNewEntryHoursError('')
                        } else {
                          setNewEntryHoursError('Invalid time. Maximum is 24:00.')
                        }
                      } else {
                        setNewEntryHoursError('Invalid format. Use decimal (e.g., 2.2) or H:MM format (e.g., 2:30). Range: 0:01 to 24:00.')
                      }
                    }}
                    placeholder="2.2 or 2:30"
                    className={`mt-1 focus:ring-transparent focus:border-black block w-full shadow-sm sm:text-sm rounded-md ${
                      isValidTimeFormat(newEntryHoursDisplay || newEntryHours) ? 'border-gray-300' : 'border-red-300'
                    }`}
                  />
                  {newEntryHoursError && <p className="text-red-500 text-xs mt-1">{newEntryHoursError}</p>}
                  <p className="text-xs text-gray-500 mt-1">Enter time in decimal (e.g., 2.2 for 2 hours 12 minutes) or H:MM format (e.g., 2:30)</p>
                </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Notes</label>
                  <textarea
                    value={newEntryNotes}
                    onChange={(e) => setNewEntryNotes(e.target.value)}
                    rows={3}
                    placeholder="Optional notes..."
                    className="mt-1 block w-full border-gray-300 rounded-md focus:ring-transparent focus:border-black"
                  />
                </div>
                
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => { setShowNewEntryModal(false); setNewEntryDate(''); setNewEntryMode('manual') }}
                    className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  {isUserView && newEntryMode === 'timer' ? (
                    <button
                      type="button"
                      onClick={handleStartTimerFromModal}
                      disabled={!newEntryProject || !newEntryTask || !newEntryDate || isSubmittingEntry}
                      className="btn-primary px-4 py-2 rounded-md disabled:opacity-50 flex items-center gap-2"
                    >
                      {isSubmittingEntry ? (
                        <>
                          <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Starting...
                        </>
                      ) : (
                        <>
                          <FiPlay className="w-4 h-4" />
                          Start Timer
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleAddNewEntry}
                      disabled={!newEntryProject || !newEntryTask || !newEntryDate || isSubmittingEntry}
                      className="btn-primary px-4 py-2 rounded-md disabled:opacity-50"
                    >
                      {isSubmittingEntry ? 'Adding...' : 'Add Entry'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        )
      })()}

      {/* Edit Entry Modal */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            {/* Background overlay */}
            <div 
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={() => setEditingEntry(null)}
            />
            
            {/* Modal panel */}
            <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Edit Time Entry</h3>
                <button
                  onClick={() => setEditingEntry(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>
              
              <EditEntryForm
                entry={editingEntry}
                projectsWithTasks={projectsWithTasks}
                onSave={async (data) => {
                  await updateEntry(editingEntry._key, data)
                  toast.success('Entry updated')
                  setEditingEntry(null)
                  await fetchTimesheet()
                }}
                onDelete={async () => {
                  await deleteEntry(editingEntry._key)
                  toast.success('Entry deleted')
                  setEditingEntry(null)
                  await fetchTimesheet()
                }}
                onCancel={() => setEditingEntry(null)}
                fetchProjectsWithTasks={fetchProjectsWithTasks}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Parse time input helper function (matches Timesheet.tsx logic)
function parseTimeInputForEdit(input: string): number | null {
  if (!input || input.trim() === '') return null

  const trimmed = input.trim()

  // Check for decimal format (e.g., "2.5" or "2.25")
  const decimalMatch = trimmed.match(/^(\d*\.?\d+)$/)
  if (decimalMatch) {
    const decimalValue = parseFloat(decimalMatch[1])
    if (isNaN(decimalValue) || decimalValue < 0 || decimalValue > 24) {
      return null
    }
    return decimalValue
  }

  // Check for H:MM format (e.g., "2:30")
  const timeMatch = trimmed.match(/^(\d+):?(\d*)$/)
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
      return null
    }

    return hours + (minutes / 60)
  }

  return null
}

// Edit Entry Form Component
function EditEntryForm({
  entry,
  projectsWithTasks,
  onSave,
  onDelete,
  onCancel,
  fetchProjectsWithTasks,
}: {
  entry: TimesheetEntry
  projectsWithTasks: ProjectWithTasks[]
  onSave: (data: { projectId?: string; taskId?: string; date?: string; hours?: number; notes?: string }) => Promise<void>
  onDelete: () => Promise<void>
  onCancel: () => void
  fetchProjectsWithTasks: () => Promise<void>
}) {
  const [project, setProject] = useState(entry.project._id)
  const [task, setTask] = useState(entry.task?._id || '')
  const [date, setDate] = useState(entry.date || '')
  const [hours, setHours] = useState(formatSimpleTime(entry.hours))
  const [notes, setNotes] = useState(entry.notes || '')
  const [tasks, setTasks] = useState<Task[]>([])
  const [billableTasks, setBillableTasks] = useState<Task[]>([])
  const [nonBillableTasks, setNonBillableTasks] = useState<Task[]>([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [hoursError, setHoursError] = useState<string | null>(null)

  useEffect(() => {
    fetchProjectsWithTasks()
  }, [fetchProjectsWithTasks])

  useEffect(() => {
    const proj = projectsWithTasks.find(p => p._id === project)
    const allTasks = (proj?.tasks || []).filter(t => !t.isArchived)
    setTasks(allTasks)
    setBillableTasks(allTasks.filter(t => t.isBillable))
    setNonBillableTasks(allTasks.filter(t => !t.isBillable))
  }, [project, projectsWithTasks])

  // Validate hours on change
  useEffect(() => {
    if (hours.trim()) {
      const parsed = parseTimeInputForEdit(hours)
      if (parsed === null) {
        setHoursError('Invalid format. Use H:MM (e.g., 2:30) or decimal (e.g., 2.5)')
      } else {
        setHoursError(null)
      }
    } else {
      setHoursError(null)
    }
  }, [hours])

  const handleSave = async () => {
    const parsedHours = hours.trim() ? parseTimeInputForEdit(hours) : null
    
    if (hours.trim() && parsedHours === null) {
      toast.error('Invalid time format. Use H:MM (e.g., 2:30) or decimal (e.g., 2.5)')
      return
    }

    const hoursValue = parsedHours !== null ? parsedHours : entry.hours
    
    setSaving(true)
    try {
      await onSave({
        projectId: project,
        taskId: task,
        date,
        hours: formatDecimalHours(hoursValue),
        notes,
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this time entry?')) {
      return
    }
    setDeleting(true)
    try {
      await onDelete()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700">Project</label>
        <select
          value={project}
          onChange={(e) => {
            setProject(e.target.value)
            setTask('')
          }}
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-transparent focus:border-black sm:text-sm rounded-md"
        >
          {projectsWithTasks.map(p => (
            <option key={p._id} value={p._id}>{p.name}</option>
          ))}
        </select>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">Task</label>
        <select
          value={task}
          onChange={(e) => setTask(e.target.value)}
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-transparent focus:border-black sm:text-sm rounded-md"
        >
          <option value="">Select Task</option>
          {billableTasks.length > 0 && (
            <optgroup label="Billable">
              {billableTasks.map(t => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </optgroup>
          )}
          {nonBillableTasks.length > 0 && (
            <optgroup label="Non-billable">
              {nonBillableTasks.map(t => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="mt-1 focus:ring-transparent focus:border-black block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">Hours (decimal or H:MM format)</label>
        <input
          type="text"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className={`mt-1 focus:ring-transparent focus:border-black block w-full shadow-sm sm:text-sm rounded-md ${hoursError ? 'border-red-300' : 'border-gray-300'}`}
          placeholder="2.5 or 2:30"
        />
        {hoursError && (
          <p className="text-red-500 text-xs mt-1">{hoursError}</p>
        )}
        <p className="text-xs text-gray-500 mt-1">Enter time in decimal (e.g., 2.5 for 2 hours 30 minutes) or H:MM format (e.g., 2:30)</p>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Optional notes..."
          className="mt-1 focus:ring-transparent focus:border-black block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
        />
      </div>
      
      <div className="flex justify-end items-center mt-4">
        <button
          type="button"
          onClick={handleDelete}
          disabled={saving || deleting}
          className="mr-4 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
        >
          {deleting ? 'Deleting...' : 'Delete Entry'}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || deleting}
          className="btn-primary inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
        >
          {saving ? 'Updating...' : 'Update Entry'}
        </button>
      </div>
    </div>
  )
}
