// GROQ Queries for Sanity

// User Queries
export const USER_QUERY = `*[_type == "user" && _id == $id && isArchived != true][0]{
  _id,
  firstName,
  lastName,
  email,
  avatar,
  role,
  department,
  jobCategory->{name},
  capacity,
  isActive,
  permissions
}`

export const USERS_QUERY = `*[_type == "user" && isActive == true && isArchived != true] | order(firstName asc){
  _id,
  firstName,
  lastName,
  email,
  "avatar": avatar.asset->url,
  role,
  department,
  isActive
}`

// Project Queries
export const PROJECT_QUERY = `*[_type == "project" && _id == $id][0]{
  _id,
  name,
  slug,
  code,
  client->{_id, name},
  description,
  status,
  billableType,
  projectType,
  dates,
  team->{_id, name},
  assignedUsers[]{
    user->{_id, firstName, lastName, avatar},
    role,
    isActive
  },
  budget,
  tasks[]->{
    _id,
    name,
    slug,
    description,
    isBillable,
    isActive,
    isArchived,
    category,
    estimatedHours,
    "timeEntries": *[_type == "timeEntry" && task._ref == ^._id && project._ref == $id]{
      _id,
      user->{_id, firstName, lastName},
      date,
      hours,
      isBillable,
      isApproved,
      isLocked,
      isRunning,
      notes,
      startTime,
      endTime,
      createdAt,
      updatedAt
    },
    "timeEntryCount": count(*[_type == "timeEntry" && task._ref == ^._id && project._ref == $id]),
    "billableTimeEntryCount": count(*[_type == "timeEntry" && task._ref == ^._id && project._ref == $id && isBillable == true]),
    "totalHours": math::sum(*[_type == "timeEntry" && task._ref == ^._id && project._ref == $id].hours),
    "billableHours": math::sum(*[_type == "timeEntry" && task._ref == ^._id && project._ref == $id && isBillable == true].hours)
  },
  tags,
  permission,
  "totalHours": math::sum(*[_type == "timeEntry" && references(^._id)].hours),
  "totalBillableHours": math::sum(*[_type == "timeEntry" && references(^._id) && defined(task) && task->isBillable == true].hours),
  "timeEntries": *[_type == "timeEntry" && references(^._id)]{
    _id,
    date,
    hours,
    task->{isBillable}
  },
  isActive
}`

export const PROJECTS_QUERY = `*[_type == "project" && (isActive == true || isArchived == true) && ($userRole != "manager" || $userId in assignedUsers[].user._ref )] | order(name asc){
  _id,
  name,
  slug,
  code,
  description,
  client->{_id, name},
  status,
  billableType,
  projectType,
  dates,
  budget,
  assignedUsers[]{
    user->{_id, firstName, lastName, avatar},
    role,
    isActive
  },
  tasks[]->{
    _id,
    name,
    slug,
    description,
    isBillable,
    isActive,
    isArchived,
    category,
    estimatedHours
  },
  "timeEntries": count(*[_type == "timeEntry" && references(^._id)]),
  "totalHours": math::sum(*[_type == "timeEntry" && references(^._id)].hours),
  permission,
  isActive,
  isArchived
}`

export const USER_ASSIGNED_PROJECTS_QUERY = `*[_type == "project" && (isActive == true || isArchived == true) && ($userId in assignedUsers[].user._ref )] | order(name asc){
  _id,
  name,
  slug,
  code,
  description,
  client->{_id, name},
  status,
  billableType,
  projectType,
  dates,
  budget,
  assignedUsers[]{
    user->{_id, firstName, lastName, avatar},
    role,
    isActive
  },
  tasks[]->{
    _id,
    name,
    slug,
    description,
    isBillable,
    isActive,
    isArchived,
    category,
    estimatedHours
  },
  "timeEntries": count(*[_type == "timeEntry" && references(^._id)]),
  "totalHours": math::sum(*[_type == "timeEntry" && references(^._id)].hours),
  permission,
  isActive,
  isArchived
}`

