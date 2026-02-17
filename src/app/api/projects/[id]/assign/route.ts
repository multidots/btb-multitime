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

    const projectId = params.id

    // Only admins and managers can assign projects
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const requestBody = await request.json()
    const userId = requestBody.userId

    // Check if userId is available in requestBody.people data
    // If so, treat session.user as manager (allow the operation)
    const isAssignedUserInTeamMembers = requestBody.people && Array.isArray(requestBody.people) 
      ? requestBody.people.some((person: any) => person._id === userId)
      : false

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // Optimize: Fetch project once and use for both manager check and assignedUsers check
    const currentProject = await mutationClient.getDocument(projectId)
    if (!currentProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // If manager, check if they manage this project
    // Skip this check if userId is in the team members list
    if (session.user.role === 'manager' && !isAssignedUserInTeamMembers) {
      const isProjectManager = currentProject.projectManager?._ref === session.user.id

      if (!isProjectManager) {
        return NextResponse.json({ error: 'You can only assign users to projects you manage' }, { status: 403 })
      }
    }

    const assignedUsers = currentProject.assignedUsers || []

    // Check if user is already assigned (including inactive assignments)
    const existingAssignmentIndex = assignedUsers.findIndex((assignment: any) => assignment.user._ref === userId)

    let updatedAssignedUsers: any[]

    if (existingAssignmentIndex !== -1) {
      // User is already assigned - reactivate if inactive
      const existingAssignment = assignedUsers[existingAssignmentIndex]
      if (existingAssignment.isActive === true) {
        return NextResponse.json({ error: 'User is already assigned to this project' }, { status: 400 })
      }

      // Reactivate the user assignment
      updatedAssignedUsers = assignedUsers.map((assignment: any, index: number) => {
        if (index === existingAssignmentIndex) {
          return {
            ...assignment,
            isActive: true
          }
        }
        return assignment
      })
    } else {
      // User is not assigned - add them as new
      // Use the same format as route.ts for consistency
      updatedAssignedUsers = [
        ...assignedUsers,
        {
          _type: 'object',
          _key: `assigned-user-${userId}-${assignedUsers.length}`,
          user: { _type: 'reference', _ref: userId },
          role: 'Team Member',
          isActive: true
        }
      ]
    }

    // Update project
    const updatedProject = await mutationClient
      .patch(projectId)
      .set({ assignedUsers: updatedAssignedUsers })
      .commit()

    if (!updatedProject) {
      return NextResponse.json({ error: 'Failed to assign user to project' }, { status: 500 })
    }

    return NextResponse.json({ success: true, project: updatedProject })
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
