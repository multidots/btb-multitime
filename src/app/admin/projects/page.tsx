'use client'

import React, { useState, useEffect, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import DashboardLayout from '@/components/layouts/DashboardLayout'
import { requireAdmin } from '@/lib/auth'
import { CLIENTS_QUERY, PROJECTS_QUERY, PROJECT_QUERY, USERS_QUERY, TEAMS_QUERY, ALL_TASKS_QUERY } from '@/lib/queries'
import { sanityFetch } from '@/lib/sanity'
import { formatSimpleTime } from '@/lib/time'
import { Client, Project } from '@/types'
import { useSession } from 'next-auth/react'
import { ProjectName, ProjectCode, BillableType, ProjectDate, ProjectPermission, ProjectStatus, ProjectDescription, ProjectType } from '@/components/layouts/project/create/Form'
import BudgetTab from '@/components/layouts/project/create/BudgetTab'
import ProjectAssignedUsers, { ProjectAssignedUsersRef } from '@/components/layouts/project/create/ProjectAssignedUsers'
import ProjectClients from '@/components/layouts/project/create/ProjectClients'
import ProjectsFilterDropdown from '@/components/layouts/project/ProjectsFilterDropdown'
import ClientFilterDropdown from '@/components/layouts/project/ClientFilterDropdown'
import { usePageTitle } from '@/lib/pageTitleImpl'

function AdminProjectsContent() {
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
    const [isLoading, setIsLoading] = useState(true)
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [projectSearchTerm, setProjectSearchTerm] = useState('')
    const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false)
    const [clientSearchTerm, setClientSearchTerm] = useState('')
    const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false)
    const [openActionDropdown, setOpenActionDropdown] = useState<string | null>(null)
    const [dropdownPosition, setDropdownPosition] = useState<{ x: number; y: number } | null>(null)
    const [editingProject, setEditingProject] = useState<Project | null>(null)
    const [isEditMode, setIsEditMode] = useState(false)
  
  
    const [taskSearchTerm, setTaskSearchTerm] = useState('')
    const [isTaskDropdownOpen, setIsTaskDropdownOpen] = useState(false)
    const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null)
    const [archivingProjectId, setArchivingProjectId] = useState<string | null>(null)
    const [initialProjectManagers, setInitialProjectManagers] = useState<string[]>([])
    const [newTasksToCreate, setNewTasksToCreate] = useState<Array<{ tempId: string; name: string; isBillable: boolean }>>([])
    const projectAssignedUsersRef = useRef<ProjectAssignedUsersRef>(null)
    const isLoadingRef = useRef(false)
    const hasLoadedRef = useRef(false)
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        clientId: '',
        description: '',
        status: 'planning',
        billableType: 'billable',
        startDate: '',
        endDate: '',
        assignedUsers: [] as Array<{
            user: { _id: string }
            role?: string
            isActive: boolean
        }>,
        tasks: [] as string[],
        projectType: 'timeAndMaterials',
        budgetType: 'no-budget',
        totalProjectHours: '',
        isActive: true,
        permission: 'admin'
    })

    usePageTitle('Projects')

    // Load data on component mount
    useEffect(() => {
        const loadData = async () => {
            if (!session?.user) {
                setIsLoading(false)
                isLoadingRef.current = false
                return
            }
            
            // Prevent duplicate loading if already in progress or already loaded
            if (isLoadingRef.current || hasLoadedRef.current) {
                return
            }
            
            isLoadingRef.current = true
            setIsLoading(true)
            
            try {
                const userRole = session?.user?.role || 'user'
                const userId = session?.user?.id || ''
                
                const [projectsData, clientsData, usersData, teamsData, tasksData] = await Promise.all([
                sanityFetch({ query: PROJECTS_QUERY, params: { userRole, userId } }),
                sanityFetch({ query: CLIENTS_QUERY }),
                sanityFetch({ query: USERS_QUERY }),
                sanityFetch({ query: TEAMS_QUERY }),
                sanityFetch({ query: ALL_TASKS_QUERY })
                ])
                setProjects(projectsData as Project[])
                setClients(clientsData as Client[])
                setUsers(usersData as string[])
                setTeams(teamsData as string[])
                setTasks(tasksData as string[])
                hasLoadedRef.current = true
            } catch (error) {
                console.error('Error loading data:', error)
            } finally {
                setIsLoading(false)
                isLoadingRef.current = false
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
                    assignedUsers: Array.isArray(projectToEdit.assignedUsers) ? projectToEdit.assignedUsers.map((au: any) => ({
                        user: { _id: au.user._id || au.user._ref },
                        role: au.role || 'Team Member',
                        isActive: au.isActive ?? true
                    })) : [],
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
                router.replace('/admin/projects')
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

    // Sort projects within each group: archived projects at the bottom
    Object.keys(groupedProjects).forEach((clientId) => {
        groupedProjects[clientId].projects.sort((a: any, b: any) => {
            const aArchived = a.isArchived ? 1 : 0
            const bArchived = b.isArchived ? 1 : 0
            return aArchived - bArchived // Archived (1) comes after non-archived (0)
        })
    })

    const groupedProjectsArray = Object.values(groupedProjects)

    // Filter projects based on search term
    const filteredProjectsForSearch = projects.filter((project: any) => 
        project.name.toLowerCase().includes(projectSearchTerm.toLowerCase())
    )

    // Get selected project name for display
    //===============================================
    const selectedProjectName = selectedProject 
        ? projects.find(p => p._id === selectedProject)?.name || 'Select a project'
        : `All Projects (${filteredProjectsForSearch.length})`

    const handleProjectSelect = (projectId: string) => {
        setSelectedProject(projectId)
        setIsProjectDropdownOpen(false)
        setProjectSearchTerm('')
    }

    // Filter clients based on search term
    const filteredClientsForSearch = clients.filter((client: any) => 
        client.name.toLowerCase().includes(clientSearchTerm.toLowerCase())
    )

    // Get selected client name for display
    const selectedClientName = selectedClient 
        ? clients.find(c => c._id === selectedClient)?.name || 'Select a client'
        : `All Clients (${filteredClientsForSearch.length})`

    const handleClientSelect = (clientId: string) => {
        setSelectedClient(clientId)
        setIsClientDropdownOpen(false)
        setClientSearchTerm('')
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
            assignedUsers: Array.isArray(project.assignedUsers) ? project.assignedUsers.map((au: any) => ({
                user: { _id: au.user._id || au.user._ref },
                role: au.role || 'Team Member',
                isActive: au.isActive ?? true
            })) : [],
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
            assignedUsers: [] as Array<{
                user: { _id: string }
                role?: string
                isActive: boolean
            }>,
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
        !task.isArchived &&
        (task.name.toLowerCase().includes(taskSearchTerm.toLowerCase()) ||
        task.description?.toLowerCase().includes(taskSearchTerm.toLowerCase()))
    ).filter((task: any) => !formData.tasks.includes(task._id))
    
    // Check if we should show "Create task" option
    const shouldShowCreateTaskOption = taskSearchTerm.length > 3 && filteredTasks.length === 0 && taskSearchTerm.trim().length > 0
    // Filter Tasks based on task Id with formData.tasks.
    const assignedTasksData = tasks.filter((task: any) => 
        !task.isArchived && formData.tasks.includes(task._id)
    )

    // [Project:Action] Archive Project
    const handleArchiveProject = async (projectId: string) => {
        const project = projects.find(p => p._id === projectId)
        const projectName = project?.name || 'this project'
        const isArchived = project?.isArchived || false
        
        // Confirm archiving/restoring
        const action = isArchived ? 'restore' : 'archive'
        if (!confirm(`Are you sure you want to ${action} "${projectName}"?`)) {
            return
        }
        
        // Set loading state
        setArchivingProjectId(projectId)
        setOpenActionDropdown(null)
        setDropdownPosition(null)
        
        try {
            const response = await fetch(`/api/projects/${projectId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ isArchived: !isArchived }),
            })
            
            if (response.ok) {
                const data = await response.json()
                
                // Update project in local state
                setProjects(prevProjects => 
                    prevProjects.map(p => 
                        p._id === projectId 
                            ? { ...p, isArchived: !isArchived, isActive: isArchived } // When archiving, isActive becomes false. When restoring, isActive becomes true
                            : p
                    )
                )
                
                // Show success message
                alert(`Project "${projectName}" ${action}d successfully`)
                
                // Reset selected project if it was the archived one and we're archiving
                if (selectedProject === projectId && !isArchived) {
                    setSelectedProject('')
                }
            } else {
                const error = await response.json()
                alert(`Failed to ${action} project: ${error.error || 'Unknown error'}`)
            }
        } catch (error: any) {
            console.error(`Error ${action}ing project:`, error)
            alert(`Failed to ${action} project: ${error.message || 'Unknown error'}`)
        } finally {
            // Clear loading state
            setArchivingProjectId(null)
        }
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
    // Helper function to check if project is inactive or unassigned for manager
    const isProjectInactiveOrUnassignedForManager = (project: any) => {
        if (session?.user?.role !== 'manager') {
            return false
        }
        // Check if manager is assigned to the project
        const managerAssignment = project.assignedUsers?.find((assignment: any) => 
            assignment.user._id === session?.user?.id
        )
        // If not assigned at all, or assigned but inactive
        return !managerAssignment || managerAssignment.isActive === false
    }

    // Toggle Action Dropdown.
    const toggleActionDropdown = (projectId: string, event: React.MouseEvent, project: any) => {
        // Don't allow opening dropdown if project is being deleted or archived
        if (deletingProjectId === projectId || archivingProjectId === projectId) {
            return
        }
        
        // Don't allow opening dropdown if project is inactive or unassigned for manager
        if (isProjectInactiveOrUnassignedForManager(project)) {
            return
        }
        
        if (openActionDropdown === projectId) {
        setOpenActionDropdown(null)
        setDropdownPosition(null)
        } else {
        const buttonRect = event.currentTarget.getBoundingClientRect()
        const dropdownHeight = 200 // Estimated height of dropdown menu
        const gap = 8 // Gap between button and dropdown
        const viewportHeight = window.innerHeight
        
        // Check if there's enough space below the button
        const spaceBelow = viewportHeight - buttonRect.bottom
        const spaceAbove = buttonRect.top
        
        // If not enough space below but enough space above, position dropdown above
        const shouldPositionAbove = spaceBelow < dropdownHeight && spaceAbove > dropdownHeight
        
        setDropdownPosition({
            x: buttonRect.right - 192, // 192px is the width of the dropdown (w-48)
            y: shouldPositionAbove 
                ? buttonRect.top - dropdownHeight - gap + 50  // Position above with gap, moved down 50px
                : buttonRect.bottom + gap  // Position below with gap
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
        setFormData(prev => {
            const userExists = prev.assignedUsers.some((au: any) => {
                const auUserId = typeof au === 'string' ? au : (au.user?._id || au.user?._ref)
                return auUserId === userId
            })
            
            return {
                ...prev,
                assignedUsers: userExists
                    ? prev.assignedUsers.filter((au: any) => {
                        const auUserId = typeof au === 'string' ? au : (au.user?._id || au.user?._ref)
                        return auUserId !== userId
                    })
                    : [...prev.assignedUsers, {
                        user: { _id: userId },
                        role: 'Team Member',
                        isActive: true
                    }]
            }
        })
    }

    const handleTaskToggle = (taskId: string) => {
        setFormData(prev => ({
        ...prev,
        tasks: prev.tasks.includes(taskId)
            ? prev.tasks.filter(id => id !== taskId)
            : [...prev.tasks, taskId]
        }))
    }
    // Handle Project Form Submit.
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)

        // Client-side validation for budget fields
        if (formData.budgetType === 'total-project-hours' && (!formData.totalProjectHours || parseFloat(formData.totalProjectHours) <= 0)) {
            alert('Please enter a valid total project hours when budget type is set to total project hours.')
            setIsSubmitting(false)
            return
        }

        try {
            // First, create any new tasks that were added temporarily
            const taskIdMapping: { [tempId: string]: string } = {}
            const finalTaskIds: string[] = []
            
            // Separate temporary task IDs from real task IDs
            const tempTaskIds = formData.tasks.filter(id => id.startsWith('temp-'))
            const realTaskIds = formData.tasks.filter(id => !id.startsWith('temp-'))
            
            // Create new tasks
            if (tempTaskIds.length > 0) {
                for (const tempId of tempTaskIds) {
                    const newTask = newTasksToCreate.find(nt => nt.tempId === tempId)
                    if (newTask) {
                        try {
                            const taskResponse = await fetch('/api/tasks', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                    name: newTask.name,
                                    isBillable: newTask.isBillable,
                                    projectIds: [] // Don't add to project yet, we'll do it in the project creation
                                }),
                            })
                            
                            if (taskResponse.ok) {
                                const taskData = await taskResponse.json()
                                taskIdMapping[tempId] = taskData.task._id
                                finalTaskIds.push(taskData.task._id)
                            } else {
                                const error = await taskResponse.json()
                                throw new Error(`Failed to create task "${newTask.name}": ${error.error || 'Unknown error'}`)
                            }
                        } catch (error: any) {
                            console.error(`Error creating task "${newTask.name}":`, error)
                            alert(`Failed to create task "${newTask.name}": ${error.message || 'Unknown error'}`)
                            setIsSubmitting(false)
                            return
                        }
                    }
                }
            }
            
            // Combine real task IDs with newly created task IDs
            const allTaskIds = [...realTaskIds, ...finalTaskIds]
            
            const url = isEditMode ? `/api/projects/${editingProject?._id}` : '/api/projects'
            const method = isEditMode ? 'PUT' : 'POST'
            
            // Get current project managers from ProjectAssignedUsers component
            // Get the latest project managers directly from the component
            const rawProjectManagers = projectAssignedUsersRef.current?.getProjectManagers() || []
            
            // Filter project managers to only include eligible users (admin or manager role)
            // who are in the assignedUsers list and are active, matching "Select All" button logic
            const currentProjectManagers = rawProjectManagers.filter((managerId: string) => {
                // Find the user in the users array to check their role
                const user = users.find((u: any) => u._id === managerId)
                if (!user) return false
                
                // Check if user has admin or manager role (eligible to be project manager)
                if (user.role !== 'admin' && user.role !== 'manager') return false
                
                // Check if user is in assignedUsers list and is active
                const assignedUser = formData.assignedUsers.find((au: any) => {
                    const auUserId = typeof au === 'string' ? au : (au.user?._id || au.user?._ref)
                    return auUserId === managerId
                })
                if (!assignedUser) return false
                
                // Check if user is active
                const isActive = typeof assignedUser === 'object' ? (assignedUser.isActive ?? true) : true
                return isActive === true
            })
            
            // Extract user IDs from assignedUsers objects for API submission
            // Include all users (both active and inactive) so we can preserve them
            const assignedUserIds = formData.assignedUsers.map((au: any) => {
                return typeof au === 'string' ? au : (au.user?._id || au.user?._ref)
            }).filter((id: any) => id !== undefined)
            
            // Get inactive user IDs from ProjectAssignedUsers component
            const inactiveUserIds = projectAssignedUsersRef.current?.getInactiveUserIds() || []
            
            const response = await fetch(url, {
                method: method,
                headers: {
                'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...formData,
                    assignedUsers: assignedUserIds, // Send user IDs as array of strings
                    inactiveUserIds: inactiveUserIds, // Send inactive user IDs separately
                    tasks: allTaskIds, // Use the combined task IDs
                    projectManagers: currentProjectManagers,
                }),
            })

            if (response.ok) {
                if (isEditMode) {
                    // After update, refetch the project with proper query to get fully populated data
                    try {
                        const updatedProject = await sanityFetch({ 
                            query: PROJECT_QUERY, 
                            params: { id: editingProject?._id } 
                        }) as Project
                        // Update existing project in the list with properly fetched data
                        setProjects(prev => prev.map(p => p._id === editingProject?._id ? updatedProject : p))
                        alert(`Project "${formData.name}" updated successfully!`)
                        // open the updated project page
                        router.push(`/admin/projects/${editingProject?._id}`)
                    } catch (fetchError) {
                        console.error('Error refetching updated project:', fetchError)
                        // Fallback: use the response data even if refetch fails
                        const projectData = await response.json()
                        setProjects(prev => prev.map(p => p._id === editingProject?._id ? projectData as Project : p))
                        alert(`Project "${formData.name}" updated successfully!`)
                    }
                } else {
                    // For new projects, refetch the project with proper query to get fully populated data
                    const projectData = await response.json()
                    const newProjectId = projectData._id
                    
                    if (newProjectId) {
                        try {
                            // Refetch the project with fully populated client and other references
                            const fetchedProject = await sanityFetch({ 
                                query: PROJECT_QUERY, 
                                params: { id: newProjectId } 
                            }) as Project
                            
                            setProjects(prev => [fetchedProject, ...prev])
                            alert(`Project "${formData.name}" created successfully!`)
                        } catch (fetchError) {
                            console.error('Error refetching new project:', fetchError)
                            // Fallback: use the response data even if refetch fails
                            setProjects(prev => [projectData as Project, ...prev])
                            alert(`Project "${formData.name}" created successfully!`)
                        }
                    } else {
                        // Fallback: use the response data if no ID is available
                        setProjects(prev => [projectData as Project, ...prev])
                        alert(`Project "${formData.name}" created successfully!`)
                    }
                }
                
                // Reset form and close
                resetForm()
                setShowCreateForm(false)
                
                // Reload tasks to include newly created ones
                try {
                    const tasksData = await sanityFetch({ query: ALL_TASKS_QUERY })
                    setTasks(tasksData as string[])
                } catch (error) {
                    console.error('Error reloading tasks:', error)
                }
            } else {
                const error = await response.json()
                alert(`Error: ${error.error}`)
            }

        } catch (error) {
            console.error(`Error ${isEditMode ? 'updating' : 'creating'} project:`, error)
            alert('Error creating project. Please try again.')
        } finally {
            setIsSubmitting(false)
        }
    }
    // Form Markup.
    const createProjectMarkup = () => {
        return (
            <div className="">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                {isEditMode ? `Edit Project: ${editingProject?.name}` : 'Create New Project'}
                </h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Project Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-14">
                        {/* Project Name */}
                        <ProjectName formData={formData} handleInputChange={handleInputChange} />

                        {/* Project Code */}
                        <ProjectCode formData={formData} handleInputChange={handleInputChange} />

                        {/* Client */}
                        <ProjectClients formData={formData} handleInputChange={handleInputChange} clients={clients} />

                        {/* Status */}
                        <ProjectStatus formData={formData} handleInputChange={handleInputChange} />

                        {/* Billable Type */}
                        <BillableType formData={formData} handleInputChange={handleInputChange} />
                        
                        {/* Project Dates */}
                        <ProjectDate formData={formData} handleInputChange={handleInputChange} />

                    </div>
                    {/* seperator */}
                    <div className="h-px bg-gray-200"></div>

                    {/* Project Permissions */}
                    <ProjectPermission formData={formData} handleInputChange={handleInputChange} />

                    {/* Budget Tab - Only show for billable projects */}
                    {formData.billableType !== 'non_billable' && (
                      <>
                        {/* seperator */}
                        <div className="h-px bg-gray-200"></div>

                        {/* Project Type Tabs */}
                        <BudgetTab formData={formData} setFormData={setFormData} handleInputChange={handleInputChange} />
                      </>
                    )}

                    {/* seperator */}
                    <div className="h-px bg-gray-200"></div>

                    {/* Description */}
                    <ProjectDescription formData={formData} handleInputChange={handleInputChange} />

                    {/* seperator */}
                    <div className="h-px bg-gray-200"></div>

                    {/* Tasks */}
                    <div className="py-8 w-full">
                        <label className="block text-lg font-bold text-gray-700 mb-5">
                            Tasks
                        </label>
                    
                        {/* Task Search Input */}
                        <div className="relative task-dropdown mb-4 lg:w-[50%]">
                            <input
                            type="text"
                            placeholder="Assign a task..."
                            value={taskSearchTerm}
                            onChange={(e) => {
                                setTaskSearchTerm(e.target.value)
                                setIsTaskDropdownOpen(true)
                            }}
                            onFocus={() => setIsTaskDropdownOpen(true)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    // If dropdown is open and there's a search term, handle task creation/selection
                                    if (isTaskDropdownOpen && taskSearchTerm.trim()) {
                                        if (filteredTasks.length > 0) {
                                            // Select first matching task
                                            addTaskToProject(filteredTasks[0]._id)
                                        } else if (taskSearchTerm.trim().length > 3) {
                                            // Create temporary task if search term is long enough
                                            createTemporaryTask(taskSearchTerm.trim())
                                        }
                                    }
                                } else if (e.key === 'Escape') {
                                    setIsTaskDropdownOpen(false)
                                    setTaskSearchTerm('')
                                }
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-transparent focus:border-black"
                            />
                            
                            {/* Task Dropdown */}
                            {isTaskDropdownOpen && (
                            <div className="absolute z-50 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none">
                                {filteredTasks.length > 0 ? (
                                filteredTasks.map((task: any) => (
                                    <div
                                    key={task._id}
                                    onClick={() => addTaskToProject(task._id)}
                                    className="flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer"
                                    >
                                    <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                        </svg>
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-sm font-medium text-gray-900 capitalize">
                                        {task.name}
                                        </div>
                                        <div className="flex items-center mt-1">
                                        {task.isBillable && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 mr-2">
                                            Billable
                                            </span>
                                        )}
                                        </div>
                                    </div>
                                    </div>
                                ))
                                ) : shouldShowCreateTaskOption ? (
                                <div 
                                    onClick={() => createTemporaryTask(taskSearchTerm.trim())}
                                    className="flex items-center px-3 py-2 hover:bg-blue-50 cursor-pointer border-t border-gray-200 bg-blue-50"
                                >
                                    <div className="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mr-3">
                                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-sm font-medium text-blue-900">
                                        Create task: "{taskSearchTerm.trim()}"
                                        </div>
                                        <div className="text-xs text-blue-700 mt-1">
                                        This task will be created when you submit the form
                                        </div>
                                    </div>
                                </div>
                                ) : (
                                <div className="px-3 py-2 text-sm text-gray-500">
                                    {taskSearchTerm ? (taskSearchTerm.length <= 3 ? 'Type at least 4 characters to create a new task' : 'No tasks found') : 'No tasks available'}
                                </div>
                                )}
                            </div>
                            )}
                        </div>

                        {/* Assigned Tasks List */}
                        {assignedTasksData.length > 0 && (
                            <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700">Assigned Tasks</span>
                                <span className="text-xs text-gray-500">
                                {assignedTasksData.length} task(s) assigned
                                </span>
                            </div>
                            
                            {assignedTasksData.map((task: any) => (
                                <div key={task._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                                <div className="flex items-center">
                                    <button
                                    onClick={() => removeTaskFromProject(task._id)}
                                    className="flex-shrink-0 w-6 h-6 bg-gray-400 hover:bg-gray-500 rounded flex items-center justify-center mr-3"
                                    >
                                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                    
                                    <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                        </svg>
                                    </div>
                                    
                                    <div className="flex-1">
                                        <div className="text-sm font-medium text-gray-900 capitalize">
                                            {task.name}
                                        </div>
                                        <div className="flex items-center mt-1">
                                            {task.isBillable && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 mr-2">
                                                Billable
                                            </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                </div>
                            ))}
                            </div>
                        )}
                    
                        {assignedTasksData.length === 0 && (
                            <div className="text-gray-500 text-sm text-center py-4 border border-gray-200 rounded-md">
                            No tasks assigned yet
                            </div>
                        )}
                    </div>


                    {/* seperator */}
                    <div className="h-px bg-gray-200"></div>

                    {/* Assigned Users */}
                    <ProjectAssignedUsers 
                        ref={projectAssignedUsersRef}
                        users={users} 
                        formData={formData} 
                        setFormData={setFormData}
                        initialProjectManagers={initialProjectManagers}
                        projectAssignedUsers={isEditMode && editingProject?.assignedUsers ? editingProject.assignedUsers : []}
                    />

                    {/* Active Status */}
                    <ProjectType formData={formData} handleInputChange={handleInputChange} />

                    {/* Form Actions */}
                    <div className="flex justify-end space-x-3 pt-4">
                        <button
                        type="button"
                        onClick={() => {
                            resetForm()
                            setShowCreateForm(false)
                        }}
                        className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                        >
                        Cancel
                        </button>
                        <button
                        type="submit"
                        disabled={isSubmitting}
                        className="btn-primary focus:!ring-0 focus:!shadow-none focus:!outline-none px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
                        >
                        {isSubmitting 
                            ? (isEditMode ? 'Updating...' : 'Creating...') 
                            : (isEditMode ? 'Update Project' : 'Create Project')
                        }
                        </button>
                    </div>
                    {/* End of Project Details */}
                </form>
            </div>
        )
    }

    // Determine role from session.
    const userRole = session?.user?.role || 'user'
    const dashboardRole = userRole === 'admin' || userRole === 'manager' ? userRole : 'admin'
    return (
        <DashboardLayout role={dashboardRole}>
            <div className="space-y-6">
                {/* Page title and new project button */}
                <div className="flex items-center justify-between bg-white rounded-lg shadow-custom p-6">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">Projects</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            {
                                dashboardRole === 'admin' ? 'Manage all projects in your organization' : 'Manage your assigned projects'
                            }
                        </p>
                    </div>
                    <div>
                        {
                            showCreateForm ?
                            (<button
                                type="button"
                                onClick={() => {
                                    resetForm()
                                    setShowCreateForm(false)
                                }}
                                className="btn-primary focus:!ring-0 focus:!shadow-none focus:!outline-none px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                                >
                                Back to Projects
                            </button>)
                            :
                            (<button 
                            id="create-new-project-button" 
                            onClick={() => {
                                resetForm()
                                setShowCreateForm(true)
                            }}
                                    className="btn-primary px-4 py-2 text-sm font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50"
                            >
                            + New Project
                            </button>)
                        }
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
                        {createProjectMarkup()}
                    </div>
                    ) : (
                    <div className="project-lists-table">
                        {isLoading ? (
                            <div className="bg-white rounded-lg shadow overflow-hidden">
                                <div className="flex items-center justify-center py-20">
                                    <div className="flex flex-col items-center gap-4">
                                        <svg className="animate-spin h-8 w-8 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        <span className="text-sm text-gray-600 font-medium">Loading projects...</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center flex-wrap justify-between gap-5 flex-wrap gap-2">
                                    {/* dropdownfilter by project */}
                                    <div className="w-full lg:w-auto lg:flex-1">
                                        <ProjectsFilterDropdown
                                            selectedProjectName={selectedProjectName}
                                            projectSearchTerm={projectSearchTerm}
                                            setProjectSearchTerm={setProjectSearchTerm}
                                            handleProjectSelect={handleProjectSelect}
                                            filteredProjectsForSearch={filteredProjectsForSearch}
                                            isProjectDropdownOpen={isProjectDropdownOpen}
                                            setIsProjectDropdownOpen={setIsProjectDropdownOpen}
                                        />
                                    </div>
                                    {/* dropdown filter by client */}
                                    <div className="w-full lg:w-auto lg:flex-1">
                                        <ClientFilterDropdown
                                            selectedClientName={selectedClientName}
                                            clientSearchTerm={clientSearchTerm}
                                            setClientSearchTerm={setClientSearchTerm}
                                            handleClientSelect={handleClientSelect}
                                            filteredClientsForSearch={filteredClientsForSearch}
                                            isClientDropdownOpen={isClientDropdownOpen}
                                            setIsClientDropdownOpen={setIsClientDropdownOpen}
                                        />
                                    </div>
                                </div>

                                {/* Projects Table */}
                                <div className="md:overflow-hidden mt-6 overflow-x-auto">
                                    <table className="min-w-full">
                                    <thead className="bg-[#eee]">
                                    <tr>
                                        <th className="px-6 py-2 text-left font-normal text-sm text-[#1d1e1c]">
                                        Project Name
                                        </th>
                                        <th className="px-6 py-2 text-left font-normal text-sm text-[#1d1e1cb3]">
                                        Status
                                        </th>
                                        <th className="px-6 py-2 text-left font-normal text-sm text-[#1d1e1cb3]">
                                        Budget
                                        </th>
                                        <th className="px-6 py-2 text-left font-normal text-sm text-[#1d1e1cb3]">
                                        Spent
                                        </th>
                                        <th className="px-6 py-2 text-left font-normal text-sm text-[#1d1e1cb3]">
                                        Actions
                                        </th>
                                    </tr>
                                    </thead>
                                    <tbody className="bg-white">
                                    {groupedProjectsArray.length === 0 ? (
                                        <tr>
                                        <td colSpan={5} className="px-6 py-8 text-center text-sm">
                                            No projects found matching your filters.
                                        </td>
                                        </tr>
                                    ) : (
                                        groupedProjectsArray.map((group: any) => (
                                        <React.Fragment key={group.client._id}>
                                            {/* Client Header Row */}
                                            <tr className="bg-[#eee] border-gray-300">
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
                                            <tr 
                                                key={project._id} 
                                                className={`border-transparent hover:border-primary-300 relative hover:bg-gray-50 transition-colors ${project.isArchived || ( session?.user?.role === 'manager' && project.assignedUsers?.some((assignment: any) => assignment.user._id === session?.user?.id && assignment.isActive === false) ) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            >
                                                <td className="px-6 py-2">
                                                <div className="flex items-center">
                                                    <div>
                                                        {project.isArchived || ( session?.user?.role === 'manager' && project.assignedUsers?.some((assignment: any) => assignment.user._id === session?.user?.id && assignment.isActive === false) ) ? (
                                                            <span className="text-sm text-gray-500 capitalize">{project.name}</span>
                                                        ) : (
                                                            <Link 
                                                                href={`/admin/projects/${project._id}`}
                                                                className="text-[#2a59c1] hover:text-[#2a59c1] underline capitalize block"
                                                            >
                                                                {project.name}
                                                            </Link>
                                                        )}
                                                    {(project.billableType || project.projectType) && (
                                                        <div className="text-xs text-gray-500">
                                                        {project.billableType === 'non_billable' 
                                                          ? 'Non-Billable' 
                                                          : project.projectType === 'timeAndMaterials' 
                                                            ? 'Time & Materials' 
                                                            : project.projectType === 'fixedFee' 
                                                              ? 'Fixed Fee' 
                                                              : 'Billable'}
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
                                                <span className="text-sm text-gray-900">
                                                    {!project.budget || project.budget.type === 'no-budget' ? 'No Budget' : formatSimpleTime(Number(project.budget.totalProjectHours))}
                                                </span>
                                                </td>
                                                {/* Hours Column */}
                                                <td className="px-6 py-2">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-sm text-gray-900">
                                                            {project.timesheetHours ? formatSimpleTime(Number(project.timesheetHours)) : '0:00'}
                                                        </span>
                                                        {project.timesheetApprovedHours > 0 && project.timesheetApprovedHours !== project.timesheetHours && (
                                                            <span className="text-xs text-green-600">
                                                                ✓ {formatSimpleTime(Number(project.timesheetApprovedHours))} approved
                                                            </span>
                                                        )}
                                                        {project.budget && (project.budget as any)?.type === 'total-project-hours' && project.budget?.totalProjectHours ? (() => {
                                                            const timesheetHours = project.timesheetHours || 0
                                                            const budgetHours = project.budget.totalProjectHours
                                                            const progressPercentage = Math.min((timesheetHours / budgetHours) * 100, 100)
                                                            
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
                                                                        {Math.round(progressPercentage)}% of {formatSimpleTime(Number(budgetHours))}
                                                                    </span>
                                                                </div>
                                                            )
                                                        })() : null}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-2">
                                                <div className="relative action-dropdown" style={{ zIndex: 'auto' }}>
                                                    {/* Restore project */}
                                                    {
                                                        project.isArchived ? (
                                                            <button
                                                                onClick={() => handleArchiveProject(project._id)}
                                                                disabled={archivingProjectId === project._id}
                                                                className={`text-sm font-medium flex items-center gap-1 ${
                                                                    archivingProjectId === project._id
                                                                    ? 'text-[#2a59c1] cursor-not-allowed opacity-50'
                                                                    : 'text-[#2a59c1] hover:text-[#2a59c1]'
                                                                }`}
                                                            >
                                                                {archivingProjectId === project._id ? (
                                                                    <>
                                                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                        </svg>
                                                                        Restoring...
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                                        </svg>
                                                                        Restore
                                                                    </>
                                                                )}
                                                            </button>
                                                        ) : (    
                                                            <button 
                                                                onClick={(e) => toggleActionDropdown(project._id, e, project)}
                                                                disabled={deletingProjectId === project._id || archivingProjectId === project._id || isProjectInactiveOrUnassignedForManager(project)}
                                                                className={`text-sm font-medium flex items-center gap-1 ${
                                                                    deletingProjectId === project._id || archivingProjectId === project._id || isProjectInactiveOrUnassignedForManager(project)
                                                                        ? 'text-gray-400 cursor-not-allowed opacity-50'
                                                                        : 'text-[#2a59c1] hover:text-[#2a59c1]'
                                                                }`}
                                                            >
                                                                {deletingProjectId === project._id ? (
                                                                    <>
                                                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                        </svg>
                                                                        Deleting...
                                                                    </>
                                                                ) : archivingProjectId === project._id ? (
                                                                    <>
                                                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                        </svg>
                                                                        {project.isArchived ? 'Restoring...' : 'Archiving...'}
                                                                    </>
                                                                ) : (
                                                                    isProjectInactiveOrUnassignedForManager(project) ? (
                                                                        <span className="text-gray-400 cursor-not-allowed opacity-50">Inactive Project</span>
                                                                    )
                                                                    :
                                                                    (<>
                                                                        Actions
                                                                        <svg 
                                                                            className={`w-4 h-4 transition-transform ${openActionDropdown === project._id ? 'rotate-180' : ''}`} 
                                                                            fill="none" 
                                                                            stroke="currentColor" 
                                                                            viewBox="0 0 24 24"
                                                                        >
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                                        </svg>
                                                                    </>)
                                                                )}
                                                            </button>
                                                        )
                                                    }

                                                    
                                                    {openActionDropdown === project._id && dropdownPosition && !isProjectInactiveOrUnassignedForManager(project) && (
                                                    <div 
                                                        className="fixed w-48 bg-white rounded-md shadow-xl border border-gray-200"
                                                        style={{
                                                        zIndex: 99999,
                                                        left: `${dropdownPosition.x}px`,
                                                        top: `${dropdownPosition.y}px`
                                                        }}
                                                    >
                                                        <div className="py-1">
                                                        <button
                                                            onClick={() => handleEditProject(project._id)}
                                                            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-black hover:text-white"
                                                        >
                                                            <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                            </svg>
                                                            Edit
                                                        </button>
                                                        <button
                                                            onClick={() => handleDuplicateProject(project._id)}
                                                            className="cursor-not-allowed opacity-50 flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-300"
                                                            style={{ cursor: 'disabled' }}
                                                            disabled={true}
                                                            title="Duplicate project is not available"
                                                        >
                                                            <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                            </svg>
                                                            Duplicate
                                                        </button>
                                                        <button
                                                            onClick={() => handleArchiveProject(project._id)}
                                                            disabled={archivingProjectId === project._id}
                                                            className={`flex items-center w-full px-4 py-2 text-sm ${
                                                                archivingProjectId === project._id
                                                                    ? 'text-gray-400 cursor-not-allowed opacity-50'
                                                                    : 'text-gray-700 hover:bg-black hover:text-white'
                                                            }`}
                                                            title={project.isArchived ? 'Restore project' : 'Archive project'}
                                                        >
                                                            {archivingProjectId === project._id ? (
                                                                <>
                                                                    <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                    </svg>
                                                                    {project.isArchived ? 'Restoring...' : 'Archiving...'}
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <svg className="w-4 h-4 mr-3 mt-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={project.isArchived ? "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" : "M5 8l4 4m0 0l4-4m-4 4V3"} />
                                                                    </svg>
                                                                    {project.isArchived ? 'Restore' : 'Archive'}
                                                                </>
                                                            )}
                                                        </button>
                                                        <div className="border-t border-gray-100"></div>
                                                        <button
                                                            onClick={() => handleDeleteProject(project._id)}
                                                            disabled={deletingProjectId === project._id}
                                                            className={`flex items-center w-full px-4 py-2 text-sm ${
                                                                deletingProjectId === project._id
                                                                    ? 'text-gray-400 cursor-not-allowed opacity-50 hover:bg-gray-100'
                                                                    : 'text-red-600 hover:bg-black hover:text-white'
                                                            }`}
                                                        >
                                                            {deletingProjectId === project._id ? (
                                                                <>
                                                                    <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                    </svg>
                                                                    Deleting...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                    </svg>
                                                                    Delete
                                                                </>
                                                            )}
                                                        </button>
                                                        </div>
                                                    </div>
                                                    )}
                                                </div>
                                                </td>
                                            </tr>
                                            ))}
                                        </React.Fragment>
                                        ))
                                    )}
                                    </tbody>
                                </table>
                                </div>
                            </>
                        )}
                    </div>
                    )}
                </div>
            </div>
    </DashboardLayout>
  )
}

export default function AdminProjectsPage() {
  return (
    <Suspense fallback={
      <DashboardLayout role="admin">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      </DashboardLayout>
    }>
      <AdminProjectsContent />
    </Suspense>
  )
}

