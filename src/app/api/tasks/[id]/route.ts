import { NextRequest, NextResponse } from 'next/server'
import { sanityFetch, updateSanityDocument, hardDeleteSanityDocument } from '@/lib/sanity'
import { requireAdminOrManagerApi, AuthError } from '@/lib/auth'

// GET /api/tasks/[id] - Get specific task
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdminOrManagerApi()

    const { id } = params

    const query = `
      *[_type == "task" && _id == $id][0] {
        _id,
        name,
        slug,
        projects[]->{
          _id,
          name,
          code,
          client->{_id, name}
        },
        isBillable,
        category->{
          _id,
          name,
          slug,
          color,
          icon
        },
        createdAt,
        updatedAt
      }
    `

    const task = await sanityFetch<any>({
      query,
      params: { id }
    })

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ task })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      )
    }
    return NextResponse.json(
      { error: 'Failed to fetch task' },
      { status: 500 }
    )
  }
}

// PUT /api/tasks/[id] - Update specific task
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdminOrManagerApi()

    const { id } = params
    const body = await request.json()
    const {
      name,
      projectIds,
      isBillable,
      category,
      isArchived
    } = body

    // Build update object
    const updateData: any = {
      updatedAt: new Date().toISOString(),
    }

    // Handle isArchived update (for restore functionality)
    if (isArchived !== undefined) {
      updateData.isArchived = isArchived
    }

    // If name is provided, update name and slug
    if (name) {
      // Generate slug from name
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
      
      updateData.name = name
      updateData.slug = { _type: 'slug', current: slug }
    }

    // Update other fields if provided
    if (projectIds !== undefined) {
      updateData.projects = projectIds && projectIds.length > 0 
        ? projectIds.map((projectId: string) => ({ _type: 'reference', _ref: projectId })) 
        : []
    }

    if (isBillable !== undefined) {
      updateData.isBillable = isBillable
    }

    if (category !== undefined) {
      updateData.category = category ? { _type: 'reference', _ref: category } : undefined
    }

    // If only isArchived is being updated, we don't need name
    if (Object.keys(updateData).length === 2 && updateData.isArchived !== undefined && updateData.updatedAt) {
      // Only updating isArchived, no need to validate name
    } else if (!name && isArchived === undefined) {
      // If updating other fields, name is required
      return NextResponse.json(
        { error: 'Task name is required' },
        { status: 400 }
      )
    }

    const task = await updateSanityDocument(id, updateData)

    return NextResponse.json({ task })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      )
    }
    return NextResponse.json(
      { error: 'Failed to update task' },
      { status: 500 }
    )
  }
}


// DELETE /api/tasks/[id] - Delete specific task
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdminOrManagerApi()

    const { id } = params

    // Check if task exists and get its name
    const task = await sanityFetch<{ _id: string; name: string } | null>({
      query: `*[_type == "task" && _id == $id][0]{ _id, name }`,
      params: { id }
    })

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      )
    }

    // Check if task is referenced in any projects
    const projectsUsingTask = await sanityFetch<Array<{ _id: string; name: string }>>({
      query: `*[_type == "project" && references($taskId)]{ _id, name }`,
      params: { taskId: id }
    })

    // Count total time entries
    const timeEntryCount = await sanityFetch<number>({
      query: `count(*[_type == "timesheet" && status != "approved" && ^._id in entries[].task._ref])`,
      params: { taskId: id }
    })

    // If task is referenced, return error with details
    if (projectsUsingTask.length > 0 || timeEntryCount > 0) {
      let errorMessage = `Cannot delete task "${task.name}" because it is currently in use.`
      const details: string[] = []

      if (projectsUsingTask.length > 0) {
        const projectNames = projectsUsingTask.map(p => p.name).join(', ')
        details.push(`Referenced in ${projectsUsingTask.length} project${projectsUsingTask.length > 1 ? 's' : ''}: ${projectNames}`)
      }

      if (timeEntryCount > 0) {
        details.push(`Used in ${timeEntryCount} time entr${timeEntryCount > 1 ? 'ies' : 'y'}`)
      }

      return NextResponse.json(
        { 
          error: errorMessage,
          details: details,
          suggestion: 'Consider archiving this task instead of deleting it.',
          referencedIn: {
            projects: projectsUsingTask,
            timeEntryCount: timeEntryCount
          }
        },
        { status: 409 } // Conflict status code
      )
    }

    // Hard delete the task if no references
    await hardDeleteSanityDocument(id)

    return NextResponse.json({ message: 'Task deleted successfully' })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      )
    }
    
    // Provide more specific error messages
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    // Handle specific Sanity errors
    if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: 'Task not found or already deleted' },
        { status: 404 }
      )
    }
    
    if (errorMessage.includes('Insufficient permissions')) {
      return NextResponse.json(
        { error: 'Permission denied. Please check your Sanity API token permissions.' },
        { status: 403 }
      )
    }
    
    if (errorMessage.includes('transaction failed') || errorMessage.includes('references')) {
      return NextResponse.json(
        { 
          error: 'Cannot delete this task because it is referenced by other documents.',
          suggestion: 'Consider archiving this task instead of deleting it.'
        },
        { status: 409 }
      )
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
