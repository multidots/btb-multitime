import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { sanityFetch } from '@/lib/sanity'

// GET /api/categories - Get all job categories
export async function GET(request: NextRequest) {
  try {
    // Authentication check
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const query = `*[_type == "jobcategory" && !(_id in path("drafts.**"))] | order(name asc){
      _id,
      name,
      slug
    }`

    const categories = await sanityFetch<{
      _id: string
      name: string
      slug: {
        current: string
      }
    }[]>({ query })

    return NextResponse.json(categories)
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
