import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { client, mutationClient } from '@/lib/sanity'

// PUT /api/projects/[id] - Update an existing project
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admins and managers can update projects
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Handle both Promise and direct params (for Next.js compatibility)
    const resolvedParams = params instanceof Promise ? await params : params
    const projectId = resolvedParams.id

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
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
      assignedUsers = [],
      inactiveUserIds = [], // Users that should have isActive: false
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

    // Fetch existing project to get current assignedUsers
    const existingProject = await client.fetch(
      `*[_type == "project" && _id == $projectId][0]{
        assignedUsers[]{
          "userId": user._ref,
          role,
          isActive,
          _key
        }
      }`,
      { projectId }
    )

    // Build a map of existing assigned users by user ID
    const existingUsersMap = new Map<string, { role?: string; isActive: boolean; _key?: string }>()
    if (existingProject?.assignedUsers) {
      existingProject.assignedUsers.forEach((au: any) => {
        if (au.userId) {
          existingUsersMap.set(au.userId, {
            role: au.role,
            isActive: au.isActive ?? true,
            _key: au._key
          })
        }
      })
    }

    // Build the new assignedUsers array
    // Include all existing users (with updated isActive status) and add new ones
    const newAssignedUsers: Array<{
      _type: string
      _key: string
      user: { _type: string; _ref: string }
      role: string
      isActive: boolean
    }> = []

    // Process users from the form
    // Check if user is in inactiveUserIds to set isActive appropriately
    assignedUsers.forEach((userId: string, index: number) => {
      const existingUser = existingUsersMap.get(userId)
      const role = projectManagers?.includes(userId) ? 'Project Manager' : 'Team Member'
      const shouldBeInactive = inactiveUserIds.includes(userId)
      
      newAssignedUsers.push({
        _type: 'object',
        _key: existingUser?._key || `assigned-user-${userId}-${index}`,
        user: { _type: 'reference', _ref: userId },
        role: role,
        isActive: !shouldBeInactive // Set to false if in inactiveUserIds, true otherwise
      })
      
      // Remove from map so we know it's been processed
      existingUsersMap.delete(userId)
    })

    // Process remaining existing users (these should be set to inactive)
    existingUsersMap.forEach((userData, userId) => {
      newAssignedUsers.push({
        _type: 'object',
        _key: userData._key || `assigned-user-${userId}-${Date.now()}`,
        user: { _type: 'reference', _ref: userId },
        role: userData.role || 'Team Member',
        isActive: false
      })
    })

    // Update project
    const updatedProject = await mutationClient
      .patch(projectId)
      .set({
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
        assignedUsers: newAssignedUsers,
        tasks: tasks.map((taskId: string, index: number) => ({
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
        // updatedAt: new Date().toISOString(), // no need to update this field
      })
      .commit()

    return NextResponse.json(updatedProject, { status: 200 })
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
        error: 'Failed to update project. Please check your Sanity configuration.' 
      }, { status: 400 })
    }
    
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// PATCH /api/projects/[id] - Archive a project
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admins and managers can archive projects
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Handle both Promise and direct params (for Next.js compatibility)
    const resolvedParams = params instanceof Promise ? await params : params
    const projectId = resolvedParams.id

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    const body = await request.json()
    const { isArchived } = body

    if (typeof isArchived !== 'boolean') {
      return NextResponse.json({ error: 'isArchived must be a boolean' }, { status: 400 })
    }

    // Archive/unarchive the project by setting isArchived and isActive
    // When archiving: set isArchived=true and isActive=false
    // When restoring: set isArchived=false and isActive=true
    const updatedProject = await mutationClient
      .patch(projectId)
      .set({ 
        isArchived,
        isActive: !isArchived // If archiving (true), set isActive to false. If restoring (false), set isActive to true
      })
      .commit()

    return NextResponse.json({
      ...updatedProject,
      message: isArchived ? 'Project archived successfully' : 'Project restored successfully'
    }, { status: 200 })
  } catch (error: any) {
    
    // Check if error is because document doesn't exist
    if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
      return NextResponse.json({ 
        error: 'Project not found'
      }, { status: 404 })
    }
    
    // Handle specific Sanity permission errors
    if (error.message?.includes('Insufficient permissions')) {
      return NextResponse.json({ 
        error: 'Permission denied. Please check your Sanity API token permissions.' 
      }, { status: 403 })
    }
    
    // Handle other Sanity errors
    if (error.message?.includes('transaction failed')) {
      return NextResponse.json({ 
        error: 'Failed to archive project. Please check your Sanity configuration.' 
      }, { status: 400 })
    }
    
    return NextResponse.json({ 
      error: error.message || 'Internal Server Error'
    }, { status: 500 })
  }
}

