'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { useRouter, useParams } from 'next/navigation'
import DashboardLayout from '@/components/layouts/DashboardLayout'
import { useSession } from 'next-auth/react'
import { FiSave, FiArrowLeft, FiBriefcase, FiX, FiTrash2, FiMoreVertical, FiLoader } from 'react-icons/fi'
import Link from 'next/link'

interface Contact {
  _key?: string
  firstName: string
  lastName: string
  email: string
  title?: string
  officePhone?: string
  mobilePhone?: string
  faxNumber?: string
  isPrimary: boolean
}

interface Project {
  _id: string
  name: string
  code?: string
  status: string
  isActive: boolean
  createdAt: string
}

interface Client {
  _id: string
  name: string
  contacts?: Contact[]
  address?: string
  preferredCurrency?: string
  isActive: boolean
  isArchived?: boolean
}

export default function EditClientPage() {
  const router = useRouter()
  const params = useParams()
  const { data: session } = useSession()
  const clientId = params.id as string

  const [loading, setLoading] = useState(false)
  const [fetchLoading, setFetchLoading] = useState(true)
  const [archiving, setArchiving] = useState(false)
  const [client, setClient] = useState<Client | null>(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [errors, setErrors] = useState<{
    name?: string
    preferredCurrency?: string
    contacts?: { [key: number]: { firstName?: string; lastName?: string; email?: string } }
  }>({})
  const [formData, setFormData] = useState({
    name: '',
    contacts: [] as Contact[],
    address: '',
    preferredCurrency: 'USD',
    isActive: true,
    isArchived: false,
  })

  const fetchClient = useCallback(async () => {
    try {
      setFetchLoading(true)
      // Import sanityFetch dynamically to avoid SSR issues
      const { sanityFetch } = await import('@/lib/sanity')
      const query = `
        *[_type == "client" && _id == $id][0] {
          _id,
          name,
          slug,
          contacts,
          address,
          preferredCurrency,
          isActive,
          createdAt
        }
      `
      const clientData = await sanityFetch({ query, params: { id: clientId } })
      if (clientData && typeof clientData === 'object' && '_id' in clientData) {
        setClient(clientData as Client)
        // Ensure all contacts have _key property
        const contacts = ((clientData as Client).contacts || []).map((contact, index) => ({
          ...contact,
          _key: contact._key || `contact-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        }))
        
        setFormData({
          name: (clientData as Client).name || '',
          contacts: contacts,
          address: (clientData as Client).address || '',
          preferredCurrency: (clientData as Client).preferredCurrency || 'USD',
          isActive: (clientData as Client).isActive ?? true,
          isArchived: (clientData as Client).isArchived ?? false,
        })
      } else {
        console.error('Failed to fetch client')
      }
    } catch (error) {
      console.error('Error fetching client:', error)
    } finally {
      setFetchLoading(false)
    }
  }, [clientId])

  const fetchProjects = useCallback(async () => {
    try {
      setProjectsLoading(true)
      // Import sanityFetch dynamically to avoid SSR issues
      const { sanityFetch } = await import('@/lib/sanity')
      const query = `
        *[_type == "project" && client._ref == $clientId] {
          _id,
          name,
          code,
          status,
          isActive,
          createdAt
        }
      `
      const projectsData = await sanityFetch({ query, params: { clientId } })
      setProjects(Array.isArray(projectsData) ? projectsData : [])
    } catch (error) {
      console.error('Error fetching projects:', error)
    } finally {
      setProjectsLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    fetchClient()
    fetchProjects()
  }, [fetchClient, fetchProjects])

  // Separate active and archived projects
  const activeProjects = projects.filter(project => project.isActive)
  const archivedProjects = projects.filter(project => !project.isActive)

  // Check if client can be archived
  const canArchiveClient = activeProjects.length === 0

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

  const handleArchive = useCallback(async () => {
    setIsDropdownOpen(false)
    if (confirm('Are you sure you want to archive this client? This will deactivate the client and prevent new projects from being assigned to it.')) {
      setArchiving(true)
      try {
        const response = await fetch(`/api/clients/${clientId}`, {
          method: 'DELETE'
        })

        if (response.ok) {
          const data = await response.json()
          alert(data.message || 'Client archived successfully!')
          router.push('/admin/manage?tab=clients')
        } else {
          const errorData = await response.json()
          alert(`Failed to archive client: ${errorData.error || 'Unknown error'}`)
        }
      } catch (error) {
        console.error('Error archiving client:', error)
        alert('Failed to archive client')
      } finally {
        setArchiving(false)
      }
    }
  }, [clientId, router])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    // Clear errors when user starts typing
    if (errors[name as keyof typeof errors]) {
      setErrors(prev => ({
        ...prev,
        [name]: undefined
      }))
    }
  }, [errors])

  const handleContactChange = useCallback((index: number, field: keyof Contact, value: string | boolean) => {
    setFormData(prev => {
      let updatedContacts = prev.contacts.map((contact, i) =>
        i === index ? { ...contact, [field]: value } : contact
      )
      
      // If setting a contact as primary, uncheck all other primary contacts
      if (field === 'isPrimary' && value === true) {
        updatedContacts = updatedContacts.map((contact, i) =>
          i === index ? contact : { ...contact, isPrimary: false }
        )
      }
      
      return {
        ...prev,
        contacts: updatedContacts
      }
    })
    // Clear contact-specific errors when user starts typing
    if (errors.contacts?.[index]?.[field as keyof typeof errors.contacts[0]]) {
      setErrors(prev => ({
        ...prev,
        contacts: {
          ...prev.contacts,
          [index]: {
            ...prev.contacts?.[index],
            [field]: undefined
          }
        }
      }))
    }
  }, [errors.contacts])

  const addContact = useCallback(() => {
    const newContact: Contact = {
      _key: `contact-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      firstName: '',
      lastName: '',
      email: '',
      title: '',
      officePhone: '',
      mobilePhone: '',
      faxNumber: '',
      isPrimary: false,
    }

    setFormData(prev => ({
      ...prev,
      contacts: [...prev.contacts, newContact]
    }))
  }, [])

  const removeContact = useCallback((index: number) => {
    if (!confirm('Are you sure you want to remove this contact?')) {
      return
    }
    setFormData(prev => ({
      ...prev,
      contacts: prev.contacts.filter((_, i) => i !== index)
    }))
  }, [])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()

    // Reset errors
    setErrors({})

    // Validate required fields
    const newErrors: typeof errors = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Client name is required'
    }

    if (!formData.preferredCurrency) {
      newErrors.preferredCurrency = 'Preferred currency is required'
    }

    // Validate contacts
    const contactErrors: { [key: number]: { firstName?: string; lastName?: string; email?: string } } = {}
    for (let i = 0; i < formData.contacts.length; i++) {
      const contact = formData.contacts[i]
      const contactError: { firstName?: string; lastName?: string; email?: string } = {}

      if (!contact.firstName.trim()) {
        contactError.firstName = 'First name is required'
      }
      if (!contact.lastName.trim()) {
        contactError.lastName = 'Last name is required'
      }
      if (!contact.email.trim()) {
        contactError.email = 'Email is required'
      } else {
        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(contact.email.trim())) {
          contactError.email = 'Please enter a valid email address'
        }
      }

      if (Object.keys(contactError).length > 0) {
        contactErrors[i] = contactError
      }
    }

    if (Object.keys(contactErrors).length > 0) {
      newErrors.contacts = contactErrors
    }

    // Ensure only one primary contact
    const primaryContacts = formData.contacts.filter(contact => contact.isPrimary)
    if (primaryContacts.length > 1) {
      // For primary contact validation, we'll show it as a general error
      newErrors.name = 'Only one primary contact is allowed'
    }

    // If there are errors, set them, scroll to top, and return
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      // Scroll to top to show error message
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setLoading(true)

    try {

      const response = await fetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          contacts: formData.contacts,
          address: formData.address,
          preferredCurrency: formData.preferredCurrency,
          isActive: formData.isActive,
          isArchived: formData.isArchived,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        alert('Client updated successfully!')
        // Signal that data needs to be refreshed
        sessionStorage.setItem('refreshClients', 'true')
        router.push('/admin/manage?tab=clients')
      } else {
        const errorData = await response.json()
        alert(`Error: ${errorData.error || 'Failed to update client'}`)
      }
    } catch (error) {
      console.error('Error updating client:', error)
      alert('Failed to update client')
    } finally {
      setLoading(false)
    }
  }, [formData, clientId, router])

  if (fetchLoading) {
    return (
      <DashboardLayout role={session?.user?.role === 'admin' ? 'admin' : 'manager'}>
        <div className="flex items-center justify-center min-h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p>Loading client...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!client) {
    return (
      <DashboardLayout role={session?.user?.role === 'admin' ? 'admin' : 'manager'}>
        <div className="text-center py-12">
          <p>Client not found</p>
          <Link href="/admin/manage?tab=clients" className="flex items-center text-gray-500 hover:text-gray-700">
            Back to Clients
          </Link>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout role="admin">
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Link
            href="/admin/manage?tab=clients"
            className="flex items-center text-gray-500 hover:text-gray-700"
          >
            <FiArrowLeft className="w-5 h-5 mr-2" />
            Back to Clients
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <FiBriefcase className="w-6 h-6 theme-color" />
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Edit Client</h2>
                  <p className="text-sm text-gray-500">Update client information and contacts</p>
                </div>
              </div>

              {/* Action Dropdown */}
              {client && (
                <div className="relative dropdown-container">
                  <button
                    className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
                    title="Client actions"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  >
                    <FiMoreVertical className="w-5 h-5" />
                  </button>

                  {/* Dropdown Menu */}
                  {isDropdownOpen && (
                    <div className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-10">
                      <div className="py-1">
                        <button
                          className={`flex items-center w-full px-4 py-2 text-sm ${
                            canArchiveClient
                              ? 'text-red-600 hover:bg-red-50 hover:text-red-700'
                              : 'text-gray-400 cursor-not-allowed'
                          }`}
                          onClick={canArchiveClient ? handleArchive : undefined}
                          disabled={!canArchiveClient}
                          title={!canArchiveClient ? 'Cannot archive client with active projects' : 'Archive client'}
                        >
                          <FiTrash2 className="w-4 h-4 mr-3" />
                          {canArchiveClient ? 'Archive Client' : 'Cannot Archive'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="p-6">
            {/* Two Column Layout for Basic Info and Projects */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Left Column - Basic Client Information */}
              <div className="space-y-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                      Client Name *
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      required
                      value={formData.name}
                      onChange={handleInputChange}
                      className={`mt-1 block w-full rounded-md shadow-sm focus:ring-transparent focus:border-black outline-none ${
                        errors.name ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300'
                      }`}
                      placeholder="Enter client name"
                    />
                    {errors.name && (
                      <p className="mt-1 text-sm text-red-600">{errors.name}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="address" className="block text-sm font-medium text-gray-700">
                      Address
                    </label>
                    <textarea
                      id="address"
                      name="address"
                      rows={4}
                      value={formData.address}
                      onChange={handleInputChange}
                      className="mt-1 block w-full rounded-md shadow-sm border border-gray-300 focus:ring-transparent focus:border-black outline-none"
                      placeholder="Street address, city, state, zip code"
                    />
                  </div>

                  <div>
                    <label htmlFor="preferredCurrency" className="block text-sm font-medium text-gray-700">
                      Preferred Currency *
                    </label>
                    <select
                      id="preferredCurrency"
                      name="preferredCurrency"
                      required
                      value={formData.preferredCurrency || 'USD'}
                      onChange={handleInputChange}
                      className={`mt-1 block w-full rounded-md shadow-sm focus:ring-transparent focus:border-black outline-none ${
                        errors.preferredCurrency ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300'
                      }`}
                    >
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="JPY">JPY (¥)</option>
                      <option value="CAD">CAD (C$)</option>
                      <option value="AUD">AUD (A$)</option>
                      <option value="CHF">CHF (CHF)</option>
                      <option value="CNY">CNY (¥)</option>
                      <option value="SEK">SEK (kr)</option>
                      <option value="NZD">NZD (NZ$)</option>
                    </select>
                    {errors.preferredCurrency && (
                      <p className="mt-1 text-sm text-red-600">{errors.preferredCurrency}</p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="isActive"
                          checked={formData.isActive}
                          onChange={(e) => {
                            const isActive = e.target.checked
                            setFormData(prev => ({ ...prev, isActive }))
                          }}
                          className="h-4 w-4 rounded focus:ring-transparent focus:border-black outline-none theme-color border-gray-300"
                        />
                        <label htmlFor="isActive" className="ml-2 block text-sm text-gray-700">
                          Active Client
                        </label>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {formData.isActive
                        ? 'Client is active and can accept new projects'
                        : 'Client is inactive but not archived'
                      }
                    </p>
                  </div>
                </form>
              </div>

              {/* Right Column - Project Details and Archive Info */}
              <div className="space-y-6">
                {/* Projects Information */}
                <div className="border-t pt-6">
                  {/* Active Projects */}
                  <div className="mb-6">
                    <h4 className="text-md font-medium text-gray-900 mb-3 flex items-center">
                      <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                      Active Projects ({activeProjects.length})
                    </h4>
                    {projectsLoading ? (
                      <div className="text-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mx-auto mb-2"></div>
                        <p className="text-sm text-gray-500">Loading projects...</p>
                      </div>
                    ) : activeProjects.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {activeProjects.map((project) => (
                          <div key={project._id} className="border border-green-200 bg-green-50 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-green-900 truncate">
                                  {project.code ? `[${project.code}] ${project.name}` : project.name}
                                </p>
                                <p className="text-xs text-green-700 mt-1">
                                  Status: {project.status} • Created: {format(new Date(project.createdAt), 'MMM d, yyyy')}
                                </p>
                              </div>
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                Active
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                        <p className="text-gray-500">No active projects</p>
                      </div>
                    )}
                  </div>

                  {/* Archived Projects */}
                  <div className="mb-6">
                    <h4 className="text-md font-medium text-gray-900 mb-3 flex items-center">
                      <span className="w-3 h-3 bg-gray-400 rounded-full mr-2"></span>
                      Archived Projects ({archivedProjects.length})
                    </h4>
                    {projectsLoading ? (
                      <div className="text-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mx-auto mb-2"></div>
                        <p className="text-sm text-gray-500">Loading projects...</p>
                      </div>
                    ) : archivedProjects.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {archivedProjects.map((project) => (
                          <div key={project._id} className="border border-gray-200 bg-gray-50 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {project.code ? `[${project.code}] ${project.name}` : project.name}
                                </p>
                                <p className="text-xs text-gray-600 mt-1">
                                  Status: {project.status} • Created: {format(new Date(project.createdAt), 'MMM d, yyyy')}
                                </p>
                              </div>
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                Archived
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                        <p className="text-gray-500">No archived projects</p>
                      </div>
                    )}
                  </div>
                  {/* Client Status Info Box */}
                  <div className={`mb-6 p-4 rounded-lg border ${canArchiveClient
                    ? 'bg-green-50 border-green-200 text-green-800'
                    : 'bg-yellow-50 border-yellow-200 text-yellow-800'
                    }`}>
                    <div className="flex items-start">
                      <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ${canArchiveClient ? 'bg-green-100' : 'bg-yellow-100'
                        }`}>
                        <span className={`text-xs font-medium ${canArchiveClient ? 'text-green-800' : 'text-yellow-800'
                          }`}>
                          {canArchiveClient ? '✓' : '⚠'}
                        </span>
                      </div>
                      <div className="ml-3">
                        <h4 className="font-medium">
                          {canArchiveClient ? 'Client can be archived' : 'Client cannot be archived'}
                        </h4>
                        <p className="text-sm mt-1">
                          {canArchiveClient
                            ? 'This client has no active projects and can be safely archived.'
                            : `This client has ${activeProjects.length} active project${activeProjects.length > 1 ? 's' : ''} that must be completed or archived before the client can be archived.`
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Full Width - Contacts Section */}
            <div className="border-t pt-6 mb-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Contacts</h3>
                <button
                  type="button"
                  onClick={addContact}
                  className="btn-primary px-4 py-2 text-sm font-semibold rounded-md hover:bg-blue-700"
                >
                  Add Contact
                </button>
              </div>

              {formData.contacts.length > 0 ? (
                <div className="space-y-6">
                  {formData.contacts.map((contact, index) => (
                    <div key={contact._key || index} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-md font-medium text-gray-900">Contact {index + 1}</h4>
                        <button
                          type="button"
                          onClick={() => removeContact(index)}
                          className="text-red-600 hover:text-red-800 p-1"
                          title="Remove contact"
                        >
                          <FiX className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            First Name *
                          </label>
                          <input
                            type="text"
                            value={contact.firstName}
                            onChange={(e) => handleContactChange(index, 'firstName', e.target.value)}
                            className={`mt-1 block w-full rounded-md shadow-sm focus:ring-transparent focus:border-black outline-none ${
                              errors.contacts?.[index]?.firstName ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300'
                            }`}
                            required
                          />
                          {errors.contacts?.[index]?.firstName && (
                            <p className="mt-1 text-sm text-red-600">{errors.contacts[index].firstName}</p>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            Last Name *
                          </label>
                          <input
                            type="text"
                            value={contact.lastName}
                            onChange={(e) => handleContactChange(index, 'lastName', e.target.value)}
                            className={`mt-1 block w-full rounded-md shadow-sm focus:ring-transparent focus:border-black outline-none ${
                              errors.contacts?.[index]?.lastName ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300'
                            }`}
                            required
                          />
                          {errors.contacts?.[index]?.lastName && (
                            <p className="mt-1 text-sm text-red-600">{errors.contacts[index].lastName}</p>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            Email *
                          </label>
                          <input
                            type="email"
                            value={contact.email}
                            onChange={(e) => handleContactChange(index, 'email', e.target.value)}
                            className={`mt-1 block w-full rounded-md shadow-sm focus:ring-transparent focus:border-black outline-none ${
                              errors.contacts?.[index]?.email ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300'
                            }`}
                            required
                          />
                          {errors.contacts?.[index]?.email && (
                            <p className="mt-1 text-sm text-red-600">{errors.contacts[index].email}</p>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            Title
                          </label>
                          <input
                            type="text"
                            value={contact.title || ''}
                            onChange={(e) => handleContactChange(index, 'title', e.target.value)}
                            className="mt-1 block w-full rounded-md shadow-sm focus:ring-transparent focus:border-black outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            Office Phone
                          </label>
                          <input
                            type="tel"
                            value={contact.officePhone || ''}
                            onChange={(e) => handleContactChange(index, 'officePhone', e.target.value)}
                            className="mt-1 block w-full rounded-md shadow-sm focus:ring-transparent focus:border-black outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            Mobile Phone
                          </label>
                          <input
                            type="tel"
                            value={contact.mobilePhone || ''}
                            onChange={(e) => handleContactChange(index, 'mobilePhone', e.target.value)}
                            className="mt-1 block w-full rounded-md shadow-sm focus:ring-transparent focus:border-black outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            Fax Number
                          </label>
                          <input
                            type="tel"
                            value={contact.faxNumber || ''}
                            onChange={(e) => handleContactChange(index, 'faxNumber', e.target.value)}
                            className="mt-1 block w-full rounded-md shadow-sm focus:ring-transparent focus:border-black outline-none"
                          />
                        </div>

                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id={`primary-${index}`}
                            checked={contact.isPrimary}
                            onChange={(e) => handleContactChange(index, 'isPrimary', e.target.checked)}
                            disabled={formData.contacts.some((c, i) => i !== index && c.isPrimary)}
                            className="h-4 w-4 theme-color border-gray-300 rounded focus:ring-transparent focus:border-black outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                          <label htmlFor={`primary-${index}`} className={`ml-2 block text-sm ${formData.contacts.some((c, i) => i !== index && c.isPrimary) ? 'text-gray-400' : 'text-gray-700'}`}>
                            Primary Contact
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <p className="text-gray-500">No contacts added yet. Click "Add Contact" to get started.</p>
                </div>
              )}
            </div>

            {/* Full Width - Form Buttons */}
            <div className="flex items-center justify-between pt-6 border-t">
              <button
                type="button"
                onClick={handleArchive}
                disabled={!canArchiveClient || archiving}
                className={`flex items-center space-x-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md ${
                  canArchiveClient && !archiving
                    ? 'text-white bg-red-600 hover:bg-red-700'
                    : 'text-gray-400 bg-gray-200 cursor-not-allowed'
                }`}
                title={!canArchiveClient ? 'Cannot archive client with active projects' : 'Archive client'}
              >
                {archiving ? (
                  <FiLoader className="w-4 h-4 animate-spin" />
                ) : (
                  <FiTrash2 className="w-4 h-4" />
                )}
                <span>{archiving ? 'Archiving...' : (canArchiveClient ? 'Archive Client' : 'Cannot Archive')}</span>
              </button>

              <div className="flex items-center space-x-4">
                <Link
                  href="/admin/manage?tab=clients"
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </Link>
                <button
                  type="button"
                  onClick={() => handleSubmit({ preventDefault: () => {} } as React.FormEvent)}
                  disabled={loading || !formData.name}
                  className="btn-primary flex items-center space-x-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading && (
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  {!loading && <FiSave className="w-4 h-4" />}
                  <span>{loading ? 'Updating...' : 'Update Client'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
