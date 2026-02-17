'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/layouts/DashboardLayout'
import { useSession } from 'next-auth/react'
import { FiSave, FiArrowLeft, FiCheckSquare, FiAlertCircle } from 'react-icons/fi'
import Link from 'next/link'

interface Category {
  _id: string
  name: string
  slug: string
  description?: string
  color?: string
  icon?: string
}

export default function CreateTaskPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [formData, setFormData] = useState({
    name: '',
    isBillable: true,
    categoryId: ''
  })
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    fetchCategories()
  }, [])

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

    setLoading(true)
    setErrors([])

    try {
      const taskData = {
        name: formData.name.trim(),
        projectIds: [],
        isBillable: formData.isBillable,
        category: formData.categoryId || undefined
      }

      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData)
      })

      if (response.ok) {
        // Signal that data needs to be refreshed
        sessionStorage.setItem('refreshTasks', 'true')
        router.push('/admin/manage?tab=tasks')
      } else {
        const errorData = await response.json()
        setErrors([errorData.error || 'Failed to create task'])
      }
    } catch (error) {
      console.error('Error creating task:', error)
      setErrors(['Failed to create task'])
    } finally {
      setLoading(false)
    }
  }

  return (
    <DashboardLayout role={session?.user?.role === 'admin' ? 'admin' : 'manager'}>
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
            <div className="flex items-center space-x-3">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Create New Task</h2>
                <p className="text-sm text-gray-500">Create a new task for project tracking</p>
              </div>
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
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-transparent focus:border-black outline-none"
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
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-transparent focus:border-black outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
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
                  className="w-4 h-4 rounded border-gray-300 theme-color focus:ring-transparent focus:border-black"
                />
                <label htmlFor="isBillable" className="ml-2 block text-sm text-gray-700">
                  Billable
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-4 pt-6 border-t">
              <Link
                href="/admin/manage?tab=tasks"
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary flex items-center space-x-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FiSave className="w-4 h-4" />
                <span>{loading ? 'Creating...' : 'Create Task'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  )
}
