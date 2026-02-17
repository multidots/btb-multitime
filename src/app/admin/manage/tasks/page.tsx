'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/layouts/DashboardLayout'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import {
  FiPlus,
  FiCheckSquare,
  FiEdit2,
  FiArchive,
  FiTrash2,
  FiCopy,
  FiSearch,
  FiFilter,
  FiEye,
  FiEyeOff,
  FiFolder,
  FiTag,
  FiFlag
} from 'react-icons/fi'

interface Task {
  _id: string
  name: string
  slug: string
  projects: Array<{
    _id: string
    name: string
    code: string
    client: {
      name: string
    }
  }>
  description?: string
  isBillable: boolean
  isActive: boolean
  isArchived: boolean
  category?: string
  estimatedHours?: number
  createdAt: string
  updatedAt: string
}

interface TaskStats {
  totalTasks: number
  activeTasks: number
  archivedTasks: number
  billableTasks: number
}

export default function ManageTasksPage() {
  const { data: session } = useSession()
  const userRole = session?.user?.role || 'user'
  const dashboardRole = userRole === 'admin' || userRole === 'manager' ? userRole : 'admin'

  return (
    <DashboardLayout role={dashboardRole}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Task Management</h2>
            <p className="mt-1 text-sm text-gray-500">
              Create, edit, archive, and manage project tasks
            </p>
          </div>
          <Link
            href="/admin/manage/tasks/create"
            className="bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700 flex items-center space-x-2"
          >
            <FiPlus className="w-4 h-4" />
            <span>New Task</span>
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6 text-center">
            <FiCheckSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">Task management is now available in the main Manage section.</p>
            <Link
            href="/admin/manage?tab=tasks"
              className="btn-primary inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-600"
            >
            Go to Task Management
                      </Link>
        </div>
      </div>
    </DashboardLayout>
  )
}