// DELETE /api/projects/[id] - Delete a project
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admins can delete projects
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Handle both Promise and direct params (for Next.js compatibility)
    const resolvedParams = params instanceof Promise ? await params : params
    const projectId = resolvedParams.id

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    // Parallelize independent queries for better performance
    const [project, timeEntryCount, tasksUsingProject] = await Promise.all([
      // Check if project exists and get its name
      client.fetch<{ _id: string; name: string } | null>(
        `*[_type == "project" && _id == $projectId][0]{ _id, name }`,
        { projectId }
      ),
      // Check if project is referenced in non-approved timesheet entries
      // (approved timesheets should not block deletion)
      client.fetch<number>(
        `count(*[_type == "timesheet" && status != "approved" && count(entries[project._ref == $projectId]) > 0].entries[project._ref == $projectId])`,
        { projectId }
      ),
      // Check if project is referenced in tasks
      client.fetch<Array<{ _id: string; name: string }>>(
        `*[_type == "task" && references($projectId)]{ _id, name }`,
        { projectId }
      )
    ])

    if (!project) {
      return NextResponse.json({ 
        error: 'Project not found' 
      }, { status: 404 })
    }

    // If project is referenced, return error with details
    if (timeEntryCount > 0 || tasksUsingProject.length > 0) {
      let errorMessage = `Cannot delete project "${project.name}" because it is currently in use.`
      const details: string[] = []

      if (timeEntryCount > 0) {
        details.push(`Used in ${timeEntryCount} pending/unsubmitted time entr${timeEntryCount > 1 ? 'ies' : 'y'}`)
      }

      if (tasksUsingProject.length > 0) {
        const taskNames = tasksUsingProject.slice(0, 5).map(t => t.name).join(', ')
        const moreCount = tasksUsingProject.length > 5 ? ` and ${tasksUsingProject.length - 5} more` : ''
        details.push(`Referenced in ${tasksUsingProject.length} task${tasksUsingProject.length > 1 ? 's' : ''}: ${taskNames}${moreCount}`)
      }

      return NextResponse.json({ 
        error: errorMessage,
        details: details,
        suggestion: 'Consider archiving this project instead of deleting it.',
        referencedIn: {
          timeEntryCount: timeEntryCount,
          tasks: tasksUsingProject
        }
      }, { status: 409 }) // Conflict status code
    }

    // Delete the project from Sanity
    // Note: Sanity's delete will throw an error if it fails, 
    // so if we reach here, the deletion was successful
    await mutationClient.delete(projectId)

    return NextResponse.json({ 
      message: 'Project deleted successfully',
      deleted: true 
    }, { status: 200 })
  } catch (error: any) {
    
    // Check if error is because document doesn't exist (already deleted)
    if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
      return NextResponse.json({ 
        message: 'Project already deleted or does not exist',
        deleted: true 
      }, { status: 200 })
    }
    
    // Handle specific Sanity permission errors
    if (error.message?.includes('Insufficient permissions')) {
      return NextResponse.json({ 
        error: 'Permission denied. Please check your Sanity API token permissions.' 
      }, { status: 403 })
    }
    
    // Handle reference errors
    if (error.message?.includes('transaction failed') || error.message?.includes('references')) {
      return NextResponse.json({ 
        error: 'Cannot delete this project because it is referenced by other documents.',
        suggestion: 'Consider archiving this project instead of deleting it.'
      }, { status: 409 })
    }
    
    return NextResponse.json({ 
      error: error.message || 'Internal Server Error',
      details: error.toString()
    }, { status: 500 })
  }
}
