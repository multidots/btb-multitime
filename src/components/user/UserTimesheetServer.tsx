import UserTimesheet from '@/components/user/UserTimesheet'
import { getTimesheetData } from '@/components/user/TimesheetData'

interface UserTimesheetServerProps {
  userId: string
  firstName?: string
}

/**
 * Server component for the single-user timesheet.
 * Mirrors DashboardServer: fetches initial data on the server and passes to client for fast first paint.
 */
export default async function UserTimesheetServer({ userId, firstName }: UserTimesheetServerProps) {
  const initialData = await getTimesheetData({ userId })

  return <UserTimesheet userId={userId} initialData={initialData} firstName={firstName} />
}
