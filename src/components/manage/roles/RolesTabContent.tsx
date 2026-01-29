'use client'

import React, { useCallback, useState, useEffect } from 'react'
import { useDataFetcher } from '@/lib/hooks/useDataFetcher'
import { sanityFetch } from '@/lib/sanity'
import { urlFor } from '@/lib/sanity'
import { JOB_CATEGORIES_QUERY } from '@/lib/queries'
import { FiCheckSquare, FiX, FiTrash2, FiLoader } from 'react-icons/fi'

interface JobCategory {
  _id: string
  name: string
  slug?: {
    current: string
  }
}

interface User {
  _id: string
  firstName: string
  lastName: string
  avatar?: any
}

interface JobCategoryWithUsers extends JobCategory {
  users: User[]
}

const RolesTabContent = () => {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [roleName, setRoleName] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  
  // State for table row selection (selecting roles)
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set())

  const fetchRolesData = useCallback(async (): Promise<JobCategoryWithUsers[]> => {
    // First fetch all job categories
    const categories = await sanityFetch<JobCategory[]>({
      query: JOB_CATEGORIES_QUERY
    })

    // Then fetch users for each category
    const categoriesWithUsers = await Promise.all(
      categories.map(async (category) => {
        const users = await sanityFetch<User[]>({
          query: `*[_type == "user" && jobCategory._ref == $categoryId && isActive == true && isArchived != true] | order(firstName asc){
            _id,
            firstName,
            lastName,
            avatar
          }`,
          params: { categoryId: category._id }
        })

        return {
          ...category,
          users: users || []
        }
      })
    )

    return categoriesWithUsers
  }, [])

  const { data: rolesData, loading, error, refetch } = useDataFetcher<JobCategoryWithUsers[]>(fetchRolesData)

  // Fetch all users when form is shown or when editing
  useEffect(() => {
    if (showCreateForm || editingRoleId) {
      fetchAllUsers()
    }
  }, [showCreateForm, editingRoleId])

  const fetchAllUsers = async () => {
    setUsersLoading(true)
    try {
      const users = await sanityFetch<User[]>({
        query: `*[_type == "user" && isArchived != true] | order(firstName asc){
          _id,
          firstName,
          lastName,
          avatar
        }`
      })
      setAllUsers(users || [])
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setUsersLoading(false)
    }
  }

  const handleUserToggle = (userId: string) => {
    setSelectedUserIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(userId)) {
        newSet.delete(userId)
      } else {
        newSet.add(userId)
      }
      return newSet
    })
  }

  const handleSelectAll = () => {
    if (allUsers.length === 0) return
    const allSelected = allUsers.every(user => selectedUserIds.has(user._id))
    if (allSelected) {
      // Deselect all
      setSelectedUserIds(new Set())
    } else {
      // Select all
      setSelectedUserIds(new Set(allUsers.map(user => user._id)))
    }
  }

  const isAllSelected = allUsers.length > 0 && allUsers.every(user => selectedUserIds.has(user._id))

  // Handlers for table row selection (selecting roles)
  const handleRoleToggle = (roleId: string) => {
    setSelectedRoleIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(roleId)) {
        newSet.delete(roleId)
      } else {
        newSet.add(roleId)
      }
      return newSet
    })
  }

  const handleSelectAllRoles = () => {
    if (!rolesData || rolesData.length === 0) return
    const allRolesSelected = rolesData.every(role => selectedRoleIds.has(role._id))
    if (allRolesSelected) {
      // Deselect all roles
      setSelectedRoleIds(new Set())
    } else {
      // Select all roles
      setSelectedRoleIds(new Set(rolesData.map(role => role._id)))
    }
  }

  const isAllRolesSelected = rolesData && rolesData.length > 0 && rolesData.every(role => selectedRoleIds.has(role._id))
  const isSomeRolesSelected = rolesData && rolesData.length > 0 && rolesData.some(role => selectedRoleIds.has(role._id)) && !isAllRolesSelected

  // Bulk delete state
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)

  const handleClearSelection = () => {
    setSelectedRoleIds(new Set())
  }

  const handleBulkDelete = async () => {
    if (selectedRoleIds.size === 0) return

    const selectedRolesList = rolesData?.filter(role => selectedRoleIds.has(role._id)) || []
    const roleNames = selectedRolesList.map(role => role.name).join(', ')

    if (!confirm(`Are you sure you want to delete ${selectedRoleIds.size} role(s)?\n\nRoles to delete: ${roleNames}\n\nThis will only delete the roles, not the users assigned to them. This action cannot be undone.`)) {
      return
    }

    setIsBulkDeleting(true)
    try {
      const response = await fetch('/api/job-categories/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleIds: Array.from(selectedRoleIds),
          operation: 'delete'
        })
      })

      if (response.ok) {
        const data = await response.json()
        let message = data.message || `Successfully deleted ${data.successCount} role${data.successCount !== 1 ? 's' : ''}`
        if (data.errorCount > 0) {
          message += `. ${data.errorCount} failed.`
          if (data.errors && data.errors.length > 0) {
            const errorDetails = data.errors.map((err: any) =>
              `Role ${err.id}: ${err.error}`
            ).join('\n')
            message += `\n\nError details:\n${errorDetails}`
          }
        }
        alert(message)

        if (data.successCount > 0) {
          setSelectedRoleIds(new Set())
          refetch()
        }
      } else {
        const errorData = await response.json()
        alert(`Failed to delete roles: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error deleting roles:', error)
      alert('Failed to delete roles. Please try again.')
    } finally {
      setIsBulkDeleting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!roleName.trim()) {
      alert('Role name is required')
      return
    }

    setIsSubmitting(true)
    try {
      const url = editingRoleId 
        ? `/api/job-categories/${editingRoleId}`
        : '/api/job-categories'
      const method = editingRoleId ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: roleName.trim(),
          userIds: Array.from(selectedUserIds),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        const errorMessage = errorData.error || `Failed to ${editingRoleId ? 'update' : 'create'} role`
        console.error('API Error:', errorMessage)
        alert(errorMessage)
        return
      }

      const result = await response.json()
      console.log(`Role ${editingRoleId ? 'updated' : 'created'} successfully:`, result)

      // Reset form and hide form section
      setRoleName('')
      setSelectedUserIds(new Set())
      setShowCreateForm(false)
      setEditingRoleId(null)
      
      // Refresh the roles list
      refetch()
    } catch (error) {
      console.error(`Error ${editingRoleId ? 'updating' : 'creating'} role:`, error)
      alert(`Failed to ${editingRoleId ? 'update' : 'create'} role. Please try again.`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    setRoleName('')
    setSelectedUserIds(new Set())
    setShowCreateForm(false)
    setEditingRoleId(null)
  }

  const handleEdit = (role: JobCategoryWithUsers) => {
    setEditingRoleId(role._id)
    setRoleName(role.name)
    setSelectedUserIds(new Set(role.users.map(u => u._id)))
    setShowCreateForm(false)
  }

  const handleDelete = async (roleId: string, roleName: string) => {
    if (!confirm(`Are you sure you want to delete the role "${roleName}"? This will only delete the role, not the users assigned to it.`)) {
      return
    }

    setIsDeleting(roleId)
    try {
      const response = await fetch(`/api/job-categories/${roleId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        const errorMessage = errorData.error || 'Failed to delete role'
        console.error('API Error:', errorMessage)
        alert(errorMessage)
        return
      }

      const result = await response.json()
      console.log('Role deleted successfully:', result)
      
      // Refresh the roles list
      refetch()
    } catch (error) {
      console.error('Error deleting role:', error)
      alert('Failed to delete role. Please try again.')
    } finally {
      setIsDeleting(null)
    }
  }

  const renderForm = (isInline: boolean = false) => {
    return (
      <div className={isInline ? "bg-gray-50 border border-gray-200 p-6" : "bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6"}>
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label htmlFor={isInline ? `roleName-${editingRoleId}` : "roleName"} className="block text-sm font-medium text-gray-900 mb-2">
              Role name
            </label>
            <input
              type="text"
              id={isInline ? `roleName-${editingRoleId}` : "roleName"}
              minLength={3}
              maxLength={100}
              required
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              placeholder="e.g. Design, Development, Marketing, etc."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-transparent focus:border-black disabled:bg-gray-100 disabled:cursor-not-allowed"
              autoFocus
              disabled={isSubmitting}
            />
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-900">
                Who's assigned to this role?
              </label>
              {allUsers.length > 0 && (
                <div className="flex items-center space-x-2 text-xs text-gray-500">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    disabled={isSubmitting}
                    className="text-primary-600 hover:text-primary-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isAllSelected ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
              )}
            </div>
            <div className="border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
              {usersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
                  <span className="ml-3 text-gray-600 text-sm">Loading users...</span>
                </div>
              ) : allUsers.length > 0 ? (
                <div className="divide-y divide-gray-200">
                  {allUsers.map((user, index) => (
                    <label
                      key={user._id}
                      className={`flex items-center px-4 py-3 hover:bg-gray-50 ${isSubmitting ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedUserIds.has(user._id)}
                        onChange={() => handleUserToggle(user._id)}
                        disabled={isSubmitting}
                        className="rounded border-gray-300 theme-color focus:ring-transparent focus:border-black outline-none mr-3 disabled:cursor-not-allowed"
                      />
                      <div className="flex items-center flex-1">
                        {user.avatar ? (
                          <img
                            src={urlFor(user.avatar).fit('crop').url()}
                            alt={`${user.firstName} ${user.lastName}`}
                            className="h-8 w-8 rounded-full object-cover mr-3"
                          />
                        ) : (
                          <div className={`h-8 w-8 rounded-full ${getAvatarColor(index)} flex items-center justify-center text-white text-xs font-medium mr-3`}>
                            {getInitials(user.firstName, user.lastName)}
                          </div>
                        )}
                        <span className="text-sm text-gray-900">
                          {user.firstName} {user.lastName}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-8 text-center text-sm text-gray-500">
                  No users found
                </div>
              )}
            </div>
          </div>

          {/* Form footer */}
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSubmitting}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !roleName.trim()}
              className="btn-primary px-4 py-2 text-sm font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : editingRoleId ? 'Update role' : 'Save role'}
            </button>
          </div>
        </form>
      </div>
    )
  }

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase()
  }

  const getAvatarColor = (index: number) => {
    const colors = [
      'bg-gray-500',
      'bg-blue-500',
      'bg-green-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-yellow-500',
      'bg-indigo-500',
      'bg-red-500'
    ]
    return colors[index % colors.length]
  }

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <span className="ml-3 text-gray-600">Loading roles...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">Error loading roles: {error}</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h3 className="text-2xl font-bold text-gray-900 mb-2">Roles</h3>
        <button 
          onClick={() => {
            if (editingRoleId) {
              handleCancel()
            }
            setShowCreateForm(!showCreateForm)
          }}
          disabled={!!editingRoleId}
          className="btn-primary px-4 py-2 text-sm font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          + New role
        </button>
      </div>

      {/* Create Role Form Section */}
      {showCreateForm && !editingRoleId && renderForm(false)}

      {/* Bulk Actions Bar - shown when roles are selected */}
      {selectedRoleIds.size > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <FiCheckSquare className="w-5 h-5 theme-color" />
                <span className="text-sm font-medium theme-color">
                  {selectedRoleIds.size} role{selectedRoleIds.size !== 1 ? 's' : ''} selected
                </span>
              </div>
              <button
                onClick={handleClearSelection}
                className="flex items-center space-x-1 text-sm theme-color hover:theme-color-hover"
              >
                <FiX className="w-4 h-4" />
                <span>Clear selection</span>
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleBulkDelete}
                disabled={isBulkDeleting || !!editingRoleId}
                title={editingRoleId ? "Cannot delete while editing a role" : "Delete selected roles"}
                className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-black bg-red-100 hover:bg-red-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isBulkDeleting ? (
                  <FiLoader className="w-4 h-4 animate-spin" />
                ) : (
                  <FiTrash2 className="w-4 h-4" />
                )}
                <span>{isBulkDeleting ? 'Deleting...' : 'Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {rolesData && rolesData.length > 0 ? (
        <div className="bg-white shadow-sm lg:overflow-hidden overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-[#eee]">
              <tr>
                <th className="px-6 py-2 text-left font-normal text-sm text-[#1d1e1c]">
                  <input 
                    type="checkbox" 
                    checked={isAllRolesSelected || false}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate = isSomeRolesSelected || false
                      }
                    }}
                    onChange={handleSelectAllRoles}
                    disabled={!!editingRoleId}
                    className="rounded border-gray-300 theme-color focus:ring-transparent disabled:opacity-50 disabled:cursor-not-allowed" 
                  />
                </th>
                <th className="px-6 py-2 text-left font-normal text-sm text-[#1d1e1cb3]">
                  Role
                </th>
                <th className="px-6 py-2 text-left font-normal text-sm text-[#1d1e1cb3]">
                  People
                </th>
                <th className="px-6 py-2 text-right font-normal text-sm text-[#1d1e1cb3]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {rolesData.map((role) => (
                <React.Fragment key={role._id}>
                  <tr className="capitalize relative hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-2 whitespace-nowrap">
                      <input 
                        type="checkbox" 
                        checked={selectedRoleIds.has(role._id)}
                        onChange={() => handleRoleToggle(role._id)}
                        disabled={!!editingRoleId}
                        className="rounded border-gray-300 theme-color focus:ring-transparent focus:border-black outline-none disabled:opacity-50 disabled:cursor-not-allowed" 
                      />
                    </td>
                    <td className="px-6 py-2 whitespace-nowrap">
                      {editingRoleId === role._id ? (
                        <div className="font-medium text-gray-900">Editing: {role.name}</div>
                      ) : (
                        <div className="font-medium text-gray-900">{role.name}</div>
                      )}
                    </td>
                    <td className="px-6 py-2">
                      {editingRoleId === role._id ? (
                        <div className="text-gray-500">Form below</div>
                      ) : (
                        <div className="flex items-center -space-x-2">
                          {role.users.slice(0, 8).map((user, index) => (
                            <div
                              key={user._id}
                              className="relative inline-block"
                              title={`${user.firstName} ${user.lastName}`}
                            >
                              {user.avatar ? (
                                <img
                                  src={urlFor(user.avatar).fit('crop').url()}
                                  alt={`${user.firstName} ${user.lastName}`}
                                  className="h-8 w-8 rounded-full border-2 border-white object-cover object-top"
                                />
                              ) : (
                                <div className={`h-8 w-8 rounded-full border-2 border-white ${getAvatarColor(index)} flex items-center justify-center text-white text-xs font-medium`}>
                                  {getInitials(user.firstName, user.lastName)}
                                </div>
                              )}
                            </div>
                          ))}
                          {role.users.length > 8 && (
                            <div className="h-8 w-8 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-gray-600 text-xs font-medium">
                              +{role.users.length - 8}
                            </div>
                          )}
                          {role.users.length === 0 && (
                            <span className="text-gray-400">No people assigned</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-2 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <button 
                          onClick={() => handleEdit(role)}
                          disabled={!!editingRoleId}
                          className="px-3 py-1 text-[#2a59c1] hover:underline rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-primary-600 disabled:hover:bg-transparent"
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => handleDelete(role._id, role.name)}
                          disabled={!!editingRoleId || isDeleting === role._id}
                          className="px-3 py-1 text-red-600 hover:underline rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-red-600 disabled:hover:bg-transparent"
                        >
                          {isDeleting === role._id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editingRoleId === role._id && (
                    <tr>
                      <td colSpan={4} className="px-6 py-4">
                        {renderForm(true)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <p className="text-gray-500">No roles found</p>
        </div>
      )}
    </div>
  )
}

export default RolesTabContent