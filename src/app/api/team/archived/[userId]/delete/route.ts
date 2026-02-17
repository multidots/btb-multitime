import { NextRequest, NextResponse } from 'next/server'
import { sanityFetch, mutationClient } from '@/lib/sanity'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { requireAdminApi, AuthError } from '@/lib/auth'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> | { userId: string } }
) {
  try {
    await requireAdminApi()
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode })
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Handle both Promise and direct params (for Next.js compatibility)
  const resolvedParams = params instanceof Promise ? await params : params
  const userId = resolvedParams.userId
  
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }

  try {
    // Step 1: Check for unsubmitted or pending (submitted) timesheets - prevent deletion if found
    const pendingTimesheets = await sanityFetch<Array<{ 
      _id: string
      status: string
      weekStart: string
    }>>({
      query: `*[_type == "timesheet" && user._ref == $id && status in ["unsubmitted", "submitted"] && count(entries) > 0 && !(_id in path("drafts.**"))] { 
        _id,
        status,
        weekStart
      }`,
      params: { id: userId }
    })
    
    if (Array.isArray(pendingTimesheets) && pendingTimesheets.length > 0) {
      const unsubmittedCount = pendingTimesheets.filter(ts => ts.status === 'unsubmitted').length
      const submittedCount = pendingTimesheets.filter(ts => ts.status === 'submitted').length
      
      return NextResponse.json(
        { 
          error: "Cannot delete member with unsubmitted or pending timesheets",
          details: {
            unsubmittedCount,
            submittedCount,
            total: pendingTimesheets.length
          }
        },
        { status: 400 }
      )
    }

    // Sanity transaction limit is 200 mutations per transaction
    const TRANSACTION_LIMIT = 200

    // Step 2: Delete all timesheets for this user (user field is required, so we must delete timesheets to remove user reference)
    const timesheets = await sanityFetch<Array<{ _id: string }>>({
      query: `*[_type == "timesheet" && user._ref == $id && !(_id in path("drafts.**"))] { _id }`,
      params: { id: userId }
    })
    
    if (timesheets && timesheets.length > 0) {
      const deleteBatches: Array<{ _id: string }>[] = []
      for (let i = 0; i < timesheets.length; i += 50) {
        deleteBatches.push(timesheets.slice(i, i + 50))
      }

      for (const batch of deleteBatches) {
        await Promise.all(
          batch.map(ts => 
            mutationClient.delete(ts._id).catch(err => {
              // Continue with other deletes even if one fails
            })
          )
        )
      }
    }

    // Step 3: Remove user from all projects (assignedUsers and projectManager)
    const projects = await sanityFetch<Array<{ 
      _id: string
      assignedUsers?: Array<{ user: { _ref: string }; _key?: string }>
      projectManager?: { _ref: string }
    }>>({
      query: `*[_type == "project" && (projectManager._ref == $id || $id in assignedUsers[].user._ref) && !(_id in path("drafts.**"))] {
        _id,
        assignedUsers[]{
          user,
          _key
        },
        projectManager
      }`,
      params: { id: userId }
    })

    if (projects && projects.length > 0) {
      const projectUpdates: Array<{ _id: string; updates: any }> = []
      
      projects.forEach((project) => {
        const updates: any = {}
        
        if (project.assignedUsers && project.assignedUsers.length > 0) {
          const filteredAssignedUsers = project.assignedUsers.filter(
            (au: any) => au.user?._ref !== userId
          )
          if (filteredAssignedUsers.length !== project.assignedUsers.length) {
            updates.assignedUsers = filteredAssignedUsers
          }
        }
        
        if (project.projectManager?._ref === userId) {
          updates.projectManager = null
        }
        
        if (Object.keys(updates).length > 0) {
          projectUpdates.push({ _id: project._id, updates })
        }
      })

      if (projectUpdates.length > 0) {
        const batches: Array<{ _id: string; updates: any }>[] = []
        for (let i = 0; i < projectUpdates.length; i += TRANSACTION_LIMIT) {
          batches.push(projectUpdates.slice(i, i + TRANSACTION_LIMIT))
        }

        for (const batch of batches) {
          const transaction = mutationClient.transaction()
          batch.forEach(({ _id, updates }) => {
            transaction.patch(_id, patch => patch.set(updates))
          })
          try {
            await transaction.commit()
          } catch (err) {
            // Continue with other batches even if one fails
          }
        }
      }
    }

    // Step 4: Remove user from all teams (members and manager)
    const teams = await sanityFetch<Array<{ 
      _id: string
      members?: Array<{ _ref: string }>
      manager?: { _ref: string }
    }>>({
      query: `*[_type == "team" && (manager._ref == $id || $id in members[]._ref) && !(_id in path("drafts.**"))] {
        _id,
        members[],
        manager
      }`,
      params: { id: userId }
    })

    if (teams && teams.length > 0) {
      const teamUpdates: Array<{ _id: string; updates: any }> = []
      
      teams.forEach((team) => {
        const updates: any = {}
        
        if (team.members && team.members.length > 0) {
          const filteredMembers = team.members.filter(
            (member: any) => member._ref !== userId
          )
          if (filteredMembers.length !== team.members.length) {
            updates.members = filteredMembers
          }
        }
        
        if (team.manager?._ref === userId) {
          updates.manager = null
        }
        
        if (Object.keys(updates).length > 0) {
          teamUpdates.push({ _id: team._id, updates })
        }
      })

      if (teamUpdates.length > 0) {
        const batches: Array<{ _id: string; updates: any }>[] = []
        for (let i = 0; i < teamUpdates.length; i += TRANSACTION_LIMIT) {
          batches.push(teamUpdates.slice(i, i + TRANSACTION_LIMIT))
        }

        for (const batch of batches) {
          const transaction = mutationClient.transaction()
          batch.forEach(({ _id, updates }) => {
            transaction.patch(_id, patch => patch.set(updates))
          })
          try {
            await transaction.commit()
          } catch (err) {
            // Continue with other batches even if one fails
          }
        }
      }
    }

    // Step 5: Remove user from all other users' pinnedBy arrays
    const usersWithPinnedBy = await sanityFetch<Array<{ 
      _id: string
      pinnedBy?: Array<{ _ref: string; _key?: string }>
    }>>({
      query: `*[_type == "user" && $id in pinnedBy[]._ref && !(_id in path("drafts.**"))] {
        _id,
        pinnedBy[]
      }`,
      params: { id: userId }
    })

    if (usersWithPinnedBy && usersWithPinnedBy.length > 0) {
      const userUpdates: Array<{ _id: string; pinnedBy: any[] }> = []
      
      usersWithPinnedBy.forEach((user) => {
        if (user.pinnedBy && user.pinnedBy.length > 0) {
          const filteredPinnedBy = user.pinnedBy.filter(
            (pinned: any) => pinned._ref !== userId
          )
          if (filteredPinnedBy.length !== user.pinnedBy.length) {
            userUpdates.push({ _id: user._id, pinnedBy: filteredPinnedBy })
          }
        }
      })

      if (userUpdates.length > 0) {
        const batches: Array<{ _id: string; pinnedBy: any[] }>[] = []
        for (let i = 0; i < userUpdates.length; i += TRANSACTION_LIMIT) {
          batches.push(userUpdates.slice(i, i + TRANSACTION_LIMIT))
        }

        for (const batch of batches) {
          const transaction = mutationClient.transaction()
          batch.forEach(({ _id, pinnedBy }) => {
            transaction.patch(_id, patch => patch.set({ pinnedBy }))
          })
          try {
            await transaction.commit()
          } catch (err) {
            // Continue with other batches even if one fails
          }
        }
      }
    }

    // Step 6: Clean up user references from reports (preserve report data, just remove user references)
    // This allows deletion while preserving report data for budget calculations
    const reports = await sanityFetch<Array<{ 
      _id: string
      filters?: {
        dateRange?: any
        projects?: any[]
        users?: Array<{ _ref: string }>
        clients?: any[]
        teams?: any[]
      }
      createdBy?: { _ref: string }
    }>>({
      query: `*[_type == "report" && (createdBy._ref == $id || $id in filters.users[]._ref) && !(_id in path("drafts.**"))] {
        _id,
        filters {
          dateRange,
          projects[],
          users[],
          clients[],
          teams[]
        },
        createdBy
      }`,
      params: { id: userId }
    })

    if (reports && reports.length > 0) {
      const reportUpdates: Array<{ _id: string; updates: any }> = []
      
      reports.forEach((report) => {
        const updates: any = {}
        
        // Remove user from filters.users array (preserve other filter data)
        if (report.filters?.users && report.filters.users.length > 0) {
          const filteredUsers = report.filters.users.filter(
            (user: any) => user._ref !== userId
          )
          if (filteredUsers.length !== report.filters.users.length) {
            updates['filters.users'] = filteredUsers
          }
        }
        
        // Remove createdBy reference (preserve report data)
        if (report.createdBy?._ref === userId) {
          updates.createdBy = null
        }
        
        if (Object.keys(updates).length > 0) {
          reportUpdates.push({ _id: report._id, updates })
        }
      })

      if (reportUpdates.length > 0) {
        const batches: Array<{ _id: string; updates: any }>[] = []
        for (let i = 0; i < reportUpdates.length; i += TRANSACTION_LIMIT) {
          batches.push(reportUpdates.slice(i, i + TRANSACTION_LIMIT))
        }

        for (const batch of batches) {
          const transaction = mutationClient.transaction()
          batch.forEach(({ _id, updates }) => {
            transaction.patch(_id, patch => patch.set(updates))
          })
          try {
            await transaction.commit()
          } catch (err) {
            // Continue with other batches even if one fails
          }
        }
      }
    }

    // Step 7: Delete the user document
    // All references have been removed (timesheets, projects, teams, pinnedBy, reports)
    await mutationClient.delete(userId)
    return NextResponse.json({ 
      success: true,
      message: 'User deleted successfully',
      action: 'deleted'
    })
  } catch (err: any) {
    console.error('Error deleting archived user:', err)
    
    // Handle Sanity reference errors specifically
    // This typically happens when user has timesheets (which we preserve for budget calculations)
    if (err?.statusCode === 409 || err?.response?.statusCode === 409) {
      const errorMessage = err?.details?.description || err?.message || 'Cannot delete user due to existing references'
      const referencingIds = err?.details?.items?.[0]?.error?.referencingIDs || []
      const hasTimesheets = errorMessage.includes('timesheet') || errorMessage.toLowerCase().includes('timesheet') || 
                           referencingIds.some((id: string) => id && id.includes('timesheet'))
      
      // Try to identify what's referencing the user
      let referenceDetails = ''
      if (referencingIds.length > 0) {
        // Try to identify document types
        const docTypes = await Promise.all(
          referencingIds.slice(0, 5).map(async (refId: string) => {
            try {
              const doc = await sanityFetch<{ _type: string }>({
                query: `*[_id == $refId][0]{ _type }`,
                params: { refId }
              })
              return doc?._type || 'unknown'
            } catch {
              return 'unknown'
            }
          })
        )
        referenceDetails = `Referenced by: ${docTypes.filter(t => t !== 'unknown').join(', ') || 'unknown documents'}`
      }
      
      return NextResponse.json({ 
        error: 'Cannot delete user',
        details: hasTimesheets 
          ? 'User has timesheet entries that are preserved for budget calculations. Archived users with timesheet data cannot be deleted.'
          : errorMessage + (referenceDetails ? ` (${referenceDetails})` : ''),
        suggestion: hasTimesheets
          ? 'Timesheet data is preserved for historical budget calculations. The user remains archived but cannot be permanently deleted.'
          : 'User may still be referenced by other documents. All non-essential references have been cleaned up, but timesheets and reports are preserved for budget calculations.',
        referencingIds: referencingIds.length > 0 ? referencingIds : undefined
      }, { status: 409 })
    }
    
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode })
    }
    
    return NextResponse.json({ 
      error: 'Failed to delete user',
      details: err instanceof Error ? err.message : 'Unknown error'
    }, { status: 500 })
  }
}
