import { getDashboardData } from './DashboardData'
import UserDashboard from './UserDashboard'

interface DashboardServerProps {
  userId: string
}

export default async function DashboardServer({ userId }: DashboardServerProps) {
  // Fetch initial dashboard data on the server
  const initialData = await getDashboardData({ userId })

  return (
    <UserDashboard
      userId={userId}
      initialData={initialData}
    />
  )
}
