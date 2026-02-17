// Type definitions for the application

export interface User {
  _id: string
  firstName: string
  lastName: string
  email: string
  avatar?: any
  role: 'admin' | 'manager' | 'user'
  team?: Team
  department?: string
  jobCategory?: { name: string }
  capacity?: number
  rate?: number
  timezone?: string
  isActive: boolean
  isArchived?: boolean
  isSanityAdmin?: boolean
  sanityUserId?: string
  permissions?: {
    canManageProjects?: boolean
    canManageUsers?: boolean
    canViewReports?: boolean
    canManageClients?: boolean
    canApproveTimeEntries?: boolean
  }
}

export interface Contact {
  _key?: string
  firstName: string
  lastName: string
  email: string
  title?: string
  officePhone?: string
  mobilePhone?: string
  faxNumber?: string
  isPrimary: boolean
}

export interface Team {
  _id: string
  name: string
  slug: string
  description?: string
  manager?: User
  members?: User[]
  isActive: boolean
}

export interface Client {
  _id: string
  name: string
  slug: string
  contacts?: Contact[]
  address?: string
  preferredCurrency?: string
  contactInfo?: {
    primaryContact?: string
    email?: string
    phone?: string
    address?: string
  }
  billingInfo?: {
    billingEmail?: string
    billingAddress?: string
  }
  isActive: boolean
}

// The Project interface
export interface Project {
  _id: string
  name: string
  slug: string
  code?: string
  client: Client
  description?: string
  status: 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled'
  billableType: 'billable' | 'non_billable'
  projectType?: string
  permission?: 'admin' | 'everyone'
  dates?: {
    startDate?: string
    endDate?: string
  }
  projectManager?: User
  team?: Team
  assignedUsers?: Array<{
    user: User
    role?: string
    isActive: boolean
  }>
  tasks?: Task[]
  tags?: string[]
  isActive: boolean
  isArchived?: boolean
  totalHours?: number
  totalBillableHours?: number
  timeEntries?: Array<{
    _id: string
    date: string
    hours: number
    task?: {
      isBillable: boolean
    }
  }>
  // Timesheet-based hours (stored on project, auto-updated when entries change)
  timesheetHours?: number
  timesheetApprovedHours?: number
  timesheetBillableHours?: number
  // Timesheet entries with user info (for task breakdown)
  timesheetEntriesWithUsers?: Array<{
    user: {
      _id: string
      firstName: string
      lastName: string
    }
    status: string
    entries: Array<{
      _key: string
      date: string
      hours: number
      isBillable: boolean
      notes?: string
      taskId?: string
    }>
  }>
  budget?: {
    type?: string;
    totalProjectHours?: number
  }
}

export interface Task {
  _id: string
  name: string
  slug: string
  description?: string
  isBillable: boolean
  isActive: boolean
  isArchived: boolean
  category?: string
  estimatedHours?: number
  // Computed fields from queries
  totalHours?: number
  billableHours?: number
  timesheetHours?: number
  timesheetApprovedHours?: number
  createdAt: string
  updatedAt: string
}

export interface TimeEntry {
  _id: string
  user: User
  project: Project
  task?: Task
  date: string
  hours: number
  startTime?: string
  endTime?: string
  isRunning: boolean
  notes?: string
  isBillable: boolean
  isApproved: boolean
  approvedBy?: User
  approvedAt?: string
  isLocked: boolean
  createdAt: string
  updatedAt?: string
}

// Weekly Timesheet types
export interface TimesheetEntry {
  _key: string
  date: string
  project: {
    _ref: string
    _id?: string
    name?: string
    code?: string
  }
  task?: {
    _ref: string
    _id?: string
    name?: string
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

export interface TimesheetEntryExpanded {
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

export type TimesheetStatus = 'unsubmitted' | 'submitted' | 'approved' | 'rejected'

export interface Timesheet {
  _id: string
  _type: 'timesheet'
  user: { _ref: string }
  weekStart: string
  weekEnd: string
  year: number
  weekNumber: number
  status: TimesheetStatus
  entries: TimesheetEntry[]
  totalHours: number
  billableHours: number
  nonBillableHours: number
  hasRunningTimer: boolean
  submittedAt?: string
  approvedBy?: { _ref: string }
  approvedAt?: string
  rejectedAt?: string
  rejectionReason?: string
  isLocked: boolean
  createdAt: string
  updatedAt?: string
}

export interface TimesheetExpanded extends Omit<Timesheet, 'user' | 'entries' | 'approvedBy'> {
  user: {
    _id: string
    firstName: string
    lastName: string
    email?: string
    avatar?: string
  }
  entries: TimesheetEntryExpanded[]
  approvedBy?: {
    _id: string
    firstName: string
    lastName: string
  }
}

export interface Report {
  _id: string
  name: string
  slug: string
  type: 'time' | 'project' | 'user' | 'client' | 'custom'
  description?: string
  filters?: {
    dateRange?: {
      startDate?: string
      endDate?: string
    }
    projects?: Project[]
    users?: User[]
    clients?: Client[]
    teams?: Team[]
  }
  schedule?: {
    enabled: boolean
    frequency?: 'daily' | 'weekly' | 'monthly' | 'quarterly'
    recipients?: string[]
  }
  createdBy?: User
  isPublic: boolean
  createdAt: string
}

/** Timesheet with entries for admin dashboard recent list */
export interface TimesheetWithEntries {
  _id: string
  user?: { firstName?: string; lastName?: string }
  entries?: Array<{
    _key: string
    date?: string
    hours?: number
    isBillable?: boolean
    project?: { name?: string; code?: string }
  }>
}

export interface DashboardStats {
  totalProjects?: number
  activeProjects?: number
  totalUsers?: number
  totalClients?: number
  thisWeekHours?: number
  thisMonthHours?: number
  todayHours?: number
  pendingTimeEntries?: number
  recentProjects?: Project[]
  recentTimeEntries?: TimeEntry[]
  recentTimesheets?: TimesheetWithEntries[]
}