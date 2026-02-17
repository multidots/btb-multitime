import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { client, sanityFetch, createSanityDocument, updateSanityDocument } from '@/lib/sanity'

// Create a separate client with explicit write permissions for mutations
const mutationClient = client.withConfig({
  useCdn: false,
  token: process.env.SANITY_API_TOKEN,
})

// GET /api/projects - Get all projects
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admins and managers can view all projects
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')
    const assignedTo = searchParams.get('assignedTo')

    // Optimized: Single query with conditional filters (maintaining original if-else-if-else logic)
    const conditions = [
      '_type == "project"',
      '!(_id in path("drafts.**"))',
      // Original logic: if assignedTo, else if clientId, else isActive
      assignedTo 
        ? 'isActive == true && count(assignedUsers[user._ref == $assignedTo]) > 0'
        : clientId 
          ? 'client._ref == $clientId'  // No isActive filter for clientId (includes archived)
          : 'isActive == true'  // Default: only active projects
    ].filter(Boolean)

    const params: any = {}
    if (assignedTo) params.assignedTo = assignedTo
    if (clientId) params.clientId = clientId

    const query = `*[${conditions.join(' && ')}] | order(name asc) {
      _id,
      name,
      code,
      slug,
      client->{_id, name},
      status,
      billableType,
      dates,
      team->{_id, name},
      assignedUsers[]{
        user->{_id, firstName, lastName, avatar},
        role,
        isActive
      },
      isActive,
      createdAt
    }`

    const projects = await sanityFetch<any[]>({ query, params })

    return NextResponse.json({ projects })
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// POST /api/projects - Create a new project
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admins and managers can create projects
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { 
      name, 
      code, 
      clientId, 
      description, 
      status, 
      billableType, 
      startDate, 
      endDate, 
      // projectManagerId, 
      // teamIds = [],
      assignedUsers = [],
      tasks = [],
      projectType,
      budgetType,
      totalProjectHours,
      projectManagers = [],
      permission = 'admin',
      isActive = true 
    } = body

    // Validation
    if (!name || !clientId) {
      return NextResponse.json(
        { error: 'Project name and client are required' },
        { status: 400 }
      )
    }

    // Validate budget fields
    if (budgetType === 'total-project-hours' && (!totalProjectHours || totalProjectHours <= 0)) {
      return NextResponse.json(
        { error: 'Total project hours is required when budget type is set to total project hours' },
        { status: 400 }
      )
    }

    // Create slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    // Get common tasks that should be automatically added to all projects
    // Tasks under the "common-tasks" category (by slug) are automatically added to all projects
    const commonTasks = await sanityFetch<string[]>({
      query: `*[_type == "task" && category->slug.current == "common-tasks" && !(_id in path("drafts.**"))]._id`
    })

    // Combine manually selected tasks with common tasks, avoiding duplicates
    const allTaskIds = [...new Set([...tasks, ...commonTasks])]

    // Create project
    const newProject = await mutationClient.create({
      _type: 'project',
      name,
      slug: {
        _type: 'slug',
        current: slug
      },
      code: code || undefined,
      client: { _type: 'reference', _ref: clientId },
      description: description || undefined,
      status: status || 'planning',
      billableType: billableType || 'billable',
      dates: {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      },
      // projectManager: projectManagerId ? { _type: 'reference', _ref: projectManagerId } : undefined,
      // teams: teamIds.map((teamId: string, index: number) => ({
      //   _type: 'reference',
      //   _ref: teamId,
      //   _key: `team-${teamId}-${index}`
      // })),
      assignedUsers: assignedUsers.map((userId: string, index: number) => ({
        _type: 'object',
        _key: `assigned-user-${userId}-${index}`,
        user: { _type: 'reference', _ref: userId },
        role: projectManagers?.includes(userId) ? 'Project Manager' : 'Team Member',
        isActive: true
      })),
      tasks: allTaskIds.map((taskId: string, index: number) => ({
        _type: 'reference',
        _ref: taskId,
        _key: `task-${taskId}-${index}`
      })),
      projectType: projectType || 'timeAndMaterials',
      budget: {
        type: budgetType || 'no-budget',
        totalProjectHours: budgetType === 'total-project-hours' ? Number(totalProjectHours) : undefined
      },
      permission: permission || 'admin',
      isActive,
      createdAt: new Date().toISOString(),
    })

    return NextResponse.json({
      ...newProject,
      commonTasksAdded: commonTasks.length,
      totalTasks: allTaskIds.length
    }, { status: 201 })
  } catch (error: any) {
    
    // Handle specific Sanity permission errors
    if (error.message?.includes('Insufficient permissions')) {
      return NextResponse.json({ 
        error: 'Permission denied. Please check your Sanity API token permissions.' 
      }, { status: 403 })
    }
    
    // Handle other Sanity errors
    if (error.message?.includes('transaction failed')) {
      return NextResponse.json({ 
        error: 'Failed to create project. Please check your Sanity configuration.' 
      }, { status: 400 })
    }
    
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}