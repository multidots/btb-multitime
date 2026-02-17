'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { format, parseISO, startOfWeek, endOfWeek, addWeeks, subWeeks, isSameWeek, addDays, isValid } from 'date-fns'
import { useSession } from 'next-auth/react'
import { FiChevronLeft, FiChevronRight, FiEdit, FiMoreVertical, FiArchive, FiTrash2, FiStar, FiLock } from 'react-icons/fi'
import { urlFor, sanityFetch } from '@/lib/sanity'
import { formatSimpleTime, formatDecimalHours } from '@/lib/time'
import toast from 'react-hot-toast'
import Link from 'next/link'

// Color palette for projects and tasks
const COLOR_PALETTE = [
  '#188433',
  '#fa5d00',
  '#db5383',
  '#935ba3',
  '#376bdd',
  '#86b1f1',
  '#ffc33c',
  '#c6c6c6',
];

// Helper function to get a color from the palette by index (sequential)
const getColorFromPalette = (index: number): string => {
  return COLOR_PALETTE[index % COLOR_PALETTE.length];
};

// Mock data and interfaces - replace with your actual data fetching
interface TimeEntry {
  _id: string
  _key?: string // present when entry is from timesheet
  project: { _id: string; name: string; color?: string }
  task?: { _id: string; name: string }
  date: string
  hours: number
  notes: string
  isBillable: boolean
  isApproved?: boolean
}


interface Project {
  _id: string;
  name: string;
}

interface Task {
  _id: string;
  name: string;
  isBillable: boolean;
  isArchived?: boolean;
}

interface TimesheetEntry {
  _key: string
  date: string
  project: { _id: string; name: string; code?: string }
  task?: { _id: string; name: string; isBillable?: boolean }
  hours: number
  notes?: string
  isBillable: boolean
}

interface Timesheet {
  _id: string
  weekStart: string
  weekEnd: string
  status: string
  entries: TimesheetEntry[]
  totalHours: number
  billableHours: number
  nonBillableHours: number
}


interface EditTimeEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: TimeEntry | null;
  projects: Project[];
  onSave: (entry: TimeEntry) => void;
  initialTasks?: Task[];
  /** When set, use timesheet API (entry must have _key) */
  timesheetId?: string | null;
  /** Called after timesheet entry delete so parent can refetch */
  onDeleted?: () => void;
}

interface EditTimesheetEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: TimesheetEntry | null;
  timesheetId: string | null;
  projects: Project[];
  onSave: () => void;
}

