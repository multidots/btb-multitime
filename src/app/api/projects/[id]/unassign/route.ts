import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { mutationClient } from '@/lib/sanity'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admins and managers can unassign projects
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const projectId = params.id
    const requestBody = await request.json()
    const assigneduserId = requestBody.userId
    
    // Check if assignedUserId is available in requestBody.people data
    // If so, treat session.user as manager (allow the operation)
    const isAssignedUserInTeamMembers = requestBody.people && Array.isArray(requestBody.people) 
      ? requestBody.people.some((person: any) => person._id === assigneduserId)
      : false

    if (!assigneduserId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // Optimize: Fetch project once and use for both manager check and assignedUsers check
    const currentProject = await mutationClient.getDocument(projectId)
    if (!currentProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // If manager, check if they manage this project
    // Skip this check if assignedUserId is in the team members list
    if (session.user.role === 'manager' && !isAssignedUserInTeamMembers) {
      const isProjectManager = currentProject.projectManager?._ref === session.user.id

      if (!isProjectManager) {
        return NextResponse.json({ error: 'You can only unassign users from projects you manage' }, { status: 403 })
      }
    }

    const assignedUsers = currentProject.assignedUsers || []

    // Find the user assignment and update isActive to false
    const userAssignmentIndex = assignedUsers.findIndex((assignment: any) => assignment.user._ref === assigneduserId)
    
    if (userAssignmentIndex === -1) {
      return NextResponse.json({ error: 'User is not assigned to this project' }, { status: 400 })
    }

    // Update the user's isActive status to false instead of removing them
    const updatedAssignedUsers = assignedUsers.map((assignment: any, index: number) => {
      if (index === userAssignmentIndex) {
        return {
          ...assignment,
          isActive: false
        }
      }
      return assignment
    })

    // Update project
    const updatedProject = await mutationClient
      .patch(projectId)
      .set({ assignedUsers: updatedAssignedUsers })
      .commit()

    if (!updatedProject) {
      return NextResponse.json({ error: 'Failed to unassign user from project' }, { status: 500 })
    }

    return NextResponse.json({ success: true, project: updatedProject })
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
