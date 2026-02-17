import { Suspense } from 'react'
import DashboardLayout from '@/components/layouts/DashboardLayout'
import { requireAdminOrManager, getCurrentUser } from '@/lib/auth'
import TeamModuleClient from './TeamModuleClient'

export const metadata = {
  title: 'Team',
  description: 'View team hours and capacity',
}

function TeamSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
        <div>
          <div className="h-6 bg-gray-200 rounded w-40 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-64"></div>
        </div>
        <div className="flex space-x-3">
          <div className="h-10 bg-gray-200 rounded w-24"></div>
          <div className="h-10 bg-gray-200 rounded w-32"></div>
        </div>
      </div>

      {/* Week Navigation Skeleton */}
      <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
        <div className="h-8 w-8 bg-gray-200 rounded"></div>
        <div className="h-5 bg-gray-200 rounded w-48"></div>
        <div className="h-8 w-8 bg-gray-200 rounded"></div>
      </div>

      {/* Stats Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center">
              <div className="h-8 w-8 bg-gray-200 rounded"></div>
              <div className="ml-4">
                <div className="h-4 bg-gray-200 rounded w-20 mb-2"></div>
                <div className="h-6 bg-gray-200 rounded w-16"></div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Table Skeleton */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="h-5 bg-gray-200 rounded w-32 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-56"></div>
        </div>
        <div className="p-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center space-x-4 py-4 border-b border-gray-100 last:border-0">
              <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-32"></div>
                <div className="h-3 bg-gray-200 rounded w-20"></div>
              </div>
              <div className="h-4 bg-gray-200 rounded w-16"></div>
              <div className="h-4 bg-gray-200 rounded w-16"></div>
              <div className="h-4 bg-gray-200 rounded w-16"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default async function AdminTeamPage() {
  const session = await requireAdminOrManager()
  const user = await getCurrentUser()

  return (
    <DashboardLayout role={user?.role === 'admin' ? 'admin' : 'manager'}>
      <Suspense fallback={<TeamSkeleton />}>
        <TeamModuleClient />
      </Suspense>
    </DashboardLayout>
  )
}
