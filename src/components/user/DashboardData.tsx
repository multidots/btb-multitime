import { sanityFetch } from '@/lib/sanity'
import { USER_DASHBOARD_QUERY } from '@/lib/queries'
import { format, startOfWeek, endOfWeek } from 'date-fns'

interface DashboardData {
  user: any
  thisWeekHours: number
  todayHours: number
  runningTimer: any
  recentEntries: Array<{
    _id: string
    project: {
      _id: string
      name: string
      code?: string
      client?: { name: string }
    }
    task?: {
      _id: string
      name: string
      isBillable: boolean
    }
    date: string
    hours: number
    notes?: string
    isBillable: boolean
    isRunning: boolean
    isApproved: boolean
    isLocked: boolean
  }>
}

interface DashboardDataProps {
  userId: string
  currentWeek?: Date
}

export async function getDashboardData({ userId, currentWeek = new Date() }: DashboardDataProps): Promise<DashboardData> {
  const today = new Date()
  const params = {
    userId,
    weekStart: format(startOfWeek(currentWeek), 'yyyy-MM-dd'),
    weekEnd: format(endOfWeek(currentWeek), 'yyyy-MM-dd'),
    today: format(today, 'yyyy-MM-dd'),
  }

  return sanityFetch<DashboardData>({
    query: USER_DASHBOARD_QUERY,
    params
  })
}
