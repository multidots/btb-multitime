'use client'

import { useState, useEffect } from 'react'
import { sanityFetch } from '@/lib/sanity'
import { formatSimpleTime, formatDecimalHours } from '@/lib/time'
import toast from 'react-hot-toast'
import { useSession } from 'next-auth/react'

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

export default function NewTimeEntryForm({
  onTimeEntryCreated,
  initialProjectId = '',
  initialDate = '',
  initialHours = '',
  initialTaskId = '',
  initialEntryId = '',
  initialNotes = ''
}: {
  onTimeEntryCreated: () => void
  initialProjectId?: string
  initialDate?: string
  initialHours?: string
  initialTaskId?: string
  initialEntryId?: string
  initialNotes?: string
}) {
  const { data: session } = useSession()
  const [projects, setProjects] = useState<Project[]>([])
  const [billableTasks, setBillableTasks] = useState<Task[]>([])
  const [nonBillableTasks, setNonBillableTasks] = useState<Task[]>([])
  const [selectedProject, setSelectedProject] = useState('')
  const [selectedTask, setSelectedTask] = useState('')
  const [date, setDate] = useState('')
  const [hours, setHours] = useState('')
  const [hoursDisplay, setHoursDisplay] = useState('') // For H:MM format display
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [hoursError, setHoursError] = useState('');

  const userId = session?.user?.id

  useEffect(() => {
    async function fetchProjectsAndSetInitialValues() {
      try {
        const userRole = session?.user?.role;
        const userId = session?.user?.id;
        let projectQuery = '*[_type == "project" && isActive == true]{_id, name}'; // Default for admin
        let queryParams = {};

        if (userRole === 'manager') {
          projectQuery = `*[_type == "project" && $userId in assignedUsers[role == "Project Manager"].user._ref && isActive == true]{_id, name}`;
          queryParams = { userId };
        }
        
        const projectList = await sanityFetch<Project[]>({
          query: projectQuery,
          params: queryParams,
        })
        setProjects(projectList)

        if (initialProjectId) {
          setSelectedProject(initialProjectId)
          // Fetch tasks for the initial project (excluding archived)
          const taskList = await sanityFetch<Task[]>({
            query: `*[_type == "project" && _id == $projectId]{ "tasks": tasks[]->{_id, name, isBillable, isArchived} }[0].tasks`,
            params: { projectId: initialProjectId },
          })
          const tasks = (taskList || []).filter(task => !task.isArchived)
          setBillableTasks(tasks.filter(task => task.isBillable))
          setNonBillableTasks(tasks.filter(task => !task.isBillable))
          if (initialTaskId) setSelectedTask(initialTaskId)
        }
        if (initialDate) setDate(initialDate)
        if (initialHours) {
          setHours(initialHours)
          // Convert decimal hours to H:MM format for display
          const hoursNum = parseFloat(initialHours)
          if (!isNaN(hoursNum)) {
            setHoursDisplay(formatSimpleTime(hoursNum))
          }
        }
        if (initialNotes) setNotes(initialNotes)
      } catch (error) {
        console.error('Error fetching initial data:', error)
        toast.error('Failed to load initial data.')
      }
    }

    fetchProjectsAndSetInitialValues()
  }, [initialProjectId, initialDate, initialHours, initialTaskId, initialEntryId])

  // This useEffect is now only for when selectedProject changes AFTER initial load
  useEffect(() => {
    if (!selectedProject || (initialProjectId && selectedProject === initialProjectId)) {
      // Avoid re-fetching if it's the initial project already handled above
      return
    }

    async function fetchTasks() {
      try {
        const taskList = await sanityFetch<Task[]>({
          query: `*[_type == "project" && _id == $projectId]{ "tasks": tasks[]->{_id, name, isBillable, isArchived} }[0].tasks`,
          params: { projectId: selectedProject },
        })
        const tasks = (taskList || []).filter(task => !task.isArchived)
        setBillableTasks(tasks.filter(task => task.isBillable))
        setNonBillableTasks(tasks.filter(task => !task.isBillable))
      } catch (error) {
        console.error('Error fetching tasks:', error)
        toast.error('Failed to load tasks for the selected project.')
      }
    }

    fetchTasks()
  }, [selectedProject, initialProjectId])

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

    // Check for H:MM format
    const timeMatch = input.match(/^(\d+):(\d+)$/)
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10)
      let minutes = parseInt(timeMatch[2], 10)

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate date is set (required for creating new entries)
    if (!initialEntryId && !date) {
      toast.error('Date is required')
      return
    }

    // Parse hours from H:MM format
    const hoursValue = parseTimeInput(hoursDisplay || hours)
    
    if (hoursValue === null || isNaN(hoursValue) || hoursValue <= 0 || hoursValue > 24) {
      setHoursError('Hours must be in decimal (e.g., 2.2) or H:MM format (e.g., 2:30). Range: 0:01 to 24:00.');
      return;
    } else {
      setHoursError('');
    }
    
    // Round to 2 decimal places
    const roundedHours = formatDecimalHours(hoursValue)

    if (!userId) {
      toast.error('You must be logged in to create/update a time entry.')
      return
    }
    setIsSubmitting(true)
    const payload: any = {
      userId,
      projectId: selectedProject,
      taskId: selectedTask,
      date,
      hours: roundedHours,
      notes: notes.trim(),
      isBillable: true, // Or get this from the task
      isLocked: false,
      isApproved: false,
      entryType: 'manual',
    }

    if (initialEntryId) {
      payload._id = initialEntryId;
      payload.action = 'update'; // Add action for PATCH request
    }

    try {
      const method = initialEntryId ? 'PATCH' : 'POST'
      const url = initialEntryId ? `/api/time-entries/${initialEntryId}` : '/api/time-entries'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(`Failed to ${initialEntryId ? 'update' : 'create'} time entry: ${errorData.message || response.statusText}`);
      }

      toast.success(`Time entry ${initialEntryId ? 'updated' : 'created'} successfully`)
      onTimeEntryCreated()
      // Reset form
      setSelectedProject('')
      setSelectedTask('')
      setDate('')
      setHours('')
      setHoursDisplay('')
      setNotes('')
    } catch (error) {
      console.error(`Error ${initialEntryId ? 'updating' : 'creating'} time entry:`, error)
      toast.error(`Failed to ${initialEntryId ? 'update' : 'create'} time entry`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!initialEntryId || !confirm('Are you sure you want to delete this time entry?')) {
      return
    }
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/time-entries/${initialEntryId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete time entry')
      }

      toast.success('Time entry deleted successfully')
      onTimeEntryCreated()
      // Reset form
      setSelectedProject('')
      setSelectedTask('')
      setDate('')
      setHours('')
      setHoursDisplay('')
      setNotes('')
    } catch (error) {
      console.error('Error deleting time entry:', error)
      toast.error('Failed to delete time entry')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-y-6">
      <div>
        <label htmlFor="project" className="block text-sm font-medium text-gray-700">
          Project
        </label>
        <select
          id="project"
          value={selectedProject}
          onChange={e => setSelectedProject(e.target.value)}
          required
          disabled={!userId}
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-transparent focus:border-black sm:text-sm rounded-md"
        >
          <option value="">Select Project</option>
          {projects.map(project => (
            <option key={project._id} value={project._id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="task" className="block text-sm font-medium text-gray-700">
          Task
        </label>
        <select
          id="task"
          value={selectedTask}
          onChange={e => setSelectedTask(e.target.value)}
          required
          disabled={!selectedProject}
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-transparent focus:border-black sm:text-sm rounded-md"
        >
          <option value="">Select Task</option>
          {billableTasks.length > 0 && (
            <optgroup label="Billable">
              {billableTasks.map(task => (
                <option key={task._id} value={task._id}>
                  {task.name}
                </option>
              ))}
            </optgroup>
          )}
          {nonBillableTasks.length > 0 && (
            <optgroup label="Non-billable">
              {nonBillableTasks.map(task => (
                <option key={task._id} value={task._id}>
                  {task.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
      {/* Date field - only show when editing an entry */}
      {initialEntryId && (
        <div>
          <label htmlFor="date" className="block text-sm font-medium text-gray-700">
            Date
          </label>
          <input
            type="date"
            id="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            required
            className="mt-1 focus:ring-transparent focus:border-black block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
          />
        </div>
      )}
      <div>
        <label htmlFor="hours" className="block text-sm font-medium text-gray-700">
          Hours (decimal or H:MM format)
        </label>
        <input
          type="text"
          id="hours"
          value={hoursDisplay || hours}
          onChange={e => {
            const input = e.target.value
            setHoursDisplay(input)
            setHours(input)
            setHoursError('')
          }}
          onBlur={e => {
            const input = e.target.value.trim()
            if (!input) {
              setHoursDisplay('')
              setHours('')
              return
            }

            // Normalize the input (convert decimal to H:MM or normalize minutes >= 60 to hours)
            const normalized = normalizeTimeInput(input)
            if (normalized) {
              // Parse to validate and get decimal for storage
              const parsed = parseTimeInput(normalized)
              if (parsed !== null && !isNaN(parsed) && parsed > 0 && parsed <= 24) {
                // Store the decimal value (rounded to 2 decimals)
                const rounded = formatDecimalHours(parsed)
                setHours(rounded.toString())
                // Display the normalized H:MM format (preserves exact minutes)
                setHoursDisplay(normalized)
                setHoursError('')
              } else {
                setHoursError('Invalid time. Maximum is 24:00.')
              }
            } else {
              setHoursError('Invalid format. Use decimal (e.g., 2.2) or H:MM format (e.g., 2:30). Range: 0:01 to 24:00.')
            }
          }}
          required
          placeholder="2.2 or 2:30"
          className={`mt-1 focus:ring-transparent focus:border-black block w-full shadow-sm sm:text-sm border-gray-300 rounded-md ${hoursError ? 'border-red-300' : ''}`}
        />
        {hoursError && <p className="text-red-500 text-xs mt-1">{hoursError}</p>}
        <p className="text-xs text-gray-500 mt-1">Enter time in decimal (e.g., 2.2 for 2 hours 12 minutes) or H:MM format (e.g., 2:30)</p>
      </div>
      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
          Notes (optional)
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="Optional notes..."
          className="mt-1 focus:ring-transparent focus:border-black block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
        />
      </div>
      <div className="flex justify-end items-center mt-4">
        {initialEntryId && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isSubmitting || isDeleting}
            className="mr-4 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
          >
            {isDeleting ? 'Deleting...' : 'Delete Entry'}
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting || isDeleting}
          className="btn-primary inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
        >
          {isSubmitting ? (initialEntryId ? 'Updating...' : 'Adding...') : (initialEntryId ? 'Update Entry' : 'Add Entry')}
        </button>
      </div>
    </form>
    )
}