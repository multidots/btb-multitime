import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { sanityFetch } from '@/lib/sanity'
import { authOptions } from '@/lib/authOptions'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Only admins can fetch unassigned users
    const isAdmin = session.user.role === 'admin' || session.user.isSanityAdmin
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Only admins can fetch unassigned users' },
        { status: 403 }
      )
    }

    // Get search query and managerId from params
    const searchParams = request.nextUrl.searchParams
    const searchQuery = searchParams.get('search') || ''
    const managerId = searchParams.get('managerId') || ''

    // Query to find users excluding:
    // 1. The currently editing manager (if managerId is provided)
    // 2. Inactive or archived users
    // Include all roles: user, admin, and manager
    let filterQuery = '*[_type == "user" && role in ["user", "admin", "manager"] && isActive == true && isArchived != true'
    
    // Exclude the currently editing manager
    if (managerId) {
      filterQuery += ` && _id != "${managerId}"`
    }
    
    // Exclude users already in teams (they are "assigned")
    filterQuery += ` && !(
      _id in *[_type == "team" && isActive == true].members[]._ref
    )`
    
    // Add search filter
    if (searchQuery) {
      filterQuery += ` && (
        firstName match "${searchQuery}*" ||
        lastName match "${searchQuery}*" ||
        email match "${searchQuery}*"
      )`
    }
    
    filterQuery += `] {
      _id,
      firstName,
      lastName,
      email,
      avatar,
      role
    } | order(firstName asc, lastName asc)`

    const unassignedUsers = await sanityFetch({
      query: filterQuery,
      params: {}
    })

    return NextResponse.json(unassignedUsers || [])
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch unassigned users' },
      { status: 500 }
    )
  }
}
