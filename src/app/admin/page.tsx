import { Suspense } from 'react'
import AdminDashboardServer from '@/components/admin/AdminDashboardServer'
import DashboardLayout from '@/components/layouts/DashboardLayout'
import { requireAdminOrManager, getCurrentUser } from '@/lib/auth'

export const metadata = {
  title: 'Dashboard',
  description: 'Admin dashboard for managing projects, teams, and viewing analytics',
}

export default async function AdminPage() {
  // Require admin or manager role
  const session = await requireAdminOrManager()
  const user = await getCurrentUser()

  return (
    <DashboardLayout role={user?.role === 'admin' ? 'admin' : 'manager'}>
      <Suspense fallback={<DashboardSkeleton />}>
        <AdminDashboardServer />
      </Suspense>
    </DashboardLayout>
  )
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-lg p-6 h-32" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg p-6 h-96" />
        <div className="bg-white rounded-lg p-6 h-96" />
      </div>
    </div>
  )
}

