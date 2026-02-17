import React, { useEffect, useLayoutEffect, useState, useImperativeHandle, forwardRef, useRef } from 'react'

export interface ProjectAssignedUsersRef {
	resetUsers: () => void
	setProjectManagers: (managers: string[]) => void
	getProjectManagers: () => string[]
	getInactiveUserIds: () => string[]
}

interface ProjectAssignedUsersProps {
	users: any[]
	formData: any
	setFormData: any
	resetUsers?: () => void
	initialProjectManagers?: string[]
	projectAssignedUsers?: Array<{
		user: any
		role?: string
		isActive: boolean
	}>
}

const ProjectAssignedUsers = forwardRef<ProjectAssignedUsersRef, ProjectAssignedUsersProps>(
	({users, formData, setFormData, resetUsers, initialProjectManagers = [], projectAssignedUsers = []}, ref) => {
	
	const [userSearchTerm, setUserSearchTerm] = useState('')
	const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false)
  	const [projectManagers, setProjectManagers] = useState<string[]>([])
	
	// Track users that should be marked as inactive (but still in assignedUsers)
	const [inactiveUserIds, setInactiveUserIds] = useState<Set<string>>(new Set())
	
	// Use a ref to always access the current projectManagers value
	const projectManagersRef = useRef<string[]>([])
	const previousInitialManagersRef = useRef<string[]>([])
	
	// Keep ref in sync with state - use useLayoutEffect to ensure it's updated synchronously
	useLayoutEffect(() => {
		projectManagersRef.current = projectManagers
	}, [projectManagers])
	
	// Sync project managers when initialProjectManagers prop changes
	// This handles setting project managers when editing a project
	useEffect(() => {
		// Only update if the prop actually changed (not just a re-render)
		if (initialProjectManagers !== undefined) {
			const prevStr = JSON.stringify(previousInitialManagersRef.current.sort())
			const newStr = JSON.stringify([...initialProjectManagers].sort())
			if (prevStr !== newStr) {
				setProjectManagers(initialProjectManagers)
				previousInitialManagersRef.current = [...initialProjectManagers]
			}
		}
	}, [initialProjectManagers])

	// Expose methods to parent via ref
	useImperativeHandle(ref, () => ({
		resetUsers: () => {
			setUserSearchTerm('')
			setIsUserDropdownOpen(false)
			setProjectManagers([])
			setInactiveUserIds(new Set())
		},
		setProjectManagers: (managers: string[]) => {
			setProjectManagers(managers)
		},
		getProjectManagers: () => {
			// Return current state value via ref (which is kept in sync via useEffect)
			// Using ref ensures we get the latest value even if called synchronously
			return projectManagersRef.current
		},
		getInactiveUserIds: () => {
			// Extract user IDs from formData.assignedUsers where isActive is false
			return formData.assignedUsers
				.filter((au: any) => {
					if (typeof au === 'string') return false
					return au.isActive === false
				})
				.map((au: any) => au.user?._id || au.user?._ref)
				.filter((id: any) => id !== undefined)
		}
	}), [formData.assignedUsers])

	// Also support the callback prop for backward compatibility
	useEffect(() => {
		if (resetUsers && typeof resetUsers === 'function') {
			// This is handled by the ref now
		}
	}, [resetUsers])

	// Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Element
			if (isUserDropdownOpen && !target.closest('.user-dropdown')) {
				setIsUserDropdownOpen(false)
				setUserSearchTerm('')
			}
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => {
	        document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isUserDropdownOpen])

	// User management functions
    const addUserToProject = (userId: string) => {
        // Check if user already exists in assignedUsers
        const userExists = formData.assignedUsers.some((au: any) => {
            const auUserId = typeof au === 'string' ? au : (au.user?._id || au.user?._ref)
            return auUserId === userId
        })
        
        if (!userExists) {
            setFormData((prev: any) => ({
                ...prev,
                assignedUsers: [...prev.assignedUsers, {
                    user: { _id: userId },
                    role: 'Team Member',
                    isActive: true
                }]
            }))
        }
        setUserSearchTerm('')
        setIsUserDropdownOpen(false)
    }

    const removeUserFromProject = (userId: string) => {
        // Update user's isActive to false instead of removing from assignedUsers
        setFormData((prev: any) => ({
            ...prev,
            assignedUsers: prev.assignedUsers.map((au: any) => {
                const auUserId = typeof au === 'string' ? au : (au.user?._id || au.user?._ref)
                if (auUserId === userId) {
                    return {
                        ...(typeof au === 'object' ? au : { user: { _id: au }, role: 'Team Member' }),
                        isActive: false
                    }
                }
                return au
            })
        }))
        // Also remove from project managers if they were one
        setProjectManagers((prev: string[]) => prev.filter((id: string) => id !== userId))
    }

    const toggleProjectManager = (userId: string) => {
        setProjectManagers(prev => 
        prev.includes(userId) 
            ? prev.filter(id => id !== userId)
            : [...prev, userId]
        )
    }

    const reassignInactiveUser = (userId: string, event?: React.MouseEvent) => {
        if (event) {
            event.preventDefault()
            event.stopPropagation()
        }
        // Update user's isActive to true in formData.assignedUsers
        setFormData((prev: any) => ({
            ...prev,
            assignedUsers: prev.assignedUsers.map((au: any) => {
                const auUserId = typeof au === 'string' ? au : (au.user?._id || au.user?._ref)
                if (auUserId === userId) {
                    return {
                        ...(typeof au === 'object' ? au : { user: { _id: au }, role: 'Team Member' }),
                        isActive: true
                    }
                }
                return au
            })
        }))
    }

    const filteredUsers = users.filter((user: any) => 
        user.firstName.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
        user.lastName.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(userSearchTerm.toLowerCase())
    ).filter((user: any) => {
        // Check if user is already in assignedUsers (as object or string for backward compatibility)
        return !formData.assignedUsers.some((au: any) => {
            const auUserId = typeof au === 'string' ? au : (au.user?._id || au.user?._ref)
            return auUserId === user._id
        })
    })

    // Separate active and inactive users based on isActive property
    const assignedUsersData = users.filter((user: any) => {
        const assignedUser = formData.assignedUsers.find((au: any) => {
            const auUserId = typeof au === 'string' ? au : (au.user?._id || au.user?._ref)
            return auUserId === user._id
        })
        if (!assignedUser) return false
        
        // Check isActive property (handle both object and string formats)
        const isActive = typeof assignedUser === 'object' ? (assignedUser.isActive ?? true) : true
        return isActive === true
    })
    
    // Get inactive users: from formData.assignedUsers where isActive is false
    const inactiveUsersData = formData.assignedUsers
        .filter((au: any) => {
            // Handle both object and string formats for backward compatibility
            if (typeof au === 'string') return false
            const isActive = au.isActive ?? true
            return isActive === false
        })
        .map((au: any) => {
            const userId = au.user?._id || au.user?._ref
            const user = users.find((u: any) => u._id === userId)
            if (!user) return null
            return {
                ...user,
                role: au.role || 'Team Member',
                isActive: false
            }
        })
        .filter((user: any) => user !== null)
    
	return (
		<div className="py-8 w-full">
			<label className="block text-lg font-bold text-gray-700 mb-5">
			Team
			</label>
			
			{/* Search Input */}
			<div className="relative user-dropdown mb-4 lg:w-[50%]">
			<input
				type="text"
				placeholder="Assign a person..."
				value={userSearchTerm}
				onChange={(e) => {
					setUserSearchTerm(e.target.value)
					setIsUserDropdownOpen(true)
				}}
				onFocus={() => setIsUserDropdownOpen(true)}
				className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-transparent focus:border-black"
			/>
			
			{/* User Dropdown */}
			{isUserDropdownOpen && (
				<div className="absolute z-50 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none">
				{filteredUsers.length > 0 ? (
					filteredUsers.map((user: any) => (
					<div
						key={user._id}
						onClick={() => addUserToProject(user._id)}
						className="flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer"
					>
						<div className="flex-shrink-0 w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
						{user.avatar ? (
							<img
							src={user.avatar}
							alt={`${user.firstName} ${user.lastName}`}
							className="w-8 h-8 rounded-full object-cover"
							/>
						) : (
							<span className="text-sm font-medium text-gray-700">
							{user.firstName.charAt(0)}{user.lastName.charAt(0)}
							</span>
						)}
						</div>
						<div className="ml-3">
						<div className="text-sm font-medium text-gray-900 capitalize">
							{user.firstName} {user.lastName}
						</div>
						<div className="text-sm text-gray-500">{user.email}</div>
						</div>
					</div>
					))
				) : (
					<div className="px-3 py-2 text-sm text-gray-500">
					{userSearchTerm ? 'No users found' : 'No users available'}
					</div>
				)}
				</div>
			)}
			</div>

			{/* Assigned Users List */}
			{assignedUsersData.length > 0 && (
			<div className="space-y-3">
				<div className="flex items-center justify-between">
				<span className="text-sm font-medium text-gray-700">Assigned Team Members</span>
				<div className="flex items-center space-x-2 text-xs text-gray-500">
					<span>Manages this project</span>
					<div className="flex space-x-1">
					<button
						type="button"
						onClick={(e) => {
							e.preventDefault()
							// Only select users who are admin or manager, exclude users with role 'user'
							const eligibleManagers = assignedUsersData
								.filter(u => u.role === 'admin' || u.role === 'manager')
								.map(u => u._id)
							setProjectManagers(eligibleManagers)
						}}
						className="text-primary-600 hover:text-primary-800"
					>
						Select All
					</button>
					<span>/</span>
					<button
						type="button"
						onClick={(e) => {
							e.preventDefault()
							setProjectManagers([])
						}}
						className="text-primary-600 hover:text-primary-800"
					>
						None
					</button>
					</div>
				</div>
				</div>
				
				{assignedUsersData.map((user: any) => (
				<div key={user._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
					<div className="flex items-center">
					<button
						onClick={() => removeUserFromProject(user._id)}
						className="flex-shrink-0 w-6 h-6 bg-gray-400 hover:bg-gray-500 rounded flex items-center justify-center mr-3"
					>
						<svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
					
					<div className="flex-shrink-0 w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center mr-3">
						{user.avatar ? (
						<img
							src={user.avatar}
							alt={`${user.firstName} ${user.lastName}`}
							className="w-8 h-8 rounded-full object-cover"
						/>
						) : (
						<span className="text-sm font-medium text-gray-700 uppercase">
							{user.firstName.charAt(0)}{user.lastName.charAt(0)}
						</span>
						)}
					</div>
					
					<div>
						<div className="text-sm font-medium text-gray-900 capitalize">
						{user.firstName} {user.lastName}
						</div>
						<div className="text-sm text-gray-500">{user.email}</div>
					</div>
					</div>
					
					<div className="flex items-center">
					<input
						type="checkbox"
						disabled={user.role !== 'admin' && user.role !== 'manager'}
						checked={projectManagers.includes(user._id)}
						onChange={() => toggleProjectManager(user._id)}
						className="h-4 w-4 theme-color focus:ring-transparent focus:border-black outline-none border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
					/>
					</div>
				</div>
				))}
			</div>
			)}
			
			{/* Inactive Users List */}
			{inactiveUsersData.length > 0 && (
			<div className="space-y-3 mt-6">
				<div className="flex items-center justify-between">
				<span className="text-sm font-medium text-gray-500 uppercase tracking-wide">Inactive Team Members</span>
				</div>
				
				{inactiveUsersData.map((user: any) => (
				<div key={user._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md opacity-75">
					<div className="flex items-center">
					<button 
						type="button"
						onClick={(e) => reassignInactiveUser(user._id, e)}
						className="button button-primary px-3 py-1 text-xs font-medium rounded-md mr-3 z-10 text-white bg-primary-600 hover:bg-primary-700 transition-colors"
						title="Reassign to active team"
					>
						Reassign
					</button>
					
					<div className="flex-shrink-0 w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center mr-3">
						{user.avatar ? (
						<img
							src={user.avatar}
							alt={`${user.firstName} ${user.lastName}`}
							className="w-8 h-8 rounded-full object-cover"
						/>
						) : (
						<span className="text-sm font-medium text-gray-500 uppercase">
							{user.firstName.charAt(0)}{user.lastName.charAt(0)}
						</span>
						)}
					</div>
					
					<div>
						<div className="text-sm font-medium text-gray-500 capitalize">
						{user.firstName} {user.lastName}
						</div>
						<div className="text-sm text-gray-400">{user.email}</div>
					</div>
					</div>
					
					<div className="flex items-center">
					<input
						type="checkbox"
						checked={false}
						disabled
						className="h-4 w-4 text-gray-400 border-gray-300 rounded cursor-not-allowed"
					/>
					</div>
				</div>
				))}
			</div>
			)}
			
			{assignedUsersData.length === 0 && inactiveUsersData.length === 0 && (
			<div className="text-gray-500 text-sm text-center py-4 border border-gray-200 rounded-md">
				No team members assigned yet
			</div>
			)}
		</div>
	)
})

ProjectAssignedUsers.displayName = 'ProjectAssignedUsers'

export default ProjectAssignedUsers