export const PROJECTS_BY_STATUS_QUERY = `*[_type == "project" && status == $status && isActive == true] | order(name asc){
  _id,
  name,
  code,
  client->{_id, name},
  status,
  dates,
  "tasks": count(tasks),
  "totalHours": math::sum(*[_type == "timeEntry" && references(^._id)].hours)
}`

// Time Entry Queries - Optimized with proper filtering and pagination
export const TIME_ENTRY_QUERY = `*[_type == "timeEntry" && _id == $id][0]{
  _id,
  user->{_id, firstName, lastName},
  project->{_id, name, code, client->{name}},
  task->{
    _id,
    name,
    isBillable
  },
  date,
  hours,
  startTime,
  endTime,
  isRunning,
  notes,
  isBillable,
  isApproved,
  isLocked
}`

export const TIME_ENTRIES_QUERY = `*[_type == "timeEntry" && user._ref == $userId && date >= $startDate && date <= $endDate] | order(date desc, _createdAt desc)[$offset...$limit]{
  _id,
  project->{_id, name, code},
  task->{_id, name},
  date,
  hours,
  notes,
  isBillable,
  isRunning,
  isApproved,
  isLocked,
  createdAt,
  updatedAt
}`

export const RUNNING_TIMER_QUERY = `*[_type == "timeEntry" && user._ref == $userId && isRunning == true][0]{
  _id,
  project->{_id, name, code},
  task->{_id, name},
  startTime,
  notes
}`

// Dashboard Queries - Optimized for better performance
export const ADMIN_DASHBOARD_QUERY = `{
  "totalProjects": count(*[_type == "project" && isActive == true]),
  "activeProjects": count(*[_type == "project" && isActive == true]),
  "totalUsers": count(*[_type == "user" && isActive == true && isArchived != true]),
  "totalClients": count(*[_type == "client" && !(_id in path("drafts.**"))]),
  "thisWeekHours": math::sum(*[_type == "timeEntry" && date >= $weekStart && date <= $weekEnd && isBillable == true].hours),
  "thisMonthHours": math::sum(*[_type == "timeEntry" && date >= $monthStart && date <= $monthEnd && isBillable == true].hours),
  "pendingTimeEntries": count(*[_type == "timeEntry" && isLocked == true && (isApproved == false || isApproved == null)]),
  "recentProjects": *[_type == "project" && isActive == true] | order(_createdAt desc)[0..4]{
    _id,
    name,
    code,
    client->{name},
    status,
    dates
  },
  "recentTimeEntries": *[_type == "timeEntry"] | order(_createdAt desc)[0..9]{
    _id,
    user->{firstName, lastName},
    project->{name, code},
    date,
    hours,
    isBillable
  }
}`

export const USER_DASHBOARD_QUERY = `{
  "user": *[_type == "user" && _id == $userId && isActive == true && isArchived != true][0]{
    _id,
    firstName,
    lastName,
    avatar,
    capacity,
  "assignedProjects": *[_type == "project" && !(_id in path("drafts.**")) && isActive == true && (^._id in assignedUsers[isActive == true].user._ref )] | order(name asc){
      _id,
      name,
      code,
      client->{name},
      tasks[]->{
        _id,
        name,
        slug,
        description,
        isBillable,
        isActive,
        isArchived,
        category,
        estimatedHours
      }
    }
  },
  "thisWeekHours": math::sum(*[_type == "timeEntry" && user._ref == $userId && date >= $weekStart && date <= $weekEnd].hours),
  "todayHours": math::sum(*[_type == "timeEntry" && user._ref == $userId && date == $today && isBillable == true].hours),
  "runningTimer": *[_type == "timeEntry" && user._ref == $userId && isRunning == true][0]{
    _id,
    project->{_id, name, code},
    task->{_id, name},
    startTime,
    notes
  },
  "recentEntries": *[_type == "timeEntry" && user._ref == $userId && date >= $weekStart && date <= $weekEnd] | order(date desc, _createdAt desc)[0..20]{
    _id,
    project->{_id, name, code, client->{name}},
    task->{_id, name, isBillable},
    date,
    hours,
    notes,
    isBillable,
    isRunning,
    isApproved,
    isLocked,
    submittedAt
  }
}`