const EditTimeEntryModal: React.FC<EditTimeEntryModalProps> = ({ isOpen, onClose, entry, projects, onSave, initialTasks = [], timesheetId = null, onDeleted }) => {
  if (!isOpen || !entry) return null;

  const [updatedEntry, setUpdatedEntry] = useState(entry);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tasks, setTasks] = useState<Task[]>(initialTasks || []);
  const [billableTasks, setBillableTasks] = useState<Task[]>([]);
  const [nonBillableTasks, setNonBillableTasks] = useState<Task[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(entry.project._id);
  const [hoursInput, setHoursInput] = useState<string>(entry.hours ? formatSimpleTime(entry.hours) : '');
  const [hoursError, setHoursError] = useState('');

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
    if (selectedProjectId) {
      fetchTasksForProject(selectedProjectId);
      // Reset task when project changes (if project ID changed from entry's original project)
      if (selectedProjectId !== entry.project._id) {
        setUpdatedEntry(prev => ({ ...prev, task: undefined }));
      }
    } else {
      setTasks([]);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    const activeTasks = tasks.filter(task => !task.isArchived);
    setBillableTasks(activeTasks.filter(task => task.isBillable));
    setNonBillableTasks(activeTasks.filter(task => !task.isBillable));
  }, [tasks]);

  useEffect(() => {
    setUpdatedEntry(entry);
    setSelectedProjectId(entry.project._id);
    setHoursInput(entry.hours ? formatSimpleTime(entry.hours) : '');
  }, [entry]);

  const fetchTasksForProject = async (projectId: string) => {
    try {
      // Fetch tasks from the project's tasks array (consistent with NewTimeEntryForm)
      const taskList = await sanityFetch<Task[]>({
        query: `*[_type == "project" && _id == $projectId]{ "tasks": tasks[]->{_id, name, isBillable, isArchived} }[0].tasks`,
        params: { projectId },
      });
      
      let fetchedTasks = (taskList || []).filter(task => !task.isArchived);

      // Only include the current task if we're still on the original project (for autopopulation on edit)
      // Don't include it if project has changed - user should select a new task
      if (projectId === entry.project._id && entry.task && !fetchedTasks.some((task: Task) => task._id === entry.task?._id)) {
        // Use entry.isBillable as fallback since task object might not have isBillable property
        fetchedTasks = [{ _id: entry.task._id, name: entry.task.name, isBillable: entry.isBillable || false, isArchived: false }, ...fetchedTasks];
      }

      setTasks(fetchedTasks);
    } catch (error) {
      console.error('Error fetching tasks for project:', error);
      toast.error('Failed to load tasks for the selected project.');
      setTasks([]);
    }
  };

  const handleSave = async () => {
    const parsedHours = parseTimeInput(hoursInput);
    if (parsedHours === null || parsedHours <= 0 || parsedHours > 24) {
      setHoursError('Please enter a valid time in H:MM format (e.g., 8:30).');
      return;
    }
    
    // Validate task is selected
    if (!updatedEntry.task || !updatedEntry.task._id) {
      toast.error('Please select a task for this time entry.');
      return;
    }
    
    setSaving(true);
    try {
      await onSave({
        ...updatedEntry,
        hours: parsedHours,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this time entry?')) return;
    setDeleting(true);
    try {
      if (timesheetId && (entry as TimeEntry & { _key?: string })._key) {
        const response = await fetch(`/api/timesheets/${timesheetId}/entries?entryKey=${(entry as TimeEntry & { _key: string })._key}`, {
          method: 'DELETE',
        });
        if (!response.ok) throw new Error('Failed to delete entry');
        toast.success('Timesheet entry deleted!');
        onClose();
        onDeleted?.();
      } else {
        const response = await fetch(`/api/time-entries/${entry._id}`, {
          method: 'DELETE',
        });
        if (!response.ok) throw new Error('Failed to delete entry');
        toast.success('Time entry deleted!');
        onClose();
        window.location.reload();
      }
    } catch (error) {
      toast.error('Failed to delete time entry.');
      console.error(error);
    } finally {
      setDeleting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    if (name === 'project') {
      const newProject = projects.find(p => p._id === value);
      if (newProject) {
        setSelectedProjectId(value);
        // Update project and reset task in a single state update
        setUpdatedEntry(prev => ({
          ...prev,
          project: newProject,
          task: undefined
        }));
      }
    } else {
      setUpdatedEntry(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }));
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-2xl">
        <h2 className="text-xl font-bold mb-6">Edit Time Entry</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Project</label>
            <select name="project" value={selectedProjectId} onChange={handleChange} disabled={saving || deleting} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed">
              {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Task <span className="text-red-500">*</span>
            </label>
            <select 
              name="task" 
              value={updatedEntry.task?._id || ''} 
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                const selectedTask = tasks.find(t => t._id === e.target.value);
                setUpdatedEntry(prev => ({
                  ...prev, 
                  task: selectedTask,
                  // Update isBillable based on selected task
                  isBillable: selectedTask ? selectedTask.isBillable : prev.isBillable
                }));
              }} 
              disabled={saving || deleting || !selectedProjectId} 
              required
              className={`mt-1 block w-full rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                !updatedEntry.task?._id ? 'border-yellow-300' : 'border-gray-300'
              }`}
            >
              <option value="">Select a task</option>
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
            {!updatedEntry.task?._id && (
              <p className="text-yellow-600 text-xs mt-1">Please select a task</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Date</label>
            <input type="date" name="date" value={updatedEntry.date} onChange={handleChange} disabled={saving || deleting} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Hours (decimal or H:MM format)</label>
            <input
              type="text"
              name="hours"
              value={hoursInput}
              onChange={(e) => {
                setHoursInput(e.target.value);
                setHoursError('');
              }}
              onBlur={(e) => {
                const input = e.target.value;
                if (input && input.trim() !== '') {
                  const normalized = normalizeTimeInput(input);
                  if (normalized) {
                    setHoursInput(normalized);
                  } else {
                    setHoursError('Please enter a valid time in decimal (e.g., 2.2) or H:MM format (e.g., 8:30).');
                  }
                }
              }}
              disabled={saving || deleting}
              className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-transparent sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed ${hoursError ? 'border-red-300' : ''}`}
              placeholder="e.g., 2.2 or 8:30"
            />
            {hoursError && <p className="text-red-500 text-xs mt-1">{hoursError}</p>}
            <p className="mt-1 text-xs text-gray-500">Enter time in decimal (e.g., 2.2 for 2 hours 12 minutes) or H:MM format (e.g., 8:30)</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Notes</label>
            <textarea name="notes" value={updatedEntry.notes} onChange={handleChange} rows={3} disabled={saving || deleting} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-transperant sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"></textarea>
          </div>
          <div className="flex items-center">
            <input type="checkbox" name="isBillable" checked={updatedEntry.isBillable} onChange={handleChange} disabled={saving || deleting} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed" />
            <label className="ml-2 block text-sm text-gray-900">Billable</label>
          </div>
        </div>

        <div className="flex justify-between space-x-4 mt-8">
          <button onClick={handleDelete} disabled={saving || deleting} className="px-4 py-2 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {deleting ? 'Deleting...' : 'Delete Entry'}
          </button>
          <div className="flex space-x-4">
            <button onClick={onClose} disabled={saving || deleting} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving || deleting} className="px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center">
              {saving ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const EditTimesheetEntryModal: React.FC<EditTimesheetEntryModalProps> = ({ isOpen, onClose, entry, timesheetId, projects, onSave }) => {
  if (!isOpen || !entry || !timesheetId) return null;

  const [updatedEntry, setUpdatedEntry] = useState(entry);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [billableTasks, setBillableTasks] = useState<Task[]>([]);
  const [nonBillableTasks, setNonBillableTasks] = useState<Task[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(entry.project._id);
  const [hoursInput, setHoursInput] = useState<string>(entry.hours ? formatSimpleTime(entry.hours) : '');
  const [hoursError, setHoursError] = useState('');

  // Normalize H:MM format or decimal format
  const normalizeTimeInput = (input: string): string | null => {
    if (!input || input.trim() === '') return null

    const decimalMatch = input.match(/^(\d*\.?\d+)$/)
    if (decimalMatch) {
      const decimalValue = parseFloat(decimalMatch[1])
      if (isNaN(decimalValue) || decimalValue < 0 || decimalValue > 24) {
        return null
      }
      const hours = Math.floor(decimalValue)
      const minutes = Math.round((decimalValue - hours) * 60)
      return `${hours}:${minutes.toString().padStart(2, '0')}`
    }

    const timeMatch = input.match(/^(\d+):(\d+)$/)
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10)
      let minutes = parseInt(timeMatch[2], 10)
      if (minutes >= 60) {
        const additionalHours = Math.floor(minutes / 60)
        hours += additionalHours
        minutes = minutes % 60
      }
      return `${hours}:${minutes.toString().padStart(2, '0')}`
    }

    return null
  }

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

  useEffect(() => {
    if (selectedProjectId) {
      fetchTasksForProject(selectedProjectId);
      if (selectedProjectId !== entry.project._id) {
        setUpdatedEntry(prev => ({ ...prev, task: undefined }));
      }
    } else {
      setTasks([]);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    const activeTasks = tasks.filter(task => !task.isArchived);
    setBillableTasks(activeTasks.filter(task => task.isBillable));
    setNonBillableTasks(activeTasks.filter(task => !task.isBillable));
  }, [tasks]);

  useEffect(() => {
    setUpdatedEntry(entry);
    setSelectedProjectId(entry.project._id);
    setHoursInput(entry.hours ? formatSimpleTime(entry.hours) : '');
  }, [entry]);

  const fetchTasksForProject = async (projectId: string) => {
    try {
      const taskList = await sanityFetch<Task[]>({
        query: `*[_type == "project" && _id == $projectId]{ "tasks": tasks[]->{_id, name, isBillable, isArchived} }[0].tasks`,
        params: { projectId },
      });
      
      let fetchedTasks = (taskList || []).filter(task => !task.isArchived);

      if (projectId === entry.project._id && entry.task && !fetchedTasks.some((task: Task) => task._id === entry.task?._id)) {
        fetchedTasks = [{ _id: entry.task._id, name: entry.task.name, isBillable: entry.isBillable || false, isArchived: false }, ...fetchedTasks];
      }

      setTasks(fetchedTasks);
    } catch (error) {
      console.error('Error fetching tasks for project:', error);
      toast.error('Failed to load tasks for the selected project.');
      setTasks([]);
    }
  };

  const handleSave = async () => {
    const parsedHours = parseTimeInput(hoursInput);
    if (parsedHours === null || parsedHours <= 0 || parsedHours > 24) {
      setHoursError('Please enter a valid time in H:MM format (e.g., 8:30).');
      return;
    }
    
    if (!updatedEntry.task || !updatedEntry.task._id) {
      toast.error('Please select a task for this timesheet entry.');
      return;
    }
    
    setSaving(true);
    try {
      const response = await fetch(`/api/timesheets/${timesheetId}/entries`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryKey: entry._key,
          projectId: updatedEntry.project._id,
          taskId: updatedEntry.task._id,
          date: updatedEntry.date,
          hours: parsedHours,
          notes: updatedEntry.notes || '',
          isBillable: updatedEntry.isBillable
        }),
      });
      
      if (!response.ok) throw new Error('Failed to save entry');
      toast.success('Timesheet entry updated!');
      onClose();
      onSave(); // Refresh data
    } catch (error) {
      toast.error('Failed to update timesheet entry.');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this timesheet entry?')) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/timesheets/${timesheetId}/entries?entryKey=${entry._key}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete entry');
      toast.success('Timesheet entry deleted!');
      onClose();
      onSave(); // Refresh data
    } catch (error) {
      toast.error('Failed to delete timesheet entry.');
      console.error(error);
    } finally {
      setDeleting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    if (name === 'project') {
      const newProject = projects.find(p => p._id === value);
      if (newProject) {
        setSelectedProjectId(value);
        setUpdatedEntry(prev => ({
          ...prev,
          project: newProject,
          task: undefined
        }));
      }
    } else {
      setUpdatedEntry(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }));
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-2xl">
        <h2 className="text-xl font-bold mb-6">Edit Timesheet Entry</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Project</label>
            <select name="project" value={selectedProjectId} onChange={handleChange} disabled={saving || deleting} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed">
              {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Task <span className="text-red-500">*</span>
            </label>
            <select 
              name="task" 
              value={updatedEntry.task?._id || ''} 
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                const selectedTask = tasks.find(t => t._id === e.target.value);
                setUpdatedEntry(prev => ({
                  ...prev, 
                  task: selectedTask,
                  isBillable: selectedTask ? selectedTask.isBillable : prev.isBillable
                }));
              }} 
              disabled={saving || deleting || !selectedProjectId} 
              required
              className={`mt-1 block w-full rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                !updatedEntry.task?._id ? 'border-yellow-300' : 'border-gray-300'
              }`}
            >
              <option value="">Select a task</option>
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
            {!updatedEntry.task?._id && (
              <p className="text-yellow-600 text-xs mt-1">Please select a task</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Date</label>
            <input type="date" name="date" value={updatedEntry.date} onChange={handleChange} disabled={saving || deleting} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Hours (decimal or H:MM format)</label>
            <input
              type="text"
              name="hours"
              value={hoursInput}
              onChange={(e) => {
                setHoursInput(e.target.value);
                setHoursError('');
              }}
              onBlur={(e) => {
                const input = e.target.value;
                if (input && input.trim() !== '') {
                  const normalized = normalizeTimeInput(input);
                  if (normalized) {
                    setHoursInput(normalized);
                  } else {
                    setHoursError('Please enter a valid time in decimal (e.g., 2.2) or H:MM format (e.g., 8:30).');
                  }
                }
              }}
              disabled={saving || deleting}
              className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-transparent sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed ${hoursError ? 'border-red-300' : ''}`}
              placeholder="e.g., 2.2 or 8:30"
            />
            {hoursError && <p className="text-red-500 text-xs mt-1">{hoursError}</p>}
            <p className="mt-1 text-xs text-gray-500">Enter time in decimal (e.g., 2.2 for 2 hours 12 minutes) or H:MM format (e.g., 8:30)</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Notes</label>
            <textarea name="notes" value={updatedEntry.notes || ''} onChange={handleChange} rows={3} disabled={saving || deleting} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-transperant sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"></textarea>
          </div>
          <div className="flex items-center">
            <input type="checkbox" name="isBillable" checked={updatedEntry.isBillable} onChange={handleChange} disabled={saving || deleting} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed" />
            <label className="ml-2 block text-sm text-gray-900">Billable</label>
          </div>
        </div>

        <div className="flex justify-between space-x-4 mt-8">
          <button onClick={handleDelete} disabled={saving || deleting} className="px-4 py-2 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {deleting ? 'Deleting...' : 'Delete Entry'}
          </button>
          <div className="flex space-x-4">
            <button onClick={onClose} disabled={saving || deleting} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving || deleting} className="px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center">
              {saving ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


interface Member {
  _id: string
  firstName: string
  lastName: string
  email: string
  avatar?: any
  capacity?: number
  role?: string
  jobCategory?: { name: string }
  isPinned?: boolean
}

export default function MemberDetailsClient({ memberId }: { memberId: string }) {
  const [member, setMember] = useState<Member | null>(null)
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [timesheet, setTimesheet] = useState<Timesheet | null>(null)
  const [loading, setLoading] = useState(true)
  const searchParams = useSearchParams()
  // Initialize currentWeek from localStorage or default to current week
  const [currentWeek, setCurrentWeek] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('team_detail_viewed_week')
      if (stored) {
        const parsedDate = parseISO(stored)
        if (isValid(parsedDate)) {
          return startOfWeek(parsedDate, { weekStartsOn: 1 })
        }
      }
    }
    return startOfWeek(new Date(), { weekStartsOn: 1 })
  })
  const router = useRouter()
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [pinningMember, setPinningMember] = useState(false);
  const [archivingMember, setArchivingMember] = useState(false);
  const [deletingMember, setDeletingMember] = useState(false);
  const [hasPendingOrUnsubmittedHours, setHasPendingOrUnsubmittedHours] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const isManager = session?.user?.role === 'manager'

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
        setIsActionMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Check URL query parameter on mount and update currentWeek if present
  useEffect(() => {
    const weekParam = searchParams?.get('week')
    if (weekParam) {
      const parsedDate = parseISO(weekParam)
      if (isValid(parsedDate)) {
        const weekStart = startOfWeek(parsedDate, { weekStartsOn: 1 })
        setCurrentWeek(weekStart)
      }
    }
  }, []) // Run only once on mount

  // Persist current week to localStorage for page refresh persistence
  useEffect(() => {
    localStorage.setItem('team_detail_viewed_week', format(currentWeek, 'yyyy-MM-dd'))
  }, [currentWeek])

  useEffect(() => {
    fetchMemberAndEntries()
  }, [currentWeek, memberId])

  const fetchMemberAndEntries = async () => {
    setLoading(true)
    try {
      const memberPromise = fetch(`/api/team/members/${memberId}`).then(res => res.json())
      
      const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 })
      const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 })
      const startDate = format(weekStart, 'yyyy-MM-dd')
      const endDate = format(weekEnd, 'yyyy-MM-dd')

      // Fetch projects assigned to the member (consistent across the app)
      const projectsPromise = fetch(`/api/projects?assignedTo=${memberId}`).then(res => res.json());
      // Check if member has pending or unsubmitted hours
      const hasPendingOrUnsubmittedPromise = checkIfMemberHasPendingOrUnsubmittedHours(memberId);
      // Fetch approved timesheet for the current week
      const timesheetPromise = fetch(`/api/timesheets?userId=${memberId}&weekStart=${startDate}&approvedOnly=true`).then(res => res.json()).catch(() => null);

      const [memberData, , projectsData, hasPendingOrUnsubmitted, timesheetData] = await Promise.all([memberPromise, Promise.resolve([]), projectsPromise, hasPendingOrUnsubmittedPromise, timesheetPromise])

      setMember(memberData)
      // Time entry reference commented out – use empty array
      setTimeEntries([])
      // Ensure we only use projects that are assigned to the member
      setProjects(projectsData.projects || [])
      setHasPendingOrUnsubmittedHours(hasPendingOrUnsubmitted)
      // Set timesheet data (may be null if no timesheet exists)
      setTimesheet(timesheetData || null)

    } catch (error) {
      console.error('Failed to fetch data:', error)
      toast.error('Failed to load member data.')
    } finally {
      setLoading(false)
    }
  }

  const checkIfMemberHasPendingOrUnsubmittedHours = async (userId: string): Promise<boolean> => {
    try {
      // Check if user has pending or unsubmitted time entries
      const response = await fetch('/api/team/pending-approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIds: [userId] }),
        cache: 'no-store'
      })
      if (!response.ok) return false
      const data = await response.json()
      return Array.isArray(data.memberIds) && data.memberIds.includes(userId)
    } catch (error) {
      console.error('Error checking pending/unsubmitted hours:', error)
      return false
    }
  }

  const handlePin = async (pin: boolean) => {
    if (!member) return
    setPinningMember(true)
    // Don't close menu immediately - let spinner show in menu
    
    try {
      const response = await fetch(`/api/team/members/${memberId}/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPinned: pin })
      })

      let responseData: any = {}
      try {
        responseData = await response.json()
      } catch (e) {
        console.error('Failed to parse response:', e)
      }
      
      if (!response.ok) {
        console.error('Pin API error:', {
          status: response.status,
          statusText: response.statusText,
          data: responseData
        })
        throw new Error(responseData.error || `Failed to update pin status (${response.status})`)
      }

      toast.success(`Member ${pin ? 'pinned' : 'unpinned'} successfully`)
      
      // Close menu after success
      setIsActionMenuOpen(false)
      
      // Wait a moment for Sanity to propagate, then refresh member data
      setTimeout(async () => {
        try {
          const memberResponse = await fetch(`/api/team/members/${memberId}`, { 
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache'
            }
          })
          if (memberResponse.ok) {
            const updatedMember = await memberResponse.json()
            setMember(updatedMember)
          } else {
            console.warn('Failed to refresh member data, using local update')
            // Fallback: update local state
            setMember(prev => prev ? { ...prev, isPinned: pin } : null)
          }
        } catch (refreshError) {
          console.error('Error refreshing member data:', refreshError)
          // Fallback: update local state
          setMember(prev => prev ? { ...prev, isPinned: pin } : null)
        }
      }, 500)
    } catch (error) {
      console.error('Error pinning member:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to update pin status'
      toast.error(errorMessage)
      setIsActionMenuOpen(false)
    } finally {
      setPinningMember(false)
    }
  }

  const handleArchive = async () => {
    if (!member) return
    setIsActionMenuOpen(false)
    if (!window.confirm('Are you sure you want to archive this member?')) {
      return
    }
    
    setArchivingMember(true)
    try {
      const response = await fetch(`/api/team/members/${memberId}/archive`, {
        method: 'POST',
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to archive member')
      }
      toast.success('Member archived successfully')
      router.push('/admin/team')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to archive member')
    } finally {
      setArchivingMember(false)
    }
  }

  const handleDelete = async () => {
    if (!member) return
    setIsActionMenuOpen(false)
    
    // Prevent deletion if member has pending or unsubmitted time entries
    if (hasPendingOrUnsubmittedHours) {
      toast.error('Cannot delete member with pending or unsubmitted time entries')
      return
    }
    
    if (!window.confirm('Are you sure you want to delete this member? This action cannot be undone.')) {
      return
    }
    
    setDeletingMember(true)
    try {
      const response = await fetch(`/api/team/members/${memberId}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to delete member')
      }
      toast.success('Member deleted successfully')
      router.push('/admin/team')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete member')
    } finally {
      setDeletingMember(false)
    }
  }

  const handleEditClick = (entry: TimeEntry) => {
    setEditingEntry(entry);
    setIsEditModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsEditModalOpen(false);
    setEditingEntry(null);
  };

  const handleSaveEntry = async (updatedEntry: TimeEntry) => {
    const entryKey = (updatedEntry as TimeEntry & { _key?: string })._key;
    const useTimesheet = timesheet?._id && entryKey;

    if (useTimesheet) {
      const response = await fetch(`/api/timesheets/${timesheet!._id}/entries`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryKey,
          projectId: updatedEntry.project._id,
          taskId: updatedEntry.task?._id,
          date: updatedEntry.date,
          hours: updatedEntry.hours,
          notes: updatedEntry.notes ?? '',
          isBillable: updatedEntry.isBillable,
        }),
      });
      if (!response.ok) throw new Error('Failed to save entry');
      toast.success('Timesheet entry updated!');
      handleCloseModal();
      fetchMemberAndEntries();
    } else {
      const response = await fetch(`/api/time-entries/${updatedEntry._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedEntry),
      });
      if (!response.ok) throw new Error('Failed to save entry');
      toast.success('Time entry updated!');
      handleCloseModal();
      fetchMemberAndEntries();
    }
  };

  const handleEditTimesheetEntry = (entry: TimesheetEntry) => {
    if (!timesheet?._id) {
      toast.error('Timesheet not found');
      return;
    }
    // Use EditTimeEntryModal with timesheet API (entry with _key)
    setEditingEntry({
      _id: entry._key,
      _key: entry._key,
      project: entry.project,
      task: entry.task,
      date: entry.date,
      hours: entry.hours,
      notes: entry.notes ?? '',
      isBillable: entry.isBillable,
    });
    setIsEditModalOpen(true);
  };

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 })

  const dailyData = Array.from({ length: 7 }).map((_, i) => {
    const day = addDays(weekStart, i)
    const dateStr = format(day, 'yyyy-MM-dd')
    const entriesForDay = timeEntries.filter(e => e.date === dateStr)
    const totalHours = entriesForDay.reduce((sum, e) => sum + e.hours, 0)
    const billableHours = entriesForDay.filter(e => e.isBillable).reduce((sum, e) => sum + e.hours, 0)
    return {
      name: format(day, 'EEE'),
      date: dateStr,
      'Total Hours': totalHours,
      'Billable': billableHours,
      'Non-Billable': totalHours - billableHours,
      entries: entriesForDay,
    }
  })

  const totalWeeklyHours = dailyData.reduce((sum, day) => sum + day['Total Hours'], 0)
  const totalBillableHours = dailyData.reduce((sum, day) => sum + day['Billable'], 0)

  // Collect unique projects in order of first appearance
  const uniqueProjects: string[] = []
  timeEntries.forEach(entry => {
    if (!uniqueProjects.includes(entry.project.name)) {
      uniqueProjects.push(entry.project.name)
    }
  })

  const projectBreakdown = timeEntries.reduce((acc, entry) => {
    const projectName = entry.project.name
    if (!acc[projectName]) {
      const projectIndex = uniqueProjects.indexOf(projectName)
      acc[projectName] = { hours: 0, color: entry.project.color || getColorFromPalette(projectIndex) }
    }
    acc[projectName].hours += entry.hours
    return acc
  }, {} as Record<string, { hours: number, color: string }>)

  const projectChartData = Object.entries(projectBreakdown).map(([name, data]) => ({
    name,
    hours: data.hours,
    fill: data.color,
  }))

  // Collect unique tasks in order of first appearance
  const uniqueTasks: string[] = []
  timeEntries.forEach(entry => {
    if (entry.task && !uniqueTasks.includes(entry.task.name)) {
      uniqueTasks.push(entry.task.name)
    }
  })

  const taskBreakdown = timeEntries.reduce((acc, entry) => {
    if (entry.task) {
        const taskName = entry.task.name;
        if (!acc[taskName]) {
            const taskIndex = uniqueTasks.indexOf(taskName)
            acc[taskName] = { hours: 0, color: getColorFromPalette(taskIndex) };
        }
        acc[taskName].hours += entry.hours;
    }
    return acc;
  }, {} as Record<string, { hours: number, color: string }>);

  const taskChartData = Object.entries(taskBreakdown).map(([name, data]) => ({
      name,
      hours: data.hours,
      fill: data.color,
  }));

  // Timesheet project breakdown
  const timesheetEntries = timesheet?.entries || []
  const uniqueTimesheetProjects: string[] = []
  timesheetEntries.forEach((entry: TimesheetEntry) => {
    if (entry.project && !uniqueTimesheetProjects.includes(entry.project.name)) {
      uniqueTimesheetProjects.push(entry.project.name)
    }
  })

  const timesheetProjectBreakdown = timesheetEntries.reduce((acc, entry: TimesheetEntry) => {
    if (entry.project) {
      const projectName = entry.project.name
      if (!acc[projectName]) {
        const projectIndex = uniqueTimesheetProjects.indexOf(projectName)
        acc[projectName] = { hours: 0, color: getColorFromPalette(projectIndex) }
      }
      acc[projectName].hours += entry.hours
    }
    return acc
  }, {} as Record<string, { hours: number, color: string }>)

  const timesheetProjectChartData = Object.entries(timesheetProjectBreakdown).map(([name, data]) => ({
    name,
    hours: data.hours,
    fill: data.color,
  }))

  const totalTimesheetHours = timesheetEntries.reduce((sum, entry: TimesheetEntry) => sum + entry.hours, 0)

  // Timesheet task breakdown
  const uniqueTimesheetTasks: string[] = []
  timesheetEntries.forEach((entry: TimesheetEntry) => {
    if (entry.task && !uniqueTimesheetTasks.includes(entry.task.name)) {
      uniqueTimesheetTasks.push(entry.task.name)
    }
  })

  const timesheetTaskBreakdown = timesheetEntries.reduce((acc, entry: TimesheetEntry) => {
    if (entry.task) {
      const taskName = entry.task.name
      if (!acc[taskName]) {
        const taskIndex = uniqueTimesheetTasks.indexOf(taskName)
        acc[taskName] = { hours: 0, color: getColorFromPalette(taskIndex) }
      }
      acc[taskName].hours += entry.hours
    }
    return acc
  }, {} as Record<string, { hours: number, color: string }>)

  const timesheetTaskChartData = Object.entries(timesheetTaskBreakdown).map(([name, data]) => ({
    name,
    hours: data.hours,
    fill: data.color,
  }))

  if (loading && !member) {
    return <div className="text-center py-10">Loading details...</div>
  }

  if (!member) {
    return <div className="text-center py-10 text-red-500">Member not found.</div>
  }

  const capacity = member.capacity || 40;
  const totalNonBillableHours = totalWeeklyHours - totalBillableHours;
  const unusedHours = Math.max(0, capacity - totalWeeklyHours);

  const billablePercentage = (totalBillableHours / capacity) * 100;
  const nonBillablePercentage = (totalNonBillableHours / capacity) * 100;

  const today = new Date();
  const startOfThisWeek = startOfWeek(today, { weekStartsOn: 1 });

  const isCurrentWeek = isSameWeek(currentWeek, startOfThisWeek, { weekStartsOn: 1 });
  const isLastWeek = isSameWeek(currentWeek, subWeeks(startOfThisWeek, 1), { weekStartsOn: 1 });
  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-gray-50 min-h-screen">
      <Link
          href="/admin/team"
          className="flex items-center text-gray-500 hover:text-gray-700 mb-4"
      >
          <FiChevronLeft className="w-5 h-5 mr-1" />
          Back to Team
      </Link>
      <EditTimeEntryModal
        isOpen={isEditModalOpen}
        onClose={handleCloseModal}
        entry={editingEntry}
        projects={projects}
        onSave={handleSaveEntry}
        timesheetId={timesheet?._id ?? null}
        onDeleted={() => { handleCloseModal(); fetchMemberAndEntries(); }}
      />
      {/* Week Navigation */}
      <div className="flex items-center mb-6 space-x-2 gap-4 flex-wrap">
        <div className="flex">
        <button disabled={loading} onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))} className="p-1.5 rounded-s-md border border-[#1d1e1c40] hover:bg-gray-100 transition-colors">
          <FiChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <button disabled={isCurrentWeek || loading} onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))} className="p-1.5 rounded-e-md border border-l-0 border-[#1d1e1c40] hover:bg-gray-100 transition-colors">
          <FiChevronRight className={`w-5 h-5 text-gray-600`}/>
        </button>
        </div>
        <div className="text-center flex flex-wrap gap-x-3 gap-y-1">
          <h2 className="font-medium text-gray-900">
            {weekStart.getMonth() === weekEnd.getMonth() && weekStart.getFullYear() === weekEnd.getFullYear()
              ? `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'd, yyyy')}`
              : weekStart.getFullYear() === weekEnd.getFullYear()
              ? `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`
              : `${format(weekStart, 'MMM d, yyyy')} - ${format(weekEnd, 'MMM d, yyyy')}`
            }
          </h2>
          <div className="">
            {isCurrentWeek && <span className="text-sm text-gray-500">This week</span>}
            {isLastWeek && <span className="text-sm text-gray-500">Last week | </span>}
            {!isCurrentWeek && (
                <button onClick={() => setCurrentWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))} className="text-sm text-blue-600 hover:underline">
                    Return to this week
                </button>
            )}
          </div>
        </div>
      </div>

      {/* Content with loading overlay */}
      <div className="relative">
        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center rounded-lg">
            <div className="text-gray-500">Loading...</div>
          </div>
        )}

        {/* Member Header */}
        <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div className="flex items-center">
              <img
                src={member.avatar ? urlFor(member.avatar).url() : `https://ui-avatars.com/api/?name=${member.firstName}+${member.lastName}`}
                alt="Avatar"
                className="h-16 w-16 rounded-full mr-4 object-cover object-top"
              />
              <div>
                <h1 className="text-2xl font-bold text-gray-900 capitalize">{member.firstName} {member.lastName}</h1>
                <p className="text-sm text-gray-600">{`${member.jobCategory?.name ? `${member.jobCategory?.name} | ` : ''} ${member.role}`}</p>
                <p className="text-sm text-gray-500">{member.email}</p>
              </div>
            </div>
            <div className="flex items-center mt-4 sm:mt-0">
              <button 
                onClick={() => router.push(`/admin/team/edit/${memberId}`)}
                className="flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50">
                <FiEdit className="mr-2 h-4 w-4" />
                Edit Profile
              </button>
              <div className="relative ml-2">
                <div className="flex items-center gap-2">
                  {(archivingMember || deletingMember || pinningMember) && (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
                  )}
                <button
                    className="p-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => setIsActionMenuOpen(!isActionMenuOpen)}
                    disabled={archivingMember || deletingMember || pinningMember}
                >
                  <FiMoreVertical className="h-5 w-5" />
                </button>
                </div>
                {isActionMenuOpen && (
                  <div
                    ref={actionMenuRef}
                    className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200"
                  >
                    {isManager && (
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          if (member) {
                            handlePin(!member.isPinned)
                          }
                        }}
                        disabled={pinningMember || archivingMember || deletingMember || !member}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-black hover:text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                      >
                        {pinningMember ? (
                          <>
                            <div className="animate-spin rounded-full h-3 w-3 border-b border-gray-700 mr-2"></div>
                            {member?.isPinned ? 'Unpinning...' : 'Pinning...'}
                          </>
                        ) : (
                          <>
                            <FiStar className="mr-2" />
                            {member?.isPinned ? 'Unpin' : 'Pin'}
                          </>
                        )}
                      </button>
                    )}
                    {isAdmin && (
                      <>
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            if (member) {
                              handlePin(!member.isPinned)
                            }
                          }}
                          disabled={pinningMember || archivingMember || deletingMember || !member}
                          className="block w-full text-left px-4 py-2 text-sm text-gray hover:bg-black hover:text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                        >
                          {pinningMember ? (
                            <>
                              <div className="animate-spin rounded-full h-3 w-3 border-b border-gray-700 mr-2"></div>
                              {member?.isPinned ? 'Unpinning...' : 'Pinning...'}
                            </>
                          ) : (
                            <>
                              <FiStar className="mr-2" />
                              {member?.isPinned ? 'Unpin' : 'Pin'}
                            </>
                          )}
                        </button>
                        <button
                          onClick={handleArchive}
                          disabled={archivingMember || deletingMember || pinningMember}
                          className="block w-full text-left px-4 py-2 text-sm text-gray hover:bg-black hover:text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                        >
                          {archivingMember ? (
                            <>
                              <div className="animate-spin rounded-full h-3 w-3 border-b border-gray-700 mr-2"></div>
                              Archiving...
                            </>
                          ) : (
                            <>
                              <FiArchive className="mr-2" />
                              Archive
                            </>
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            if (hasPendingOrUnsubmittedHours || deletingMember || archivingMember || pinningMember) {
                              e.preventDefault()
                              e.stopPropagation()
                              return
                            }
                            handleDelete()
                          }}
                          disabled={hasPendingOrUnsubmittedHours || deletingMember || archivingMember || pinningMember}
                          title={hasPendingOrUnsubmittedHours ? 'Cannot delete member with pending or unsubmitted time entries' : ''}
                          className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-black hover:text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                        >
                          {deletingMember ? (
                            <>
                              <div className="animate-spin rounded-full h-3 w-3 border-b border-red-600 mr-2"></div>
                              Deleting...
                            </>
                          ) : (
                            <>
                              <FiTrash2 className="mr-2" />
                              Delete
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Column */}
          <div className="w-full lg:max-w-[400px] lg:flex-shrink-0 space-y-6">
            {/* Weekly Hours Overview – time entry (te) reference commented out */}
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <div className="flex justify-between items-start mb-4">
                  <div>
                      <h3 className="text-lg font-semibold text-gray-600">Total hours</h3>
                      <p className="font-bold text-2xl">{formatSimpleTime(timesheet?.totalHours || 0)}</p>
                  </div>
                  <div className="text-right">
                      <h3 className="text-lg font-semibold text-gray-600">Capacity</h3>
                      <p className="font-bold text-2xl">{capacity}h</p>
                  </div>
              </div>

              {/* Time entry bar commented out – using timesheet percentages */}
              <div className="w-full bg-gray-200 h-5 flex text-xs text-white items-center mb-4">
                  <div className="bg-[#376bdd] h-5 flex items-center justify-center" style={{ width: `${capacity ? ((timesheet?.billableHours ?? 0) / capacity) * 100 : 0}%` }}>
                  </div>
                  <div className="bg-[#86b1f1] h-5 flex items-center justify-center" style={{ width: `${capacity ? ((timesheet?.nonBillableHours ?? 0) / capacity) * 100 : 0}%` }}>
                  </div>
              </div>

              <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                      <div className="flex items-center">
                          <div className="w-4 h-4 bg-[#376bdd] mr-2 rounded"></div>
                          <span>Billable</span>
                      </div>
                      <strong>{formatSimpleTime(timesheet?.billableHours || 0)}</strong>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                      <div className="flex items-center">
                          <div className="w-4 h-4 bg-[#86b1f1] mr-2 rounded"></div>
                          <span>Non-Billable</span>
                      </div>
                      <strong>{formatSimpleTime(timesheet?.nonBillableHours || 0)}</strong>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                      <div className="flex items-center">
                          <div className="w-4 h-4 bg-gray-200 border mr-2 rounded"></div>
                          <span>Unused</span>
                      </div>
                      <strong>{formatSimpleTime(Math.max(0, capacity - (timesheet?.totalHours ?? 0)))}</strong>
                  </div>
              </div>
            </div>

            {/* Daily Breakdown – time entry row commented out */}
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <div className="flex justify-between mt-4 pt-4 border-t border-gray-200">
                {dailyData.map(day => {
                  const timesheetHoursForDay = timesheet?.entries
                    ? timesheet.entries.filter(e => e.date === day.date).reduce((sum, e) => sum + e.hours, 0)
                    : 0
                  return (
                    <div key={`ts-${day.date}`} className="text-center">
                      <p className="text-sm text-gray-500">{day.name}</p>
                      <p className="font-bold text-md text-blue-600">{formatSimpleTime(timesheetHoursForDay)}</p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Timesheet Project Breakdown */}
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h3 className="text-lg font-semibold mb-4">Project Breakdown</h3>
              <div className="space-y-4">
                {timesheetProjectChartData.length > 0 ? (
                  <>
                    <div className="w-full bg-gray-200 h-5 mb-2 flex rounded overflow-hidden">
                      {timesheetProjectChartData.map((project, index) => (
                        <div
                          key={index}
                          className="h-full"
                          style={{
                            width: `${totalTimesheetHours > 0 ? (project.hours / totalTimesheetHours) * 100 : 0}%`,
                            backgroundColor: project.fill,
                          }}
                          title={`${project.name}: ${formatSimpleTime(project.hours)}`}
                        ></div>
                      ))}
                    </div>
                    {timesheetProjectChartData.map((project, index) => (
                      <div key={index} className="flex justify-between items-center">
                        <div className="flex items-center">
                          <div className="w-4 h-4 mr-2 rounded" style={{ backgroundColor: project.fill }}></div>
                          <span className="text-sm font-medium">{project.name}</span>
                        </div>
                        <span className="text-sm font-bold">{formatSimpleTime(project.hours)}</span>
                      </div>
                    ))}
                  </>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">No timesheet project data available</p>
                )}
              </div>
            </div>

            {/* Timesheet Task Breakdown */}
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h3 className="text-lg font-semibold mb-4">Task Breakdown</h3>
              <div className="space-y-4">
                {timesheetTaskChartData.length > 0 ? (
                  <>
                    <div className="w-full bg-gray-200 h-5 mb-2 flex rounded overflow-hidden">
                      {timesheetTaskChartData.map((task, index) => (
                        <div
                          key={index}
                          className="h-full"
                          style={{
                            width: `${totalTimesheetHours > 0 ? (task.hours / totalTimesheetHours) * 100 : 0}%`,
                            backgroundColor: task.fill,
                          }}
                          title={`${task.name}: ${formatSimpleTime(task.hours)}`}
                        ></div>
                      ))}
                    </div>
                    {timesheetTaskChartData.map((task, index) => (
                      <div key={index} className="flex justify-between items-center">
                        <div className="flex items-center">
                          <div className="w-4 h-4 mr-2 rounded" style={{ backgroundColor: task.fill }}></div>
                          <span className="text-sm font-medium">{task.name}</span>
                        </div>
                        <span className="text-sm font-bold">{formatSimpleTime(task.hours)}</span>
                      </div>
                    ))}
                  </>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">No timesheet task data available</p>
                )}
              </div>
            </div>
            
          </div>

          {/* Right Column */}
          <div className="flex-1 min-w-0 space-y-6">
            <div>
              {/* Timesheet Daily Breakdown */}
              <div className="mt-0">
                {dailyData.map(day => {
                  const timesheetEntriesForDay = timesheet?.entries ? timesheet.entries.filter(e => e.date === day.date) : []
                  const dayTotal = timesheetEntriesForDay.reduce((sum, e) => sum + e.hours, 0)
                  const hasEntries = timesheetEntriesForDay.length > 0
                  
                  return (
                    <div key={`timesheet-${day.date}`} className={`bg-white p-4 rounded-lg shadow-sm mb-4 ${hasEntries ? '' : ''}`}>
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="font-semibold">{format(parseISO(day.date), 'EEEE, MMM d')}</h4>
                        {hasEntries && <span className="text-sm font-medium text-blue-600"></span>}
                      </div>
                      {hasEntries ? (
                        <>
                          {timesheetEntriesForDay.map(entry => (
                            <div key={entry._key} className="border-t py-2">
                              <div className="flex justify-between items-center">
                                <div className="flex-1">
                                  <p className="font-medium text-sm">{entry.project.name}</p>
                                  {entry.task && <p className="text-xs text-gray-500">{entry.task.name}</p>}
                                  {entry.notes && <p className="text-xs text-gray-500 mt-1 truncate max-w-xs">{entry.notes}</p>}
                                </div>
                                <div className="text-right mx-4">
                                  <p className={`font-bold text-sm ${entry.isBillable ? 'text-green-600' : ''}`}>
                                    {formatSimpleTime(entry.hours)}
                                  </p>
                                </div>
                                {isAdmin ? (
                                  <button onClick={() => handleEditTimesheetEntry(entry)} className="text-sm text-blue-600 hover:underline">
                                    <FiEdit />
                                  </button>
                                ) : (
                                  <div className="relative group">
                                    <button className="text-sm text-gray-400 cursor-not-allowed" disabled>
                                      <FiLock />
                                    </button>
                                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block bg-gray-800 text-white text-xs rounded py-1 px-2 whitespace-nowrap">
                                      Only admins can edit this
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                          <div className="border-t py-2 bg-gray-50">
                            <div className="flex justify-between items-center">
                              <div className="flex-1">
                                <p className="font-semibold text-sm">Total</p>
                              </div>
                              <div className="text-right mx-4">
                                <p className="font-bold text-sm">{formatSimpleTime(dayTotal)}</p>
                              </div>
                              <div className="w-4"></div> {/* Spacer for alignment */}
                            </div>
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-gray-500">No entries for this day.</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}