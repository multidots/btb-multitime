import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import DashboardServer from '@/components/user/DashboardServer'
import DashboardLayout from '@/components/layouts/DashboardLayout'
import { requireAuth } from '@/lib/auth'

export const metadata = {
  title: 'Time Tracking',
  description: 'Complete time tracking solution with timer functionality, manual entries, entry management, and week submission',
}

export default async function DashboardPage() {
  // Require authentication
  const session = await requireAuth()

  // Redirect user role to timesheet; admins and managers stay on dashboard
  if (session.user.role === 'user') {
    redirect('/dashboard/timesheet')
  }
  if (session.user.role === 'admin' || session.user.role === 'manager') {
    redirect('/admin')
  }


  // Use actual user role for navigation
  const dashboardRole = session.user.role === 'admin' || session.user.role === 'manager' ? session.user.role : 'user'

  return (
    <DashboardLayout role={dashboardRole}>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardServer userId={session.user.id} />
      </Suspense>
    </DashboardLayout>
  )
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-lg p-6 h-32" />
        ))}
      </div>
      <div className="bg-white rounded-lg p-6 h-96" />
    </div>
  )
}

