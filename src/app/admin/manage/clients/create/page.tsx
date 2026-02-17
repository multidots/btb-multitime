'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/layouts/DashboardLayout'
import { useSession } from 'next-auth/react'
import { FiSave, FiArrowLeft, FiBriefcase, FiX } from 'react-icons/fi'
import Link from 'next/link'

interface Contact {
  firstName: string
  lastName: string
  email: string
  title?: string
  officePhone?: string
  mobilePhone?: string
  faxNumber?: string
  isPrimary: boolean
}

export default function CreateClientPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [loading, setLoading] = useState(false)
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
  })

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
    } else if (formData.name.trim().length < 4) {
      newErrors.name = 'Client name must be at least 2 characters long'
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

      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          contacts: formData.contacts,
          address: formData.address,
          preferredCurrency: formData.preferredCurrency,
        }),
      })

      if (response.ok) {
        // Signal that data needs to be refreshed
        sessionStorage.setItem('refreshClients', 'true')
        router.push('/admin/manage?tab=clients')
      } else {
        const errorData = await response.json()
        alert(`Error: ${errorData.error || 'Failed to create client'}`)
      }
    } catch (error) {
      console.error('Error creating client:', error)
      alert('Failed to create client')
    } finally {
      setLoading(false)
    }
  }, [formData, router])

  return (
    <DashboardLayout role={session?.user?.role === 'admin' ? 'admin' : 'manager'}>
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
            <div className="flex items-center space-x-3">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Create New Client</h2>
                <p className="text-sm text-gray-500">Add a new client to your organization</p>
              </div>
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
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-transparent focus:border-black outline-none"
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
                      value={formData.preferredCurrency}
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
                </form>
              </div>

              {/* Right Column - Project Details and Archive Info */}
              <div className="space-y-6">
                <div className="">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Projects</h3>

                  {/* Active Projects */}
                  <div className="mb-6">
                    <h4 className="text-md font-medium text-gray-900 mb-3 flex items-center">
                      <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                      Active Projects (0)
                    </h4>
                    <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                      <p className="text-gray-500">No active projects yet</p>
                      <p className="text-xs text-gray-400 mt-1">Projects will appear here once the client is created and projects are assigned</p>
                    </div>
                  </div>

                  {/* Archived Projects */}
                  <div>
                    <h4 className="text-md font-medium text-gray-900 mb-3 flex items-center">
                      <span className="w-3 h-3 bg-gray-400 rounded-full mr-2"></span>
                      Archived Projects (0)
                    </h4>
                    <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                      <p className="text-gray-500">No archived projects yet</p>
                      <p className="text-xs text-gray-400 mt-1">Archived projects will appear here once projects are completed and archived</p>
                    </div>
                  </div>
                </div>

                {/* Archive Information */}
                <div className="">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Archive Information</h3>

                  <div className="p-4 rounded-lg border bg-green-50 border-green-200 text-green-800">
                    <div className="flex items-start">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 bg-green-100">
                        <span className="text-xs font-medium text-green-800">✓</span>
                      </div>
                      <div className="ml-3">
                        <h4 className="font-medium">Ready for Creation</h4>
                        <p className="text-sm mt-1">
                          This new client can be created without any restrictions. Once created, archive status will depend on assigned projects.
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
                  className="btn-primary bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 text-sm"
                >
                  Add Contact
                </button>
              </div>

              {formData.contacts.length > 0 ? (
                <div className="space-y-6">
                  {formData.contacts.map((contact, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
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
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-transparent focus:border-black outline-none"
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
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-transparent focus:border-black outline-none"
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
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-transparent focus:border-black outline-none"
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
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-transparent focus:border-black outline-none"
                          />
                        </div>

                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id={`primary-${index}`}
                            checked={contact.isPrimary}
                            onChange={(e) => handleContactChange(index, 'isPrimary', e.target.checked)}
                            disabled={formData.contacts.some((c, i) => i !== index && c.isPrimary)}
                            className="h-4 w-4 theme-color focus:ring-transparent focus:border-black outline-none border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="flex items-center justify-end space-x-4 pt-6 border-t">
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
                <span>{loading ? 'Creating...' : 'Create Client'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
