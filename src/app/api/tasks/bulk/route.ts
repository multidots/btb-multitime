import { NextRequest, NextResponse } from 'next/server'
import { sanityFetch, mutationClient } from '@/lib/sanity'
import { requireAdminOrManagerApi, AuthError } from '@/lib/auth'

// Sanity transaction limit is 200 mutations per transaction
const TRANSACTION_LIMIT = 200

// Helper function to check references for multiple tasks at once (optimized)
async function getTaskReferencesBatch(taskIds: string[]): Promise<Map<string, { projectCount: number; timeEntryCount: number; projectNames: string[] }>> {
  const resultMap = new Map<string, { projectCount: number; timeEntryCount: number; projectNames: string[] }>()
  
  // Initialize all tasks with zero references
  taskIds.forEach(taskId => {
    resultMap.set(taskId, { projectCount: 0, timeEntryCount: 0, projectNames: [] })
  })

  // Optimize: Run both queries in parallel since they are independent
  const [projectsUsingTasks, timeEntryCounts] = await Promise.all([
    // Batch query: Get all projects that reference any of these tasks
    sanityFetch<Array<{ _id: string; name: string; taskRefs: string[] }>>({
      query: `*[_type == "project" && references($taskIds)]{
        _id,
        name,
        "taskRefs": tasks[]._ref
      }`,
      params: { taskIds }
    }),
    // Batch query: Get time entry counts for all tasks
    sanityFetch<Array<{ taskId: string }>>({
      query: `*[_type == "timesheet" && status != "approved" && count(entries[task._ref in $taskIds]) > 0].entries[task._ref in $taskIds]{
        "taskId": task._ref
      }`,
      params: { taskIds }
    })
  ])

  // Count time entries per task
  const timeEntryMap = new Map<string, number>()
  timeEntryCounts.forEach(entry => {
    const current = timeEntryMap.get(entry.taskId) || 0
    timeEntryMap.set(entry.taskId, current + 1)
  })

  // Count projects per task
  projectsUsingTasks.forEach(project => {
    if (project.taskRefs) {
      project.taskRefs.forEach(taskRef => {
        if (resultMap.has(taskRef)) {
          const current = resultMap.get(taskRef)!
          current.projectCount++
          current.projectNames.push(project.name)
        }
      })
    }
  })

  // Set time entry counts
  timeEntryMap.forEach((count, taskId) => {
    if (resultMap.has(taskId)) {
      resultMap.get(taskId)!.timeEntryCount = count
    }
  })

  return resultMap
}

// POST /api/tasks/bulk - Bulk operations on tasks (archive, delete)
export async function POST(request: NextRequest) {
  try {
    await requireAdminOrManagerApi()

    const body = await request.json()
    const { taskIds, operation } = body


    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json(
        { error: 'Task IDs are required' },
        { status: 400 }
      )
    }

    if (!operation || (operation !== 'delete' && operation !== 'archive')) {
      return NextResponse.json(
        { error: 'Valid operation (delete or archive) is required' },
        { status: 400 }
      )
    }

    const results: Array<{ id: string; status: string }> = []
    const errors: Array<{ id: string; error: string; suggestion?: string }> = []

    // Batch check references for delete operations
    let taskReferences: Map<string, { projectCount: number; timeEntryCount: number; projectNames: string[] }> | null = null
    if (operation === 'delete') {
      taskReferences = await getTaskReferencesBatch(taskIds)
    }

    // Separate tasks into those that can be processed and those that have errors
    const tasksToProcess: string[] = []
    const taskErrors: Array<{ id: string; error: string; suggestion?: string }> = []

    for (const taskId of taskIds) {
      if (operation === 'delete' && taskReferences) {
        const refs = taskReferences.get(taskId) || { projectCount: 0, timeEntryCount: 0, projectNames: [] }
        
        if (refs.projectCount > 0 || refs.timeEntryCount > 0) {
          // Task has references, cannot delete
          let errorDetails = 'Task is in use'
          const details: string[] = []
          
          if (refs.projectCount > 0) {
            details.push(`Referenced in ${refs.projectCount} project${refs.projectCount > 1 ? 's' : ''}: ${refs.projectNames.join(', ')}`)
          }
          if (refs.timeEntryCount > 0) {
            details.push(`Used in ${refs.timeEntryCount} time entr${refs.timeEntryCount > 1 ? 'ies' : 'y'}`)
          }
          
          errorDetails = details.join('. ')
          taskErrors.push({ 
            id: taskId, 
            error: errorDetails,
            suggestion: 'Consider archiving instead of deleting'
          })
          continue
        }
      }
      
      tasksToProcess.push(taskId)
    }

    // Batch process archive operations using transactions
    if (operation === 'archive' && tasksToProcess.length > 0) {
      const batches: string[][] = []
      for (let i = 0; i < tasksToProcess.length; i += TRANSACTION_LIMIT) {
        batches.push(tasksToProcess.slice(i, i + TRANSACTION_LIMIT))
      }

      for (const batch of batches) {
        const transaction = mutationClient.transaction()
        
        batch.forEach(taskId => {
          transaction.patch(taskId, patch => patch.set({ isArchived: true }))
        })
        
        try {
          await transaction.commit()
          batch.forEach(taskId => {
            results.push({ id: taskId, status: 'archived' })
          })
        } catch (error) {
          // If transaction fails, add all tasks in batch to errors
          batch.forEach(taskId => {
            errors.push({ 
              id: taskId, 
              error: error instanceof Error ? error.message : 'Failed to archive task' 
            })
          })
        }
      }
    }

    // Batch process delete operations (deletes must be done individually, not in transactions)
    if (operation === 'delete' && tasksToProcess.length > 0) {
      // Process deletes in smaller chunks to avoid overwhelming the API
      const deleteBatches: string[][] = []
      for (let i = 0; i < tasksToProcess.length; i += 50) {
        deleteBatches.push(tasksToProcess.slice(i, i + 50))
      }

      for (const batch of deleteBatches) {
        await Promise.all(
          batch.map(async (taskId) => {
            try {
              await mutationClient.delete(taskId)
              results.push({ id: taskId, status: 'deleted' })
            } catch (error) {
              errors.push({ 
                id: taskId, 
                error: error instanceof Error ? error.message : 'Failed to delete task' 
              })
            }
          })
        )
      }
    }

    // Add task errors to errors array
    errors.push(...taskErrors)

    const count = results.length
    const operationText = operation === 'archive' ? 'archive' : 'delete'
    const message = count === 1 
      ? `Task ${operationText}d successfully`
      : `${count} tasks ${operationText}d successfully`

    return NextResponse.json({
      message,
      results,
      errors,
      successCount: results.length,
      errorCount: errors.length
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      )
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to perform bulk operation' },
      { status: 500 }
    )
  }
}
