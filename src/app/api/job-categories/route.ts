import { NextRequest, NextResponse } from 'next/server'
import { sanityFetch, mutationClient, createSanityDocument } from '@/lib/sanity'
import { requireAdminOrManagerApi, AuthError } from '@/lib/auth'

// POST /api/job-categories - Create new job category and assign users
export async function POST(request: NextRequest) {
  try {
    await requireAdminOrManagerApi()

    const body = await request.json()
    const { name, userIds }: { name: string; userIds: string[] } = body

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Role name is required' },
        { status: 400 }
      )
    }

    // Generate slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    // Check if job category with same name already exists
    const existing = await sanityFetch<{ _id: string }[]>({
      query: `*[_type == "jobcategory" && name == $name][0]`,
      params: { name }
    })

    if (existing) {
      return NextResponse.json(
        { error: 'A role with this name already exists' },
        { status: 400 }
      )
    }

    // Create the job category
    const jobCategoryData = {
      _type: 'jobcategory',
      name: name.trim(),
      slug: { _type: 'slug', current: slug },
    }

    const jobCategory = await createSanityDocument(jobCategoryData)

    // Update users' jobCategory if userIds provided
    if (userIds && userIds.length > 0) {
      const transactions = userIds.map((userId) => ({
        patch: {
          id: userId,
          set: {
            jobCategory: {
              _type: 'reference',
              _ref: jobCategory._id,
            },
          },
        },
      }))

      await mutationClient.transaction(transactions).commit()
    }

    return NextResponse.json({ jobCategory }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      )
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to create job category: ${errorMessage}` },
      { status: 500 }
    )
  }
}

