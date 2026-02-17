'use client'

import { urlFor } from '@/lib/sanity'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { usePathname as usePathnameHook } from 'next/navigation'
import {
  FiHome,
  FiClock,
  FiFolder,
  FiUsers,
  FiBriefcase,
  FiBarChart2,
  FiSettings,
  FiMenu,
  FiX,
  FiChevronLeft,
} from 'react-icons/fi'
import UserProfileMenu from '@/components/user/UserProfileMenu'
import BasicInfoTab from '@/components/settings/BasicInfoTab'
import AssignedProjectsTab from '@/components/settings/AssignedProjectsTab'
import AssignedPeopleTab from '@/components/settings/AssignedPeopleTab'
import PermissionsTab from '@/components/settings/PermissionsTab'
import { sanityFetch } from '@/lib/sanity'
import toast from 'react-hot-toast'
import DashboardLayout from '@/components/layouts/DashboardLayout'

interface Member {
    _id: string
    firstName: string
    lastName: string
    email: string
    role?: string
    capacity?: number
    isPinned?: boolean
    rate?: number
    timezone?: string
    avatar?: any
    jobCategory?: {
        _id: string
        name: string
        slug: {
            current: string
        }
    }
}

export default function EditMemberPage() {
    const { id } = useParams()
    const router = useRouter()
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const pathname = usePathname()
    const { data: session } = useSession()
    const currentPathname = usePathnameHook()
    const [loading, setLoading] = useState(true)
    const [member, setMember] = useState<Member | null>(null)
    const [activeTab, setActiveTab] = useState('basic')
    const [tabData, setTabData] = useState<{
      basic: Member | null
      projects: any
      people: any
      permissions: any
    }>({
      basic: null,
      projects: null,
      people: null,
      permissions: null
    })
    const [tabLoading, setTabLoading] = useState({
      basic: false,
      projects: false,
      people: false,
      permissions: false
    })

    const role = session?.user?.role || 'user'

    const adminNavigationBase = [
      { name: 'Dashboard', href: '/admin', icon: FiHome },
      { name: 'Time', href: '/admin/timesheets', icon: FiClock },
      { name: 'Projects', href: '/admin/projects', icon: FiFolder },
      { name: 'Team', href: '/admin/team', icon: FiUsers },
      { name: 'Reports', href: '/admin/reports', icon: FiBarChart2 },
      { name: 'Manage', href: '/admin/manage', icon: FiBriefcase },

    ]

    const adminNavigation = role === 'admin'
      ? [
          ...adminNavigationBase,
          { name: 'CMS Studio', href: '/studio', icon: FiSettings },
          { name: 'Settings', href: '/admin/settings', icon: FiSettings },
        ]
      : [
          ...adminNavigationBase,
        //   { name: 'Settings', href: '/admin/settings', icon: FiSettings },
        ]

    const navigation = role === 'admin' || role === 'manager' ? adminNavigation : []

    useEffect(() => {
        if (id) fetchMember()
    }, [id])

    // Preload all tab data when member is loaded
    useEffect(() => {
        if (member) {
            preloadAllTabs()
        }
    }, [member])

    const preloadAllTabs = useCallback(async () => {
        const tabs = ['basic', 'projects', 'people', 'permissions']
        const preloadPromises = tabs.map(tab => preloadTabData(tab))
        await Promise.all(preloadPromises)
    }, [member])

    const preloadTabData = useCallback(async (tab: string) => {
        if (!member) return

        setTabLoading(prev => ({ ...prev, [tab]: true }))

        try {
            switch (tab) {
                case 'basic':
                    // Basic info is already loaded with member data
                    setTabData(prev => ({ ...prev, basic: member }))
                    break
                case 'projects':
                    // Fetch assigned projects
                    const projectsQuery = `*[_type == "user" && _id == $userId && isArchived != true][0]{
                      "assignedProjects": *[_type == "project" && !(_id in path("drafts.**")) && isActive == true && $userId in assignedUsers[].user._ref] | order(name asc){
                        _id,
                        name,
                        code,
                        status,
                        billableType,
                        client->{name},
                        description,
                        "tasks": tasks[]->{
                          _id,
                          name,
                          isBillable,
                          isArchived
                        }
                      }
                    }`
                    const projectsData = await sanityFetch({ query: projectsQuery, params: { userId: member._id } })
                    setTabData(prev => ({ ...prev, projects: projectsData }))
                    break
                case 'people':
                    // Fetch assigned people
                    const peopleQuery = `*[_type == "user" && _id == $userId && isArchived != true][0]{
                      "teamMembers": *[_type == "team" && manager._ref == ^._id && isActive == true].members[]->{
                        _id,
                        firstName,
                        lastName,
                        email,
                        avatar,
                        jobCategory->{name},
                        startDate,
                        isActive
                      },
                      "managedUsers": *[_type == "project" && $userId in assignedUsers[role == "Project Manager"].user._ref && isActive == true].assignedUsers[role != "Project Manager" && user->role != "admin"]{
                        "user": user->{
                          _id,
                          firstName,
                          lastName,
                          email,
                          avatar,
                          role,
                          jobCategory->{name},
                          startDate,
                          isActive
                        }
                      }.user
                    }`
                    const peopleData = await sanityFetch({ query: peopleQuery, params: { userId: member._id } }) as any
                    // Deduplicate managedUsers by _id to ensure unique users
                    if (peopleData?.managedUsers && Array.isArray(peopleData.managedUsers)) {
                      const uniqueManagedUsers = peopleData.managedUsers.filter((user: any, index: number, self: any[]) => 
                        index === self.findIndex((u: any) => u._id === user._id)
                      )
                      peopleData.managedUsers = uniqueManagedUsers
                    }
                    setTabData(prev => ({ ...prev, people: peopleData }))
                    break
                case 'permissions':
                    // Fetch permissions
                    const permissionsQuery = `*[_type == "user" && _id == $userId && isArchived != true][0]{
                      _id,
                      firstName,
                      lastName,
                      email,
                      role,
                      permissions
                    }`
                    const permissionsData = await sanityFetch({ query: permissionsQuery, params: { userId: member._id } })
                    setTabData(prev => ({ ...prev, permissions: permissionsData }))
                    break
            }
        } catch (error) {
            console.error(`Error preloading ${tab} data:`, error)
        } finally {
            setTabLoading(prev => ({ ...prev, [tab]: false }))
        }
    }, [member])

    const fetchMember = async () => {
        try {
            const res = await fetch(`/api/team/members/${id}`)
            if (!res.ok) throw new Error('Failed to load member')
            const data = await res.json()
            setMember(data)
        } catch (error) {
            toast.error('Error loading member')
        } finally {
            setLoading(false)
        }
    }

    const handleUpdateMember = async (updatedData: Partial<Member>) => {
      if (!member) return;
      try {
        // Avatar is handled separately via the avatar endpoint, so we don't need to send it here
        // The BasicInfoTab component handles avatar upload/removal separately
        const { avatar, ...restOfData } = updatedData;

        // Only send update if there's data to update (excluding avatar)
        if (Object.keys(restOfData).length > 0) {
          const res = await fetch(`/api/team/members/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(restOfData),
          });
          if (!res.ok) {
            const errorData = await res.json();
            console.error('Failed to save member:', errorData);
            throw new Error(errorData.error || 'Failed to save changes');
          }
          const result = await res.json();
          
          // Update local member state with the updated data
          if (result.member) {
            setMember(prev => prev ? { ...prev, ...result.member } : null);
          }
        }
        
        // If avatar was provided (for upload or removal), update local state
        if (avatar !== undefined) {
          if (avatar === null) {
            // Avatar was removed
            setMember(prev => prev ? { ...prev, avatar: null } : null);
          } else if (avatar && typeof avatar === 'object') {
            // Avatar was uploaded - update with the new avatar data
            setMember(prev => prev ? { ...prev, avatar } : null);
          }
        }
        
        // Only show success toast if we actually updated something
        if (Object.keys(restOfData).length > 0 || avatar !== undefined) {
          toast.success('Member updated successfully');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to save member';
        toast.error(errorMessage);
        throw error; // Re-throw so BasicInfoTab knows the operation failed
      }
    };

    return (
        <DashboardLayout role={session?.user?.role === 'admin' ? 'admin' : 'manager'}>
            <div className="space-y-6">
                {/* Mobile sidebar */}
                {/* <div
                    className={`fixed inset-0 z-40 lg:hidden ${
                        sidebarOpen ? 'block' : 'hidden'
                    }`}
                >
                    <div
                        className="fixed inset-0 bg-gray-600 bg-opacity-75"
                        onClick={() => setSidebarOpen(false)}
                    />
                    <div className="fixed inset-y-0 left-0 flex flex-col w-64 bg-white">
                        <div className="flex items-center justify-between h-16 px-4 border-b">
                            <Link href="/" className="flex items-center space-x-2">
                                <FiClock className="w-8 h-8 text-primary-600" />
                                <span className="text-xl font-bold text-gray-900">Multitime</span>
                            </Link>
                            <button onClick={() => setSidebarOpen(false)}>
                                <FiX className="w-6 h-6 text-gray-500" />
                            </button>
                        </div>
                        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
                            {navigation.map((item) => {
                                const isActive = currentPathname === item.href || currentPathname.startsWith(item.href + '/')
                                return (
                                    <Link
                                        key={item.name}
                                        href={item.href}
                                        className={`flex items-center px-4 py-2 text-sm font-medium rounded-lg ${
                                            isActive
                                                ? 'bg-primary-50 text-primary-700'
                                                : 'text-gray-700 hover:bg-gray-50'
                                        }`}
                                        onClick={() => setSidebarOpen(false)}
                                    >
                                        <item.icon className="w-5 h-5 mr-3" />
                                        {item.name}
                                    </Link>
                                )
                            })}
                        </nav>
                        <div className="p-4 border-t">
                            <UserProfileMenu />
                        </div>
                    </div>
                </div> */}

                {/* Desktop sidebar */}
                {/* <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
                    <div className="flex flex-col flex-1 min-h-0 bg-white border-r">
                        <div className="flex items-center h-16 px-4 border-b">
                            <Link href="/" className="flex items-center space-x-2">
                                <FiClock className="w-8 h-8 text-primary-600" />
                                <span className="text-xl font-bold text-gray-900">Multitime</span>
                            </Link>
                        </div>
                        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
                            {navigation.map((item) => {
                                const isActive = currentPathname === item.href || currentPathname.startsWith(item.href + '/')
                                return (
                                    <Link
                                        key={item.name}
                                        href={item.href}
                                        className={`flex items-center px-4 py-2 text-sm font-medium rounded-lg ${
                                            isActive
                                                ? 'bg-primary-50 text-primary-700'
                                                : 'text-gray-700 hover:bg-gray-50'
                                        }`}
                                    >
                                        <item.icon className="w-5 h-5 mr-3" />
                                        {item.name}
                                    </Link>
                                )
                            })}
                        </nav>
                        <div className="p-4 border-t">
                            <UserProfileMenu />
                        </div>
                    </div>
                </div> */}

                {/* Main content */}
                {/* <div className="lg:pl-64"> */}
                    {/* Admin Dashboard Header */}
                    {/* <div className="px-6 py-4 bg-white rounded-lg shadow-sm">
                        <h2 className="text-2xl font-bold text-gray-900">Admin Dashboard</h2>
                    </div> */}

                    {/* Back to Team Link */}
                    <Link
                        href="/admin/team"
                        className="flex items-center text-gray-500 hover:text-gray-700 px-6 py-4"
                    >
                        <FiChevronLeft className="w-5 h-5 mr-1" />
                        Back to Team
                    </Link>

                    {/* Page Header */}
                    <div className="px-6 py-4 bg-white border-b shadow-sm">
                        <h1 className="text-2xl font-bold text-gray-900">Edit Team Member</h1>
                        <p className="mt-1 text-sm text-gray-500">Update team member information and permissions</p>
                    </div>

                    {/* Page content */}
                    <main className="flex-1">
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                                <span className="ml-3 text-gray-600">Loading member...</span>
                            </div>
                        ) : !member ? (
                            <div className="p-6">
                                <div className="text-red-600">Member not found</div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* Header with user info */}
                                <div className="bg-white shadow">
                                    <div className="px-6 py-8">
                                        <div className="flex items-center space-x-4">
                                            <div className="flex-shrink-0 uppercase">
                                                {member.avatar ? (
                                                    <img
                                                        className="h-16 w-16 rounded-full object-cover object-top"
                                                        src={urlFor(member.avatar).fit('crop').url()}
                                                        alt={`${member.firstName} ${member.lastName}`}
                                                    />
                                                ) : (
                                                    <div className="h-16 w-16 rounded-full bg-black flex items-center justify-center text-white font-semibold text-xl">
                                                        {member.firstName?.[0]}{member.lastName?.[0]}
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <h1 className="text-3xl font-bold text-gray-900 capitalize">
                                                    {member.firstName} {member.lastName}
                                                </h1>
                                                <p className="text-lg text-gray-600">{member.email}</p>
                                                <div className="flex items-center space-x-1">
                                                    <p className="text-sm text-gray-500 capitalize">{member.role} |</p>
                                                    {member.jobCategory && (
                                                        <span className="text-sm text-gray-500"> {member.jobCategory.name}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Tab Navigation */}
                                <div className="bg-white shadow">
                                    <div className="border-b border-gray-200 overflow-y-hidden overflow-x-auto">
                                        <nav className="-mb-px flex space-x-8 px-6">
                                            <button
                                                onClick={() => setActiveTab('basic')}
                                                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                                                    activeTab === 'basic'
                                                        ? 'theme-color-border theme-color'
                                                        : 'border-transparent text-gray-500 hover:theme-color hover:theme-color-border'
                                                }`}
                                            >
                                                Basic Info
                                            </button>
                                            <button
                                                onClick={() => setActiveTab('projects')}
                                                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                                                    activeTab === 'projects'
                                                        ? 'theme-color-border theme-color'
                                                        : 'border-transparent text-gray-500 hover:theme-color hover:theme-color-border'
                                                }`}
                                            >
                                                Assigned Projects
                                            </button>
                                            <button
                                                onClick={() => setActiveTab('people')}
                                                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                                                    activeTab === 'people'
                                                        ? 'theme-color-border theme-color'
                                                        : 'border-transparent text-gray-500 hover:theme-color hover:theme-color-border'
                                                }`}
                                            >
                                                Assigned People
                                            </button>
                                            <button
                                                onClick={() => setActiveTab('permissions')}
                                                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
                                                    activeTab === 'permissions'
                                                        ? 'theme-color-border theme-color'
                                                        : 'border-transparent text-gray-500 hover:theme-color hover:theme-color-border'
                                                }`}
                                            >
                                                Permissions
                                            </button>
                                        </nav>
                                    </div>
                                </div>

                                {/* Tab Content */}
                                <div className="">
                                    {activeTab === 'basic' && (
                                        <div className="space-y-6">
                                            {/* Basic Information Tab */}
                                            {tabLoading.basic ? (
                                                <div className="flex items-center justify-center py-12">
                                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                                                    <span className="ml-3 text-gray-600">Loading basic information...</span>
                                                </div>
                                            ) : (
                                                <BasicInfoTab
                                                    user={{
                                                        id: member._id,
                                                        email: member.email,
                                                        firstName: member.firstName,
                                                        lastName: member.lastName,
                                                        role: member.role as 'admin' | 'manager' | 'user',
                                                        rate: member.rate,
                                                        timezone: member.timezone,
                                                        avatar: member.avatar
                                                    }}
                                                    onUpdate={handleUpdateMember}
                                                    userId={member._id}
                                                />
                                            )}
                                        </div>
                                    )}
                                    {activeTab === 'projects' && (
                                        tabLoading.projects ? (
                                            <div className="flex items-center justify-center py-12">
                                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                                                <span className="ml-3 text-gray-600">Loading assigned projects...</span>
                                            </div>
                                        ) : (
                                            <AssignedProjectsTab userId={member._id} />
                                        )
                                    )}
                                    {activeTab === 'people' && (
                                        tabLoading.people ? (
                                            <div className="flex items-center justify-center py-12">
                                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                                                <span className="ml-3 text-gray-600">Loading assigned people...</span>
                                            </div>
                                        ) : (
                                            <AssignedPeopleTab userId={member._id} />
                                        )
                                    )}
                                    {activeTab === 'permissions' && (
                                        tabLoading.permissions ? (
                                            <div className="flex items-center justify-center py-12">
                                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                                                <span className="ml-3 text-gray-600">Loading permissions...</span>
                                            </div>
                                        ) : (
                                            <PermissionsTab 
                                                user={{
                                                    id: member._id,
                                                    email: member.email,
                                                    firstName: member.firstName,
                                                    lastName: member.lastName,
                                                    role: member.role as 'admin' | 'manager' | 'user'
                                                }}
                                                isAdmin={session?.user?.role === 'admin'}
                                                viewingOwnProfile={false}
                                            />
                                        )
                                    )}
                                </div>
                            </div>
                        )}
                    </main>
                {/* </div> */}
            </div>
        </DashboardLayout>
    )
}
