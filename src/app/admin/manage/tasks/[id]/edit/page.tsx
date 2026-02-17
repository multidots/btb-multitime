'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import DashboardLayout from '@/components/layouts/DashboardLayout'
import { useSession } from 'next-auth/react'
import { FiSave, FiArrowLeft, FiCheckSquare, FiAlertCircle, FiTrash2, FiMoreVertical, FiCopy, FiLoader } from 'react-icons/fi'
import Link from 'next/link'

interface Task {
  _id: string
  name: string
  slug: string
  projects: Array<{
    _id: string
    name: string
    code: string
    client: {
      _id: string
      name: string
    }
  }>
  isBillable: boolean
  category?: {
    _id: string
    name: string
    slug: string
    color?: string
    icon?: string
  }
  createdAt: string
  updatedAt: string
}

interface Category {
  _id: string
  name: string
  slug: string
  description?: string
  color?: string
  icon?: string
}

export default function EditTaskPage() {
  const router = useRouter()
  const params = useParams()
  const { data: session } = useSession()
  const taskId = params.id as string

  const [loading, setLoading] = useState(true)
  
  const userRole = session?.user?.role || 'user'
  const dashboardRole = userRole === 'admin' || userRole === 'manager' ? userRole : 'admin'
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [task, setTask] = useState<Task | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [formData, setFormData] = useState({
    name: '',
    isBillable: true,
    categoryId: ''
  })
  const [errors, setErrors] = useState<string[]>([])
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      if (!target.closest('.dropdown-container')) {
        setIsDropdownOpen(false)
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('click', handleClickOutside)
    }

    return () => {
      document.removeEventListener('click', handleClickOutside)
    }
  }, [isDropdownOpen])

  // Fetch task data
  useEffect(() => {
    fetchCategories()

    if (taskId) {
      fetchTask()
    }
  }, [taskId])

  // Update form data when task is loaded and categories are available
  useEffect(() => {
    if (task && categories.length > 0) {
      setFormData(prev => ({
        ...prev,
        categoryId: task.category?._id || ''
      }))
    }
  }, [task, categories])

  const fetchTask = async () => {
    try {
      // Import sanityFetch dynamically to avoid SSR issues
      const { sanityFetch } = await import('@/lib/sanity')
      const query = `
        *[_type == "task" && _id == $id][0] {
          _id,
          name,
          slug,
          projects[]->{
            _id,
            name,
            code,
            client->{_id, name}
          },
          isBillable,
          category->{
            _id,
            name,
            slug,
            color,
            icon
          },
          createdAt,
          updatedAt
        }
      `
      const taskData = await sanityFetch({ query, params: { id: taskId } })
      if (taskData && typeof taskData === 'object' && '_id' in taskData) {
        setTask(taskData as Task)
        setFormData({
          name: (taskData as Task).name || '',
          isBillable: (taskData as Task).isBillable ?? true,
          categoryId: (taskData as Task).category?._id || ''
        })
      } else {
        setErrors(['Task not found'])
      }
    } catch (error) {
      console.error('Error fetching task:', error)
      setErrors(['Failed to load task'])
    } finally {
      setLoading(false)
    }
  }

  const fetchCategories = async () => {
    try {
      setCategoriesLoading(true)
      // Import sanityFetch dynamically to avoid SSR issues
      const { sanityFetch } = await import('@/lib/sanity')
      const query = `
        *[_type == "category"] | order(name asc) {
          _id,
          name,
          slug,
          description,
          color,
          icon
        }
      `
      const categoriesData = await sanityFetch({ query })
      setCategories(Array.isArray(categoriesData) ? categoriesData : [])
    } catch (error) {
      console.error('Error fetching categories:', error)
    } finally {
      setCategoriesLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
  }

  const validateForm = () => {
    const newErrors: string[] = []

    if (!formData.name.trim()) {
      newErrors.push('Task name is required')
    } else if (formData.name.trim().length < 4) {
      newErrors.push('Task name must be at least 4 characters')
    }

    setErrors(newErrors)
    return newErrors.length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setSaving(true)
    setErrors([])

    try {
      const updateData = {
        name: formData.name.trim(),
        isBillable: formData.isBillable,
        category: formData.categoryId || undefined
      }


      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      })

      if (response.ok) {
        // Refetch the task data to ensure it's updated
        await fetchTask()
        // Signal that data needs to be refreshed
        sessionStorage.setItem('refreshTasks', 'true')
        router.push('/admin/manage?tab=tasks')
      } else {
        const errorData = await response.json()
        setErrors([errorData.error || 'Failed to update task'])
      }
    } catch (error) {
      console.error('Error updating task:', error)
      setErrors(['Failed to update task'])
    } finally {
      setSaving(false)
    }
  }



  const handleDelete = async () => {
    setIsDropdownOpen(false)
    if (confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
      setDeleting(true)
      try {
        const response = await fetch(`/api/tasks/${taskId}`, {
          method: 'DELETE'
        })

        if (response.ok) {
          const data = await response.json()
          alert(data.message || 'Task deleted successfully!')
          router.push('/admin/manage?tab=tasks')
        } else {
          const errorData = await response.json()
          // Build a user-friendly error message
          let errorMessage = errorData.error || 'Unknown error'
          
          // If there are details about references, show them
          if (errorData.details && errorData.details.length > 0) {
            errorMessage += '\n\n' + errorData.details.join('\n')
          }
          
          // Show suggestion if available
          if (errorData.suggestion) {
            errorMessage += '\n\n💡 ' + errorData.suggestion
          }
          
          alert(errorMessage)
        }
      } catch (error) {
        console.error('Error deleting task:', error)
        alert('Failed to delete task: Network error or server unavailable')
      } finally {
        setDeleting(false)
      }
    }
  }

  if (loading) {
    return (
      <DashboardLayout role={dashboardRole}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-500">Loading task...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!task) {
    return (
      <DashboardLayout role={dashboardRole}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <FiAlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-gray-500">Task not found</p>
            <Link
              href="/admin/manage?tab=tasks"
              className="mt-4 inline-flex items-center text-gray-500 hover:text-gray-700"
            >
              Back to Tasks
            </Link>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Link
            href="/admin/manage?tab=tasks"
            className="flex items-center text-gray-500 hover:text-gray-700"
          >
            <FiArrowLeft className="w-5 h-5 mr-2" />
            Back to Tasks
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Edit Task</h2>
                  <p className="text-sm text-gray-500">Update task details and settings</p>
                </div>
              </div>

              {/* Action Dropdown */}
              {task && (
                <div className="relative dropdown-container">
                  <button
                    className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
                    title="Task actions"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  >
                    <FiMoreVertical className="w-5 h-5" />
                  </button>

                  {/* Dropdown Menu */}
                  {isDropdownOpen && (
                    <div className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-10">
                      <div className="py-1">
                        <button
                          className={`flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 ${
                            deleting ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                          onClick={handleDelete}
                          disabled={deleting}
                        >
                          {deleting ? (
                            <FiLoader className="w-4 h-4 mr-3 animate-spin" />
                          ) : (
                            <FiTrash2 className="w-4 h-4 mr-3" />
                          )}
                          {deleting ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Error Messages */}
          {errors.length > 0 && (
            <div className="p-4 bg-red-50 border-l-4 border-red-400">
              <div className="flex">
                <FiAlertCircle className="w-5 h-5 text-red-400" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Please fix the following errors:</h3>
                  <ul className="mt-2 text-sm text-red-700">
                    {errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Task Name *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  minLength={4}
                  value={formData.name}
                  onChange={handleInputChange}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Enter task name (min. 4 characters)"
                />
              </div>


              <div className="md:col-span-2">
                <label htmlFor="categoryId" className="block text-sm font-medium text-gray-700">
                  Category
                </label>
                <select
                  id="categoryId"
                  name="categoryId"
                  value={formData.categoryId}
                  onChange={handleInputChange}
                  disabled={categoriesLoading}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">
                    {categoriesLoading ? 'Loading categories...' : categories.length === 0 ? 'No categories available - create some in Sanity Studio' : 'Select category...'}
                  </option>
                  {categories.map((category) => (
                    <option key={category._id} value={category._id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isBillable"
                  name="isBillable"
                  checked={formData.isBillable}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label htmlFor="isBillable" className="ml-2 block text-sm text-gray-700">
                  Billable
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between pt-6 border-t">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className={`flex items-center space-x-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 ${
                  deleting ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {deleting ? (
                  <FiLoader className="w-4 h-4 animate-spin" />
                ) : (
                  <FiTrash2 className="w-4 h-4" />
                )}
                <span>{deleting ? 'Deleting...' : 'Delete Task'}</span>
              </button>
              <div className="flex items-center space-x-4">
                <Link
                  href="/admin/manage?tab=tasks"
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary flex items-center space-x-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FiSave className="w-4 h-4" />
                  <span>{saving ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  )
}
