'use client'

import TimesheetWeekly from '@/components/admin/timesheets/TimesheetWeekly'
import type { TimesheetDataResult } from './TimesheetData'

interface UserTimesheetProps {
  userId: string
  initialData?: TimesheetDataResult | null
  firstName?: string
}

/**
 * Client wrapper for the single-user timesheet.
 * Mirrors UserDashboard: receives userId + initialData from server, passes to TimesheetWeekly for fast first paint and refetch.
 */
export default function UserTimesheet({ userId, initialData, firstName }: UserTimesheetProps) {
  return (
    <div className="space-y-6">
      {firstName != null && firstName !== '' && (
        <div className="bg-white rounded-lg shadow-custom p-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {firstName}!
          </h1>
        </div>
      )}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Timesheet</h2>
      </div>
      <div className="bg-white shadow rounded-lg p-6">
        <TimesheetWeekly userId={userId} initialData={initialData} />
      </div>
    </div>
  )
}
