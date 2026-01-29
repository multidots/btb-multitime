'use client'

import { useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useDataFetcher } from '@/lib/hooks/useDataFetcher'
import { sanityFetch } from '@/lib/sanity'
import { FiUsers, FiSettings, FiShield, FiCheck } from 'react-icons/fi'

interface PermissionsTabProps {
  user: {
    id: string
    email: string
    firstName: string
    lastName: string
    role: 'admin' | 'manager' | 'user'
  }
  isAdmin?: boolean
  viewingOwnProfile?: boolean
}

interface UserPermissions {
  id: string
  firstName: string
  lastName: string
  email: string
  role: string
  permissions?: {
    canManageProjects?: boolean
    canManageUsers?: boolean
    canViewReports?: boolean
    canManageClients?: boolean
    canApproveTimeEntries?: boolean
  }
}

export default function PermissionsTab({ user, isAdmin = false, viewingOwnProfile = true }: PermissionsTabProps) {
  const { update } = useSession()
  const [selectedPermission, setSelectedPermission] = useState<string>('')
  const [isUpdating, setIsUpdating] = useState(false)

  const fetchUserPermissions = useCallback(async (): Promise<UserPermissions | null> => {
    // If user.id is undefined (e.g., Google-authenticated Studio admin), return null
    if (!user.id || !user.email) {
      return null
    }

    try {
      const query = `*[_type == "user" && _id == $userId && isArchived != true][0]{
        _id,
        firstName,
        lastName,
        email,
        role,
        permissions
      }`

      const userPermissions = await sanityFetch<UserPermissions>({
        query,
        params: { userId: user.id }
      })

      return userPermissions
    } catch (error) {
      console.error('Error fetching user permissions:', error)
      // If user doesn't exist in Sanity (e.g., Google-authenticated Studio admin), return null
      return null
    }
  }, [user.id, user.email])

  const { data: currentUser, loading, error, refetch } = useDataFetcher<UserPermissions | null>(fetchUserPermissions)

  const handlePermissionUpdate = async () => {
    if (!selectedPermission || !currentUser) return

    setIsUpdating(true)
    try {
      let updateData: any = {}

      if (selectedPermission === 'member') {
        updateData = {
          role: 'user',
          permissions: {}
        }
      } else if (selectedPermission === 'manager') {
        updateData = {
          role: 'manager',
          permissions: {}
        }
      } else if (selectedPermission === 'administrator') {
        updateData = {
          role: 'admin',
          permissions: {}
        }
      }

      // If admin is editing another user, pass userId
      if (!viewingOwnProfile && isAdmin) {
        updateData.userId = user.id
      }

      const response = await fetch('/api/user/permissions', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      })

      if (!response.ok) {
        throw new Error('Failed to update permissions')
      }

      const result = await response.json()

      // Update the session with the new role and permissions only if updating own profile
      if (viewingOwnProfile) {
        await update({
          role: result.user.role,
          permissions: result.user.permissions,
        })
      }

      await refetch()
      setSelectedPermission('')
      alert('Permissions updated successfully!')
    } catch (error) {
      console.error('Error updating permissions:', error)
      alert('Error updating permissions. Please try again.')
    } finally {
      setIsUpdating(false)
    }
  }

  const getCurrentPermissionLevel = () => {
    // If user doesn't exist in Sanity schema (e.g., Google-authenticated Studio admin), treat as admin
    if (!currentUser) {
      // If user has admin role in session but no Sanity record, they're a Studio admin
      if (user.role === 'admin') return 'administrator'
      return 'member'
    }

    if (currentUser.role === 'admin') return 'administrator'
    if (currentUser.role === 'manager') return 'manager'
    return 'member'
  }

  // Normalize role display
  const getRoleDisplay = (role: string) => {
    switch (role.toLowerCase()) {
      case 'admin':
      case 'administrator':
        return 'Administrator';
      case 'manager':
        return 'Manager';
      case 'user':
      case 'member':
        return 'User';
      default:
        return role.charAt(0).toUpperCase() + role.slice(1);
    }
  };

  const roleDisplay = currentUser ? getRoleDisplay(currentUser.role) : (user.role ? getRoleDisplay(user.role) : 'Guest');

  const permissionLevels = [
    {
      id: 'member',
      name: 'Member',
      icon: FiUsers,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      description: 'Good for people who just need to track time.'
    },
    {
      id: 'manager',
      name: 'Manager',
      icon: FiSettings,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      description: 'Good for people who need more access to people and project reports. Managers can approve and run reports for all time tracked to selected projects and people. Optionally, they can also: Create projects, and edit projects that they manage; Create and edit all clients and tasks on the account; Create and edit time and expenses for people and projects they manage; See and edit billable rates and amounts for projects and people they manage.'
    },
    {
      id: 'administrator',
      name: 'Administrator',
      icon: FiShield,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      description: 'Good for people who need the most control to manage your account. Administrators can see and do everything: create and manage all projects and people, manage all clients, see all reports, see and edit all rates, and more.'
    }
  ]

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Permissions</h3>
          <p className="mt-1 text-sm text-gray-500">
            This setting determines what you can see and do in this account.
          </p>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <span className="ml-3 text-gray-600">Loading permissions...</span>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Permissions</h3>
          <p className="mt-1 text-sm text-gray-500">
            This setting determines what you can see and do in this account.
          </p>
        </div>
        <div className="p-6">
          <div className="text-center py-12">
            <div className="text-red-600 mb-2">
              <FiShield className="w-12 h-12 mx-auto mb-4" />
              <p className="text-lg font-medium">Error loading permissions</p>
              <p className="text-sm text-gray-500 mt-1">{error}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Handle case where user doesn't exist in Sanity schema (e.g., Google-authenticated Studio admin)
  if (!currentUser && !loading) {
    return (
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Permissions</h3>
          <p className="mt-1 text-sm text-gray-500">
            This setting determines what you can see and do in this account.
          </p>
        </div>
        <div className="p-6">
          <div className="text-center py-12">
            <FiShield className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <p className="text-lg font-medium text-gray-900 mb-2">
              Studio Administrator
            </p>
            <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
              You are authenticated as a Sanity Studio administrator. Your permissions are managed through Sanity Studio access controls.
              {user.role === 'admin' && ' You have full administrative access to the application.'}
            </p>
            {!user.id && (
              <p className="text-xs text-gray-400 mt-4">
                Note: To manage user permissions in this application, create a user record in the User schema with your email address.
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  const currentLevel = getCurrentPermissionLevel()
  // Admins can edit any user (viewing own or others), but must have a user record in Sanity
  // Non-admins viewing their own profile cannot edit if they don't have a Sanity record
  const canEditPermissions = isAdmin && currentUser !== null && user.id

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Permissions</h3>
        <p className="mt-1 text-sm text-gray-500">
          This setting determines what you can see and do in this account.
        </p>
      </div>

      <div className="p-6">
        <div className="mb-6 text-sm text-gray-600">
          {canEditPermissions 
            ? (viewingOwnProfile 
              ? 'Only an Administrator can edit your permissions.' 
              : 'You can change this user\'s permissions.')
            : 'Only an Administrator can edit permissions.'}
        </div>

        <div>
          <h4 className="text-lg font-medium text-gray-900 mb-6">Permissions</h4>

          <div className="space-y-4">
            {permissionLevels.map((level, index) => {
              const Icon = level.icon
              const isCurrent = currentLevel === level.id
              const isSelected = selectedPermission === level.id || (selectedPermission === '' && isCurrent)

              return (
                <div key={level.id} className={`${level.bgColor} border ${level.borderColor} rounded-lg p-6`}>
                  <div className="flex items-start space-x-4 relative">
                    <div className="flex-shrink-0 mt-1 absolute -left-3">
                      {canEditPermissions ? (
                        <input
                          type="radio"
                          name="permission"
                          value={level.id}
                          checked={isSelected}
                          onChange={(e) => setSelectedPermission(e.target.value)}
                          className="w-4 h-4 theme-color focus:ring-transparent border-gray-300"
                        />
                      ) : (
                        isCurrent && <FiCheck className="w-5 h-5 text-green-600" />
                      )}
                    </div>

                    <div className="flex-shrink-0">
                      <Icon className={`w-6 h-6 ${level.color}`} />
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h5 className="text-lg font-medium text-gray-900">{level.name}</h5>
                        {isCurrent && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        {level.description}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {canEditPermissions && selectedPermission && selectedPermission !== currentLevel && (
            <div className="mt-8 flex justify-end space-x-3">
              <button
                onClick={() => setSelectedPermission('')}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handlePermissionUpdate}
                disabled={isUpdating}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUpdating ? 'Updating...' : 'Update permissions'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
