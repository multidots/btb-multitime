import { NextRequest, NextResponse } from 'next/server'
import { sanityFetch, mutationClient } from '@/lib/sanity'
import { requireAdminOrManagerApi, AuthError } from '@/lib/auth'

// Sanity transaction limit is 200 mutations per transaction
const TRANSACTION_LIMIT = 200

// POST /api/tasks/add-to-all-projects - Add task to all active projects
export async function POST(request: NextRequest) {
  try {
    await requireAdminOrManagerApi()

    const body = await request.json()
    const { taskId } = body

    if (!taskId) {
      return NextResponse.json(
        { error: 'Task ID is required' },
        { status: 400 }
      )
    }

    // Get all active projects with their current tasks
    const projectsQuery = `*[_type == "project" && isActive == true]{
      _id,
      tasks
    }`
    const allProjects = await sanityFetch<Array<{ _id: string; tasks?: Array<{ _ref: string }> }>>({ query: projectsQuery })

    if (!allProjects || allProjects.length === 0) {
      return NextResponse.json(
        { error: 'No active projects found' },
        { status: 404 }
      )
    }

    // Filter projects that don't already have this task
    const projectsToUpdate = allProjects.filter(project =>
      !project.tasks || !project.tasks.some(task => task._ref === taskId)
    )

    if (projectsToUpdate.length === 0) {
      return NextResponse.json({
        message: 'Task is already added to all active projects',
        projectCount: 0
      }, { status: 200 })
    }

    const timestamp = Date.now()
    const totalProjects = projectsToUpdate.length

    // If within limit, use single transaction; otherwise batch
    if (totalProjects <= TRANSACTION_LIMIT) {
      // Single transaction for all updates (optimal for ≤200 projects)
      const transaction = mutationClient.transaction()

      projectsToUpdate.forEach((project, index) => {
        const taskKey = `task-${taskId}-${timestamp}-${index}`
        
        transaction.patch(project._id, patch => 
          patch
            .setIfMissing({ tasks: [] })  // Ensure tasks array exists for projects with no tasks
            .append('tasks', [{ 
              _type: 'reference', 
              _ref: taskId,
              _key: taskKey
            }])
        )
      })

      await transaction.commit()

      return NextResponse.json({
        message: `Task successfully added to ${totalProjects} project${totalProjects !== 1 ? 's' : ''}`,
        projectCount: totalProjects,
        transactionsUsed: 1
      }, { status: 200 })
    }

    // Batch processing for large datasets (> 200 projects)
    const batches: Array<typeof projectsToUpdate> = []
    for (let i = 0; i < totalProjects; i += TRANSACTION_LIMIT) {
      batches.push(projectsToUpdate.slice(i, i + TRANSACTION_LIMIT))
    }

    let totalUpdated = 0

    for (const batch of batches) {
      const transaction = mutationClient.transaction()

      batch.forEach((project, index) => {
        const globalIndex = totalUpdated + index
        const taskKey = `task-${taskId}-${timestamp}-${globalIndex}`
        
        transaction.patch(project._id, patch => 
          patch
            .setIfMissing({ tasks: [] })  // Ensure tasks array exists for projects with no tasks
            .append('tasks', [{ 
              _type: 'reference', 
              _ref: taskId,
              _key: taskKey
            }])
        )
      })

      await transaction.commit()
      totalUpdated += batch.length
    }

    return NextResponse.json({
      message: `Task successfully added to ${totalProjects} project${totalProjects !== 1 ? 's' : ''}`,
      projectCount: totalProjects,
      transactionsUsed: batches.length
    }, { status: 200 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      )
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to add task to all projects: ${errorMessage}` },
      { status: 500 }
    )
  }
}
