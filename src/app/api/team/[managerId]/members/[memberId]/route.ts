import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { mutationClient, sanityFetch } from '@/lib/sanity'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { managerId: string; memberId: string } }
) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin or the manager themselves
    const userId = (session.user as any)._id
    const isAdmin = (session.user as any)?.role === 'admin'
    const isManagerSelf = userId === params.managerId

    if (!isAdmin && !isManagerSelf) {
      return NextResponse.json(
        { error: 'You do not have permission to manage this team' },
        { status: 403 }
      )
    }

    // Find the team document for this manager
    const team = await mutationClient.fetch(
      `*[_type == "team" && manager._ref == $managerId][0]`,
      { managerId: params.managerId }
    )

    if (!team) {
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404 }
      )
    }


    // Remove the member from the team - handle both reference objects and string IDs
    const updatedMembers = (team.members || []).filter((member: any) => {
      const memberId = typeof member === 'string' ? member : member._ref
      return memberId !== params.memberId
    })


    // Update the team document
    const updatedTeam = await mutationClient
      .patch(team._id)
      .set({ members: updatedMembers })
      .commit()

    // Publish the team document by creating a published version
    const publishTransaction = mutationClient.transaction()
    const publishedDocId = team._id.replace(/^drafts\./, '') // Remove 'drafts.' prefix if present
    
    try {
      // Create or update the published version
      publishTransaction.createIfNotExists({
        ...updatedTeam,
        _id: publishedDocId,
        _type: 'team'
      })
      
      await publishTransaction.commit()
    } catch (publishError) {
      // Continue even if publish fails - the team is still updated
    }

    // Refetch the published team to get the updated data
    const publishedTeam = await sanityFetch({
      query: `*[_type == "team" && _id == $teamId][0]`,
      params: { teamId: publishedDocId }
    })

    return NextResponse.json(
      { 
        message: 'User removed from team successfully and published',
        team: publishedTeam
      },
      { status: 200 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to remove team member' },
      { status: 500 }
    )
  }
}
