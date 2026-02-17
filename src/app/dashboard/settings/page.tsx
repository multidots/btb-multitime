'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import DashboardLayout from '@/components/layouts/DashboardLayout'
import { useSession } from 'next-auth/react'
import BasicInfoTab from '@/components/settings/BasicInfoTab'
import AssignedProjectsTab from '@/components/settings/AssignedProjectsTab'
import AssignedPeopleTab from '@/components/settings/AssignedPeopleTab'
import PermissionsTab from '@/components/settings/PermissionsTab'
import NotificationsTab from '@/components/settings/NotificationsTab'
import { sanityFetch } from '@/lib/sanity'
import { usePageTitle } from '@/lib/pageTitleImpl'

interface UserData {
  _id: string
  firstName: string
  lastName: string
  email: string
  role: 'admin' | 'manager' | 'user'
  rate?: number
  timezone?: string
  avatar?: any
  permissions?: any
  team?: {
    _id: string
    name: string
    manager?: {
      firstName: string
      lastName: string
    }
  }
}

export default function SettingsPage() {
  const { data: session, update } = useSession()
  const searchParams = useSearchParams()
  const tabFromUrl = searchParams.get('tab')
  
  const [activeTab, setActiveTab] = useState(tabFromUrl || 'basic')
  const [currentUser, setCurrentUser] = useState<UserData | null>(null)
  const [loadingUser, setLoadingUser] = useState(true)

  usePageTitle('Profile')
  
  // Update active tab when URL changes
  useEffect(() => {
    if (tabFromUrl) {
      setActiveTab(tabFromUrl)
    }
  }, [tabFromUrl])

  // Fetch latest user data from Sanity to ensure role is up-to-date
  useEffect(() => {
    const fetchUserData = async () => {
      // If user doesn't have an ID (e.g., Google-authenticated Studio admin), skip fetching
      if (!session?.user?.id) {
        setLoadingUser(false)
        return
      }

      try {
        const query = `*[_type == "user" && _id == $userId && isArchived != true][0]{
          _id,
          firstName,
          lastName,
          email,
          role,
          rate,
          timezone,
          avatar,
          permissions,
          team->{
            _id, 
            name,
            manager->{firstName, lastName}
          }
        }`

        const userData = await sanityFetch<UserData>({
          query,
          params: { userId: session.user.id }
        })

        if (userData) {
          setCurrentUser(userData)
          
          // Update session if role has changed
          if (userData.role !== session.user.role) {
            await update({
              role: userData.role,
              firstName: userData.firstName,
              lastName: userData.lastName,
              rate: userData.rate,
              timezone: userData.timezone,
              avatar: userData.avatar,
              permissions: userData.permissions,
            })
          }
        }
      } catch (error) {
        console.error('Error fetching user data:', error)
        // If user doesn't exist in Sanity, that's okay - they might be a Studio admin
      } finally {
        setLoadingUser(false)
      }
    }

    fetchUserData()
  }, [session?.user?.id, session?.user?.role, update])

  // Use current user data from Sanity if available, otherwise fall back to session
  const displayUser = currentUser || session?.user
  const userRole = displayUser?.role || 'user'
  const isManager = userRole === 'admin' || userRole === 'manager'

  const allTabs = [
    { id: 'basic', name: 'Basic Info', description: 'Update your profile information' },
    { id: 'projects', name: 'Assigned Projects', description: 'View your assigned projects and tasks' },
    { id: 'people', name: 'Assigned People', description: 'Manage people assigned to you' },
    { id: 'permissions', name: 'Permissions', description: 'Manage your account permissions' },
    { id: 'notifications', name: 'Notifications', description: 'Manage your notification preferences' },
  ]

  // Get team manager name for notification info box
  const teamManagerName = currentUser?.team?.manager 
    ? `${currentUser.team.manager.firstName} ${currentUser.team.manager.lastName}`
    : undefined

  // Filter tabs based on user role - show Assigned People only for managers/admins
  const tabs = allTabs.filter(tab => {
    // The tab should always be visible, content will be conditional
    return true
  })

  if (!session?.user) {
    return null
  }

  if (loadingUser) {
    return (
      <DashboardLayout role={userRole === 'admin' || userRole === 'manager' ? userRole : 'user'}>
        <div className="space-y-6">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <span className="ml-3 text-gray-600">Loading profile...</span>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  // Create user object for components (use latest data from Sanity)
  // If user doesn't exist in Sanity (e.g., Google-authenticated Studio admin), use session data
  const userForComponents = currentUser ? {
    id: currentUser._id,
    email: currentUser.email,
    firstName: currentUser.firstName,
    lastName: currentUser.lastName,
    role: currentUser.role,
    rate: currentUser.rate,
    timezone: currentUser.timezone,
    avatar: currentUser.avatar,
  } : (session?.user || {
    id: '',
    email: '',
    firstName: '',
    lastName: '',
    role: 'admin' as const,
  })

  return (
    <DashboardLayout role={userRole === 'admin' || userRole === 'manager' ? userRole : 'user'}>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My Profile</h2>
          <p className="mt-1 text-sm text-gray-500">
            Manage your account settings and preferences
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 overflow-y-hidden overflow-x-auto">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-theme-color theme-color-border theme-color'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:theme-color-border'
                }`}
              >
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {activeTab === 'basic' && <BasicInfoTab user={userForComponents} />}
          {activeTab === 'projects' && <AssignedProjectsTab />}
          {activeTab === 'people' && <AssignedPeopleTab />}
          {activeTab === 'permissions' && (
            <PermissionsTab 
              user={userForComponents} 
              isAdmin={userRole === 'admin'}
              viewingOwnProfile={true}
            />
          )}
          {activeTab === 'notifications' && (
            <NotificationsTab 
              user={userForComponents}
              teamManagerName={teamManagerName}
            />
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}

