'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import DashboardLayout from '@/components/layouts/DashboardLayout'
import { useSession } from 'next-auth/react'
import TimesheetWeekly from '@/components/admin/timesheets/TimesheetWeekly'
import TimesheetPendingApproval from '@/components/admin/timesheets/PendingApproval'
import TimesheetUnsubmitted from '@/components/admin/timesheets/Unsubmitted'
import TimesheetApproved from '@/components/admin/timesheets/Approved'
import { setPageTitle } from '@/lib/pageTitle'

type Tab = 'Timesheet' | 'Pending Approval' | 'Unsubmitted' | 'Approved'

const TabButton: React.FC<{ activeTab: Tab; tab: Tab; onClick: (tab: Tab) => void }> = ({
  activeTab,
  tab,
  onClick,
}) => (
  <button
    onClick={() => onClick(tab)}
    className={`px-4 py-2 text-sm font-medium ${
      activeTab === tab
        ? 'theme-color border-b-2 theme-color-border font-semibold'
        : 'text-gray-500 hover:theme-color'
    }`}
  >
    {tab}
  </button>
)

function AdminTimesheetsContent() {
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const tabQuery = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState<Tab>('Timesheet')
  const userRole = session?.user?.role || 'user'
  const dashboardRole = userRole === 'admin' || userRole === 'manager' ? userRole : 'admin'
  const isAdmin = userRole === 'admin'

  const renderContent = () => {
    return (
      <>
        {activeTab === 'Timesheet' && <TimesheetWeekly />}
        {activeTab === 'Pending Approval' && <TimesheetPendingApproval />}
        {activeTab === 'Unsubmitted' && <TimesheetUnsubmitted />}
        {activeTab === 'Approved' && <TimesheetApproved />}
      </>
    )
  }

  useEffect(() => {
    setPageTitle('Timesheets')
  }, [])

  useEffect(() => {
    const validTabs = ['Timesheet', 'Pending Approval', 'Unsubmitted']
    if (isAdmin) {
      validTabs.push('Approved')
    }
    if (tabQuery && validTabs.includes(tabQuery)) {
      setActiveTab(tabQuery as Tab)
    }
  }, [tabQuery, isAdmin])

  return (
    <DashboardLayout role={dashboardRole}>
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-custom p-6">
          <h1 className="text-2xl font-bold text-gray-900">Timesheets</h1>
          <p className="text-gray-600 mt-1">
            Manage and review weekly timesheets.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-custom">
          <div className="border-b border-gray-200 overflow-hidden overflow-x-auto">
            <nav className="-mb-px flex space-x-6 px-6" aria-label="Tabs">
              <TabButton activeTab={activeTab} tab="Timesheet" onClick={setActiveTab} />
              <TabButton activeTab={activeTab} tab="Pending Approval" onClick={setActiveTab} />
              <TabButton activeTab={activeTab} tab="Unsubmitted" onClick={setActiveTab} />
              {isAdmin && <TabButton activeTab={activeTab} tab="Approved" onClick={setActiveTab} />}
            </nav>
          </div>
          <div className="p-6">{renderContent()}</div>
        </div>
      </div>
    </DashboardLayout>
  )
}

export default function AdminTimesheetsPage() {
  return (
    <Suspense fallback={
      <DashboardLayout role="admin">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      </DashboardLayout>
    }>
      <AdminTimesheetsContent />
    </Suspense>
  )
}
