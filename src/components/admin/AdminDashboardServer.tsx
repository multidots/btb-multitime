import { getAdminDashboardData } from './AdminDashboardData'
import AdminDashboard from './AdminDashboard'

export default async function AdminDashboardServer() {
  // Fetch initial admin dashboard data on the server
  const initialStats = await getAdminDashboardData()

  return (
    <AdminDashboard
      initialStats={initialStats}
    />
  )
}
