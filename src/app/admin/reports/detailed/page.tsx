'use client'

import { Suspense, useState, useEffect } from 'react'
import DashboardLayout from '@/components/layouts/DashboardLayout'
import DetailedTimeReport from '@/components/layouts/report/detailed-time'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { useSession } from 'next-auth/react'
import { usePageTitle } from '@/lib/pageTitleImpl'

function DetailedReportPageContent() {
  const { data: session } = useSession()
  const [timeReportUrl, setTimeReportUrl] = useState('/admin/reports')
  usePageTitle('Detailed Time Report')

  useEffect(() => {
    // Try to get saved params from sessionStorage first
    const savedParams = sessionStorage.getItem('reportsPageParams')
    
    if (savedParams) {
      setTimeReportUrl(`/admin/reports?${savedParams}`)
    } else {
      // Use defaults: tab=clients, kind=month, from/till based on current month
      const now = new Date()
      const defaultParams = new URLSearchParams({
        tab: 'clients',
        kind: 'month',
        from: format(startOfMonth(now), 'yyyy-MM-dd'),
        till: format(endOfMonth(now), 'yyyy-MM-dd')
      })
      setTimeReportUrl(`/admin/reports?${defaultParams.toString()}`)
    }
  }, [])

  return (
    <DashboardLayout role="admin">
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
              href="/admin/reports/saved"
              className="border-b-2 border-transparent text-gray-500 hover:theme-color hover:theme-color-border whitespace-nowrap pb-3 px-1 text-sm font-medium"
            >
              Saved reports
            </a>
          </nav>
        </div>

        {/* Content */}
        {session ? (
          <DetailedTimeReport userRole={session?.user?.role} userId={session?.user?.id} />
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
      <DashboardLayout role="admin">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-gray-500">Loading detailed report...</div>
        </div>
      </DashboardLayout>
    }>
      <DetailedReportPageContent />
    </Suspense>
  )
}
