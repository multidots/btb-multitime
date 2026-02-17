import { sanityFetch } from '@/lib/sanity'
import { TIMESHEET_BY_USER_WEEK_QUERY } from '@/lib/queries'
import { format, startOfWeek } from 'date-fns'

/** Projects with tasks - same shape as /api/projects/with-tasks for assigned user */
const PROJECTS_WITH_TASKS_QUERY = `*[_type == "project" && isActive == true && !(_id in path("drafts.**")) && count(assignedUsers[user._ref == $userId && isActive == true]) > 0] | order(name asc) {
  _id,
  name,
  code,
  tasks[]->{
    _id,
    name,
    isBillable,
    isArchived
  }
}`

export interface TimesheetDataTimesheet {
  _id: string
  user: { _id: string; firstName: string; lastName: string; email?: string }
  weekStart: string
  weekEnd: string
  year: number
  weekNumber: number
  status: 'unsubmitted' | 'submitted' | 'approved' | 'rejected'
  entries: Array<{
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
  }>
  totalHours: number
  billableHours: number
  nonBillableHours: number
  hasRunningTimer: boolean
  isLocked: boolean
  createdAt: string
  updatedAt?: string
  submittedAt?: string
  approvedBy?: { _id: string; firstName: string; lastName: string }
  approvedAt?: string
}

export interface TimesheetDataProject {
  _id: string
  name: string
  code?: string
  tasks?: Array<{ _id: string; name: string; isBillable?: boolean; isArchived?: boolean }>
}

export interface TimesheetDataResult {
  timesheet: TimesheetDataTimesheet | null
  projects: TimesheetDataProject[]
  weekStart: string
}

interface GetTimesheetDataProps {
  userId: string
  weekStart?: string
}

/**
 * Server-side data for the user timesheet page.
 * Mirrors the dashboard pattern: fetch timesheet + projects so the client can hydrate with initialData.
 */
export async function getTimesheetData({
  userId,
  weekStart: weekStartParam,
}: GetTimesheetDataProps): Promise<TimesheetDataResult> {
  const currentWeek = new Date()
  const weekStart = weekStartParam ?? format(startOfWeek(currentWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd')

  const [timesheet, projectsResult] = await Promise.all([
    sanityFetch<TimesheetDataTimesheet | null>({
      query: TIMESHEET_BY_USER_WEEK_QUERY,
      params: { userId, weekStart },
    }),
    sanityFetch<TimesheetDataProject[]>({
      query: PROJECTS_WITH_TASKS_QUERY,
      params: { userId },
    }),
  ])

  return {
    timesheet: timesheet ?? null,
    projects: Array.isArray(projectsResult) ? projectsResult : [],
    weekStart,
  }
}
