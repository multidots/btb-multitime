import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@sanity/client'
import { requireAdminApi } from '@/lib/auth'

// Use environment variables directly (works on Vercel and locally)
const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || process.env.SANITY_STUDIO_DATASET
const apiToken = process.env.SANITY_API_TOKEN

if (!projectId || !dataset || !apiToken) {
}

const client = createClient({
  projectId: projectId!,
  dataset: dataset!,
  apiVersion: '2024-01-01',
  token: apiToken!,
  useCdn: false,
})

export async function POST(request: NextRequest) {
  try {
    // Require admin authentication
    await requireAdminApi()

    const defaultCategorySlug = 'common-tasks'

    // Check if it already exists
    const existing = await client.fetch(
      `*[_type == "category" && slug.current == $slug][0]`,
      { slug: defaultCategorySlug }
    )

    if (existing) {
      return NextResponse.json(
        {
          success: true,
          message: 'Default category already exists',
          category: existing,
        },
        { status: 200 }
      )
    }

    // Create the default category
    const newCategory = await client.create({
      _type: 'category',
      name: 'Common Tasks (This is a common task, and should be added to all future projects)',
      slug: { _type: 'slug', current: defaultCategorySlug },
      description: 'Default category for general tasks and activities.',
      color: 'blue',
      icon: 'other',
      isActive: true,
    })

    return NextResponse.json(
      {
        success: true,
        message: 'Default category created successfully',
        category: newCategory,
      },
      { status: 201 }
    )
  } catch (error: any) {
    
    // Handle authentication errors
    if (error.statusCode === 401 || error.statusCode === 403) {
      return NextResponse.json(
        { error: error.message || 'Unauthorized' },
        { status: error.statusCode }
      )
    }

    return NextResponse.json(
      { error: error.message || 'Failed to create default category' },
      { status: 500 }
    )
  }
}

