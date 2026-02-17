'use client'

import { Suspense, useState, useEffect } from 'react'
import DashboardLayout from '@/components/layouts/DashboardLayout'
import DetailedTimeReport from '@/components/layouts/report/detailed-time'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { useSession } from 'next-auth/react'

function DetailedReportPageContent() {
  const { data: session } = useSession()
  const [timeReportUrl, setTimeReportUrl] = useState('/dashboard/reports')

  useEffect(() => {
    // Try to get saved params from sessionStorage first
    const savedParams = sessionStorage.getItem('userReportsPageParams')
    
    if (savedParams) {
      setTimeReportUrl(`/dashboard/reports?${savedParams}`)
    } else {
      // Use defaults: tab=clients, kind=month, from/till based on current month
      const now = new Date()
      const defaultParams = new URLSearchParams({
        tab: 'clients',
        kind: 'month',
        from: format(startOfMonth(now), 'yyyy-MM-dd'),
        till: format(endOfMonth(now), 'yyyy-MM-dd')
      })
      setTimeReportUrl(`/dashboard/reports?${defaultParams.toString()}`)
    }
  }, [])

  // Layout role for nav; report is always single-user (logged-in user only)
  const dashboardRole = session?.user?.role === 'admin' || session?.user?.role === 'manager' ? session.user.role : 'user'

  return (
    <DashboardLayout role={dashboardRole}>
      <div className="space-y-6 bg-white rounded-lg shadow p-6">
        {/* Main Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-4">
            <a 
              href={timeReportUrl}
              className="border-b-2 border-transparent text-gray-500 hover:theme-color hover:theme-color-border whitespace-nowrap pb-3 px-1 text-sm font-medium"
            >
              Time
            </a>
            <span className="border-b-2 theme-color theme-color-border whitespace-nowrap pb-3 px-1 text-sm font-medium">
              Detailed time
            </span>
            <a 
              href="/dashboard/reports/saved"
              className="border-b-2 border-transparent text-gray-500 hover:theme-color hover:theme-color-border whitespace-nowrap pb-3 px-1 text-sm font-medium"
            >
              Saved reports
            </a>
          </nav>
        </div>

        {/* Content - Always single-user: only logged-in user's data (userRole="user" ignores URL user[]) */}
        {session?.user?.id ? (
          <DetailedTimeReport userId={session.user.id} userRole="user" />
        ) : session ? (
          <div className="flex items-center justify-center min-h-[200px]">
            <div className="text-gray-500">Loading user...</div>
          </div>
        ) : (
          <div className="flex items-center justify-center min-h-[200px]">
            <div className="text-gray-500">Loading...</div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

export default function DetailedReportPage() {
  return (
    <Suspense fallback={
      <DashboardLayout role="user">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-gray-500">Loading detailed report...</div>
        </div>
      </DashboardLayout>
    }>
      <DetailedReportPageContent />
    </Suspense>
  )
}

