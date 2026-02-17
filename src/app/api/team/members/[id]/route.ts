import { NextRequest, NextResponse } from 'next/server'
import { sanityFetch, mutationClient } from '@/lib/sanity'
import { requireAdminOrManagerApi, requireAdminApi, AuthError } from '@/lib/auth'

// Email validation - matches Sanity's built-in email validation (requires valid TLD with min 2 chars)
// Requires: local-part@domain.tld where TLD is at least 2 alphabetic characters
const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Use the API-specific auth function for consistent error handling
    const session = await requireAdminOrManagerApi()

    const { id } = params

    // For admins, find their actual user document ID (might be different from session.user.id)
    let currentUserId = session.user.id
    const sessionUser = session.user as any
    
    // Only query if session ID looks invalid (draft ID or doesn't match expected pattern)
    // This optimizes by skipping the lookup when session ID is already valid
    if (session.user.role === 'admin' && sessionUser.email && 
        (session.user.id.startsWith('drafts.') || session.user.id.length < 10)) {
      const userDoc = await sanityFetch<{ _id: string } | null>({
        query: `*[_type == "user" && email == $email && isActive == true][0]{
          _id
        }`,
        params: { email: sessionUser.email.toLowerCase() }
      })
      
      if (userDoc && userDoc._id !== session.user.id) {
        currentUserId = userDoc._id
      }
    }

    const member = await sanityFetch({
      query: `*[_type == "user" && _id == $id && isActive == true && isArchived != true][0]{
        _id,
        firstName,
        lastName,
        email,
        avatar,
        capacity,
        role,
        jobCategory->{
          _id,
          name,
          slug
        },
        "isPinned": $userId in pinnedBy[]._ref,
        rate,
        timezone
      }`,
      params: { id, userId: currentUserId }
    })

    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    return NextResponse.json(member)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      )
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Admins and managers can edit members
    const session = await requireAdminOrManagerApi()

    const { id } = params
    const body = await request.json();

    // Build update object only with defined fields
    const updateFields: any = {
      updatedAt: new Date().toISOString()
    };

    if (body.firstName !== undefined && body.firstName !== null) updateFields.firstName = body.firstName;
    if (body.lastName !== undefined && body.lastName !== null) updateFields.lastName = body.lastName;
    if (body.rate !== undefined && body.rate !== null) updateFields.rate = typeof body.rate === 'string' ? parseFloat(body.rate) : body.rate;
    if (body.timezone !== undefined && body.timezone !== null) updateFields.timezone = body.timezone;
    if (body.avatar !== undefined && body.avatar !== null) updateFields.avatar = body.avatar;
    if (body.role !== undefined && body.role !== null && session.user.role === 'admin') updateFields.role = body.role;
    if (body.jobCategory !== undefined && body.jobCategory !== null) updateFields.jobCategory = { _type: 'reference', _ref: body.jobCategory._id };
    if (body.capacity !== undefined && body.capacity !== null) updateFields.capacity = typeof body.capacity === 'string' ? parseFloat(body.capacity) : body.capacity;

    // Handle email update (only admins can change email)
    if (body.email !== undefined && body.email !== null) {
      // Only admins can change email addresses
      if (session.user.role !== 'admin') {
        return NextResponse.json(
          { error: 'Only admins can change email addresses' },
          { status: 403 }
        )
      }

      const normalizedEmail = body.email.toLowerCase().trim()

      // Validate email format
      if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
        return NextResponse.json(
          { error: 'Please enter a valid email address' },
          { status: 400 }
        )
      }

      // Optimize: Run both queries in parallel since they are independent
      const [existingUser, currentUser] = await Promise.all([
        // Check if email is already used by another user
        sanityFetch<{ _id: string } | null>({
          query: `*[_type == "user" && email == $email && _id != $userId][0]{ _id }`,
          params: { email: normalizedEmail, userId: id }
        }),
        // Get current user's email to check if it's actually changing
        sanityFetch<{ email: string } | null>({
          query: `*[_type == "user" && _id == $userId][0]{ email }`,
          params: { userId: id }
        })
      ])

      if (existingUser) {
        return NextResponse.json(
          { error: 'This email address is already in use by another user' },
          { status: 409 }
        )
      }

      // If email is actually changing, update email and clear Google auth link
      if (currentUser && currentUser.email.toLowerCase() !== normalizedEmail) {
        updateFields.email = normalizedEmail
        // Clear Google account link so user can login with new Google account
        updateFields.googleId = null
        updateFields.authProvider = null
      }
    }

    const updatedMember = await mutationClient
      .patch(id)
      .set(updateFields)
      .commit()

    if (!updatedMember) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }


    return NextResponse.json({ success: true, member: updatedMember })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      )
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdminApi()  // Only admin can delete

    const { id } = params

    // Sanity transaction limit is 200 mutations per transaction
    const TRANSACTION_LIMIT = 200

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
      params: { id }
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

    // Step 2: Remove user from timesheets' approvedBy references (preserve timesheet data)
    const timesheetsWithApprovedBy = await sanityFetch<Array<{ _id: string }>>({
      query: `*[_type == "timesheet" && approvedBy._ref == $id && !(_id in path("drafts.**"))] {
        _id
      }`,
      params: { id }
    })

    if (timesheetsWithApprovedBy && timesheetsWithApprovedBy.length > 0) {
      const batches: Array<{ _id: string }>[] = []
      for (let i = 0; i < timesheetsWithApprovedBy.length; i += TRANSACTION_LIMIT) {
        batches.push(timesheetsWithApprovedBy.slice(i, i + TRANSACTION_LIMIT))
      }

      for (const batch of batches) {
        const transaction = mutationClient.transaction()
        batch.forEach(ts => {
          transaction.patch(ts._id, patch => patch.unset(['approvedBy']))
        })
        try {
          await transaction.commit()
        } catch (err) {
          // Continue with other batches even if one fails
        }
      }
    }

    // Step 3: Delete all timesheets for this user (user field is required, so we must delete timesheets to remove user reference)
    const timesheets = await sanityFetch<Array<{ _id: string }>>({
      query: `*[_type == "timesheet" && user._ref == $id && !(_id in path("drafts.**"))] { _id }`,
      params: { id }
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

    // Step 4: Remove user from all projects (assignedUsers and projectManager)
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
      params: { id }
    })

    if (projects && projects.length > 0) {
      // Prepare all project updates
      const projectUpdates: Array<{ _id: string; updates: any }> = []
      
      projects.forEach((project) => {
        const updates: any = {}
        
        // Remove from assignedUsers
        if (project.assignedUsers && project.assignedUsers.length > 0) {
          const filteredAssignedUsers = project.assignedUsers.filter(
            (au: any) => au.user?._ref !== id
          )
          if (filteredAssignedUsers.length !== project.assignedUsers.length) {
            updates.assignedUsers = filteredAssignedUsers
          }
        }
        
        // Remove projectManager if it's this user
        if (project.projectManager?._ref === id) {
          updates.projectManager = null
        }
        
        if (Object.keys(updates).length > 0) {
          projectUpdates.push({ _id: project._id, updates })
        }
      })

      // Batch project updates into transactions
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

    // Step 5: Remove user from all teams (members and manager)
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
      params: { id }
    })

    if (teams && teams.length > 0) {
      // Prepare all team updates
      const teamUpdates: Array<{ _id: string; updates: any }> = []
      
      teams.forEach((team) => {
        const updates: any = {}
        
        // Remove from members array
        if (team.members && team.members.length > 0) {
          const filteredMembers = team.members.filter(
            (member: any) => member._ref !== id
          )
          if (filteredMembers.length !== team.members.length) {
            updates.members = filteredMembers
          }
        }
        
        // Remove manager if it's this user
        if (team.manager?._ref === id) {
          updates.manager = null
        }
        
        if (Object.keys(updates).length > 0) {
          teamUpdates.push({ _id: team._id, updates })
        }
      })

      // Batch team updates into transactions
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

    // Step 6: Remove user from all other users' pinnedBy arrays
    const usersWithPinnedBy = await sanityFetch<Array<{ 
      _id: string
      pinnedBy?: Array<{ _ref: string; _key?: string }>
    }>>({
      query: `*[_type == "user" && $id in pinnedBy[]._ref && !(_id in path("drafts.**"))] {
        _id,
        pinnedBy[]
      }`,
      params: { id }
    })

    if (usersWithPinnedBy && usersWithPinnedBy.length > 0) {
      // Prepare all user updates
      const userUpdates: Array<{ _id: string; pinnedBy: any[] }> = []
      
      usersWithPinnedBy.forEach((user) => {
        if (user.pinnedBy && user.pinnedBy.length > 0) {
          const filteredPinnedBy = user.pinnedBy.filter(
            (pinned: any) => pinned._ref !== id
          )
          if (filteredPinnedBy.length !== user.pinnedBy.length) {
            userUpdates.push({ _id: user._id, pinnedBy: filteredPinnedBy })
          }
        }
      })

      // Batch user updates into transactions
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

    // Step 7: Clean up user references from reports (preserve report data, just remove user references)
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
      params: { id }
    })

    if (reports && reports.length > 0) {
      // Prepare all report updates
      const reportUpdates: Array<{ _id: string; updates: any }> = []
      
      reports.forEach((report) => {
        const updates: any = {}
        
        // Remove from filters.users array while preserving other filter fields
        if (report.filters?.users && report.filters.users.length > 0) {
          const filteredUsers = report.filters.users.filter(
            (user: any) => user._ref !== id
          )
          if (filteredUsers.length !== report.filters.users.length) {
            // Update the filters object with filtered users, preserving other fields
            updates['filters.users'] = filteredUsers
          }
        }
        
        // Remove createdBy if it's this user
        if (report.createdBy?._ref === id) {
          updates.createdBy = null
        }
        
        if (Object.keys(updates).length > 0) {
          reportUpdates.push({ _id: report._id, updates })
        }
      })

      // Batch report updates into transactions
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

    // Step 8: Delete the user document
    // All references have been removed (timesheets, projects, teams, pinnedBy, reports, approvedBy)
    const deletedMember = await mutationClient.delete(id)

    if (!deletedMember) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    return NextResponse.json({ 
      success: true,
      message: 'User and all references have been removed successfully',
      action: 'deleted'
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      )
    }
    return NextResponse.json({ 
      error: 'Internal Server Error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
