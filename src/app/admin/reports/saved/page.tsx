'use client'

import { Suspense, useState, useEffect } from 'react'
import DashboardLayout from '@/components/layouts/DashboardLayout'
import SavedReports from '@/components/layouts/report/saved-reports'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { usePageTitle } from '@/lib/pageTitleImpl'

function SavedReportsPageContent() {
  const [timeReportUrl, setTimeReportUrl] = useState('/admin/reports')
  usePageTitle('Saved Reports')

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
            <a 
              href="/admin/reports/detailed"
              className="border-b-2 border-transparent text-gray-500 hover:theme-color hover:theme-color-border whitespace-nowrap pb-3 px-1 text-sm font-medium"
            >
              Detailed time
            </a>
            <span className="border-b-2 theme-color theme-color-border whitespace-nowrap pb-3 px-1 text-sm font-medium">
              Saved reports
            </span>
          </nav>
        </div>

        {/* Content */}
        <SavedReports basePath="/admin/reports" />
      </div>
    </DashboardLayout>
  )
}

export default function SavedReportsPage() {
  return (
    <Suspense fallback={
      <DashboardLayout role="admin">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-gray-500">Loading saved reports...</div>
        </div>
      </DashboardLayout>
    }>
      <SavedReportsPageContent />
    </Suspense>
  )
}
