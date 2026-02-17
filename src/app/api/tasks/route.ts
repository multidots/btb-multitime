import { NextRequest, NextResponse } from 'next/server'
import { sanityFetch, createSanityDocument } from '@/lib/sanity'
import { requireAdminOrManagerApi, AuthError } from '@/lib/auth'

// GET /api/tasks - List all tasks
export async function GET(request: NextRequest) {
  try {
    await requireAdminOrManagerApi()

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const includeArchived = searchParams.get('includeArchived') === 'true'
    const categoryId = searchParams.get('categoryId')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100) // Cap at 100 for performance
    const offset = parseInt(searchParams.get('offset') || '0')

    // Optimized: Build conditions array instead of string concatenation
    const conditions = [
      '_type == "task"',
      includeArchived ? null : 'isArchived != true',
      '!(_id in path("drafts.**"))',
      projectId ? '$projectId in projects[]._ref' : null,
      categoryId ? 'category._ref == $categoryId' : null
    ].filter(Boolean)

    const params: any = { offset, limit }
    if (projectId) params.projectId = projectId
    if (categoryId) params.categoryId = categoryId

    const query = `*[${conditions.join(' && ')}] | order(createdAt desc) [$offset...$limit] {
      _id,
      name,
      slug,
      projects[]->{
        _id,
        name,
        code,
        client->{name}
      },
      isBillable,
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

    const tasks = await sanityFetch<any[]>({ query, params })

    return NextResponse.json({ tasks })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      )
    }
    return NextResponse.json(
      { error: 'Failed to fetch tasks' },
      { status: 500 }
    )
  }
}

// POST /api/tasks - Create new task
export async function POST(request: NextRequest) {
  try {
    await requireAdminOrManagerApi()

    const body = await request.json()
    const {
      name,
      projectIds,
      isBillable = true,
      category
    }: {
      name: string
      projectIds?: string[]
      isBillable?: boolean
      category?: string
    } = body


    if (!name) {
      return NextResponse.json(
        { error: 'Task name is required' },
        { status: 400 }
      )
    }

    // Check if task with same name already exists
    const existingTaskQuery = `*[_type == "task" && lower(name) == lower($name) && !(_id in path("drafts.**"))][0]`
    const existingTask = await sanityFetch<any>({ query: existingTaskQuery, params: { name: name.trim() } })
    
    if (existingTask) {
      return NextResponse.json(
        { error: `A task with the name "${name}" already exists. Please use a different name.` },
        { status: 409 }
      )
    }

    // Generate slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    const taskData = {
      _type: 'task',
      name,
      slug: { _type: 'slug', current: slug },
      projects: projectIds && projectIds.length > 0 ? projectIds.map(projectId => ({ _type: 'reference', _ref: projectId })) : [],
      isBillable,
      category: category ? { _type: 'reference', _ref: category } : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const task = await createSanityDocument(taskData)

    return NextResponse.json({ task }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      )
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to create task: ${errorMessage}` },
      { status: 500 }
    )
  }
}
