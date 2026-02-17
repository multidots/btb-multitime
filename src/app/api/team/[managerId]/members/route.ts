import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { sanityFetch, mutationClient } from '@/lib/sanity'
import { authOptions } from '@/lib/authOptions'
import { v4 as uuidv4 } from 'uuid'

// Batch size for processing large numbers of users
const BATCH_SIZE = 50

// Helper function to split array into chunks
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

export async function POST(
  request: NextRequest,
  { params }: { params: { managerId: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Only admins can assign members
    const isAdmin = session.user.role === 'admin' || session.user.isSanityAdmin
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Only admins can assign team members' },
        { status: 403 }
      )
    }

    const body = await request.json()
    
    // Support both single userId and batch userIds for backward compatibility
    const userIds: string[] = body.userIds || (body.userId ? [body.userId] : [])

    if (userIds.length === 0) {
      return NextResponse.json(
        { error: 'User ID(s) required' },
        { status: 400 }
      )
    }

    // Verify the manager exists and is a manager
    const manager = await sanityFetch({
      query: `*[_type == "user" && _id == $managerId && (role == "manager" || role == "admin")][0]`,
      params: { managerId: params.managerId }
    })

    if (!manager) {
      return NextResponse.json(
        { error: 'Manager not found' },
        { status: 404 }
      )
    }

    // Verify all users to assign exist and are active (chunked queries for scalability)
    // Optimized: Parallelize chunk queries since they are independent
    const userIdChunks = chunkArray(userIds, BATCH_SIZE)
    
    // Fetch all chunks in parallel (optimized - faster than sequential)
    const chunkResults = await Promise.all(
      userIdChunks.map(chunk =>
        sanityFetch<any[]>({
          query: `*[_type == "user" && _id in $userIds && isActive == true && isArchived != true]{_id, firstName, lastName}`,
          params: { userIds: chunk }
        })
      )
    )
    
    // Flatten results
    const usersToAssign: any[] = []
    chunkResults.forEach(chunkUsers => {
      if (chunkUsers) {
        usersToAssign.push(...chunkUsers)
      }
    })

    if (usersToAssign.length !== userIds.length) {
      const foundIds = new Set(usersToAssign.map((u: any) => u._id))
      const missingIds = userIds.filter(id => !foundIds.has(id))
      return NextResponse.json(
        { error: `Some users not found or inactive: ${missingIds.join(', ')}` },
        { status: 404 }
      )
    }

    // Check if any users are already in a team (chunked queries for scalability)
    // Optimized: Parallelize chunk queries since they are independent
    const existingTeamResults = await Promise.all(
      userIdChunks.map(chunk =>
        sanityFetch<any[]>({
          query: `*[_type == "team" && isActive == true && count(members[_ref in $userIds]) > 0]{
            "assignedUserIds": members[_ref in $userIds]._ref
          }`,
          params: { userIds: chunk }
        })
      )
    )
    
    // Flatten results
    const alreadyAssignedIds: string[] = []
    existingTeamResults.forEach(existingTeamMembers => {
      const chunkAssignedIds = existingTeamMembers?.flatMap((t: any) => t.assignedUserIds || []) || []
      alreadyAssignedIds.push(...chunkAssignedIds)
    })

    if (alreadyAssignedIds.length > 0) {
      const alreadyAssignedUsers = usersToAssign
        .filter((u: any) => alreadyAssignedIds.includes(u._id))
        .map((u: any) => `${u.firstName} ${u.lastName}`)
      return NextResponse.json(
        { error: `Already assigned to a team: ${alreadyAssignedUsers.join(', ')}` },
        { status: 400 }
      )
    }

    // Get or create the team for the manager
    let team: any = await sanityFetch({
      query: `*[_type == "team" && manager._ref == $managerId && isActive == true][0]`,
      params: { managerId: params.managerId }
    })

    // Prepare all member references
    const newMembers = userIds.map(id => ({
      _key: uuidv4(),
      _type: 'reference',
      _ref: id
    }))

    if (!team) {
      // Create a new team for this manager
      const managerName = `${(manager as any).firstName} ${(manager as any).lastName}`
      const teamName = `${managerName}'s Team`
      const slug = teamName
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')

      // For new team creation, add first batch of members
      const memberChunks = chunkArray(newMembers, BATCH_SIZE)
      const firstBatch = memberChunks[0] || []

      team = await mutationClient.create({
        _type: 'team',
        name: teamName,
        slug: { current: slug },
        manager: {
          _type: 'reference',
          _ref: params.managerId
        },
        members: firstBatch,
        isActive: true
      })

      // Add remaining batches if any
      for (let i = 1; i < memberChunks.length; i++) {
        team = await mutationClient
          .patch(team._id)
          .append('members', memberChunks[i])
          .commit()
      }
    } else {
      // Filter out users already in the team
      const existingMemberIds = new Set(team.members?.map((m: any) => m._ref) || [])
      const membersToAdd = newMembers.filter(m => !existingMemberIds.has(m._ref))
      
      if (membersToAdd.length > 0) {
        // Add members in chunks for scalability
        const memberChunks = chunkArray(membersToAdd, BATCH_SIZE)
        
        for (const chunk of memberChunks) {
          team = await mutationClient
            .patch(team._id)
            .append('members', chunk)
            .commit()
        }
      }
    }

    // Publish the team document by creating a published version
    // In Sanity, we need to copy the draft to published using a transaction
    const publishTransaction = mutationClient.transaction()
    const publishedDocId = team._id.replace(/^drafts\./, '') // Remove 'drafts.' prefix if present
    
    try {
      // Create or update the published version
      publishTransaction.createIfNotExists({
        ...team,
        _id: publishedDocId,
        _type: 'team'
      })
      
      await publishTransaction.commit()
    } catch (publishError) {
      // Continue even if publish fails - the team is still created/updated
    }

    // Refetch the team to get the updated data
    const publishedTeam = await sanityFetch({
      query: `*[_type == "team" && _id == $teamId][0]`,
      params: { teamId: publishedDocId }
    })

    return NextResponse.json({
      success: true,
      message: `${userIds.length} user${userIds.length > 1 ? 's' : ''} assigned to team successfully`,
      team: publishedTeam,
      assignedCount: userIds.length
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to assign team member' },
      { status: 500 }
    )
  }
}
