'use client'

import { urlFor } from '@/lib/sanity'
import { useCallback, useState, useRef, useEffect } from 'react'
import { useDataFetcher } from '@/lib/hooks/useDataFetcher'
import { sanityFetch } from '@/lib/sanity'
import { FiUsers, FiUser, FiMail, FiCalendar, FiEye, FiSearch, FiX } from 'react-icons/fi'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

interface TeamMember {
  _id: string
  firstName: string
  lastName: string
  email: string
  avatar?: any
  role: string
  jobCategory?: { name: string }
  startDate?: string
  isActive: boolean
}

interface AssignedPeopleTabProps {
  userId?: string
}

interface AssignedPeopleData {
  managedUsers: TeamMember[]
  teamMembers: TeamMember[]
}

interface UnassignedUser {
  _id: string
  firstName: string
  lastName: string
  email: string
  avatar?: any
  role: string
}

export default function AssignedPeopleTab({ userId }: AssignedPeopleTabProps = {}) {
  const { data: session } = useSession()
  const router = useRouter()
  const [viewingMember, setViewingMember] = useState<string | null>(null)
  const [isAssigning, setIsAssigning] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<UnassignedUser[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState<UnassignedUser[]>([])
  const [isAssigningUser, setIsAssigningUser] = useState(false)
  const [allUnassignedUsers, setAllUnassignedUsers] = useState<UnassignedUser[]>([])
  const [loadingUnassigned, setLoadingUnassignedUsers] = useState(false)
  const [unassigningMemberId, setUnassigningMemberId] = useState<string | null>(null)
  const [targetUserRole, setTargetUserRole] = useState<string | null>(null)
  const [loadingTargetUser, setLoadingTargetUser] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout>()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const isAdmin = session?.user?.role === 'admin' || session?.user?.isSanityAdmin

  const targetUserId = userId || session?.user?.id

  // Check if the logged-in user is a manager (admin, manager role, or has management permissions or is team manager)
  const isLoggedInUserManager = session?.user?.role === 'admin' ||
    session?.user?.isSanityAdmin ||
    session?.user?.role === 'manager' ||
    session?.user?.permissions?.canManageUsers ||
    session?.user?.permissions?.canManageProjects

  // Check if the target user is a manager (for displaying their managed people)
  const isTargetUserManager = userId ? true : isLoggedInUserManager // If userId is provided, assume we want to show their managed people

  // Fetch target user's role when userId is provided
  useEffect(() => {
    const fetchTargetUserRole = async () => {
      if (!userId) {
        setTargetUserRole(null)
        return
      }

      setLoadingTargetUser(true)
      try {
        const userData = await sanityFetch<{ role: string }>({
          query: `*[_type == "user" && _id == $userId && isArchived != true][0]{
            role
          }`,
          params: { userId }
        })
        
        if (userData) {
          setTargetUserRole(userData.role)
        } else {
          setTargetUserRole(null)
        }
      } catch (error) {
        console.error('Error fetching target user role:', error)
        setTargetUserRole(null)
      } finally {
        setLoadingTargetUser(false)
      }
    }

    fetchTargetUserRole()
  }, [userId])

  // Check if target user is a manager or admin
  const isTargetUserManagerOrAdmin = targetUserRole === 'manager' || targetUserRole === 'admin'

  const fetchAssignedPeople = useCallback(async (): Promise<AssignedPeopleData> => {
    try {
      if (!isLoggedInUserManager && !userId) {
        return { managedUsers: [], teamMembers: [] }
      }

      if (!targetUserId) {
        return { managedUsers: [], teamMembers: [] }
      }

      // Query all teams for this manager and get their members
      const teamQuery = `*[_type == "team" && manager._ref == $userId && isActive == true]{
        _id,
        members[]->{
          _id,
          firstName,
          lastName,
          email,
          avatar,
          role,
          jobTitle,
          startDate,
          isActive,
          isArchived
        }
      }`
      
      const teams = await sanityFetch<any[]>({ query: teamQuery, params: { userId: targetUserId } })
      
      // Flatten all members from all teams and filter
      let teamMembers: TeamMember[] = []
      if (teams && teams.length > 0) {
        teams.forEach(team => {
          if (team.members && Array.isArray(team.members)) {
            teamMembers.push(...team.members)
          }
        })
      }

      const filteredTeamMembers = (teamMembers || [])
        .filter(m => m && m._id && (m as any).isArchived !== true)
        .filter((m, i, arr) => arr.findIndex(x => x._id === m._id) === i) // Remove duplicates

      if (isAdmin && !userId && filteredTeamMembers.length === 0) {
        const allUsersQuery = `*[_type == "user" && role in ["user", "manager"] && isActive == true && isArchived != true && _id != $userId]{
          _id,
          firstName,
          lastName,
          email,
          avatar,
          role,
          jobCategory->{name},
          startDate,
          isActive,
          isArchived
        }`
        const allUsers = await sanityFetch<TeamMember[]>({ query: allUsersQuery, params: { userId: targetUserId } })
        return {
          teamMembers: allUsers || [],
          managedUsers: []
        }
      }

      return {
        teamMembers: filteredTeamMembers || [],
        managedUsers: []
      }
    } catch (error) {
      console.error('Error fetching assigned people:', error)
      throw error
    }
  }, [targetUserId, isLoggedInUserManager, userId, isAdmin])

  const { data, loading, error, refetch } = useDataFetcher<AssignedPeopleData>(
    fetchAssignedPeople,
    { refetchOnMount: !!targetUserId && (isLoggedInUserManager || !!userId) }
  )

  // Keep search input focused while typing
  useEffect(() => {
    if (isAssigning && searchInputRef.current && !isSearching && !isAssigningUser && !loadingUnassigned) {
      searchInputRef.current.focus()
    }
  }, [isAssigning, isSearching, isAssigningUser, loadingUnassigned])

  // Handle search for unassigned users
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query)
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (!query.trim()) {
      // If search is cleared, show all unassigned users
      setSearchResults(allUnassignedUsers)
      return
    }

    setIsSearching(true)
    searchTimeoutRef.current = setTimeout(() => {
      try {
        // Filter locally from allUnassignedUsers for instant response
        const filtered = allUnassignedUsers.filter(user => {
          const fullName = `${user.firstName} ${user.lastName}`.toLowerCase()
          const email = user.email.toLowerCase()
          const searchLower = query.toLowerCase()
          
          return fullName.includes(searchLower) || email.includes(searchLower)
        })
        
        setSearchResults(filtered)
      } catch (error) {
        console.error('Search error:', error)
        toast.error('Failed to search for users')
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 200)
  }, [allUnassignedUsers])

  // Load all unassigned users when assignment mode is opened
  const handleOpenAssignmentMode = useCallback(async () => {
    setIsAssigning(true)
    setLoadingUnassignedUsers(true)
    try {
      const queryParams = new URLSearchParams()
      if (userId) {
        queryParams.append('managerId', userId)
      }
      const response = await fetch(`/api/team/unassigned-users?${queryParams.toString()}`)
      if (!response.ok) throw new Error('Failed to load users')
      const users = await response.json()
      // Include all users (user, admin, manager roles)
      setAllUnassignedUsers(users)
      setSearchResults(users) // Show all initially
    } catch (error) {
      console.error('Error loading unassigned users:', error)
      toast.error('Failed to load unassigned users')
      setAllUnassignedUsers([])
      setSearchResults([])
    } finally {
      setLoadingUnassignedUsers(false)
    }
  }, [userId])

  // Handle assigning multiple users to the manager's team (single API call)
  const handleAssignUsers = useCallback(async (users: UnassignedUser[]) => {
    if (!userId) {
      toast.error('Manager ID is required')
      return
    }

    if (users.length === 0) {
      toast.error('Please select at least one user to assign')
      return
    }

    setIsAssigningUser(true)
    try {
      // Single API call with all userIds (batch operation)
      const response = await fetch(`/api/team/${userId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: users.map(u => u._id) })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to assign users')
      }

      const names = users.length === 1 
        ? `${users[0].firstName} ${users[0].lastName}` 
        : `${users.length} users`
      toast.success(`${names} ${users.length === 1 ? 'has' : 'have'} been assigned to the team`)
      
      // Remove assigned users from unassigned list
      const assignedIds = new Set(users.map(u => u._id))
      const updatedUnassigned = allUnassignedUsers.filter(u => !assignedIds.has(u._id))
      setAllUnassignedUsers(updatedUnassigned)
      setSearchResults(updatedUnassigned)
      
      // Reset the search
      setSearchQuery('')
      setSelectedUsers([])
      
      // Close the assignment mode after successful assignment
      setTimeout(() => {
        setIsAssigning(false)
      }, 500)
      
      // Trigger a refetch of the assigned people list
      await refetch()
    } catch (error: any) {
      console.error('Assignment error:', error)
      toast.error(error.message || 'Failed to assign users')
    } finally {
      setIsAssigningUser(false)
    }
  }, [userId, refetch, allUnassignedUsers])

  // Handle unassigning a user from the manager's team
  const handleUnassignUser = useCallback(async (memberId: string, memberName: string) => {
    if (!userId) {
      toast.error('Manager ID is required')
      return
    }

    setUnassigningMemberId(memberId)
    try {
      const response = await fetch(`/api/team/${userId}/members/${memberId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to unassign user')
      }

      toast.success(`${memberName} has been removed from the team`)
      
      // Trigger a refetch of the assigned people list
      await refetch()
    } catch (error: any) {
      console.error('Unassignment error:', error)
      toast.error(error.message || 'Failed to unassign user')
    } finally {
      setUnassigningMemberId(null)
    }
  }, [userId, refetch])

  if (!isLoggedInUserManager && !userId) {
    return (
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Assigned People</h3>
          <p className="mt-1 text-sm text-gray-500">
            Manage people assigned to you
          </p>
        </div>

        <div className="p-6">
          <div className="text-center py-12">
            <FiUsers className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Access Restricted
            </h3>
            <p className="text-gray-600 max-w-md mx-auto leading-relaxed">
              As a Member, you cannot manage other people. Any Administrator can give you Manager permissions for more access.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Assigned People</h3>
          <p className="mt-1 text-sm text-gray-500">
            Manage people assigned to you
          </p>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <span className="ml-3 text-gray-600">Loading assigned people...</span>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Assigned People</h3>
          <p className="mt-1 text-sm text-gray-500">
            Manage people assigned to you
          </p>
        </div>
        <div className="p-6">
          <div className="text-center py-12">
            <div className="text-red-600 mb-2">
              <FiUsers className="w-12 h-12 mx-auto mb-4" />
              <p className="text-lg font-medium">Error loading assigned people</p>
              <p className="text-sm text-gray-500 mt-1">{error}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const allAssignedPeople = [
    ...(data?.managedUsers || []),
    ...(data?.teamMembers || [])
  ]

  // Remove duplicates based on _id and filter out the logged-in user
  const uniqueAssignedPeople = allAssignedPeople.filter(
    (person, index, self) =>
      person._id !== targetUserId && index === self.findIndex(p => p._id === person._id)
  )

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Assigned People</h3>
        <p className="mt-1 text-sm text-gray-500">
          {userId ? `People assigned to this team member (${uniqueAssignedPeople.length} people)` : `Manage people assigned to you (${uniqueAssignedPeople.length} people)`}
        </p>
      </div>

      <div className="p-6">
        {/* Assignment section for admins editing a manager's team */}
        {isAdmin && userId && isTargetUserManagerOrAdmin && (
          <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-semibold text-gray-900">Assign New Member</h4>
              {isAssigning && (
                <button
                  onClick={() => {
                    setIsAssigning(false)
                    setSearchQuery('')
                    setSearchResults([])
                    setSelectedUsers([])
                    setAllUnassignedUsers([])
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  <FiX className="w-4 h-4" />
                </button>
              )}
            </div>
            
            {!isAssigning ? (
              <button
                onClick={handleOpenAssignmentMode}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                + Add member to team
              </button>
            ) : (
              <div className="space-y-3">
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search by name or email..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    disabled={isSearching || isAssigningUser || loadingUnassigned}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-transparent focus:border-black disabled:opacity-50 disabled:cursor-not-allowed"
                    autoFocus
                  />
                </div>

                {/* Loading unassigned users */}
                {loadingUnassigned && (
                  <div className="text-center py-8">
                    <div className="inline-flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      <p className="text-sm text-gray-600">Loading available users...</p>
                    </div>
                  </div>
                )}

                {/* Available users list - show all or filtered results */}
                {!loadingUnassigned && searchResults.length > 0 && (
                  <div className="border border-gray-300 rounded-lg bg-white max-h-80 overflow-y-auto">
                    {searchResults.map((user) => {
                      const isSelected = selectedUsers.some(u => u._id === user._id)
                      return (
                        <div
                          key={user._id}
                          className={`px-4 py-3 flex items-center justify-between border-b last:border-b-0 cursor-pointer hover:bg-gray-50 transition ${
                            isSelected ? 'bg-blue-50' : ''
                          }`}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedUsers(selectedUsers.filter(u => u._id !== user._id))
                            } else {
                              setSelectedUsers([...selectedUsers, user])
                            }
                          }}
                        >
                          <div className="flex items-center space-x-3 flex-1">
                            <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
                              {user.avatar ? (
                                <img src={urlFor(user.avatar).fit('crop').url()} alt={`${user.firstName} ${user.lastName}`} className="w-8 h-8 rounded-full object-cover object-top" />
                              ) : (
                                <span>{user.firstName?.[0]}{user.lastName?.[0]}</span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {user.firstName} {user.lastName}
                                </p>
                                {(user.role === 'admin' || user.role === 'manager') && (
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium capitalize ${
                                    user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                                  }`}>
                                    {user.role}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 truncate">{user.email}</p>
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              e.stopPropagation()
                              if (isSelected) {
                                setSelectedUsers(selectedUsers.filter(u => u._id !== user._id))
                              } else {
                                setSelectedUsers([...selectedUsers, user])
                              }
                            }}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0"
                          />
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Empty state for search */}
                {!loadingUnassigned && searchQuery && searchResults.length === 0 && (
                  <div className="text-center py-6">
                    <p className="text-sm text-gray-500">No users found matching "{searchQuery}"</p>
                    <p className="text-xs text-gray-400 mt-1">Try searching by name or email</p>
                  </div>
                )}

                {/* Empty state - no unassigned users */}
                {!loadingUnassigned && !searchQuery && allUnassignedUsers.length === 0 && (
                  <div className="text-center py-6">
                    <p className="text-sm text-gray-500">All users have been assigned to teams</p>
                  </div>
                )}

                {/* Loading state for search */}
                {isSearching && (
                  <div className="text-center py-4">
                    <div className="inline-flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      <p className="text-sm text-gray-600">Searching...</p>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => {
                      if (selectedUsers.length > 0) {
                        handleAssignUsers(selectedUsers)
                      } else {
                        toast.error('Please select at least one user to assign')
                      }
                    }}
                    disabled={selectedUsers.length === 0 || isAssigningUser || isSearching || loadingUnassigned}
                    className="btn-primary px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isAssigningUser ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Assigning...
                      </>
                    ) : (
                      `Assign${selectedUsers.length > 0 ? ` (${selectedUsers.length})` : ''}`
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setIsAssigning(false)
                      setSearchQuery('')
                      setSearchResults([])
                      setSelectedUsers([])
                      setAllUnassignedUsers([])
                    }}
                    disabled={isAssigningUser}
                    className="px-3 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {uniqueAssignedPeople.length === 0 ? (
          <div className="text-center py-12">
            <FiUsers className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <p className="text-lg font-medium text-gray-900">No assigned people</p>
            <p className="text-sm text-gray-500 mt-1">
              You don't have any team members assigned to you yet.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden">
            <div className="px-4 py-3 flex justify-between items-center border-b bg-gray-50">
              <span className="flex-1 text-xs font-semibold uppercase text-gray-500">User</span>
              <span className="w-24 text-center text-xs font-semibold uppercase text-gray-500">Manage</span>
              <span className="w-24 text-center text-xs font-semibold uppercase text-gray-500">Actions</span>
            </div>
            <ul className="divide-y divide-gray-200">
              {uniqueAssignedPeople.map((person) => (
                <li key={person._id} className="px-4 py-4 flex items-center justify-between">
                  <div className="flex-1 flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center text-white font-semibold">
                        {person.avatar ? (
                          <img src={urlFor(person.avatar).fit('crop').url()} alt={`${person.firstName} ${person.lastName}`} className="w-10 h-10 rounded-full object-cover object-top" />
                        ) : (
                          <span className='uppercase'>{person.firstName?.[0]}{person.lastName?.[0]}</span>
                        )}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {person.firstName} {person.lastName}
                        </p>
                        {person.isActive ? (
                          <span className="ml-2 flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Active
                          </span>
                        ) : (
                          <span className="ml-2 flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            Inactive
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 capitalize">
                        {person.role}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <div className="w-24 flex justify-center">
                      {unassigningMemberId === person._id ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                      ) : (
                        <input
                          type="checkbox"
                          checked={true}
                          onChange={(e) => {
                            if (!e.target.checked) {
                              handleUnassignUser(person._id, `${person.firstName} ${person.lastName}`)
                            }
                          }}
                          disabled={!isAdmin}
                            className="h-4 w-4 theme-color border-gray-300 rounded focus:ring-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      )}
                    </div>
                    <div className="w-24 flex justify-center">
                      <button
                        onClick={() => {
                          setViewingMember(person._id)
                          // router.push(`/admin/team/edit/${person._id}`)
                          router.push(`/admin/team/details/${person._id}`)
                        }}
                        disabled={viewingMember === person._id}
                        className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="View/Edit Team Member"
                      >
                        {viewingMember === person._id ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-700"></div>
                        ) : (
                          <FiEye className="w-4 h-4" />
                        )}
                        <span className="ml-1">View</span>
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