// Report Queries
// Date format: YYYY-MM-DD
export const TIME_REPORT_QUERY = `*[_type == "timeEntry" && date >= $startDate && date <= $endDate]{
  _id,
  user->{_id, firstName, lastName},
  project->{_id, name, code, client->{_id, name}, isActive, isArchived},
  task->{_id, name},
  date,
  hours,
  isBillable
}`
export const TIME_REPORT_QUERY_FOR_CLIENT = `*[_type == "timeEntry" && date >= $startDate && date <= $endDate && project->client._ref == $clientId]{
  _id,
  user->{_id, firstName, lastName},
  project->{_id, name, code, client->{_id, name}, isActive, isArchived},
  task->{_id, name},
  date,
  hours,
  isBillable
}`

export const TIME_REPORT_QUERY_FOR_PROJECT = `*[_type == "timeEntry" && date >= $startDate && date <= $endDate && project._ref == $projectId]{
  _id,
  user->{_id, firstName, lastName},
  project->{_id, name, code, client->{_id, name}, isActive, isArchived},
  task->{_id, name},
  date,
  hours,
  isBillable
}`

export const TIME_REPORT_QUERY_FOR_TASK = `*[_type == "timeEntry" && date >= $startDate && date <= $endDate && task._ref == $taskId]{
  _id,
  user->{_id, firstName, lastName},
  project->{_id, name, code, client->{_id, name}, isActive, isArchived},
  task->{_id, name},
  date,
  hours,
  isBillable
}`

export const USER_TIME_REPORT_QUERY = `*[_type == "timeEntry" && user._ref == $userId && date >= $startDate && date <= $endDate]{
  _id,
  user->{_id, firstName, lastName},
  project->{_id, name, code, client->{_id, name}, isActive, isArchived},
  task->{_id, name},
  date,
  hours,
  isBillable
}`

// Query to get team member IDs for a manager
export const MANAGER_TEAM_MEMBERS_QUERY = `*[_type == "team" && manager._ref == $managerId && isActive == true]{
  members[]->{_id}
}`

// Query for manager time report (team members + self)
export const TEAM_TIME_REPORT_QUERY = `*[_type == "timeEntry" && user._ref in $userIds && date >= $startDate && date <= $endDate]{
  _id,
  user->{_id, firstName, lastName},
  project->{_id, name, code, client->{_id, name}, isActive, isArchived},
  task->{_id, name},
  date,
  hours,
  isBillable
}`

// Manager time report query - fetches time entries for:
// 1. Manager's own entries
// 2. Team members (from teams where manager is the manager)
// 3. Users assigned to projects where manager is assigned with role "Project Manager"
//    (only entries from those projects, and only from users who are assigned to those projects)
export const MANAGER_TIME_REPORT_QUERY = `*[_type == "timeEntry" && date >= $startDate && date <= $endDate && (
  user._ref == $managerId ||
  user._ref in *[_type == "team" && manager._ref == $managerId && isActive == true].members[]._ref ||
  (
    project._ref in *[_type == "project" && (isActive == true || isArchived == true) && count(assignedUsers[user._ref == $managerId && role == "Project Manager"]) > 0]._id &&
    user._ref in *[_type == "project" && _id == ^.project._ref].assignedUsers[].user._ref
  )
)]{
  _id,
  user->{_id, firstName, lastName},
  project->{_id, name, code, client->{_id, name}, isActive, isArchived},
  task->{_id, name},
  date,
  hours,
  isBillable
}`

export const PROJECT_REPORT_QUERY = `*[_type == "project" && _id == $projectId][0]{
  _id,
  name,
  code,
  client->{_id, name},
  dates,
  "timeEntries": *[_type == "timeEntry" && ^._id in tasks[]._ref]{
    _id,
    user->{_id, firstName, lastName},
    task->{_id, name},
    date,
    hours,
    isBillable
  },
  "totalHours": math::sum(*[_type == "timeEntry" && ^._id in tasks[]._ref].hours),
  "billableHours": math::sum(*[_type == "timeEntry" && ^._id in tasks[]._ref && isBillable == true].hours)
}`

