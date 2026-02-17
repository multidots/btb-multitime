import { NextRequest, NextResponse } from 'next/server'
import { sanityFetch, mutationClient } from '@/lib/sanity'
import { requireAdminOrManagerApi, AuthError } from '@/lib/auth'

// PUT /api/job-categories/[id] - Update job category and reassign users
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdminOrManagerApi()

    const { id } = params
    const body = await request.json()
    const { name, userIds }: { name: string; userIds: string[] } = body

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Role name is required' },
        { status: 400 }
      )
    }

    // Check if job category exists
    const existing = await sanityFetch<{ _id: string; name: string }>({
      query: `*[_type == "jobcategory" && _id == $id][0]`,
      params: { id }
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Role not found' },
        { status: 404 }
      )
    }

    // Check if another job category with same name already exists (excluding current one)
    const duplicate = await sanityFetch<{ _id: string }>({
      query: `*[_type == "jobcategory" && name == $name && _id != $id][0]`,
      params: { name: name.trim(), id }
    })

    if (duplicate) {
      return NextResponse.json(
        { error: 'A role with this name already exists' },
        { status: 400 }
      )
    }

    // Generate slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    // Update the job category
    const jobCategory = await mutationClient
      .patch(id)
      .set({
        name: name.trim(),
        slug: { _type: 'slug', current: slug },
      })
      .commit()

    // Get all users currently assigned to this job category
    const currentUsers = await sanityFetch<{ _id: string }[]>({
      query: `*[_type == "user" && jobCategory._ref == $categoryId]{
        _id
      }`,
      params: { categoryId: id }
    })

    const currentUserIds = new Set(currentUsers.map(u => u._id))
    const newUserIds = new Set(userIds || [])
    
    // Users to remove (in current but not in new)
    const usersToRemove = Array.from(currentUserIds).filter(id => !newUserIds.has(id))
    // Users to add (in new but not in current)
    const usersToAdd = Array.from(newUserIds).filter(id => !currentUserIds.has(id))

    // Build transactions for user updates
    const transactions: any[] = []

    // Remove jobCategory from users that are no longer assigned
    usersToRemove.forEach((userId) => {
      transactions.push({
        patch: {
          id: userId,
          unset: ['jobCategory'],
        },
      })
    })

    // Add jobCategory to new users
    usersToAdd.forEach((userId) => {
      transactions.push({
        patch: {
          id: userId,
          set: {
            jobCategory: {
              _type: 'reference',
              _ref: id,
            },
          },
        },
      })
    })

    // Execute all user updates in a transaction
    if (transactions.length > 0) {
      await mutationClient.transaction(transactions).commit()
    }

    return NextResponse.json({ jobCategory })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      )
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to update job category: ${errorMessage}` },
      { status: 500 }
    )
  }
}

// DELETE /api/job-categories/[id] - Delete job category (only the role, not users)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdminOrManagerApi()

    const { id } = params

    // Check if job category exists
    const existing = await sanityFetch<{ _id: string; name: string }>({
      query: `*[_type == "jobcategory" && _id == $id][0]`,
      params: { id }
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Role not found' },
        { status: 404 }
      )
    }

    // Get all users assigned to this job category
    const users = await sanityFetch<{ _id: string }[]>({
      query: `*[_type == "user" && jobCategory._ref == $categoryId]{
        _id
      }`,
      params: { categoryId: id }
    })

    // Build transactions to remove jobCategory from all users
    const transactions: any[] = []

    users.forEach((user) => {
      transactions.push({
        patch: {
          id: user._id,
          unset: ['jobCategory'],
        },
      })
    })

    // Remove jobCategory from all users first
    if (transactions.length > 0) {
      await mutationClient.transaction(transactions).commit()
    }

    // Delete the job category document
    await mutationClient.delete(id)

    return NextResponse.json({
      message: 'Role deleted successfully',
      deletedUsersCount: users.length
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      )
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to delete job category: ${errorMessage}` },
      { status: 500 }
    )
  }
}

