'use client'

import { useCallback, useEffect, useState } from 'react'
import { useDataFetcher } from '@/lib/hooks/useDataFetcher'
import { sanityFetch } from '@/lib/sanity'
import { FiFolder, FiCheckSquare, FiClock, FiUsers, FiPlus, FiX, FiEye, FiSearch } from 'react-icons/fi'
import { Project, Task } from '@/types'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'

interface AssignedProject extends Project {
  tasks?: Task[]
}

interface AssignedProjectsTabProps {
  userId?: string
}

interface AssignedProjectsData {
  assignedProjects: AssignedProject[]
}

export default function AssignedProjectsTab({ userId }: AssignedProjectsTabProps = {}) {
  const { data: session } = useSession()
  const router = useRouter()
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [availableProjects, setAvailableProjects] = useState<Project[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [assigningProject, setAssigningProject] = useState<string | null>(null)
  const [unassigningProject, setUnassigningProject] = useState<string | null>(null)
  const [teamMembers, setTeamMembers] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  const targetUserId = userId || session?.user?.id
  const isAdmin = session?.user?.role === 'admin' || session?.user?.isSanityAdmin

  // Check if logged-in user can assign projects (admin or manager)
  const canAssignProjects = isAdmin || session?.user?.role === 'manager'

  const fetchAssignedProjects = useCallback(async (): Promise<AssignedProjectsData> => {
    if (!targetUserId) {
      throw new Error('User not authenticated')
    }

    let query: string

    // For managers viewing their own profile: include projects they manage
    // For managers viewing others: only projects assigned to the target user that the manager manages
    // For admins: return projects assigned to the target user (existing behavior)
    if (session?.user?.role === 'manager' && targetUserId === session.user.id) {
      // Manager viewing own profile: show projects they are assigned to OR manage
      query = `*[_type == "user" && _id == $userId && isArchived != true][0]{
        "assignedProjects": *[_type == "project" && !(_id in path("drafts.**")) && isActive == true && ($userId in assignedUsers[].user._ref || $userId in assignedUsers[role == "Project Manager"].user._ref)] | order(name asc){
          _id,
          name,
          code,
          status,
          billableType,
          client->{name},
          description,
          assignedUsers[]{
            user->{_id, firstName, lastName, avatar},
            role,
            isActive
          },
          "tasks": tasks[]->{
          _id,
          name,
          isBillable,
          isArchived
          }
        }
        }`
    } else {
      // Existing behavior: projects assigned to target user, with manager restrictions
      const managerFilter = session?.user?.role === 'manager' 
        ? ` && "${session.user.id}" in assignedUsers[role == "Project Manager"].user._ref`
        : ''
      // ======== this show managers managed projects for the team member ========
      // query = `*[_type == "user" && _id == $userId && isArchived != true][0]{
      //   "assignedProjects": *[_type == "project" && !(_id in path("drafts.**")) && isActive == true && $userId in assignedUsers[].user._ref${managerFilter}] | order(name asc)
      // ==============================
      query = `*[_type == "user" && _id == $userId && isArchived != true][0]{
        "assignedProjects": *[_type == "project" && !(_id in path("drafts.**")) && isActive == true && $userId in assignedUsers[].user._ref] | order(name asc){
          _id,
          name,
          code,
          status,
          billableType,
          client->{name},
          description,
          assignedUsers[]{
            user->{_id, firstName, lastName, avatar},
            role,
            isActive
          },
          "tasks": tasks[]->{
          _id,
          name,
          isBillable,
          isArchived
          }
        }
        }`
    }

    const result = await sanityFetch<{ assignedProjects: AssignedProject[] }>({
      query,
      params: { userId: targetUserId }
    })

    return result
  }, [targetUserId, session?.user?.role, session?.user?.id])

  const { data, loading, error, refetch } = useDataFetcher<AssignedProjectsData>(
    fetchAssignedProjects,
    { refetchOnMount: !!session?.user?.id }
  )

  // Fetch team members when component mounts if logged-in user is a manager
  useEffect(() => {
    const fetchTeamMembers = async () => {
      if (session?.user?.role === 'manager' && session?.user?.id) {
        try {
          const teamQuery = `*[_type == "team" && manager._ref == $userId && isActive == true].members[]->{
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
          }`
          
          const members = await sanityFetch<any[]>({ 
            query: teamQuery, 
            params: { userId: session.user.id } 
          })
          
          if (members && members.length > 0) {
            setTeamMembers(members.filter(m => m && m.isArchived !== true))
          }
        } catch (error) {
          console.error('Error fetching team members:', error)
        }
      }
    }

    fetchTeamMembers()
  }, [session?.user?.role, session?.user?.id])

  const fetchAvailableProjects = async () => {
    setLoadingProjects(true)
    try {
      let query = `*[_type == "project" && isActive == true && !(_id in path("drafts.**"))`

      // If manager, only show projects they manage
      if (session?.user?.role === 'manager') {
        query += ` && $loggedInUserId in assignedUsers[role == "Project Manager"].user._ref`
      }

      query += `]{
        _id,
        name,
        code,
        status,
        client->{name},
        assignedUsers[]{
          user->{_id, firstName, lastName, avatar},
          role,
          isActive
        }
      } | order(name asc)`

      const projects = await sanityFetch<Project[]>({ 
        query,
        params: session?.user?.role === 'manager' ? { loggedInUserId: session.user.id } : {}
      })
      setAvailableProjects(projects || [])
    } catch (error) {
      console.error('Error fetching available projects:', error)
      toast.error('Failed to load available projects')
    } finally {
      setLoadingProjects(false)
    }
  }
  // console.log('availableProjects', availableProjects)

  const handleAssignProject = async (projectId: string) => {
    setAssigningProject(projectId)
    try {
      if (!targetUserId) {
        throw new Error('User ID is required')
      }
      let requestBody: { userId: string; people?: any[] } = { userId: targetUserId }
      
      // If logged-in user is a manager, include their team members in body
      if (session?.user?.role === 'manager' && teamMembers.length > 0) {
        requestBody.people = teamMembers
      }
      const response = await fetch(`/api/projects/${projectId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) throw new Error('Failed to assign project')

      toast.success('Project assigned successfully')
      setShowAssignModal(false)
      refetch() // Refresh the assigned projects list
    } catch (error) {
      console.error('Error assigning project:', error)
      toast.error('Failed to assign project')
    } finally {
      setAssigningProject(null)
    }
  }

  const handleUnassignProject = async (projectId: string) => {
    setUnassigningProject(projectId)
    try {
      if (!targetUserId) {
        throw new Error('User ID is required')
      }
      
      let requestBody: { userId: string; people?: any[] } = { userId: targetUserId }
      
      // If logged-in user is a manager, include their team members in body
      if (session?.user?.role === 'manager' && teamMembers.length > 0) {
        requestBody.people = teamMembers
      }
      
      const response = await fetch(`/api/projects/${projectId}/unassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) throw new Error('Failed to mark project as inactive')

      toast.success('Project marked as inactive successfully')
      refetch() // Refresh the assigned projects list
    } catch (error) {
      console.error('Error marking project as inactive:', error)
      toast.error('Failed to mark project as inactive')
    } finally {
      setUnassigningProject(null)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'planning':
        return 'bg-blue-100 text-blue-800'
      case 'on_hold':
        return 'bg-yellow-100 text-yellow-800'
      case 'completed':
        return 'bg-gray-100 text-gray-800'
      case 'cancelled':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getBillableTypeColor = (billableType: string) => {
    return billableType === 'billable'
      ? 'bg-green-100 text-green-800'
      : 'bg-orange-100 text-orange-800'
  }

  // Check if user is inactive for a project
  const isUserInactiveForProject = (project: AssignedProject) => {
    if (!project.assignedUsers || !targetUserId) return false
    const userAssignment = project.assignedUsers.find(
      (assignment) => assignment.user?._id === targetUserId
    )
    // console.log('userAssignment', userAssignment)
    return userAssignment ? userAssignment.isActive === false : false
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Assigned Projects</h3>
          <p className="mt-1 text-sm text-gray-500">
            View all projects assigned to you and their tasks
          </p>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <span className="ml-3 text-gray-600">Loading projects...</span>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Assigned Projects</h3>
          <p className="mt-1 text-sm text-gray-500">
            View all projects assigned to you and their tasks
          </p>
        </div>
        <div className="p-6">
          <div className="text-center py-12">
            <div className="text-red-600 mb-2">
              <FiFolder className="w-12 h-12 mx-auto mb-4" />
              <p className="text-lg font-medium">Error loading projects</p>
              <p className="text-sm text-gray-500 mt-1">{error}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const projects = data?.assignedProjects || []
  // console.log('projects', projects)
  // console.log('user', userId)
  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Assigned Projects</h3>
            <p className="mt-1 text-sm text-gray-500">
              View all projects assigned to you and their tasks ({projects.length} project{projects.length !== 1 ? 's' : ''})
              {canAssignProjects && userId && (
                <span className="block mt-1 text-xs text-blue-600">
                  {isAdmin
                    ? 'As an admin, you can assign or unassign projects for this team member.'
                    : 'As a manager, you can assign or unassign projects you manage for this team member.'
                  }
                </span>
              )}
            </p>
          </div>
          {canAssignProjects && userId && (
            <button
              onClick={() => {
                setShowAssignModal(true)
                fetchAvailableProjects()
              }}
              disabled={loadingProjects || showAssignModal}
              className="btn-primary inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingProjects ? (
                <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <FiPlus className="w-4 h-4 mr-2" />
              )}
              {loadingProjects ? 'Loading...' : 'Assign Project'}
            </button>
          )}
        </div>
        {/* Assign Project Section */}
        {showAssignModal && (
          <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Assign Project</h3>
              <button
                onClick={() => {
                  setShowAssignModal(false)
                  setSearchQuery('')
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="mb-4 relative">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search projects by name, code, or client..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-transparent focus:border-black"
              />
            </div>

            <div className="max-h-96 overflow-y-auto">
              {loadingProjects ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
                  <span className="ml-2 text-gray-600">Loading projects...</span>
                </div>
              ) : availableProjects.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No projects available</p>
              ) : (() => {
                // Filter projects based on search query
                const filteredProjects = availableProjects.filter((project) => {
                  if (!searchQuery.trim()) return true
                  const query = searchQuery.toLowerCase()
                  const projectName = project.name?.toLowerCase() || ''
                  const projectCode = project.code?.toLowerCase() || ''
                  const clientName = project.client?.name?.toLowerCase() || ''
                  return projectName.includes(query) || projectCode.includes(query) || clientName.includes(query)
                })

                return filteredProjects.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No projects found matching "{searchQuery}"</p>
                ) : (
                  <div className="space-y-2">
                    {filteredProjects.map((project) => {
                      // check if session.user.id is in project.assignedUsers[role == "Project Manager"].user._ref
                      const isProjectManager = project.assignedUsers?.some((assignment: any) => assignment.user._id === session?.user?.id && assignment.role === 'Project Manager')
                      // Check if this project is already assigned to the target user
                      const isAlreadyAssigned = !projects.some(p => p._id === project._id)
                      return (
                        <div
                          key={project._id}
                          className="flex items-center justify-between p-3 border border-gray-200 rounded-md hover:bg-gray-50 bg-white"
                        >
                          <div>
                            <div className="font-medium text-gray-900">{project.name}</div>
                            <div className="text-sm text-gray-500">
                              {project.code && `${project.code} • `}
                              {project.client?.name}
                              {session?.user?.role === 'manager' && (
                                <span className="ml-1 text-xs bg-blue-100 text-blue-800 px-1 py-0.5 rounded">
                                  {isProjectManager ? 'Project Manager' : 'Team Member'}
                                </span>
                              )}
                            </div>
                          </div>
                          {isAlreadyAssigned && (
                            <button
                              onClick={() => handleAssignProject(project._id)}
                              disabled={assigningProject === project._id}
                              className="btn-primary inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {assigningProject === project._id ? (
                                <div className="animate-spin rounded-full h-3 w-3 border-b border-white mr-1"></div>
                              ) : null}
                              Assign
                            </button>
                          )}
                        </div>
                      )
                    })}
                    {filteredProjects.filter(project => !projects.some(p => p._id === project._id)).length === 0 && (
                      <p className="text-gray-500 text-center py-4">All available projects have been assigned to this team member.</p>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        )}
      </div>

      <div className="p-6">
        {projects.length === 0 ? (
          isAdmin && !userId ? (
            <div className="text-center py-12">
              <FiFolder className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-lg font-medium text-gray-900">No projects assigned directly.</p>
              <p className="text-sm text-gray-500 mt-1 mb-4">
                As an admin, you can view all projects in the main project view.
              </p>
              <button
                onClick={() => router.push('/admin/projects')}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                View All Projects
              </button>
            </div>
          ) : (
            <div className="text-center py-12">
              <FiFolder className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-lg font-medium text-gray-900">No assigned projects</p>
              <p className="text-sm text-gray-500 mt-1">
                You haven't been assigned to any projects yet.
              </p>
            </div>
          )
        ) : (
          <div className="space-y-6">
            {projects.map((project) => (
              <div key={project._id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <FiFolder className="w-5 h-5 text-gray-400" />
                        <h4 className="text-lg font-semibold text-gray-900 capitalize">
                          {project.name}
                        </h4>
                        {project.code && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {project.code}
                          </span>
                        )}
                        {(session?.user?.role === 'admin' || session?.user?.role === 'manager') && (
                          <button
                            onClick={() => {
                              const projectRoute = `/admin/projects/${project._id}`
                              router.push(projectRoute)
                            }}
                            className="ml-2 inline-flex items-center px-2 py-1 border border-transparent text-xs leading-4 font-medium rounded text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                          >
                            <FiEye className="w-3 h-3 mr-1" />
                            View Project
                          </button>
                        )}

                        {
                          session?.user?.role === 'admin' && userId == undefined && project.assignedUsers?.some((assignment: any) => assignment.user._id === session?.user?.id ) && (
                            <div>
                              {isUserInactiveForProject(project) ? 
                              <span className="text-red-800 bg-red-100 px-2 py-1 rounded-md text-xs font-medium">Inactive Project</span> : 
                              <span className="text-green-800 bg-green-100 px-2 py-1 rounded-md text-xs font-medium">Active Project</span>}
                            </div>
                          
                        )}
                        {
                          session?.user?.role === 'manager' && userId == undefined && project.assignedUsers?.some((assignment: any) => assignment.user._id === session?.user?.id && assignment.role === 'Project Manager') && (
                            <div>
                              {isUserInactiveForProject(project) ? 
                              <span className="text-red-800 bg-red-100 px-2 py-1 rounded-md text-xs font-medium">Inactive Project</span> : 
                              <span className="text-green-800 bg-green-100 px-2 py-1 rounded-md text-xs font-medium">Active Project</span>}
                            </div>
                          
                        )}
                        {
                          session?.user?.role === 'user' && userId == undefined && project.assignedUsers?.some((assignment: any) => assignment.user._id === session?.user?.id ) && (
                            <div>
                              {isUserInactiveForProject(project) ? 
                              <span className="text-red-800 bg-red-100 px-2 py-1 rounded-md text-xs font-medium">Inactive Project</span> : 
                              <span className="text-green-800 bg-green-100 px-2 py-1 rounded-md text-xs font-medium">Active Project</span>}
                            </div>
                          
                        )}
                        {canAssignProjects && userId && (
                          <>
                            {isUserInactiveForProject(project) ? (
                              <button
                                onClick={() => handleAssignProject(project._id)}
                                disabled={assigningProject === project._id}
                                className="ml-2 inline-flex items-center px-2 py-1 border border-transparent text-xs leading-4 font-medium rounded text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {assigningProject === project._id ? (
                                  <div className="animate-spin rounded-full h-3 w-3 border-b border-white mr-1"></div>
                                ) : null}
                                <span>Reassign</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleUnassignProject(project._id)}
                                disabled={unassigningProject === project._id}
                                className="ml-2 inline-flex items-center px-2 py-1 border border-transparent text-xs leading-4 font-medium rounded text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {unassigningProject === project._id ? (
                                  <div className="animate-spin rounded-full h-3 w-3 border-b border-red-700 mr-1"></div>
                                ) : (
                                  <>
                                    <FiX className="w-3 h-3 mr-1" />
                                    Unassign
                                  </>
                                )}
                              </button>
                            )}
                          </>
                        )}
                      </div>

                    <div className="flex items-center space-x-4 text-sm text-gray-600 mb-3">
                      <div className="flex items-center space-x-1">
                        <FiUsers className="w-4 h-4" />
                        <span>{project.client?.name}</span>
                      </div>

                      <span className={`capitalize inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                        {project.status.replace('_', ' ')}
                      </span>

                      <span className={`capitalize inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getBillableTypeColor(project.billableType)}`}>
                        {project.billableType}
                      </span>
                    </div>

                    {project.description && (
                      <p className="text-sm text-gray-600 mb-3">{project.description}</p>
                    )}
                  </div>
                </div>

                {/* Tasks Section */}
                <div>
                  <div className="flex items-center space-x-2 mb-3">
                    <FiCheckSquare className="w-4 h-4 text-gray-400" />
                    <h5 className="text-sm font-medium text-gray-900">
                      Tasks ({project.tasks?.filter((task: any) => !task.isArchived).length || 0})
                    </h5>
                  </div>

                  {project.tasks && project.tasks.filter((task: any) => !task.isArchived).length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {project.tasks.filter((task: any) => !task.isArchived).map((task) => (
                        <div
                          key={task._id}
                          className="flex items-center space-x-2 p-2 bg-gray-50 rounded-md capitalize"
                        >
                          <FiClock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="text-sm text-gray-900 truncate">{task.name}</span>
                          {task.isBillable && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                              Billable
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 italic">No tasks assigned</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
