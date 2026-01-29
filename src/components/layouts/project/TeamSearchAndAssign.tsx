import React, { useState } from 'react'

interface TeamSearchAndAssignProps {
  formData: any
  setFormData: any
  assignedUsersData: any[]
  setProjectManagers: any
  projectManagers: string[]
  filteredUsers: any[]
  removeUserFromProject: (userId: string) => void
  toggleProjectManager: (userId: string) => void
}

const TeamSearchAndAssign = ({ 
  formData, 
  setFormData, 
  assignedUsersData, 
  setProjectManagers, 
  projectManagers, 
  filteredUsers, 
  removeUserFromProject, 
  toggleProjectManager 
}: TeamSearchAndAssignProps) => {
  const [userSearchTerm, setUserSearchTerm] = useState('')
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false)

  const addUserToProject = (userId: string) => {
    if (!formData.assignedUsers.includes(userId)) {
      setFormData((prev: any) => ({
        ...prev,
        assignedUsers: [...prev.assignedUsers, userId]
      }))
    }
    setUserSearchTerm('')
    setIsUserDropdownOpen(false)
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-3">
        Team
      </label>
      
      {/* Search Input */}
      <div className="relative user-dropdown mb-4">
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
                        {user.firstName?.charAt(0)}{user.lastName?.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="ml-3">
                    <div className="text-sm font-medium text-gray-900">
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
                  onClick={() => setProjectManagers(assignedUsersData.map((u: any) => u._id))}
                  className="theme-color hover:theme-color-hover"
                >
                  Select All
                </button>
                <span>/</span>
                <button
                  onClick={() => setProjectManagers([])}
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
                    <span className="text-sm font-medium text-gray-700">
                      {user.firstName?.charAt(0)}{user.lastName?.charAt(0)}
                    </span>
                  )}
                </div>
                
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {user.firstName} {user.lastName}
                  </div>
                  <div className="text-sm text-gray-500">{user.email}</div>
                </div>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={projectManagers.includes(user._id)}
                  onChange={() => toggleProjectManager(user._id)}
                  className="h-4 w-4 theme-color focus:ring-transparent focus:border-black outline-none border-gray-300 rounded"
                />
              </div>
            </div>
          ))}
        </div>
      )}
      
      {assignedUsersData.length === 0 && (
        <div className="text-gray-500 text-sm text-center py-4 border border-gray-200 rounded-md">
          No team members assigned yet
        </div>
      )}
    </div>
  )
}

export default TeamSearchAndAssign
