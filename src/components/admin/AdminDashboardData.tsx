import { sanityFetch } from '@/lib/sanity'
import { ADMIN_DASHBOARD_QUERY } from '@/lib/queries'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import { DashboardStats } from '@/types'

export async function getAdminDashboardData(): Promise<DashboardStats> {
  const today = new Date()
  const params = {
    weekStart: format(startOfWeek(today), 'yyyy-MM-dd'),
    weekEnd: format(endOfWeek(today), 'yyyy-MM-dd'),
    monthStart: format(startOfMonth(today), 'yyyy-MM-dd'),
    monthEnd: format(endOfMonth(today), 'yyyy-MM-dd'),
  }

  return sanityFetch<DashboardStats>({
    query: ADMIN_DASHBOARD_QUERY,
    params
  })
}
