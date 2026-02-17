"use client"
import { useEffect, useState } from 'react'
import DashboardLayout from '@/components/layouts/DashboardLayout'
import { FiUsers } from 'react-icons/fi'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useSession } from 'next-auth/react'

type ArchivedUser = {
  _id: string
  firstName: string
  lastName: string
  email: string
}

export default function ArchivedPeoplePage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const isManager = session?.user?.role === 'manager'
  const [archivedPeople, setArchivedPeople] = useState<ArchivedUser[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const [navigatingBack, setNavigatingBack] = useState(false)
  const [restoringMember, setRestoringMember] = useState<string | null>(null)
  const [deletingMember, setDeletingMember] = useState<string | null>(null)
  const [membersWithPendingApprovals, setMembersWithPendingApprovals] = useState<Set<string>>(new Set())
  // removed pin state - archived list doesn't support pin/unpin/edit

  useEffect(() => {
    fetchArchivedPeople()
  }, [])

  useEffect(() => {
    if (archivedPeople.length > 0 && isAdmin) {
      checkPendingApprovalsForArchivedMembers()
    }
  }, [archivedPeople, isAdmin])

  const fetchArchivedPeople = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/team/archived')
      if (!response.ok) throw new Error('Failed to fetch archived people')
      const data = await response.json()
      setArchivedPeople(data)
    } catch (error) {
      toast.error('Failed to load archived people')
      setArchivedPeople([])
    } finally {
      setLoading(false)
    }
  }

  const checkPendingApprovalsForArchivedMembers = async () => {
    if (archivedPeople.length === 0 || !isAdmin) return
    
    try {
      const memberIds = archivedPeople.map(p => p._id)
      const response = await fetch('/api/team/pending-approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIds }),
        cache: 'no-store'
      })
      
      if (response.ok) {
        const data = await response.json()
        setMembersWithPendingApprovals(new Set(data.memberIds || []))
      }
    } catch (error) {
      console.error('Error checking pending approvals for archived members:', error)
    }
  }

  const handleRestore = async (userId: string) => {
    setRestoringMember(userId)
    try {
      const response = await fetch(`/api/team/archived/${userId}/restore`, { method: 'POST' })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to restore user')
      }
      toast.success('User restored')
      setArchivedPeople(archivedPeople.filter(u => u._id !== userId))
      // After restore, navigate back to team to show restored member
      router.push('/admin/team')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to restore user')
    } finally {
      setRestoringMember(null)
    }
  }

  const handleDelete = async (userId: string) => {
    // Prevent deletion if member has pending or unsubmitted time entries
    if (membersWithPendingApprovals.has(userId)) {
      toast.error('Cannot delete member with pending or unsubmitted time entries')
      return
    }
    
    if (!window.confirm('Are you sure you want to permanently delete this user?')) return
    setDeletingMember(userId)
    try {
      const response = await fetch(`/api/team/archived/${userId}/delete`, { method: 'DELETE' })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to delete user')
      }
      toast.success('User deleted')
      setArchivedPeople(archivedPeople.filter(u => u._id !== userId))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete user')
    } finally {
      setDeletingMember(null)
    }
  }

  return (
      <DashboardLayout role="admin">
        <div className="mx-auto py-6">
          <button
            onClick={() => {
              setNavigatingBack(true)
              router.push('/admin/team')
            }}
            disabled={navigatingBack}
            className="flex items-center text-gray-500 hover:text-gray-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {navigatingBack ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700 mr-2"></div>
                Loading...
              </>
            ) : (
              <>
                <FiUsers className="mr-2 w-5 h-5" />
                Back to Team Members
              </>
            )}
          </button>
        </div>
      <div className=" mx-auto py-10">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Archived People</h2>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <span className="ml-3 text-gray-600">Loading archived people...</span>
          </div>
        ) : archivedPeople.length === 0 ? (
          <div className="text-center py-8">
            <FiUsers className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <p className="text-lg font-medium text-gray-900">No archived people found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {archivedPeople.map((person) => (
                  <tr key={person._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold">
                            {person.firstName?.[0]}{person.lastName?.[0]}
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{person.firstName} {person.lastName}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{person.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center flex gap-2 justify-center">
                      {/* removed Edit/Pin buttons: Archived listing shows only Restore and Delete */}
                      { (isAdmin || isManager) && (
                        <button
                          className="px-3 py-1 text-xs font-medium text-green-700 bg-green-100 rounded hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                          onClick={() => handleRestore(person._id)}
                          disabled={restoringMember === person._id || deletingMember === person._id}
                        >
                          {restoringMember === person._id ? (
                            <>
                              <div className="animate-spin rounded-full h-3 w-3 border-b border-green-700 mr-2"></div>
                              Restoring...
                            </>
                          ) : (
                            'Restore'
                          )}
                        </button>
                      ) }
                      { isAdmin && (
                        <button
                          className="px-3 py-1 text-xs font-medium text-red-700 bg-red-100 rounded hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                          onClick={(e) => {
                            if (deletingMember === person._id || restoringMember === person._id || membersWithPendingApprovals.has(person._id)) {
                              e.preventDefault()
                              e.stopPropagation()
                              return
                            }
                            handleDelete(person._id)
                          }}
                          disabled={deletingMember === person._id || restoringMember === person._id || membersWithPendingApprovals.has(person._id)}
                          title={membersWithPendingApprovals.has(person._id) ? 'Cannot delete member with pending or unsubmitted time entries' : ''}
                        >
                          {deletingMember === person._id ? (
                            <>
                              <div className="animate-spin rounded-full h-3 w-3 border-b border-red-700 mr-2"></div>
                              Deleting...
                            </>
                          ) : (
                            'Delete'
                          )}
                        </button>
                      ) }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