// Client Queries
export const CLIENTS_QUERY = `*[_type == "client" && !(_id in path("drafts.**")) && isActive == true && isArchived != true] | order(name asc){
  _id,
  name,
  slug,
  contacts,
  address,
  preferredCurrency,
  isActive,
  isArchived,
  "projectCount": count(*[_type == "project" && client._ref == ^._id])
}`

export const teamQuery = `*[_type == "user" && !(_id in path("drafts.**"))]{
  _id,
  name,
  email,
  role,
  "avatar": avatar.asset->url,
  "permissions": permissions,
  "jobCategory": jobCategory->{name},
  "archived": archived
}`

// Team Queries
export const TEAMS_QUERY = `*[_type == "team" && isActive == true && !(_id in path("drafts.**"))] | order(name asc){
  _id,
  name,
  description,
  manager->{_id, firstName, lastName, avatar},
  members[]->{_id, firstName, lastName, avatar},
  color
}`

// Task Queries
export const TASK_QUERY = `*[_type == "task" && _id == $id][0]{
  _id,
  name,
  slug,
  description,
  isBillable,
  isActive,
  isArchived,
  category->{
    _id,
    name,
    slug,
    color,
    icon
  },
  estimatedHours,
  createdAt,
  updatedAt
}`


export const ALL_TASKS_QUERY = `*[_type == "task" && isArchived != true] | order(createdAt desc){
  _id,
  name,
  slug,
  description,
  isBillable,
  isActive,
  isArchived,
  category->{
    _id,
    name,
    slug,
    color,
    icon
  },
  estimatedHours,
  createdAt,
  updatedAt
}`

export const ACTIVE_TASKS_QUERY = `*[_type == "task" && isActive == true && isArchived != true] | order(createdAt desc){
  _id,
  name,
  slug,
  description,
  isBillable,
  isActive,
  isArchived,
  category->{
    _id,
    name,
    slug,
    color,
    icon
  },
  estimatedHours,
  createdAt,
  updatedAt
}`

export const ARCHIVED_TASKS_QUERY = `*[_type == "task" && isArchived == true] | order(createdAt desc){
  _id,
  name,
  slug,
  description,
  isBillable,
  isActive,
  isArchived,
  category->{
    _id,
    name,
    slug,
    color,
    icon
  },
  estimatedHours,
  createdAt,
  updatedAt
}`

export const TASKS_BY_CATEGORY_QUERY = `*[_type == "task" && category._ref == $categoryId && isActive == true && isArchived != true] | order(name asc){
  _id,
  name,
  slug,
  description,
  isBillable,
  isActive,
  isArchived,
  category->{
    _id,
    name,
    slug,
    color,
    icon
  },
  estimatedHours,
  createdAt,
  updatedAt
}`

export const TASK_STATS_QUERY = `{
  "totalTasks": count(*[_type == "task"]),
  "activeTasks": count(*[_type == "task" && isActive == true && isArchived != true]),
  "archivedTasks": count(*[_type == "task" && isArchived == true]),
  "billableTasks": count(*[_type == "task" && isBillable == true && isActive == true && isArchived != true]),
  "tasksByCategory": *[_type == "task" && isActive == true && isArchived != true && defined(category)] {
    category->{
      _id,
      name,
      slug,
      color,
      icon
    }
  } | group(category._ref) | {category: category[0], count: count()},
  "tasksByProject": *[_type == "project" && isActive == true] {
    _id,
    name,
    code,
    "taskCount": count(tasks)
  } | order(taskCount desc)
}`

export const PROJECTS_FOR_TASK_DUPLICATION_QUERY = `*[_type == "project" && isActive == true] | order(name asc){
  _id,
  name,
  code,
  client->{_id, name}
}`

// Category Queries
export const CATEGORIES_QUERY = `*[_type == "category"] | order(name asc){
  _id,
  name,
  slug,
  description,
  color,
  icon
}`

export const CATEGORY_QUERY = `*[_type == "category" && _id == $id][0]{
  _id,
  name,
  slug,
  description,
  color,
  icon,
  isActive
}`

export const JOB_CATEGORIES_QUERY = `*[_type == "jobcategory" ] | order(name asc){
  _id,
  name,
  slug
}`