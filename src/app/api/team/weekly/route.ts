import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { sanityFetch } from '@/lib/sanity'

// Mark this route as dynamic
export const dynamic = 'force-dynamic'

interface TeamMemberStats {
  _id: string
  firstName: string
  lastName: string
  email: string
  avatar?: any
  capacity?: number
  totalHours: number
  billableHours: number
  nonBillableHours: number
  timesheetHours?: number
  timesheetBillableHours?: number
  role?: string
  jobCategory?: {
    _id: string
    name: string
    slug: {
      current: string
    }
  }
  isPinned?: boolean
  manager?: {
    _id: string
    firstName: string
    lastName: string
  }
}

interface WeeklyTeamStats {
  totalHours: number
  teamCapacity: number
  billableHours: number
  nonBillableHours: number
  teamMembers: TeamMemberStats[]
}

// GET /api/team/weekly - Get weekly team statistics
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admins and managers can access this
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Find the actual user document ID - use same logic as pin API
    // Optimize: Use OR query to combine both lookups into a single query
    let currentUserId = session.user.id
    const sessionUser = session.user as any
    
    if (sessionUser.email) {
      // Combined query: find by ID OR email in a single request
      const userDoc = await sanityFetch<{ _id: string } | null>({
        query: `*[_type == "user" && isActive == true && (_id == $userId || email == $email)][0]{
          _id
        }`,
        params: { 
          userId: session.user.id,
          email: sessionUser.email.toLowerCase()
        }
      })
      
      if (userDoc) {
        currentUserId = userDoc._id
      }
    } else {
      // Fallback: only check by ID if no email available
      const userDoc = await sanityFetch<{ _id: string } | null>({
        query: `*[_type == "user" && _id == $userId && isActive == true][0]{
          _id
        }`,
        params: { userId: session.user.id }
      })
      
      if (userDoc) {
        currentUserId = userDoc._id
      }
    }

    const { searchParams } = new URL(request.url)
    const weekStart = searchParams.get('weekStart')
    const weekEnd = searchParams.get('weekEnd')

    if (!weekStart || !weekEnd) {
      return NextResponse.json({ error: 'Week start and end dates are required' }, { status: 400 })
    }

    let teamMemberIds: string[] = []

    // Get team members based on role
    if (session.user.role === 'admin') {
      // Admin sees all active users including other admins, excluding drafts
      const allUsersQuery = `*[_type == "user" && isActive != false && isArchived != true && !(_id in path("drafts.**"))]{
        _id
      }`
      const allUsers = await sanityFetch<{ _id: string }[]>({ query: allUsersQuery })
      teamMemberIds = allUsers.map(u => u._id).filter(id => !id.startsWith('drafts.'))
    } else if (session.user.role === 'manager') {
      // Manager sees only their team members from teams they manage, excluding drafts
      const teamsQuery = `*[_type == "team" && manager._ref == $userId && isActive == true && !(_id in path("drafts.**"))]{
        _id,
        members[]->{
          _id,
          role
        }
      }`

      const teamsData = await sanityFetch<{ _id: string; members: Array<{ _id: string; role: string }> }[]>({ 
        query: teamsQuery, 
        params: { userId: session.user.id } 
      })


      // Collect all member IDs from all teams
      const allMemberIds: string[] = []
      teamsData.forEach(team => {
        if (team.members && Array.isArray(team.members)) {
          team.members.forEach(member => {
            if (member._id && typeof member._id === 'string' && !member._id.startsWith('drafts.')) {
              allMemberIds.push(member._id)
            }
          })
        }
      })

      // Remove duplicates
      const uniqueMemberIds = Array.from(new Set(allMemberIds))
      

      if (uniqueMemberIds.length > 0) {
        // Query users to ensure they're active and not archived
        const membersQuery = `*[_type == "user" 
          && _id in $memberIds 
          && !(_id in path("drafts.**")) 
          && isActive != false 
          && isArchived != true
        ]{
          _id
        }`

        const validMembers = await sanityFetch<{ _id: string }[]>({ 
          query: membersQuery, 
          params: { memberIds: uniqueMemberIds } 
        })


        teamMemberIds = validMembers
          .map(m => m && m._id)
          .filter((id): id is string => {
            if (!id || typeof id !== 'string') return false
            if (id.startsWith('drafts.')) return false
            return true
          })
      } else {
        teamMemberIds = []
      }
    }

    // Filter out any draft IDs that might have slipped through
    teamMemberIds = teamMemberIds.filter(id => id && !id.startsWith('drafts.'))

    if (teamMemberIds.length === 0) {
      return NextResponse.json({
        totalHours: 0,
        teamCapacity: 0,
        billableHours: 0,
        nonBillableHours: 0,
        teamMembers: []
      } as WeeklyTeamStats)
    }

    // Optimize: Fetch members, time entries, approved timesheets, and team-manager relationships in parallel
    const [members, timeEntriesAggregated, approvedTimesheets, teamManagerMap] = await Promise.all([
      // Get team members with their capacity (excluding drafts)
      sanityFetch<{
        _id: string
        firstName: string
        lastName: string
        email: string
        avatar?: any
        capacity?: number
        role?: string
        jobTitle?: string
        jobCategory?: {
          _id: string
          name: string
          slug: {
            current: string
          }
        }
        isPinned?: boolean
      }[]>({
        query: `*[_type == "user" && _id in $memberIds && isActive != false && isArchived != true && !(_id in path("drafts.**"))]{
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
          "isPinned": $userId in pinnedBy[]._ref
        }`,
        params: { memberIds: teamMemberIds, userId: currentUserId }
      }),
      // Get approved timesheet entries (optimized - only fetch approved entries from timesheets)
      sanityFetch<{
        userId: string
        hours: number
        isBillable: boolean
      }[]>({
        query: `*[_type == "timesheet" &&
          user._ref in $memberIds &&
          weekStart == $weekStart &&
          status == "approved" &&
          !(_id in path("drafts.**"))
        ].entries[date >= $weekStart && date <= $weekEnd]{
          "userId": ^.user._ref,
          hours,
          isBillable
        }`,
        params: {
          memberIds: teamMemberIds,
          weekStart,
          weekEnd
        }
      }),
      // Get approved timesheets for this week (one per user)
      sanityFetch<{
        userRef: string
        totalHours: number
        billableHours: number
      }[]>({
        query: `*[_type == "timesheet" &&
          user._ref in $memberIds &&
          weekStart == $weekStart &&
          status == "approved" &&
          !(_id in path("drafts.**"))
        ]{
          "userRef": user._ref,
          totalHours,
          billableHours
        }`,
        params: {
          memberIds: teamMemberIds,
          weekStart
        }
      }),
      // Get team-manager relationships for each member
      sanityFetch<{
        members: string[]
        manager: {
          _id: string
          firstName: string
          lastName: string
        }
      }[]>({
        query: `*[_type == "team" && isActive == true && !(_id in path("drafts.**")) && defined(manager) && defined(members)]{
          "members": members[]._ref,
          manager->{
            _id,
            firstName,
            lastName
          }
        }`,
        params: {}
      })
    ])

    // Filter out any draft members that might have slipped through
    const uniqueMembers = members
      .filter(member => member && member._id && !member._id.startsWith('drafts.'))
      .filter((member, index, self) =>
        index === self.findIndex(m => m._id === member._id)
      )
      .map(member => ({
        ...member,
        // Filter out draft job categories
        jobCategory: member.jobCategory && !member.jobCategory._id?.startsWith('drafts.') 
          ? member.jobCategory 
          : undefined
      }))

    // Create a map for aggregated stats (optimized aggregation in JavaScript)
    const aggregatedStats = new Map<string, { totalHours: number; billableHours: number; nonBillableHours: number }>()
    
    timeEntriesAggregated.forEach(entry => {
      const userId = entry.userId
      if (userId && !userId.startsWith('drafts.')) {
        if (!aggregatedStats.has(userId)) {
          aggregatedStats.set(userId, { totalHours: 0, billableHours: 0, nonBillableHours: 0 })
        }
        const stats = aggregatedStats.get(userId)!
        stats.totalHours += entry.hours || 0
        if (entry.isBillable) {
          stats.billableHours += entry.hours || 0
        } else {
          stats.nonBillableHours += entry.hours || 0
        }
      }
    })

    // Create a map for timesheet stats per user
    const timesheetStatsMap = new Map<string, { timesheetHours: number; timesheetBillableHours: number }>()
    approvedTimesheets.forEach(ts => {
      const userId = ts.userRef
      if (userId && !userId.startsWith('drafts.')) {
        timesheetStatsMap.set(userId, {
          timesheetHours: ts.totalHours ?? 0,
          timesheetBillableHours: ts.billableHours ?? 0
        })
      }
    })

    // Create a map for member -> manager relationships
    const memberManagerMap = new Map<string, { _id: string; firstName: string; lastName: string }>()
    teamManagerMap.forEach(team => {
      if (team.members && team.manager) {
        team.members.forEach(memberId => {
          if (memberId && typeof memberId === 'string' && !memberId.startsWith('drafts.')) {
            memberManagerMap.set(memberId, team.manager)
          }
        })
      }
    })

    // Calculate stats per team member
    const memberStatsMap = new Map<string, TeamMemberStats>()

    // Initialize with member data and aggregated stats
    uniqueMembers.forEach(member => {
      const aggStats = aggregatedStats.get(member._id) || { totalHours: 0, billableHours: 0, nonBillableHours: 0 }
      const tsStats = timesheetStatsMap.get(member._id) || { timesheetHours: 0, timesheetBillableHours: 0 }
      const manager = memberManagerMap.get(member._id)
      memberStatsMap.set(member._id, {
        _id: member._id,
        firstName: member.firstName,
        lastName: member.lastName,
        email: member.email,
        avatar: member.avatar,
        capacity: member.capacity || 40, // Default to 40 if not set
        totalHours: aggStats.totalHours,
        billableHours: aggStats.billableHours,
        nonBillableHours: aggStats.nonBillableHours,
        timesheetHours: tsStats.timesheetHours,
        timesheetBillableHours: tsStats.timesheetBillableHours,
        role: member.role,
        jobCategory: member.jobCategory,
        isPinned: member.isPinned,
        manager: manager
      })
    })


    // Convert to array and sort by pinned status first, then by name
    const teamMembers = Array.from(memberStatsMap.values()).sort((a, b) => {
      // Pinned members come first
      if (a.isPinned && !b.isPinned) return -1
      if (!a.isPinned && b.isPinned) return 1

      // If both are pinned or both are not pinned, sort by name
      const nameA = `${a.firstName} ${a.lastName}`.toLowerCase()
      const nameB = `${b.firstName} ${b.lastName}`.toLowerCase()
      return nameA.localeCompare(nameB)
    })

    // Calculate totals
    const totalHours = teamMembers.reduce((sum, member) => sum + member.totalHours, 0)
    const teamCapacity = teamMembers.reduce((sum, member) => sum + (member.capacity || 0), 0)
    const billableHours = teamMembers.reduce((sum, member) => sum + member.billableHours, 0)
    const nonBillableHours = teamMembers.reduce((sum, member) => sum + member.nonBillableHours, 0)

    const stats: WeeklyTeamStats = {
      totalHours,
      teamCapacity,
      billableHours,
      nonBillableHours,
      teamMembers
    }

    return NextResponse.json(stats)
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

