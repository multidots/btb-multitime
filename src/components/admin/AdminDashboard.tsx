'use client'

import { useEffect, useState, useMemo } from 'react'
import { FiFolder, FiUsers, FiBriefcase, FiClock, FiTrendingUp, FiAlertCircle } from 'react-icons/fi'
import { sanityFetch } from '@/lib/sanity'
import { ADMIN_DASHBOARD_QUERY } from '@/lib/queries'
import { formatSimpleTime, formatDecimalHours } from '@/lib/time'
import { DashboardStats } from '@/types'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'

interface AdminDashboardProps {
  initialStats?: DashboardStats
}

export default function AdminDashboard({ initialStats }: AdminDashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const today = new Date()
        const params = {
          weekStart: format(startOfWeek(today), 'yyyy-MM-dd'),
          weekEnd: format(endOfWeek(today), 'yyyy-MM-dd'),
          monthStart: format(startOfMonth(today), 'yyyy-MM-dd'),
          monthEnd: format(endOfMonth(today), 'yyyy-MM-dd'),
        }

        const data = await sanityFetch<DashboardStats>({
          query: ADMIN_DASHBOARD_QUERY,
          params,
        })

        setStats(data)
      } catch (error) {
        console.error('Error fetching dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
  }, [])

  // Flatten timesheet entries into a single list (no array::flatten in GROQ), sort by date desc, take 9
  const recentTimeEntries = useMemo(() => {
    const sheets = stats?.recentTimesheets ?? []
    const flat = sheets.flatMap((ts) =>
      (ts.entries ?? []).map((ent) => ({
        _id: `${ent._key}^${ts._id}`,
        user: ts.user,
        project: ent.project,
        date: ent.date ?? '',
        hours: ent.hours ?? 0,
        isBillable: ent.isBillable,
      }))
    )
    return flat.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 9)
  }, [stats?.recentTimesheets])

  if (loading) {
    return <div>Loading...</div>
  }

  const statCards = [
    {
      name: 'Active Projects',
      value: stats?.activeProjects || 0,
      total: stats?.totalProjects || 0,
      icon: FiFolder,
      color: 'bg-blue-500',
    },
    {
      name: 'Members',
      value: stats?.totalUsers || 0,
      icon: FiUsers,
      color: 'bg-green-500',
    },
    {
      name: 'Clients',
      value: stats?.totalClients || 0,
      icon: FiBriefcase,
      color: 'bg-purple-500',
    },
    {
      name: 'Approved Hours - ' + format(new Date(), 'MMM'),
      value: formatSimpleTime(stats?.thisMonthHours || 0),
      icon: FiClock,
      color: 'theme-color-bg',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <div
            key={stat.name}
            className="relative overflow-hidden bg-white rounded-lg shadow-custom transition-all duration-300 hover:-translate-y-1"
          >
            <div className="p-6">
              <div className="flex items-center">
                <div className={`flex-shrink-0 rounded-md p-3 ${stat.color}`}>
                  <stat.icon className="w-6 h-6 text-white" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      {stat.name}
                    </dt>
                    <dd className="flex items-baseline">
                      <div className="text-2xl font-semibold text-gray-900">
                        {stat.value}
                      </div>
                      {'total' in stat && (
                        <div className="ml-2 text-sm text-gray-500">
                          / {stat.total}
                        </div>
                      )}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {/* {(stats?.pendingTimeEntries || 0) > 0 && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg">
          <div className="flex">
            <FiAlertCircle className="h-5 w-5 text-yellow-400" />
            <div className="ml-3 flex-1">
              <p className="text-sm text-yellow-700">
                You have <strong>{stats?.pendingTimeEntries}</strong> time entries pending approval.
              </p>
            </div>
            <div className="ml-3">
              <a
                href="/admin/time-entries?tab=Pending%20Approval"
                className="inline-flex items-center px-3 py-1.5 border border-yellow-300 text-sm font-medium rounded-md text-yellow-800 bg-yellow-100 hover:bg-yellow-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
              >
                View Pending
              </a>
            </div>
          </div>
        </div>
      )} */}

      {/* Recent Projects and Time Entries */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Projects */}
        <div className="bg-white rounded-lg shadow-custom">
          <div className="p-6 border-b py-2">
            <h3 className="text-lg font-semibold text-gray-900">Recent Projects</h3>
          </div>
          <div className="p-6 pt-1 overflow-y-auto">
            {stats?.recentProjects && stats.recentProjects.length > 0 ? (
              <div className="space-y-0 h-[280px]">
                {stats.recentProjects.map((project) => (
                  <div
                    key={project._id}
                    className="flex items-center justify-between py-2 border-b last:border-b-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900 capitalize">
                        {project.code ? `[${project.code}] ` : ''}
                        {project.name}
                      </p>
                      <p className="text-sm text-gray-500">
                        {project.client?.name}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        project.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : project.status === 'planning'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {project.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm mt-4 text-gray-500">No recent projects</p>
            )}
          </div>
        </div>

        {/* Recent Timesheet Entries */}
        <div className="bg-white rounded-lg shadow-custom">
          <div className="p-6 border-b py-2">
            <h3 className="text-lg font-semibold text-gray-900">Recent Timesheet Entries</h3>
          </div>
          <div className="p-6 pt-1 overflow-y-auto">
            {recentTimeEntries.length > 0 ? (
              <div className="space-y-0 h-[280px]">
                {recentTimeEntries.map((entry) => (
                  <div
                    key={entry._id}
                    className="flex items-center justify-between py-2 border-b last:border-b-0"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center text-xs font-medium text-white uppercase">
                          {entry.user?.firstName?.[0]}
                          {entry.user?.lastName?.[0]}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 capitalize">
                          {entry.user?.firstName} {entry.user?.lastName}
                        </p>
                        <p className="text-sm text-gray-500">
                          {entry.project?.name}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900 capitalize">
                        {formatSimpleTime(entry.hours)}
                      </p>
                      <p className="text-xs text-gray-500">{entry.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 mt-4">No recent timesheet entries</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

