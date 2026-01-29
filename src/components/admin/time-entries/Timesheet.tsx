'use client'

import { useEffect, useState } from 'react'
import { sanityFetch, updateSanityDocument } from '@/lib/sanity'
import { formatSimpleTime, formatDecimalHours } from '@/lib/time'
import { format, startOfWeek, endOfWeek, addDays, subDays, isSameWeek, isToday, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { FiChevronLeft, FiChevronRight, FiTrash2, FiX, FiPlus, FiClock } from 'react-icons/fi'
import { useSession } from 'next-auth/react'
import NewTimeEntryForm from './NewTimeEntryForm'


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
  }
  date: string
  hours: number
  notes?: string
  isBillable?: boolean
  isLocked?: boolean
  isApproved?: boolean
  submittedAt?: string
}

interface User {
  _id: string
  firstName: string
  lastName: string
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

// Empty row represents a project-task combination to show in the week view without entries
interface EmptyRow {
  projectId: string
  projectName: string
  taskId: string
  taskName: string
}

export default function Timesheet() {
  const { data: session } = useSession()
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [loading, setLoading] = useState(true)
  // Initialize currentDate from localStorage or default to today
  const [currentDate, setCurrentDate] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('admin_timesheet_viewed_week')
      if (stored) {
        const parsedDate = parseISO(stored)
        if (!isNaN(parsedDate.getTime())) {
          return parsedDate
        }
      }
    }
    return new Date()
  })

  const [viewMode, setViewMode] = useState<'week' | 'day'>('week') // Default to week view
  const [projects, setProjects] = useState<Project[]>([])
  const [projectsWithTasks, setProjectsWithTasks] = useState<ProjectWithTasks[]>([])
  const [inlineEditingCell, setInlineEditingCell] = useState<{ projectId: string; projectName: string; taskId: string; taskName: string; dayIndex: number } | null>(null);
  const [inlineEditingValue, setInlineEditingValue] = useState('');
  const [inlineEditingOriginalValue, setInlineEditingOriginalValue] = useState('');
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null);
  const [savingCellId, setSavingCellId] = useState<string | null>(null);
  const [showNewEntryModal, setShowNewEntryModal] = useState(false);
  const [showAddRowModal, setShowAddRowModal] = useState(false);
  const [copyingEntries, setCopyingEntries] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  
  // State for Add Row modal
  const [addRowSelectedProject, setAddRowSelectedProject] = useState('');
  const [addRowSelectedTask, setAddRowSelectedTask] = useState('');
  const [addRowTasks, setAddRowTasks] = useState<Task[]>([]);
  
  // State for copying previous week rows
  const [copyingPreviousWeekRows, setCopyingPreviousWeekRows] = useState(false);
  
  // Empty rows to show in week view (from previous week or manually added)
  const [emptyRows, setEmptyRows] = useState<EmptyRow[]>([]);
  // Manually added rows (persisted to localStorage, scoped by week)
  const [manuallyAddedRows, setManuallyAddedRows] = useState<EmptyRow[]>([]);
  // Deleted/excluded rows - rows user manually removed from auto-copy (persisted, scoped by week)
  const [deletedRows, setDeletedRows] = useState<string[]>([]); // Store as "projectId-taskId" keys
  // Track if localStorage data has been loaded (to prevent save on initial load)
  const [localStorageLoaded, setLocalStorageLoaded] = useState(false);

  // Get auto-fill project and task for new entries
  // Returns project and task from last entry for current date, or first available project/task
  const getAutoFillProjectAndTask = () => {
    const currentDateStr = format(currentDate, 'yyyy-MM-dd')
    const dayEntries = entries.filter(e => e.date === currentDateStr)
    
    // If there are entries for the current date, use the last entry's project and task
    if (dayEntries.length > 0) {
      const lastEntry = dayEntries[dayEntries.length - 1]
      if (lastEntry.project?._id && lastEntry.task?._id) {
        return {
          projectId: lastEntry.project._id,
          taskId: lastEntry.task._id
        }
      }
    }
    
    // Otherwise, use the first project and its first task
    // First try projectsWithTasks (has tasks included)
    if (projectsWithTasks.length > 0) {
      const firstProject = projectsWithTasks[0]
      const firstTask = firstProject.tasks && firstProject.tasks.length > 0 ? firstProject.tasks[0] : null
      return {
        projectId: firstProject._id,
        taskId: firstTask?._id || ''
      }
    }
    
    // Fallback to projects list if projectsWithTasks is not loaded yet
    // Note: This won't have tasks, but NewTimeEntryForm will fetch tasks when project is selected
    if (projects.length > 0) {
      return {
        projectId: projects[0]._id,
        taskId: '' // Tasks will be loaded by NewTimeEntryForm when project is selected
      }
    }
    
    return { projectId: '', taskId: '' }
  }

  // LocalStorage key for manually added rows - scoped by user and week
  const getStorageKey = () => {
    const weekStart = format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    return `timesheet_manual_rows_${session?.user?.id || 'guest'}_${weekStart}`;
  };

  // LocalStorage key for deleted/excluded rows - scoped by user and week
  const getDeletedRowsStorageKey = () => {
    const weekStart = format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    return `timesheet_deleted_rows_${session?.user?.id || 'guest'}_${weekStart}`;
  };

  // Load manually added rows and deleted rows from localStorage when week changes
  useEffect(() => {
    if (session?.user?.id && viewMode === 'week') {
      setLocalStorageLoaded(false); // Reset before loading
      
      // Compute keys directly using currentDate to avoid closure issues
      const weekStart = format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const manualRowsKey = `timesheet_manual_rows_${session.user.id}_${weekStart}`;
      const deletedRowsKey = `timesheet_deleted_rows_${session.user.id}_${weekStart}`;
      
      try {
        // Load manual rows
        const stored = localStorage.getItem(manualRowsKey);
        if (stored) {
          const parsed = JSON.parse(stored) as EmptyRow[];
          setManuallyAddedRows(parsed);
        } else {
          setManuallyAddedRows([]);
        }
        
        // Load deleted rows
        const deletedStored = localStorage.getItem(deletedRowsKey);
        if (deletedStored) {
          const parsedDeleted = JSON.parse(deletedStored) as string[];
          setDeletedRows(parsedDeleted);
        } else {
          setDeletedRows([]);
        }
      } catch (e) {
        console.error('Error loading rows from localStorage:', e);
        setManuallyAddedRows([]);
        setDeletedRows([]);
      }
      // Mark as loaded after setting state
      setTimeout(() => setLocalStorageLoaded(true), 0);
    }
  }, [session?.user?.id, currentDate, viewMode]);

  // Save manually added rows to localStorage when they change (only after initial load)
  useEffect(() => {
    if (session?.user?.id && viewMode === 'week' && localStorageLoaded) {
      if (manuallyAddedRows.length > 0) {
        try {
          localStorage.setItem(getStorageKey(), JSON.stringify(manuallyAddedRows));
        } catch (e) {
          console.error('Error saving manual rows to localStorage:', e);
        }
      } else {
        // Clear storage if no manual rows for this week
        localStorage.removeItem(getStorageKey());
      }
    }
  }, [manuallyAddedRows, session?.user?.id, currentDate, viewMode, localStorageLoaded]);

  // Save deleted rows to localStorage when they change (only after initial load)
  useEffect(() => {
    if (session?.user?.id && viewMode === 'week' && localStorageLoaded) {
      if (deletedRows.length > 0) {
        try {
          localStorage.setItem(getDeletedRowsStorageKey(), JSON.stringify(deletedRows));
        } catch (e) {
          console.error('Error saving deleted rows to localStorage:', e);
        }
      } else {
        localStorage.removeItem(getDeletedRowsStorageKey());
      }
    }
  }, [deletedRows, session?.user?.id, currentDate, viewMode, localStorageLoaded]);



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


  useEffect(() => {
    if (session?.user?.id) {
      fetchTimeEntries()
    }
  }, [currentDate, session, viewMode])

  // Persist current date/week to localStorage for page refresh persistence
  useEffect(() => {
    localStorage.setItem('admin_timesheet_viewed_week', format(currentDate, 'yyyy-MM-dd'))
  }, [currentDate])

  // Fetch previous week's project-task combinations for current week auto-population
  const fetchPreviousWeekRows = async (showToast = false) => {
    if (!session?.user?.id) return;
    
    const currentWeekStart = format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const previousWeekStart = format(subDays(startOfWeek(currentDate, { weekStartsOn: 1 }), 7), 'yyyy-MM-dd');
    const previousWeekEnd = format(subDays(endOfWeek(currentDate, { weekStartsOn: 1 }), 7), 'yyyy-MM-dd');
    
    // Compute storage key directly using the current week being viewed
    const deletedRowsKey = `timesheet_deleted_rows_${session.user.id}_${currentWeekStart}`;
    const manualRowsKey = `timesheet_manual_rows_${session.user.id}_${currentWeekStart}`;
    
    // Read deleted rows directly from localStorage to avoid timing issues
    let currentDeletedRows: string[] = [];
    try {
      const deletedStored = localStorage.getItem(deletedRowsKey);
      if (deletedStored) {
        currentDeletedRows = JSON.parse(deletedStored) as string[];
      }
    } catch (e) {
      console.error('Error reading deleted rows from localStorage:', e);
    }
    
    // Also read manually added rows from localStorage
    let currentManualRows: EmptyRow[] = [];
    try {
      const manualStored = localStorage.getItem(manualRowsKey);
      if (manualStored) {
        currentManualRows = JSON.parse(manualStored) as EmptyRow[];
      }
    } catch (e) {
      console.error('Error reading manual rows from localStorage:', e);
    }
    
    try {
      const previousEntries = await sanityFetch<TimeEntry[]>({
        query: `*[_type == "timeEntry" && user._ref == $userId && date >= $startDate && date <= $endDate] | order(project.name asc) { 
          _id, 
          project->{_id, name}, 
          task->{_id, name}
        }`,
        params: { 
          userId: session.user.id, 
          startDate: previousWeekStart, 
          endDate: previousWeekEnd 
        },
      });
      
      // Extract unique project-task combinations
      const uniqueRows: EmptyRow[] = [];
      const seenKeys = new Set<string>();
      
      // First, add existing entries to seen keys
      entries.forEach(entry => {
        seenKeys.add(`${entry.project._id}-${entry.task._id}`);
      });
      
      // Add manually added rows from localStorage (not state, which may be stale)
      currentManualRows.forEach(row => {
        seenKeys.add(`${row.projectId}-${row.taskId}`);
      });
      
      // Also add deleted rows to seen keys so they're excluded (from localStorage, not state)
      currentDeletedRows.forEach(key => {
        seenKeys.add(key);
      });
      
      previousEntries.forEach(entry => {
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
      
      setEmptyRows(uniqueRows);
      
      // If this is a manual copy (user clicked button), also save to manuallyAddedRows for persistence
      if (showToast) {
        if (uniqueRows.length > 0) {
          // Save to manuallyAddedRows so they persist across navigation
          // Also immediately save to localStorage to ensure persistence
          const updatedManualRows = [...currentManualRows];
          uniqueRows.forEach(row => {
            if (!updatedManualRows.some(p => p.projectId === row.projectId && p.taskId === row.taskId)) {
              updatedManualRows.push(row);
            }
          });
          
          // Immediately save to localStorage
          try {
            localStorage.setItem(manualRowsKey, JSON.stringify(updatedManualRows));
          } catch (e) {
            console.error('Error saving manual rows to localStorage:', e);
          }
          
          // Also update state
          setManuallyAddedRows(updatedManualRows);
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

  // Manual handler for copying previous week rows (for non-current weeks)
  const handleCopyPreviousWeekRows = async () => {
    setCopyingPreviousWeekRows(true);
    
    // Clear deleted rows when user explicitly clicks copy button
    // This allows re-copying rows that were previously deleted
    const currentWeekStart = format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const deletedRowsKey = `timesheet_deleted_rows_${session?.user?.id}_${currentWeekStart}`;
    localStorage.removeItem(deletedRowsKey);
    setDeletedRows([]);
    
    await fetchPreviousWeekRows(true);
    setCopyingPreviousWeekRows(false);
  };

  // Clear empty rows when changing weeks or view mode
  useEffect(() => {
    if (!localStorageLoaded) return;
    // Clear empty rows when switching weeks (manually added rows are loaded from localStorage)
    setEmptyRows([]);
  }, [currentDate, viewMode, localStorageLoaded]);

  const fetchProjects = async () => {
    try {
      const projectList = await sanityFetch<Project[]>({
        query: `*[_type == "project"]{_id, name}`,
      })
      setProjects(projectList)
    } catch (error) {
      console.error('Error fetching projects:', error)
      toast.error('Failed to load projects.')
    }
  }

  // Fetch projects with their tasks for Add Row modal
  const fetchProjectsWithTasks = async () => {
    try {
      const userRole = session?.user?.role;
      const userId = session?.user?.id;
      let projectQuery = '*[_type == "project" && isActive == true]{_id, name, tasks[]->{_id, name, isBillable, isArchived}}';
      let queryParams: Record<string, string> = {};

      if (userRole === 'manager') {
        // For managers, get projects where they are an active member (as Project Manager or Team Member)
        projectQuery = `*[_type == "project" && isActive == true && count(assignedUsers[user._ref == $userId && isActive == true]) > 0]{_id, name, tasks[]->{_id, name, isBillable, isArchived}}`;
        queryParams = { userId: userId! };
      }
      
      const projectList = await sanityFetch<ProjectWithTasks[]>({
        query: projectQuery,
        params: queryParams,
      });
      setProjectsWithTasks(projectList);
    } catch (error) {
      console.error('Error fetching projects with tasks:', error);
      toast.error('Failed to load projects.');
    }
  };

  const fetchTimeEntries = async () => {
    setLoading(true)
    try {
      let queryFilter = `user._ref == $userId`;
      let queryParams: any = { userId: session!.user!.id };

      // Always fetch entire week's entries (needed for day tabs in day view)
      const startDate = startOfWeek(currentDate, { weekStartsOn: 1 });
      const endDate = endOfWeek(currentDate, { weekStartsOn: 1 });
      queryFilter += ` && date >= $startDate && date <= $endDate`;
      queryParams.startDate = format(startDate, 'yyyy-MM-dd');
      queryParams.endDate = format(endDate, 'yyyy-MM-dd');

      const allTimeEntries = await sanityFetch<TimeEntry[]>(
        {
          query: `*[_type == "timeEntry" && ${queryFilter}] | order(project.name asc, date asc) { _id, user->{_id, firstName, lastName}, project->{_id, name}, task->{_id, name}, date, hours, notes, isBillable, isLocked, isApproved, submittedAt }`,
          params: queryParams,
        }
      )
      
      // Filter out unsubmitted entries from weeks that have approved entries
      // Create a Set of week keys (userId-weekStart) that have approved entries
      const weeksWithApprovals = new Set<string>()
      allTimeEntries.forEach(entry => {
        if (entry.isApproved && entry.isLocked) {
          const entryDate = parseISO(entry.date)
          const weekStart = format(startOfWeek(entryDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
          weeksWithApprovals.add(`${entry.user._id}-${weekStart}`)
        }
      })
      
      // Filter entries: exclude unsubmitted entries from weeks with approved entries
      const filteredEntries = allTimeEntries.filter(entry => {
        // If entry is approved, include it
        if (entry.isApproved && entry.isLocked) {
          return true
        }
        
        // If entry is unsubmitted, check if its week has any approved entries
        if (!entry.submittedAt) {
          const entryDate = parseISO(entry.date)
          const weekStart = format(startOfWeek(entryDate, { weekStartsOn: 1 }), 'yyyy-MM-dd')
          const weekKey = `${entry.user._id}-${weekStart}`
          return !weeksWithApprovals.has(weekKey)
        }
        
        // Include submitted/pending entries
        return true
      })
      
      setEntries(filteredEntries)
    } catch (error) {
      console.error('Error fetching time entries:', error)
      toast.error('Failed to load time entries')
    } finally {
      setLoading(false)
    }
  }

  const handlePrev = () => {
    if (viewMode === 'week') {
      const newDate = subDays(currentDate, 7);
      setCurrentDate(newDate);
      // Force reload from localStorage for the new week
      const weekStart = format(startOfWeek(newDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const manualRowsKey = `timesheet_manual_rows_${session?.user?.id}_${weekStart}`;
      const deletedRowsKey = `timesheet_deleted_rows_${session?.user?.id}_${weekStart}`;
      try {
        const stored = localStorage.getItem(manualRowsKey);
        if (stored) {
          setManuallyAddedRows(JSON.parse(stored) as EmptyRow[]);
        } else {
          setManuallyAddedRows([]);
        }
        const deletedStored = localStorage.getItem(deletedRowsKey);
        if (deletedStored) {
          setDeletedRows(JSON.parse(deletedStored) as string[]);
        } else {
          setDeletedRows([]);
        }
      } catch (e) {
        setManuallyAddedRows([]);
        setDeletedRows([]);
      }
      // Clear emptyRows - will be repopulated by useEffect for current week
      setEmptyRows([]);
    } else {
      setCurrentDate(subDays(currentDate, 1));
    }
  };

  const handleNext = () => {
    if (viewMode === 'week') {
      const newDate = addDays(currentDate, 7);
      setCurrentDate(newDate);
      // Force reload from localStorage for the new week
      const weekStart = format(startOfWeek(newDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const manualRowsKey = `timesheet_manual_rows_${session?.user?.id}_${weekStart}`;
      const deletedRowsKey = `timesheet_deleted_rows_${session?.user?.id}_${weekStart}`;
      try {
        const stored = localStorage.getItem(manualRowsKey);
        if (stored) {
          setManuallyAddedRows(JSON.parse(stored) as EmptyRow[]);
        } else {
          setManuallyAddedRows([]);
        }
        const deletedStored = localStorage.getItem(deletedRowsKey);
        if (deletedStored) {
          setDeletedRows(JSON.parse(deletedStored) as string[]);
        } else {
          setDeletedRows([]);
        }
      } catch (e) {
        setManuallyAddedRows([]);
        setDeletedRows([]);
      }
      // Clear emptyRows - will be repopulated by useEffect for current week
      setEmptyRows([]);
    } else {
      setCurrentDate(addDays(currentDate, 1));
    }
  };

  const handleDeleteEntry = async (entryId: string, skipConfirm = false) => {
    // Check for locked entries
    const entry = entries.find((e: any) => e._id === entryId)
    if (entry?.isLocked && entry?.isApproved) {
      toast.error('Cannot delete entry that has been approved')
      return
    }
    
    // Check if ANY entries in the same week are approved
    if (entry && hasAnyApprovedEntries) {
      toast.error('Cannot delete entries in a week that has approved entries')
      return
    }

    if (!skipConfirm && !confirm('Are you sure you want to delete this time entry?')) return

    try {
      const response = await fetch(`/api/time-entries/${entryId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to delete time entry')
      }

      toast.success('Time entry deleted successfully')
      fetchTimeEntries()
    } catch (error) {
      console.error('Error deleting entry:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to delete time entry')
    }
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
      const day = startOfWeek(currentDate, { weekStartsOn: 1 })
      return addDays(day, i)
    });
    const targetDate = weekDays[dayIndex];
    const dateString = format(targetDate, 'yyyy-MM-dd');

    const existingEntries = entries.filter(e => e.project._id === projectId && e.task._id === taskId && e.date === dateString);

    // Trim and check if empty
    const trimmedValue = inlineEditingValue.trim();

    // If input is empty, exit edit mode without saving (or delete if entries exist)
    if (!trimmedValue) {
      if (existingEntries.length > 0) {
        const cellId = `${projectId}-${taskId}-${dayIndex}`;
        setSavingCellId(cellId);
        // Optimistically remove entries from UI
        setEntries(prev => prev.filter(e => 
          !(e.project._id === projectId && e.task._id === taskId && e.date === dateString)
        ));
        setInlineEditingCell(null);
        setInlineEditingValue('');
        
        // Delete from server in background
        const deletePromises = existingEntries
          .filter(entry => !(entry.isLocked && entry.isApproved))
          .map(async (entry) => {
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
            fetchTimeEntries(); // Refresh on error to revert
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
    if (hoursValue === 0 && existingEntries.length > 0) {
      const cellId = `${projectId}-${taskId}-${dayIndex}`;
      setSavingCellId(cellId);
      // Optimistically remove entries from UI
      setEntries(prev => prev.filter(e => 
        !(e.project._id === projectId && e.task._id === taskId && e.date === dateString)
      ));
      setInlineEditingCell(null);
      setInlineEditingValue('');
      
      // Delete from server in background
      const deletePromises = existingEntries
        .filter(entry => !(entry.isLocked && entry.isApproved))
        .map(async (entry) => {
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
          fetchTimeEntries(); // Refresh on error to revert
        })
        .finally(() => {
          setSavingCellId(null);
        });
      return;
    }

    const roundedHours = formatDecimalHours(hoursValue);

    if (existingEntries.length > 0) {
      // If there are multiple entries, delete all except the first one, then update the first
      const firstEntry = existingEntries[0];

      if (firstEntry.isLocked && firstEntry.isApproved) {
        toast.error('Cannot update entry that has been approved');
        setInlineEditingCell(null);
        setInlineEditingValue('');
        return;
      }

      const cellId = `${projectId}-${taskId}-${dayIndex}`;
      setSavingCellId(cellId);
      // Optimistically update the entry in UI
      setEntries(prev => {
        const filtered = prev.filter(e => 
          !(e.project._id === projectId && e.task._id === taskId && e.date === dateString && e._id !== firstEntry._id)
        );
        return filtered.map(e => 
          e._id === firstEntry._id ? { ...e, hours: roundedHours } : e
        );
      });
      setInlineEditingCell(null);
      setInlineEditingValue('');

      // Update on server in background
      (async () => {
        try {
          // Delete all other entries if there are multiple
          if (existingEntries.length > 1) {
            const deletePromises = existingEntries
              .slice(1)
              .filter(entry => !(entry.isLocked && entry.isApproved))
              .map(async (entry) => {
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
              isBillable: firstEntry.isBillable
            }),
          });
          if (!response.ok) throw new Error('Failed to update entry');
          toast.success('Entry updated');
          // No refresh needed - optimistic update already shows correct data
        } catch (error) {
          console.error('Error updating entry:', error);
          toast.error('Failed to update entry');
          await fetchTimeEntries(); // Refresh on error to revert optimistic update
        } finally {
          setSavingCellId(null);
        }
      })();
    } else {
      // Create new entry - optimistically add to UI
      const tempId = `temp-${Date.now()}`;
      const newEntry: TimeEntry = {
        _id: tempId,
        user: { _id: session!.user!.id, firstName: '', lastName: '' },
        project: { _id: projectId, name: inlineEditingCell.projectName },
        task: { _id: taskId, name: inlineEditingCell.taskName },
        date: dateString,
        hours: roundedHours,
        notes: '',
        isBillable: true,
        isLocked: false,
        isApproved: false
      };
      
      const cellId = `${projectId}-${taskId}-${dayIndex}`;
      setSavingCellId(cellId);
      setEntries(prev => [...prev, newEntry]);
      setInlineEditingCell(null);
      setInlineEditingValue('');

      // Create on server in background
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
              userId: session!.user!.id
            }),
          });
          if (!response.ok) throw new Error('Failed to create entry');
          const createdEntry = await response.json();
          // Update temp entry with real ID from server
          setEntries(prev => prev.map(e => e._id === tempId ? { ...e, _id: createdEntry._id || createdEntry.id } : e));
          toast.success('Entry created');
        } catch (error) {
          console.error('Error creating entry:', error);
          toast.error('Failed to create entry');
          // Remove optimistic entry on error
          setEntries(prev => prev.filter(e => e._id !== tempId));
        } finally {
          setSavingCellId(null);
        }
      })();
    }
  };

  const handleCellClick = (projectId: string, projectName: string, taskId: string, taskName: string, dayIndex: number) => {
    const targetDate = viewMode === 'week' ? weekDays[dayIndex] : currentDate;
    const dateString = format(targetDate, 'yyyy-MM-dd');
    const existingEntries = entries.filter(e => e.project._id === projectId && e.task._id === taskId && e.date === dateString);

    // Always use inline editing - sum up hours if multiple entries exist
    setInlineEditingCell({ projectId, projectName, taskId, taskName, dayIndex });
    if (existingEntries.length > 0) {
      // Sum up all hours from multiple entries
      const totalHours = existingEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0);
      const formattedTime = formatSimpleTime(totalHours);
      setInlineEditingValue(formattedTime);
      setInlineEditingOriginalValue(formattedTime);
    } else {
      setInlineEditingValue('');
      setInlineEditingOriginalValue('');
    }
  };

  const handleDeleteProjectTaskRow = async (projectId: string, taskId: string) => {
    // Get all entries for this project-task combination across all days in the week
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
    const weekStartStr = format(weekStart, 'yyyy-MM-dd');
    const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

    const projectTaskEntries = entries.filter(
      e => e.project._id === projectId &&
        e.task._id === taskId &&
        e.date >= weekStartStr &&
        e.date <= weekEndStr
    );

    if (projectTaskEntries.length === 0) {
      // Check if it's an empty row (no entries but exists in emptyRows or manuallyAddedRows)
      handleDeleteEmptyRow(projectId, taskId);
      return;
    }

    // Check if any entry is locked (approved)
    const hasLockedEntries = projectTaskEntries.some(e => e.isLocked && e.isApproved);
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
    
    // Optimistically remove entries from UI immediately
    const previousEntries = [...entries];
    setEntries(prev => prev.filter(
      e => !(e.project._id === projectId && e.task._id === taskId && e.date >= weekStartStr && e.date <= weekEndStr)
    ));
    
    // Also remove from empty rows if present
    setEmptyRows(prev => prev.filter(r => !(r.projectId === projectId && r.taskId === taskId)));
    setManuallyAddedRows(prev => prev.filter(r => !(r.projectId === projectId && r.taskId === taskId)));
    
    // Add to deleted rows to prevent auto-copy
    const rowKey = `${projectId}-${taskId}`;
    setDeletedRows(prev => prev.includes(rowKey) ? prev : [...prev, rowKey]);
    
    toast.success('Row deleted');
    
    // Delete from server in background
    (async () => {
      try {
        const deletePromises = projectTaskEntries.map(async (entry) => {
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
      } catch (error) {
        console.error('Error deleting entries:', error);
        toast.error('Failed to delete some entries on server');
        // Revert optimistic update on error
        setEntries(previousEntries);
      } finally {
        setDeletingRowId(null);
      }
    })();
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const day = startOfWeek(currentDate, { weekStartsOn: 1 })
    return addDays(day, i)
  })

  // Combine entries with empty rows for week view
  const entriesByProjectAndTask = (() => {
    const result: Record<string, { project: { _id: string, name: string }, task: { _id: string, name: string }, days: number[] }> = {};
    
    // First, add all entries
    entries.forEach(entry => {
      const key = `${entry.project._id}-${entry.task._id}`;
      if (!result[key]) {
        result[key] = {
          project: entry.project,
          task: entry.task,
          days: Array(7).fill(0)
        };
      }
      const dayIndex = weekDays.findIndex(day => format(day, 'yyyy-MM-dd') === entry.date);
      if (dayIndex !== -1) {
        result[key].days[dayIndex] += entry.hours;
      }
    });
    
    // Then, add empty rows that don't have entries yet (only for current week in week view)
    // Merge both emptyRows (from previous week) and manuallyAddedRows (persisted)
    if (viewMode === 'week') {
      // Also read directly from localStorage to ensure we have the latest data
      let localStorageManualRows: EmptyRow[] = [];
      try {
        const weekStart = format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        const manualRowsKey = `timesheet_manual_rows_${session?.user?.id}_${weekStart}`;
        const stored = localStorage.getItem(manualRowsKey);
        if (stored) {
          localStorageManualRows = JSON.parse(stored) as EmptyRow[];
        }
      } catch (e) {
        console.error('Error reading manual rows from localStorage:', e);
      }
      
      // Merge emptyRows, state manuallyAddedRows, and localStorage manuallyAddedRows
      const allEmptyRows = [...emptyRows, ...manuallyAddedRows, ...localStorageManualRows];
      const seenKeys = new Set<string>();
      
      allEmptyRows.forEach(emptyRow => {
        const key = `${emptyRow.projectId}-${emptyRow.taskId}`;
        if (!result[key] && !seenKeys.has(key)) {
          seenKeys.add(key);
          result[key] = {
            project: { _id: emptyRow.projectId, name: emptyRow.projectName },
            task: { _id: emptyRow.taskId, name: emptyRow.taskName },
            days: Array(7).fill(0)
          };
        }
      });
    }
    
    return result;
  })();

  const handleSubmitWeekForApproval = async () => {
    if (!session?.user?.id) {
      toast.error('You must be logged in to Submit Week for Approval.');
      return;
    }

    const startDate = format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const endDate = format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');

    const isResubmit = entries.some(entry => entry.submittedAt && !entry.isApproved) &&
      entries.some(entry => !entry.submittedAt);
    const actionText = isResubmit ? 'resubmit' : 'submit';
    const confirmText = isResubmit
      ? `Are you sure you want to resubmit the week of ${startDate} to ${endDate} for approval?`
      : `Are you sure you want to submit the week of ${startDate} to ${endDate} for approval?`;

    if (!confirm(confirmText)) {
      return;
    }

    try {
      const response = await fetch('/api/time-entries/submit-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(`Failed to ${actionText} week for approval: ${errorData.message || response.statusText}`);
      }

      toast.success(`Week ${actionText}ted for approval successfully!`);
      fetchTimeEntries(); // Re-fetch entries to show pending status
    } catch (error: any) {
      console.error(`Error ${actionText}ting week for approval:`, error);
      toast.error(error.message || `Failed to ${actionText} week for approval.`);
    }
  };

  // Handle delete empty row (row without entries, just from emptyRows state or manuallyAddedRows)
  const handleDeleteEmptyRow = (projectId: string, taskId: string) => {
    const rowKey = `${projectId}-${taskId}`;
    
    // Check if this row was from auto-copy (emptyRows) - if so, track it so it doesn't come back
    const isFromAutoCopy = emptyRows.some(r => r.projectId === projectId && r.taskId === taskId);
    if (isFromAutoCopy) {
      // Add to deleted rows so it won't be auto-copied again
      setDeletedRows(prev => {
        if (!prev.includes(rowKey)) {
          return [...prev, rowKey];
        }
        return prev;
      });
    }
    
    // Remove from both emptyRows and manuallyAddedRows state
    setEmptyRows(prev => prev.filter(r => !(r.projectId === projectId && r.taskId === taskId)));
    setManuallyAddedRows(prev => prev.filter(r => !(r.projectId === projectId && r.taskId === taskId)));
    
    // Also update localStorage immediately to ensure the row is removed
    try {
      const weekStart = format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      const manualRowsKey = `timesheet_manual_rows_${session?.user?.id}_${weekStart}`;
      const stored = localStorage.getItem(manualRowsKey);
      if (stored) {
        const storedRows = JSON.parse(stored) as EmptyRow[];
        const updatedRows = storedRows.filter(r => !(r.projectId === projectId && r.taskId === taskId));
        localStorage.setItem(manualRowsKey, JSON.stringify(updatedRows));
      }
    } catch (e) {
      console.error('Error updating localStorage:', e);
    }
    
    toast.success('Row removed');
  };

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
    
    // Check if row already exists
    const key = `${addRowSelectedProject}-${addRowSelectedTask}`;
    const existsInEntries = entries.some(e => `${e.project._id}-${e.task._id}` === key);
    const existsInEmptyRows = emptyRows.some(r => `${r.projectId}-${r.taskId}` === key);
    const existsInManualRows = manuallyAddedRows.some(r => `${r.projectId}-${r.taskId}` === key);
    
    if (existsInEntries || existsInEmptyRows || existsInManualRows) {
      toast.error('This project-task combination already exists in the timesheet.');
      setShowAddRowModal(false);
      setAddRowSelectedProject('');
      setAddRowSelectedTask('');
      return;
    }
    
    // Add to manually added rows (persisted to localStorage)
    setManuallyAddedRows(prev => [...prev, {
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

  const handleCopyPreviousDayEntries = async () => {
    if (!session?.user?.id) {
      toast.error('You must be logged in to copy entries.');
      return;
    }

    const currentDayStr = format(currentDate, 'yyyy-MM-dd');
    setCopyingEntries(true);

    try {
      // Find the most recent day with entries (looking back up to 30 days)
      let sourceDate = subDays(currentDate, 1);
      let sourceDayStr = format(sourceDate, 'yyyy-MM-dd');
      let sourceEntries: TimeEntry[] = [];

      // Try up to 30 days back to find entries
      for (let i = 0; i < 30; i++) {
        const dayEntries = await sanityFetch<TimeEntry[]>(
          {
            query: `*[_type == "timeEntry" && user._ref == $userId && date == $sourceDayStr] | order(project.name asc, task.name asc) { _id, user->{_id, firstName, lastName}, project->{_id, name}, task->{_id, name}, date, hours, notes, isBillable }`,
            params: { userId: session.user.id, sourceDayStr },
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
        setCopyingEntries(false);
        return;
      }

      if (!confirm(`Copy all time entries from ${format(sourceDate, 'MMM d, yyyy')} to ${format(currentDate, 'MMM d, yyyy')}?`)) {
        setCopyingEntries(false);
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
      fetchTimeEntries(); // Refresh the view
    } catch (error: any) {
      console.error('Error copying previous day entries:', error);
      toast.error(error.message || 'Failed to Copy rows from most recent timesheet entries.');
    } finally {
      setCopyingEntries(false);
    }
  };

  // Check week status: pending = submittedAt exists but not approved, approved = isApproved && isLocked
  const isWeekPending = entries.length > 0 && entries.some(entry => entry.submittedAt && !entry.isApproved);
  const isWeekApproved = entries.length > 0 && entries.every(entry => entry.isApproved && entry.isLocked);
  // Only lock if all entries are approved (isLocked is only true after approval)
  const isWeekLocked = entries.length > 0 && entries.every(entry => entry.isLocked && entry.isApproved);
  
  // If ANY entry in the week is approved, disable all editing/resubmission
  const hasAnyApprovedEntries = entries.length > 0 && entries.some(entry => entry.isApproved && entry.isLocked);
  
  const isCurrentWeek = isSameWeek(currentDate, new Date(), { weekStartsOn: 1 });

  // Check if it's a past week by comparing week start dates
  const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const viewedWeekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const isPastWeek = viewedWeekStart < currentWeekStart;

  // For day view, check if the day is in the past and has locked (approved) entries
  const isPastDay = viewMode === 'day' && currentDate < new Date() && !isToday(currentDate);
  const isDayLocked = viewMode === 'day' && entries.length > 0 && entries.every(entry => entry.isLocked && entry.isApproved);
  const isDayPending = viewMode === 'day' && entries.length > 0 && entries.some(entry => entry.submittedAt && !entry.isApproved);

  // Check if week needs resubmission (some entries have submittedAt, some don't, or entries were modified)
  const needsResubmit = viewMode === 'week' && isWeekPending && entries.some(entry => !entry.submittedAt);

  // Disable add entry if:
  // - Week view: approved (locked) - even in current week
  // - Day view: approved (locked) - even in current day
  // - ANY entries in the week are approved (prevents adding to weeks with approved entries)
  // Pending entries can still be edited/added by managers/admins
  const shouldDisableAddEntry = (viewMode === 'week' && (isWeekLocked || hasAnyApprovedEntries)) ||
    (viewMode === 'day' && (isDayLocked || hasAnyApprovedEntries));



  return (

    <div>

      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">

        {viewMode === 'week' && (
          <div className="flex items-center flex-wrap gap-4">
            <div className="flex flex-wrap">
            <button
              onClick={handlePrev}
              disabled={loading}
              className="p-1.5 rounded-s-md border border-[#1d1e1c40] hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiChevronLeft className="w-5 h-5 text-gray-600 " />
            </button>

            <button
              onClick={handleNext}
              disabled={loading}
              className="p-1.5 rounded-e-md border border-l-0 border-[#1d1e1c40] hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiChevronRight className='w-5 h-5 text-gray-600 '/>
            </button>
            </div>

            <div className="flex items-center space-x-2">
              <span className="font-medium">
                {(() => {
                  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
                  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 })
                  const isSameYear = format(weekStart, 'yyyy') === format(weekEnd, 'yyyy')
                  const isSameMonth = format(weekStart, 'MMM yyyy') === format(weekEnd, 'MMM yyyy')
                  const startFormat = isSameMonth ? 'd' : (isSameYear ? 'd MMM' : 'd MMM yyyy')
                  const prefix = isCurrentWeek ? 'This week: ' : ''
                  return `${prefix}${format(weekStart, startFormat)} – ${format(weekEnd, 'd MMM yyyy')}`
                })()}
              </span>
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

            {/* Only show "Return to this week" if not already on current week */}
            {!isSameWeek(currentDate, new Date(), { weekStartsOn: 1 }) && (
              <button
                className="text-[#2a59c1] hover:text-[#2a59c1] hover:underline text-sm font-medium"
                onClick={() => {
                  setEntries([]); // Clear entries immediately
                  setViewMode('week');
                  setCurrentDate(startOfWeek(new Date(), { weekStartsOn: 1 })); // Reset to start of current week
                }}
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
              className="p-1.5 rounded-s-md border border-[#1d1e1c40] hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiChevronLeft className="w-5 h-5 text-gray-600 " />
            </button>

            <button
              onClick={handleNext}
              disabled={loading}
              className="p-1.5 rounded-e-md border border-l-0 border-[#1d1e1c40] hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiChevronRight className="w-5 h-5 text-gray-600 " />
            </button>
            </div>

            <div className="flex items-center space-x-2">
              <span className="font-medium">
                {isToday(currentDate) 
                  ? `Today: ${format(currentDate, 'EEEE, d MMM')}`
                  : format(currentDate, 'EEEE, d MMM')
                }
              </span>
              {isDayLocked && (
                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                  Approved
                </span>
              )}
              {hasAnyApprovedEntries && !isDayLocked && (
                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                  Approved
                </span>
              )}
              {isDayPending && !isDayLocked && !hasAnyApprovedEntries && (
                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">
                  Pending
                </span>
              )}
            </div>


            {!isToday(currentDate) && (
              <button
                className="text-[#2a59c1] hover:text-[#2a59c1] hover:underline text-sm font-medium"
                onClick={() => setCurrentDate(new Date())}
              >
                Return to today
              </button>
            )}

          </div>

        )}

        <div className="flex items-center space-x-2">

          <div className="flex items-center space-x-2 bg-gray-100 rounded-lg p-1">

            <button

              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${viewMode === 'week'
                  ? 'bg-white theme-color shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
                }`}

              onClick={() => {

                setEntries([]); // Clear entries immediately

                setViewMode('week');

                // Preserve the week being viewed - just set to Monday of that week
                setCurrentDate(startOfWeek(currentDate, { weekStartsOn: 1 }));

              }}

            >

              Week

            </button>

            <button

              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${viewMode === 'day'
                  ? 'bg-white theme-color shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
                }`}

              onClick={() => {

                setEntries([]); // Clear entries immediately

                setViewMode('day');

                // If viewing current week, show today. Otherwise show Monday of the viewed week.
                const today = new Date()
                const todayWeekStart = startOfWeek(today, { weekStartsOn: 1 })
                const currentWeekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
                
                if (format(currentWeekStart, 'yyyy-MM-dd') === format(todayWeekStart, 'yyyy-MM-dd')) {
                  // Current week: show today
                  setCurrentDate(today)
                } else {
                  // Past or future week: show Monday of that week
                  setCurrentDate(currentWeekStart)
                }

              }}

            >

              Day

            </button>

          </div>

        </div>

      </div>






      {viewMode === 'week' && (

        <>

          {loading ? (

            <div className="h-48 bg-gray-200 rounded animate-pulse"></div>

          ) : (
            <div className="relative">
              <div className="overflow-x-auto">

              <table className="w-full text-sm border-collapse">

                <thead>

                  <tr className="text-left text-gray-500">
                    <th className="p-3 font-medium">Project</th>
                    {weekDays.map((day, index) => (
                      <th key={day.toString()} className={`p-3 font-medium min-w-[80px] text-center ${isToday(day) ? 'theme-color border-b-2 theme-color-border font-semibold' : ''}`}>{format(day, 'EEE')}<br />{format(day, 'd MMM')}</th>
                    ))}
                    <th className="p-3 font-medium text-right">Total</th>
                  </tr>

                </thead>

                <tbody>

                  {Object.values(entriesByProjectAndTask).map(({ project, task, days }) => {

                    // Check if any entry in this row is locked (approved) or pending
                    const isRowLocked = entries.some(e => e.project._id === project._id && e.task._id === task._id && e.isLocked && e.isApproved);
                    const isRowApproved = entries.some(e => e.project._id === project._id && e.task._id === task._id && e.isApproved);
                    const isRowPending = entries.some(e => e.project._id === project._id && e.task._id === task._id && e.submittedAt && !e.isApproved);

                    // Get all entries for this project-task to check if there are any to delete
                    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
                    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
                    const weekStartStr = format(weekStart, 'yyyy-MM-dd');
                    const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
                    const rowEntries = entries.filter(
                      e => e.project._id === project._id &&
                        e.task._id === task._id &&
                        e.date >= weekStartStr &&
                        e.date <= weekEndStr
                    );
                    const hasEntries = rowEntries.length > 0;
                    
                    // Check if this is an empty row (from emptyRows state or manuallyAddedRows, no entries)
                    const isEmptyRow = !hasEntries && (
                      emptyRows.some(r => r.projectId === project._id && r.taskId === task._id) ||
                      manuallyAddedRows.some(r => r.projectId === project._id && r.taskId === task._id)
                    );

                    return (

                      <tr key={`${project._id}-${task._id}`} className="border-t">

                        <td className="p-3 font-normal">

                          <span className="font-bold">{project.name}</span> - {task.name}

                        </td>

                          {days.map((hours, i) => {
                            const isEditing = inlineEditingCell && inlineEditingCell.projectId === project._id && inlineEditingCell.taskId === task._id && inlineEditingCell.dayIndex === i;
                            const cellId = `${project._id}-${task._id}-${i}`;
                            const isSaving = savingCellId === cellId;
                            return (
                              <td
                                key={i}
                                className={`p-1 text-center border bg-gray-100 hover:bg-gray-200 relative ${(isRowLocked || hasAnyApprovedEntries) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${isSaving ? 'opacity-75' : ''}`}
                                onClick={() => !isRowLocked && !hasAnyApprovedEntries && !isSaving && handleCellClick(project._id, project.name, task._id, task.name, i)}
                                title={
                                  isSaving ? 'Saving...' :
                                  hasAnyApprovedEntries ? 'This week has approved entries and cannot be edited.' :
                                  isRowApproved && isRowLocked ? 'This entry is approved and cannot be edited.' :
                                  isRowPending ? 'This entry is pending approval but can still be edited.' :
                                    'Click to edit time entry'
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
                                )}
                              </td>
                            )
                          })}

                        <td className="p-3 text-right font-bold">
                          <div className="flex items-center justify-end gap-2">
                            <span>{formatSimpleTime(days.reduce((a, b) => a + b, 0))}</span>
                            {/* Delete button for rows with entries */}
                            {hasEntries && !isRowLocked && !hasAnyApprovedEntries && (
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

                    );

                  })}

                  {Object.keys(entriesByProjectAndTask).length === 0 && (

                    <tr>

                      <td colSpan={8} className="text-center py-12 text-gray-500">No time entries found for this week.</td>

                    </tr>

                  )}

                </tbody>

                {/* Only show total row when there are project rows */}
                {Object.keys(entriesByProjectAndTask).length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 bg-gray-50">
                      <td className="p-3 font-bold text-gray-900">Total</td>
                      {weekDays.map((day, index) => {
                        const dayDateStr = format(day, 'yyyy-MM-dd');
                        const dayTotal = entries
                          .filter(e => e.date === dayDateStr)
                          .reduce((sum, entry) => sum + (entry.hours || 0), 0);
                        return (
                          <td key={index} className="p-3 text-center font-bold text-gray-900">
                            {dayTotal > 0 ? formatSimpleTime(dayTotal) : '0:00'}
                          </td>
                        );
                      })}
                      <td className="p-3 text-right font-bold text-gray-900">
                        {formatSimpleTime(
                          entries.reduce((sum, entry) => sum + (entry.hours || 0), 0)
                        )}
                      </td>
                    </tr>
                  </tfoot>
                )}

              </table>



              </div>
            </div>

            )}

          </>

        )}



      {viewMode === 'day' && (

        <>

          <div className="flex justify-between mb-4 gap-2 border-b border-gray-200 overflow-x-auto">
            {weekDays.map((day) => {
              const isSelected = format(day, 'yyyy-MM-dd') === format(currentDate, 'yyyy-MM-dd')
              const dayTotal = entries
                .filter(e => e.date === format(day, 'yyyy-MM-dd'))
                .reduce((sum, entry) => sum + (entry.hours || 0), 0)
              return (
                <div
                  key={day.toString()}
                  className={`flex-1 p-2 max-2xl: ${isSelected
                    ? 'theme-color border-b-2 theme-color-border font-semibold'
                    : 'cursor-pointer hover:theme-color'
                    }`}
                  onClick={() => setCurrentDate(day)}
                >
                  <div className="font-medium">{format(day, 'EEE')}</div>
                  <div className={"text-xs"}>
                    {dayTotal > 0 ? formatSimpleTime(dayTotal) : '0:00'}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#eee]">
                <tr>
                  <th className="px-4 py-2 text-left font-normal text-[#1d1e1c]">Project</th>
                  <th className="px-4 py-2 text-left font-normal text-[#1d1e1cb3]">Task</th>
                  <th className="px-4 py-2 text-center font-normal text-[#1d1e1cb3] w-24">Hours</th>
                  <th className="px-4 py-2 text-left font-normal text-[#1d1e1cb3]">Notes</th>
                  <th className="px-4 py-2 text-right font-normal text-[#1d1e1cb3] w-32">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1d1e1c40]">
                {(() => {
                  // Filter entries to only show entries for the selected day
                  const selectedDayStr = format(currentDate, 'yyyy-MM-dd');
                  const dayEntries = entries.filter(e => e.date === selectedDayStr);
                  
                  return dayEntries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-gray-500">
                      <div className="flex flex-col items-center">
                        <FiClock className="w-12 h-12 text-gray-300 mb-3" />
                        <p className="text-gray-500">No time entries found for this day.</p>
                        <p className="text-gray-400 text-xs mt-1">Click "Add Time Entry" to create one.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  dayEntries.map((entry) => {
                    const isLocked = entry.isLocked && entry.isApproved;
                    const isPending = entry.submittedAt && !entry.isApproved;
                    return (
                      <tr key={entry._id} className={`transition-colors ${isLocked ? 'bg-gray-50' : ''}`}>
                        <td className="px-4 py-2">
                          <span className="font-semibold">
                            {entry.project.name}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-700">{entry.task.name}</td>
                        <td className="px-4 py-2 text-center">
                          <span className="font-semibold text-gray-900">
                            {entry.hours > 0 ? formatSimpleTime(entry.hours) : '0:00'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-600 max-w-xs">
                          {entry.notes ? (
                            <span className="text-sm truncate block" title={entry.notes}>
                              {entry.notes.length > 50 ? `${entry.notes.substring(0, 50)}...` : entry.notes}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-sm">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setEditingEntry(entry)}
                              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                isLocked 
                                  ? 'text-gray-400 cursor-not-allowed' 
                                  : 'text-[#2a59c1] hover:text-[#2a59c1] hover:underline'
                              }`}
                              disabled={isLocked}
                              title={
                                isLocked ? 'This entry is approved and cannot be edited.' :
                                isPending ? 'This entry is pending approval but can still be edited.' :
                                'Edit entry'
                              }
                            >
                              Edit
                            </button>
                            {!isLocked && (
                              <button
                                onClick={() => handleDeleteEntry(entry._id)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                title="Delete entry"
                              >
                                <FiTrash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                );
                })()}
              </tbody>
              {(() => {
                const selectedDayStr = format(currentDate, 'yyyy-MM-dd');
                const dayEntries = entries.filter(e => e.date === selectedDayStr);
                return dayEntries.length > 0 && (
                  <tfoot className="bg-gray-50 border-t border-[#1d1e1c40]">
                  <tr>
                    <td colSpan={2} className="px-4 py-3 font-semibold text-gray-900">Total</td>
                    <td className="px-4 py-3 text-center font-bold text-gray-900">
                      {formatSimpleTime(dayEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0))}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              );
              })()}
            </table>
          </div>

        </>

      )}



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
                title={shouldDisableAddEntry ? (isWeekApproved ? 'Cannot add entries to approved weeks' : 'Cannot add entries to past weeks that are locked') : 'Add a new row to enter time'}
              >
                <FiPlus className="w-4 h-4" />
                Add Row
              </button>
              {/* Show "Copy from Previous Timesheet" button for non-current weeks, OR when no project rows available */}
              {Object.keys(entriesByProjectAndTask).length === 0 && !shouldDisableAddEntry && (
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
            </>
          ) : (
            // Day view: Show "Add Time Entry" button first, then conditionally "Copy from Previous" button
            <>
              <button
                onClick={async (e) => {
                  if (shouldDisableAddEntry) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  // Ensure projects are loaded for auto-fill
                  if (projects.length === 0 && projectsWithTasks.length === 0) {
                    await fetchProjects();
                  }
                  // Ensure projectsWithTasks are loaded for better auto-fill (includes tasks)
                  if (projectsWithTasks.length === 0) {
                    await fetchProjectsWithTasks();
                  }
                  setShowNewEntryModal(true);
                }}
                disabled={shouldDisableAddEntry}
                className={`btn-primary px-4 py-2 border border-transparent text-sm font-semibold rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 flex items-center gap-2 ${shouldDisableAddEntry ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={shouldDisableAddEntry ? (isWeekApproved ? 'Cannot add entries to approved weeks' : 'Cannot add entries to past weeks that are locked') : 'Add a new time entry'}
              >
                <FiPlus className="w-4 h-4" />
                Add Time Entry
              </button>
              {/* Show "Copy rows" button only if no entries for the selected day */}
              {!shouldDisableAddEntry && entries.filter(e => e.date === format(currentDate, 'yyyy-MM-dd')).length === 0 && (
                <button
                  onClick={handleCopyPreviousDayEntries}
                  disabled={copyingEntries}
                  className="px-4 py-2 border border-gray-300 text-sm font-semibold rounded-md bg-white text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Copy time entries from the most recent previous day with entries"
                >
                  {copyingEntries ? (
                    <div className="w-4 h-4 animate-spin rounded-full border-2 border-gray-600 border-t-transparent" />
                  ) : (
                    <FiClock className="w-4 h-4" />
                  )}
                  {copyingEntries ? 'Copying...' : 'Copy rows from most recent timesheet'}
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

          onClick={handleSubmitWeekForApproval}

          className={`btn-secondary px-4 py-2 border border-transparent text-sm font-semibold rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-transparent ${(isWeekApproved || entries.length === 0 || hasAnyApprovedEntries) ? 'opacity-50 cursor-not-allowed' : ''}`}

          disabled={isWeekApproved || entries.length === 0 || hasAnyApprovedEntries}

          title={

            isWeekApproved ? 'Week has been approved' :

              hasAnyApprovedEntries ? 'Cannot submit unsubmitted entries after some entries are already approved' :

                needsResubmit ? 'Resubmit all entries for this week for approval' :

                  isWeekPending ? 'Resubmit all entries for this week for approval' :

                    entries.length === 0 ? 'There are no entries for the week to submit' :

                      'Submit all entries for this week for approval'

          }

        >

          {needsResubmit || isWeekPending ? 'Resubmit Week for Approval' : 'Submit Week for Approval'}

        </button>

      </div>

      {/* Add Row Modal (for week view) */}
      {showAddRowModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            {/* Background overlay */}
            <div 
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={() => {
                setShowAddRowModal(false);
                setAddRowSelectedProject('');
                setAddRowSelectedTask('');
              }}
            />
            
            {/* Modal panel */}
            <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Add Row</h3>
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
                    className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
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

      {/* New Time Entry Modal */}
      {showNewEntryModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            {/* Background overlay */}
            <div 
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={() => setShowNewEntryModal(false)}
            />
            
            {/* Modal panel */}
            <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Add Time Entry</h3>
                <button
                  onClick={() => setShowNewEntryModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>
              
              {(() => {
                const autoFill = getAutoFillProjectAndTask();
                return (
                  <NewTimeEntryForm
                    onTimeEntryCreated={() => {
                      setShowNewEntryModal(false);
                      fetchTimeEntries();
                    }}
                    initialDate={format(currentDate, 'yyyy-MM-dd')}
                    initialProjectId={autoFill.projectId}
                    initialTaskId={autoFill.taskId}
                  />
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Edit Time Entry Modal (for day view) */}
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
              
              <NewTimeEntryForm
                onTimeEntryCreated={() => {
                  setEditingEntry(null);
                  fetchTimeEntries();
                }}
                initialProjectId={editingEntry.project._id}
                initialTaskId={editingEntry.task._id}
                initialDate={editingEntry.date}
                initialHours={editingEntry.hours.toString()}
                initialEntryId={editingEntry._id}
                initialNotes={editingEntry.notes || ''}
              />
            </div>
          </div>
        </div>
      )}

    </div>

  )

}
