import { NextRequest, NextResponse } from 'next/server'
import { sanityFetch, mutationClient } from '@/lib/sanity'
import { requireAdminOrManagerApi, AuthError } from '@/lib/auth'

// Sanity transaction limit is 200 mutations per transaction
const TRANSACTION_LIMIT = 200

// POST /api/job-categories/bulk - Bulk operations on job categories (delete)
export async function POST(request: NextRequest) {
  try {
    await requireAdminOrManagerApi()

    const body = await request.json()
    const { roleIds, operation } = body

    if (!roleIds || !Array.isArray(roleIds) || roleIds.length === 0) {
      return NextResponse.json(
        { error: 'Role IDs are required' },
        { status: 400 }
      )
    }

    if (!operation || operation !== 'delete') {
      return NextResponse.json(
        { error: 'Valid operation (delete) is required' },
        { status: 400 }
      )
    }

    // Batch check if all job categories exist
    const existingCategories = await sanityFetch<Array<{ _id: string; name: string }>>({
      query: `*[_type == "jobcategory" && _id in $roleIds]{
        _id,
        name
      }`,
      params: { roleIds }
    })

    const existingMap = new Map<string, { _id: string; name: string }>()
    existingCategories.forEach(cat => {
      existingMap.set(cat._id, cat)
    })

    const results: Array<{ id: string; name: string; status: string }> = []
    const errors: Array<{ id: string; error: string }> = []

    // Check for missing categories
    roleIds.forEach(roleId => {
      if (!existingMap.has(roleId)) {
        errors.push({ id: roleId, error: 'Role not found' })
      }
    })

    const validRoleIds = roleIds.filter(id => existingMap.has(id))

    if (validRoleIds.length === 0) {
      return NextResponse.json({
        message: 'No valid roles to delete',
        results,
        errors,
        successCount: 0,
        errorCount: errors.length
      })
    }

    // Batch get all users assigned to these job categories
    const usersByCategory = await sanityFetch<Array<{ categoryId: string; userId: string }>>({
      query: `*[_type == "user" && jobCategory._ref in $roleIds]{
        "categoryId": jobCategory._ref,
        "userId": _id
      }`,
      params: { roleIds: validRoleIds }
    })

    // Group users by category
    const usersToUnset = new Map<string, string[]>()
    usersByCategory.forEach(({ categoryId, userId }) => {
      if (!usersToUnset.has(categoryId)) {
        usersToUnset.set(categoryId, [])
      }
      usersToUnset.get(categoryId)!.push(userId)
    })

    // Process each category
    for (const roleId of validRoleIds) {
      try {
        const existing = existingMap.get(roleId)!
        const userIds = usersToUnset.get(roleId) || []

        // Remove jobCategory from all users using batched transactions
        if (userIds.length > 0) {
          const batches: string[][] = []
          for (let i = 0; i < userIds.length; i += TRANSACTION_LIMIT) {
            batches.push(userIds.slice(i, i + TRANSACTION_LIMIT))
          }

          for (const batch of batches) {
            const transaction = mutationClient.transaction()
            batch.forEach(userId => {
              transaction.patch(userId, patch => patch.unset(['jobCategory']))
            })
            await transaction.commit()
          }
        }

        // Delete the job category document
        await mutationClient.delete(roleId)

        results.push({ id: roleId, name: existing.name, status: 'deleted' })
      } catch (error) {
        errors.push({ id: roleId, error: error instanceof Error ? error.message : 'Unknown error' })
      }
    }

    const count = results.length
    const message = count === 1 
      ? `Role deleted successfully`
      : `${count} roles deleted successfully`

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

