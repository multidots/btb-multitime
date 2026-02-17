import { Suspense } from 'react'
import DashboardLayout from '@/components/layouts/DashboardLayout'
import { requireAdminOrManager, getCurrentUser } from '@/lib/auth'

export const metadata = {
  title: 'Clients',
  description: 'Manage all clients',
}

export default async function AdminClientsPage() {
  const session = await requireAdminOrManager()
  const user = await getCurrentUser()

  return (
    <DashboardLayout role={user?.role === 'admin' ? 'admin' : 'manager'}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Clients</h2>
            <p className="mt-1 text-sm text-gray-500">
              Manage all clients in your organization
            </p>
          </div>
          <button className="bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700">
            + New Client
          </button>
        </div>

        {/* Clients Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <p className="text-sm text-gray-500">No clients yet. Add your first client to get started!</p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

