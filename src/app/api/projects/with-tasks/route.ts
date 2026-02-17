import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { sanityFetch } from '@/lib/sanity'

// GET /api/projects/with-tasks - Get projects with their tasks
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = session.user.role
    const userId = session.user.id

    let query: string
    let params: Record<string, string> = {}

    if (userRole === 'admin' || (session.user as any).isSanityAdmin) {
      // Admins see all active projects
      query = `*[_type == "project" && isActive == true && !(_id in path("drafts.**"))] | order(name asc) {
        _id,
        name,
        code,
        tasks[]->{
          _id,
          name,
          isBillable,
          isArchived
        }
      }`
    } else if (userRole === 'manager') {
      // Managers see projects where they are assigned
      query = `*[_type == "project" && isActive == true && !(_id in path("drafts.**")) && count(assignedUsers[user._ref == $userId && isActive == true]) > 0] | order(name asc) {
        _id,
        name,
        code,
        tasks[]->{
          _id,
          name,
          isBillable,
          isArchived
        }
      }`
      params = { userId }
    } else {
      // Regular users see projects they are assigned to
      query = `*[_type == "project" && isActive == true && !(_id in path("drafts.**")) && count(assignedUsers[user._ref == $userId && isActive == true]) > 0] | order(name asc) {
        _id,
        name,
        code,
        tasks[]->{
          _id,
          name,
          isBillable,
          isArchived
        }
      }`
      params = { userId }
    }

    const projects = await sanityFetch<any[]>({ query, params })

    return NextResponse.json({ projects: projects || [] })
  } catch (error) {
    console.error('Error fetching projects with tasks:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
