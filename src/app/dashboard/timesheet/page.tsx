import { Suspense } from 'react'
import DashboardLayout from '@/components/layouts/DashboardLayout'
import UserTimesheetServer from '@/components/user/UserTimesheetServer'
import { requireAuth } from '@/lib/auth'

export const metadata = {
  title: 'Timesheet',
  description: 'Track your weekly time entries',
}

export default async function TimesheetPage() {
  // Require authentication
  const session = await requireAuth()

  // Use actual user role for navigation (same as dashboard page)
  const dashboardRole =
    session.user.role === 'admin' || session.user.role === 'manager'
      ? session.user.role
      : 'user'

  return (
    <DashboardLayout role={dashboardRole}>
      <Suspense fallback={<TimesheetSkeleton />}>
        <UserTimesheetServer userId={session.user.id} firstName={session.user.firstName} />
      </Suspense>
    </DashboardLayout>
  )
}

function TimesheetSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="h-8 w-32 bg-gray-200 rounded" />
      </div>
      <div className="bg-white shadow rounded-lg p-6">
        {/* Week navigation placeholder */}
        <div className="flex justify-between items-center mb-6">
          <div className="h-9 w-24 bg-gray-200 rounded" />
          <div className="flex gap-2">
            <div className="h-9 w-9 bg-gray-200 rounded" />
            <div className="h-9 w-32 bg-gray-200 rounded" />
            <div className="h-9 w-9 bg-gray-200 rounded" />
          </div>
        </div>
        {/* Table placeholder */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="h-12 bg-gray-100" />
          <div className="divide-y divide-gray-100">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="h-14 flex gap-2 p-2" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
