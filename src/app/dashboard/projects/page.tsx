'use client'

import React, { useState, useEffect, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import DashboardLayout from '@/components/layouts/DashboardLayout'
import { requireAdmin } from '@/lib/auth'
import { CLIENTS_QUERY, USER_ASSIGNED_PROJECTS_QUERY, PROJECT_QUERY, USERS_QUERY, TEAMS_QUERY, ALL_TASKS_QUERY } from '@/lib/queries'
import { sanityFetch } from '@/lib/sanity'
import { formatSimpleTime } from '@/lib/time'
import { Client, Project } from '@/types'
import { useSession } from 'next-auth/react'
import { ProjectName, ProjectCode, BillableType, ProjectDate, ProjectPermission, ProjectStatus, ProjectDescription, ProjectType } from '@/components/layouts/project/create/Form'
import BudgetTab from '@/components/layouts/project/create/BudgetTab'
import ProjectAssignedUsers, { ProjectAssignedUsersRef } from '@/components/layouts/project/create/ProjectAssignedUsers'
import ProjectClients from '@/components/layouts/project/create/ProjectClients'

function ProjectsContent() {
    const { data: session } = useSession()
    const searchParams = useSearchParams()
    const router = useRouter()
    const [selectedProject, setSelectedProject] = useState('')
    const [selectedClient, setSelectedClient] = useState('')
    const [projects, setProjects] = useState<Project[]>([])
    const [clients, setClients] = useState<Client[]>([])
    const [users, setUsers] = useState<any[]>([])
    const [teams, setTeams] = useState<any[]>([])
    const [tasks, setTasks] = useState<any[]>([])
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [projectSearchTerm, setProjectSearchTerm] = useState('')
    const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false)
    const [openActionDropdown, setOpenActionDropdown] = useState<string | null>(null)
    const [dropdownPosition, setDropdownPosition] = useState<{ x: number; y: number } | null>(null)
    const [editingProject, setEditingProject] = useState<Project | null>(null)
    const [isEditMode, setIsEditMode] = useState(false)
  
  
    const [taskSearchTerm, setTaskSearchTerm] = useState('')
    const [isTaskDropdownOpen, setIsTaskDropdownOpen] = useState(false)
    const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null)
    const [initialProjectManagers, setInitialProjectManagers] = useState<string[]>([])
    const [newTasksToCreate, setNewTasksToCreate] = useState<Array<{ tempId: string; name: string; isBillable: boolean }>>([])
    const projectAssignedUsersRef = useRef<ProjectAssignedUsersRef>(null)
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        clientId: '',
        description: '',
        status: 'planning',
        billableType: 'billable',
        startDate: '',
        endDate: '',
        assignedUsers: [] as string[],
        tasks: [] as string[],
        projectType: 'timeAndMaterials',
        budgetType: 'no-budget',
        totalProjectHours: '',
        isActive: true,
        permission: 'admin'
    })

    // Load data on component mount
    useEffect(() => {
        const loadData = async () => {
            try {
                const userId = session?.user?.id || ''
                
                const [projectsData, clientsData, usersData, teamsData, tasksData] = await Promise.all([
                sanityFetch({ query: USER_ASSIGNED_PROJECTS_QUERY, params: { userId } }),
                sanityFetch({ query: CLIENTS_QUERY }),
                sanityFetch({ query: USERS_QUERY }),
                sanityFetch({ query: TEAMS_QUERY }),
                sanityFetch({ query: ALL_TASKS_QUERY })
                ])
                setProjects(projectsData as Project[])
                // for user - set clientsData to as discussed with Nishit on Jan 1, 2026
                // todo: remove client call
                setClients([])
                setUsers(usersData as string[])
                setTeams(teamsData as string[])
                setTasks(tasksData as string[])
            } catch (error) {
                console.error('Error loading data:', error)
            }
        }
        loadData()
    }, [session])

    // Handle edit query parameter - auto-open edit form
    useEffect(() => {
        const editProjectId = searchParams.get('edit')
        if (editProjectId && projects.length > 0 && !showCreateForm) {
            // Find the project and trigger edit
            const projectToEdit = projects.find(p => p._id === editProjectId)
            if (projectToEdit) {
                // Use handleEditProject function which is defined later
                // We'll call it directly to avoid dependency issues
                setEditingProject(projectToEdit)
                setIsEditMode(true)
                setShowCreateForm(true)
                setNewTasksToCreate([]) // Reset temporary tasks when editing
                
                // Populate form with project data
                setFormData({
                    name: projectToEdit.name || '',
                    code: projectToEdit.code || '',
                    clientId: projectToEdit.client?._id || '',
                    description: projectToEdit.description || '',
                    status: projectToEdit.status || 'planning',
                    billableType: projectToEdit.billableType || 'billable',
                    startDate: projectToEdit.dates?.startDate || '',
                    endDate: projectToEdit.dates?.endDate || '',
                    assignedUsers: Array.isArray(projectToEdit.assignedUsers) ? projectToEdit.assignedUsers.map((au: any) => au.user._id) : [],
                    tasks: Array.isArray(projectToEdit.tasks) ? projectToEdit.tasks.map((t: any) => t._id) : [],
                    projectType: (projectToEdit as any).projectType || 'timeAndMaterials',
                    budgetType: (projectToEdit.budget as any)?.type || 'no-budget',
                    totalProjectHours: projectToEdit.budget?.totalProjectHours?.toString() || '',
                    isActive: projectToEdit.isActive ?? true,
                    permission: (projectToEdit as any).permission || 'admin'
                })
                
                // Set project managers
                const managers = Array.isArray(projectToEdit.assignedUsers) && projectToEdit.assignedUsers.length > 0
                    ? projectToEdit.assignedUsers
                        .filter((au: any) => {
                            if (!au) return false
                            const isManager = au.role === 'Project Manager' || au.isManager === true
                            return isManager && au.user
                        })
                        .map((au: any) => {
                            if (!au || !au.user) return null
                            if (typeof au.user === 'object') {
                                return au.user._id || au.user._ref || null
                            } else if (typeof au.user === 'string') {
                                return au.user
                            }
                            return null
                        })
                        .filter((id: string | null): id is string => id !== null)
                    : []
                
                setInitialProjectManagers(managers)
                
                // Set project managers in ProjectAssignedUsers component
                setTimeout(() => {
                    if (projectAssignedUsersRef.current) {
                        projectAssignedUsersRef.current.setProjectManagers(managers)
                    }
                }, 0)
                
                // Remove query parameter from URL
                router.replace('/dashboard/projects')
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams, projects, showCreateForm, router])

    // Filter projects based on selected filters
    const filteredProjects = projects.filter((project: any) => {
        const projectMatch = selectedProject === '' || project._id === selectedProject
        const clientMatch = selectedClient === '' || (project.client?._id && project.client._id === selectedClient)
        return projectMatch && clientMatch
    })

    // Group projects by client
    const groupedProjects = filteredProjects.reduce((acc: any, project: any) => {
        // Skip projects without a client
        if (!project.client || !project.client._id) {
            return acc
        }
        
        const clientId = project.client._id
        const clientName = project.client.name || 'Unknown Client'
        
        if (!acc[clientId]) {
        acc[clientId] = {
            client: { _id: clientId, name: clientName },
            projects: []
        }
        }
        acc[clientId].projects.push(project)
        return acc
    }, {})

    let groupedProjectsArray = Object.values(groupedProjects)
    // for user - set groupedProjectsArray to as discussed with Nishit on Jan 1, 2026
    groupedProjectsArray = []

    // Filter projects based on search term
    let filteredProjectsForSearch = projects.filter((project: any) => 
        project.name.toLowerCase().includes(projectSearchTerm.toLowerCase())
    )
    // for user - set filteredProjectsForSearch to as discussed with Nishit on Jan 1, 2026
    filteredProjectsForSearch = []

    // Get selected project name for display
    const selectedProjectName = selectedProject 
        ? projects.find(p => p._id === selectedProject)?.name || 'Select a project'
        : `All Projects (${filteredProjectsForSearch.length})`

    const handleProjectSelect = (projectId: string) => {
        setSelectedProject(projectId)
        setIsProjectDropdownOpen(false)
        setProjectSearchTerm('')
    }

    // [Project:Action] Edit Project
    const handleEditProject = (projectId: string) => {
        const project = projects.find(p => p._id === projectId)
        if (project) {
        setEditingProject(project)
        setIsEditMode(true)
        setShowCreateForm(true)
        setNewTasksToCreate([]) // Reset temporary tasks when editing
        
        // Populate form with project data
        setFormData({
            name: project.name || '',
            code: project.code || '',
            clientId: project.client?._id || '',
            description: project.description || '',
            status: project.status || 'planning',
            billableType: project.billableType || 'billable',
            startDate: project.dates?.startDate || '',
            endDate: project.dates?.endDate || '',
            assignedUsers: Array.isArray(project.assignedUsers) ? project.assignedUsers.map((au: any) => au.user._id) : [],
            tasks: Array.isArray(project.tasks) ? project.tasks.map((t: any) => t._id) : [],
            projectType: project.projectType || 'timeAndMaterials',
            budgetType: project.budget?.type || 'no-budget',
            totalProjectHours: project.budget?.totalProjectHours?.toString() || '',
            isActive: project.isActive ?? true,
            permission: project.permission || 'admin'
        })
        
        // Set project managers (users who manage this project)
        // Handle both cases: user as full object or as reference
        const managers = Array.isArray(project.assignedUsers) && project.assignedUsers.length > 0
            ? project.assignedUsers
                .filter((au: any) => {
                    // Check if user is a Project Manager
                    if (!au) return false
                    const isManager = au.role === 'Project Manager' || au.isManager === true
                    return isManager && au.user // Must have a user
                })
                .map((au: any) => {
                    // Handle both full object and reference cases
                    if (!au || !au.user) return null
                    
                    if (typeof au.user === 'object') {
                        // Full object case: user has _id property or _ref
                        return au.user._id || au.user._ref || null
                    } else if (typeof au.user === 'string') {
                        // String reference case
                        return au.user
                    }
                    return null
                })
                .filter((id: string | null): id is string => id !== null)
            : []
        
        // Store initial project managers to pass as prop
        setInitialProjectManagers(managers)
        
        // Also try to set via ref (may not be ready yet, but prop will handle it)
        setTimeout(() => {
            if (projectAssignedUsersRef.current) {
                projectAssignedUsersRef.current.setProjectManagers(managers)
            }
        }, 0)
        }
        setOpenActionDropdown(null)
        setDropdownPosition(null)
    }
    // [Project:Action] Duplicate Project
    const handleDuplicateProject = (projectId: string) => {
        setOpenActionDropdown(null)
        setDropdownPosition(null)
        // TODO: Implement duplicate functionality
    }
    const resetUsers = () => {
        // Reset ProjectAssignedUsers component via ref
        if (projectAssignedUsersRef.current) {
            projectAssignedUsersRef.current.resetUsers()
        }
    }
    // Reset Form
    const resetForm = () => {
        setEditingProject(null)
        setIsEditMode(false)
        setInitialProjectManagers([]) // Reset initial project managers
        resetUsers()
        setTaskSearchTerm('')
        setIsTaskDropdownOpen(false)
        setNewTasksToCreate([]) // Reset new tasks to create
        setFormData({
            name: '',
            code: '',
            clientId: '',
            description: '',
            status: 'planning',
            billableType: 'billable',
            startDate: '',
            endDate: '',
            assignedUsers: [],
            tasks: [],
            projectType: 'timeAndMaterials',
            budgetType: 'no-budget',
            totalProjectHours: '',
            isActive: true,
            permission: 'admin'
        })
    }

    

    // Task management functions.
    const addTaskToProject = (taskId: string) => {
        if (!formData.tasks.includes(taskId)) {
        setFormData(prev => ({
            ...prev,
            tasks: [...prev.tasks, taskId]
        }))
        }
        setTaskSearchTerm('')
        setIsTaskDropdownOpen(false)
    }

    // Create a temporary task (not yet saved to backend)
    const createTemporaryTask = (taskName: string) => {
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        const newTask = {
            _id: tempId,
            name: taskName,
            isBillable: true,
            description: ''
        }
        
        // Add to temporary tasks list
        setNewTasksToCreate(prev => [...prev, { tempId, name: taskName, isBillable: true }])
        
        // Add to tasks list for display
        setTasks(prev => [...prev, newTask])
        
        // Add to project tasks
        addTaskToProject(tempId)
    }
    // Remove Task from Project.
    const removeTaskFromProject = (taskId: string) => {
        setFormData(prev => ({
        ...prev,
        tasks: prev.tasks.filter(id => id !== taskId)
        }))
        
        // If it's a temporary task, also remove it from newTasksToCreate and tasks list
        if (taskId.startsWith('temp-')) {
            setNewTasksToCreate(prev => prev.filter(nt => nt.tempId !== taskId))
            setTasks(prev => prev.filter(t => t._id !== taskId))
        }
    }
    // Filter Tasks based on task search term with task Id.
    const filteredTasks = tasks.filter((task: any) => 
        task.name.toLowerCase().includes(taskSearchTerm.toLowerCase()) ||
        task.description?.toLowerCase().includes(taskSearchTerm.toLowerCase())
    ).filter((task: any) => !formData.tasks.includes(task._id))
    
    // Check if we should show "Create task" option
    const shouldShowCreateTaskOption = taskSearchTerm.length > 10 && filteredTasks.length === 0 && taskSearchTerm.trim().length > 0
    // Filter Tasks based on task Id with formData.tasks.
    const assignedTasksData = tasks.filter((task: any) => 
        formData.tasks.includes(task._id)
    )

    // [Project:Action] Archive Project
    const handleArchiveProject = (projectId: string) => {
        setOpenActionDropdown(null)
        setDropdownPosition(null)
        // TODO: Implement archive functionality
    }
    // [Project:Action] Delete Project
    const handleDeleteProject = async (projectId: string) => {
        const project = projects.find(p => p._id === projectId)
        const projectName = project?.name || 'this project'
        
        // Confirm deletion
        if (!confirm(`Are you sure you want to delete "${projectName}"? This action cannot be undone.`)) {
            return
        }
        
        // Set loading state
        setDeletingProjectId(projectId)
        setOpenActionDropdown(null)
        setDropdownPosition(null)
        
        try {
            const response = await fetch(`/api/projects/${projectId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
            })
            
            if (response.ok) {
                // Remove project from local state
                setProjects(prevProjects => prevProjects.filter(p => p._id !== projectId))
                
                // Show success message
                alert(`Project "${projectName}" deleted successfully`)
                
                // Reset selected project if it was the deleted one
                if (selectedProject === projectId) {
                    setSelectedProject('')
                }
            } else {
                const errorData = await response.json()
                // Build a user-friendly error message
                let errorMessage = errorData.error || 'Unknown error'
                
                // If there are details about references, show them
                if (errorData.details && errorData.details.length > 0) {
                    errorMessage += '\n\n' + errorData.details.join('\n')
                }
                
                // Show suggestion if available
                if (errorData.suggestion) {
                    errorMessage += '\n\n💡 ' + errorData.suggestion
                }
                
                alert(errorMessage)
            }
        } catch (error: any) {
            console.error('Error deleting project:', error)
            alert(`Failed to delete project: ${error.message || 'Unknown error'}`)
        } finally {
            // Clear loading state
            setDeletingProjectId(null)
        }
    }
    // Toggle Action Dropdown.
    const toggleActionDropdown = (projectId: string, event: React.MouseEvent) => {
        // Don't allow opening dropdown if project is being deleted
        if (deletingProjectId === projectId) {
            return
        }
        
        if (openActionDropdown === projectId) {
        setOpenActionDropdown(null)
        setDropdownPosition(null)
        } else {
        const buttonRect = event.currentTarget.getBoundingClientRect()
        setDropdownPosition({
            x: buttonRect.right - 192, // 192px is the width of the dropdown (w-48)
            y: buttonRect.bottom + 8   // 8px gap below the button
        })
        setOpenActionDropdown(projectId)
        }
    }

    // Close dropdown when clicking outside.
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Element
            
            if (isProjectDropdownOpen && !target.closest('.project-dropdown')) {
                setIsProjectDropdownOpen(false)
                setProjectSearchTerm('')
            }
            
            if (openActionDropdown && !target.closest('.action-dropdown')) {
                setOpenActionDropdown(null)
                setDropdownPosition(null)
            }
            
        
            if (isTaskDropdownOpen && !target.closest('.task-dropdown')) {
                setIsTaskDropdownOpen(false)
                setTaskSearchTerm('')
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => {
        document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isProjectDropdownOpen, openActionDropdown, isTaskDropdownOpen])

    // Handle Input Change.
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target
        setFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
        }))
    }

    const handleUserToggle = (userId: string) => {
        setFormData(prev => ({
        ...prev,
        assignedUsers: prev.assignedUsers.includes(userId)
            ? prev.assignedUsers.filter(id => id !== userId)
            : [...prev.assignedUsers, userId]
        }))
    }

    const handleTaskToggle = (taskId: string) => {
        setFormData(prev => ({
        ...prev,
        tasks: prev.tasks.includes(taskId)
            ? prev.tasks.filter(id => id !== taskId)
            : [...prev.tasks, taskId]
        }))
    } 

    // Determine role from session.
    const userRole = session?.user?.role || 'user'
    const dashboardRole = 'user'

    return (
        <DashboardLayout role={dashboardRole}>
            <div className="space-y-6">
                {/* Page title and new project button */}
                <div className="flex items-center justify-between bg-white rounded-lg shadow-custom p-6">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">Projects</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            List of your assigned projects
                        </p>
                    </div>
                    <div>
                    </div>
                </div>
                {/* Project filters and project lists table */}
                <div className="data-container bg-white rounded-lg shadow-custom p-6">
                    {showCreateForm ? (
                    <div className="project-create-form relative">
                        {isSubmitting && (
                            <div className="form-creation-overlay absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-50 rounded-lg">
                            <div className="flex flex-col items-center gap-2">
                                <svg className="animate-spin h-6 w-6 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span className="text-sm text-gray-600 font-medium">
                                    {isEditMode ? 'Updating project...' : 'Creating project...'}
                                </span>
                            </div>
                        </div>
                        )}
                    </div>
                    ) : (
                    <div className="project-lists-table">
                        <div className="flex items-center justify-between gap-5 flex-wrap gap-2">
                        {/* dropdownfilter by project */}
                        <div className="w-full lg:w-auto lg:flex-1">
                            <label htmlFor="project" className="block text-sm font-medium text-gray-700">Project</label>
                            
                            {/* Custom Project Dropdown with Search */}
                            <div className="relative mt-1 project-dropdown">
                            <button
                                type="button"
                                onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
                                className="relative w-full bg-white border border-gray-300 rounded-md shadow-sm pl-3 pr-10 py-2 text-left cursor-default focus:outline-none focus:ring-1 focus:ring-transparent focus:border-black"
                            >
                                <span className="block truncate">{selectedProjectName}</span>
                                <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                                    <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                </span>
                            </button>

                            {isProjectDropdownOpen && (
                                <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none">
                                {/* Search Input at the top */}
                                <div className="px-3 py-2 border-b border-gray-200 sticky top-0 bg-white z-20">
                                    <input
                                    type="text"
                                    placeholder="Search projects..."
                                    value={projectSearchTerm}
                                    onChange={(e) => setProjectSearchTerm(e.target.value)}
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-transparent focus:border-black"
                                    onClick={(e) => e.stopPropagation()}
                                    autoFocus
                                    />
                                </div>

                                {/* All Projects Option */}
                                <div
                                    className="cursor-pointer select-none relative py-2 pl-3 pr-9"
                                    onClick={() => handleProjectSelect('')}
                                >
                                    <span className="font-medium text-gray-900">All Projects ({filteredProjectsForSearch.length})</span>
                                </div>

                                {/* Active Projects */}
                                {filteredProjectsForSearch.filter((project: any) => project.status === 'active').length > 0 && (
                                    <>
                                    <div className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-t border-gray-200">
                                        Active Projects ({filteredProjectsForSearch.filter((project: any) => project.status === 'active').length})
                                    </div>
                                    {filteredProjectsForSearch.filter((project: any) => project.status === 'active').map((project: any) => (
                                        <div
                                        key={project._id}
                                        className="cursor-pointer select-none relative py-2 pl-6 pr-9 hover:bg-black hover:text-white"
                                        onClick={() => handleProjectSelect(project._id)}
                                        >
                                        <span className="block truncate capitalize">{project.name}</span>
                                        </div>
                                    ))}
                                    </>
                                )}

                                {/* Planning Projects */}
                                {filteredProjectsForSearch.filter((project: any) => project.status === 'planning').length > 0 && (
                                    <>
                                    <div className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-t border-gray-200">
                                        Planning Projects ({filteredProjectsForSearch.filter((project: any) => project.status === 'planning').length})
                                    </div>
                                    {filteredProjectsForSearch.filter((project: any) => project.status === 'planning').map((project: any) => (
                                        <div
                                        key={project._id}
                                        className="cursor-pointer select-none relative py-2 pl-6 pr-9 hover:bg-black hover:text-white"
                                        onClick={() => handleProjectSelect(project._id)}
                                        >
                                        <span className="block truncate capitalize">{project.name}</span>
                                        </div>
                                    ))}
                                    </>
                                )}

                                {/* On Hold Projects */}
                                {filteredProjectsForSearch.filter((project: any) => project.status === 'on_hold').length > 0 && (
                                    <>
                                    <div className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-t border-gray-200">
                                        On Hold Projects ({filteredProjectsForSearch.filter((project: any) => project.status === 'on_hold').length})
                                    </div>
                                    {filteredProjectsForSearch.filter((project: any) => project.status === 'on_hold').map((project: any) => (
                                        <div
                                        key={project._id}
                                        className="cursor-pointer select-none relative py-2 pl-6 pr-9 hover:bg-black hover:text-white"
                                        onClick={() => handleProjectSelect(project._id)}
                                        >
                                        <span className="block truncate capitalize">{project.name}</span>
                                        </div>
                                    ))}
                                    </>
                                )}

                                {/* Completed Projects */}
                                {filteredProjectsForSearch.filter((project: any) => project.status === 'completed').length > 0 && (
                                    <>
                                    <div className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-t border-gray-200">
                                        Completed Projects ({filteredProjectsForSearch.filter((project: any) => project.status === 'completed').length})
                                    </div>
                                    {filteredProjectsForSearch.filter((project: any) => project.status === 'completed').map((project: any) => (
                                        <div
                                        key={project._id}
                                        className="cursor-pointer select-none relative py-2 pl-6 pr-9 hover:bg-black hover:text-white"
                                        onClick={() => handleProjectSelect(project._id)}
                                        >
                                        <span className="block truncate capitalize">{project.name}</span>
                                        </div>
                                    ))}
                                    </>
                                )}

                                {/* Cancelled Projects */}
                                {filteredProjectsForSearch.filter((project: any) => project.status === 'cancelled').length > 0 && (
                                    <>
                                    <div className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-t border-gray-200">
                                        Cancelled Projects ({filteredProjectsForSearch.filter((project: any) => project.status === 'cancelled').length})
                                    </div>
                                    {filteredProjectsForSearch.filter((project: any) => project.status === 'cancelled').map((project: any) => (
                                        <div
                                        key={project._id}
                                        className="cursor-pointer select-none relative py-2 pl-6 pr-9 hover:bg-black hover:text-white"
                                        onClick={() => handleProjectSelect(project._id)}
                                        >
                                        <span className="block truncate capitalize">{project.name}</span>
                                        </div>
                                    ))}
                                    </>
                                )}

                                {/* No results */}
                                {filteredProjectsForSearch.length === 0 && (
                                    <div className="px-3 py-2 text-sm text-gray-500 text-center">
                                    No projects found
                                    </div>
                                )}
                                </div>
                            )}
                            </div>
                        </div>
                        {/* dropdown filter by client */}
                        <div className="w-full lg:w-auto lg:flex-1">
                            <label htmlFor="client" className="block text-sm font-medium text-gray-700">Client</label>
                                <select 
                                id="client" 
                                value={selectedClient}
                                onChange={(e) => setSelectedClient(e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-transparent"
                                >
                                <option value="">All Clients ({clients.length})</option>
                            {clients.map((client: any) => (
                                <option key={client._id} value={client._id}>{client.name}</option>
                            ))}
                            </select>
                        </div>
                        </div>

                        {/* Projects Table or Empty State */}
                        {groupedProjectsArray.length === 0 ? (
                            <div className="bg-[#e8e8e8] rounded-lg mt-6 py-12 px-6">
                                <div className="flex flex-col items-center justify-center text-center">
                                    {/* Illustration */}
                                    <div className="mb-6 relative">
                                        <svg width="140" height="140" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            {/* Head silhouette */}
                                            <ellipse cx="50" cy="85" rx="35" ry="45" fill="#1d1e1c"/>
                                            <path d="M50 40 C65 40 78 55 78 75 C78 95 65 110 50 120 C50 120 50 40 50 40" fill="#1d1e1c"/>
                                            {/* Brain line detail */}
                                            <path d="M35 60 Q45 55 50 65 Q55 75 45 80 Q35 85 40 95" stroke="#e8e8e8" strokeWidth="2" fill="none"/>
                                            {/* Bar chart */}
                                            <rect x="70" y="90" width="12" height="30" fill="#1d1e1c"/>
                                            <rect x="85" y="75" width="12" height="45" fill="#1d1e1c"/>
                                            <rect x="100" y="60" width="12" height="60" fill="#1d1e1c"/>
                                            <rect x="115" y="45" width="12" height="75" fill="#1d1e1c"/>
                                            {/* Trend line */}
                                            <path d="M95 30 L110 20 L125 35" stroke="#1d1e1c" strokeWidth="2" fill="none"/>
                                            <circle cx="95" cy="30" r="3" fill="#1d1e1c"/>
                                            <circle cx="110" cy="20" r="3" fill="#1d1e1c"/>
                                            <circle cx="125" cy="35" r="3" fill="#1d1e1c"/>
                                        </svg>
                                    </div>
                                    {/* Message */}
                                    <p className="text-[#1d1e1c] text-base max-w-2xl leading-relaxed">
                                        Welcome to Projects! Here you&apos;ll be able to check project reports once an Administrator or Manager 
                                        makes that report available to you. In the meantime you can{' '}
                                        <Link href="/dashboard/" className="text-[#2a59c1] underline hover:text-[#1e429f]">
                                            track time
                                        </Link>
                                        {' '}or review your{' '}
                                        <Link href="/dashboard/settings?tab=projects" className="text-[#2a59c1] underline hover:text-[#1e429f]">
                                            assigned projects
                                        </Link>.
                                    </p>
                                </div>
                            </div>
                        ) : (
                        <div className="bg-white overflow-hidden mt-6 overflow-x-auto">
                            <table className="min-w-full divide-y divide-[#1d1e1c40]">
                            <thead className="bg-[#eee] border-t border-[#1d1e1c40]">
                            <tr className="">
                                <th className="px-6 py-2 text-left text-sm font-normal text-[#1d1e1c]">
                                Project Name
                                </th>
                                <th className="px-6 py-2 text-left text-sm font-normal text-[#1d1e1cb3]">
                                Status
                                </th>
                                <th className="px-6 py-2 text-left text-sm font-normal text-[#1d1e1cb3]">
                                Budget
                                </th>
                                <th className="px-6 py-2 text-left text-sm font-normal text-[#1d1e1cb3]">
                                Spent
                                </th>
                                <th className="px-6 py-2 text-left text-sm font-normal text-[#1d1e1cb3]">
                                Actions
                                </th>
                            </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-[#1d1e1c40]">
                            {
                                groupedProjectsArray.map((group: any) => (
                                <React.Fragment key={group.client._id}>
                                    {/* Client Header Row */}
                                    <tr className="border-gray-300 bg-[#eee]">
                                    <td colSpan={5} className="px-6 py-2">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-[#1d1e1c] capitalize font-normal text-sm">
                                            {group.client.name} <span className="text-sm text-gray-600 font-regular">({group.projects.length} project{group.projects.length !== 1 ? 's' : ''})</span>
                                        </h3>
                                        </div>
                                    </td>
                                    </tr>
                                    
                                    {/* Project Rows */}
                                    {group.projects.map((project: any) => (
                                    <tr key={project._id} className={`border-transparent hover:border-primary-300 relative hover:bg-gray-50 transition-colors ${project.isArchived || project.assignedUsers?.some((assignment: any) => assignment.user._id === session?.user?.id && assignment.isActive === false) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                        <td className="px-6 py-2">
                                        <div className="flex items-center">
                                            <div>
                                                {project.isArchived || project.assignedUsers?.some((assignment: any) => assignment.user._id === session?.user?.id && assignment.isActive === false) ? (
                                                    <span className="text-gray-500 capitalize">{project.name}</span>
                                                ) : (
                                                    <Link 
                                                        href={`/dashboard/projects/${project._id}`}
                                                                    className="text-[#2a59c1] hover:text-[#2a59c1] underline capitalize block"
                                                    >
                                                        {project.name}
                                                    </Link>
                                                )}
                                                {project.code && (
                                                    <div className="text-xs text-gray-500">
                                                    Code: {project.code}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        </td>
                                        <td className="px-6 py-2">
                                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                            project.status === 'active' ? 'bg-green-100 text-green-800' :
                                            project.status === 'planning' ? 'bg-blue-100 text-blue-800' :
                                            project.status === 'on_hold' ? 'bg-yellow-100 text-yellow-800' :
                                            project.status === 'completed' ? 'bg-gray-100 text-gray-800' :
                                            'bg-red-100 text-red-800'
                                        }`}>
                                            {project.status.charAt(0).toUpperCase() + project.status.slice(1).replace('_', ' ')}
                                        </span>
                                        </td>
                                        <td className="px-6 py-2">
                                        <span className="text-gray-900">
                                            {!project.budget || project.budget.type === 'no-budget' ? 'No Budget' : `${project.budget.totalProjectHours} hours`}
                                        </span>
                                        </td>
                                        <td className="px-6 py-2">
                                        <div className="flex flex-col gap-2">
                                            <span className="text-gray-900">
                                                {project.totalHours ? formatSimpleTime(Number(project.totalHours)) : '0:00'}
                                            </span>
                                            {project.budget && (project.budget as any)?.type === 'total-project-hours' && project.budget?.totalProjectHours ? (() => {
                                                const totalHours = project.totalHours || 0
                                                const budgetHours = project.budget.totalProjectHours
                                                const progressPercentage = Math.min((totalHours / budgetHours) * 100, 100)
                                                const isOverBudget = totalHours > budgetHours
                                                
                                                return (
                                                    <div className="w-full">
                                                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                                            <div
                                                                className={`h-2 rounded-full transition-all ${
                                                                    progressPercentage >= 80 
                                                                        ? 'bg-red-600' 
                                                                        : progressPercentage >= 60 
                                                                        ? 'bg-yellow-500' 
                                                                        : 'bg-green-500'
                                                                }`}
                                                                style={{ width: `${progressPercentage}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-xs text-gray-500 mt-1">
                                                            {Math.round(progressPercentage)}% of {budgetHours} hours
                                                        </span>
                                                    </div>
                                                )
                                            })() : null}
                                        </div>
                                        </td>
                                        <td className="px-6 py-2">
                                        </td>
                                    </tr>
                                    ))}
                                </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                        </div>
                        )}
                    </div>
                    )}
                </div>
            </div>
    </DashboardLayout>
  )
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={
      <DashboardLayout role="user">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      </DashboardLayout>
    }>
      <ProjectsContent />
    </Suspense>
  )
}

