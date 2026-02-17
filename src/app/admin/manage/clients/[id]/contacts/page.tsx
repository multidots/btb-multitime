'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import DashboardLayout from '@/components/layouts/DashboardLayout'
import { useSession } from 'next-auth/react'
import { FiArrowLeft, FiPlus, FiEdit2, FiTrash2, FiMail, FiPhone, FiStar } from 'react-icons/fi'
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

interface Client {
  _id: string
  name: string
  contacts?: Contact[]
}

const initialFormData: Contact = {
  _key: '',
  firstName: '',
  lastName: '',
  email: '',
  title: '',
  officePhone: '',
  mobilePhone: '',
  faxNumber: '',
  isPrimary: false,
}

export default function ClientContactsPage() {
  const router = useRouter()
  const params = useParams()
  const { data: session } = useSession()
  const clientId = params.id as string

  const [loading, setLoading] = useState(true)
  const [client, setClient] = useState<Client | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingContactIndex, setEditingContactIndex] = useState<number | null>(null)
  const [formData, setFormData] = useState<Contact>(initialFormData)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchClient = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/clients/${clientId}`)
      if (response.ok) {
        const data = await response.json()
        // Ensure all contacts have _key property
        const clientWithKeys = {
          ...data.client,
          contacts: (data.client.contacts || []).map((contact: Contact, index: number) => ({
            ...contact,
            _key: contact._key || `contact-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
          }))
        }
        setClient(clientWithKeys)
      }
    } catch (error) {
      console.error('Error fetching client:', error)
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    fetchClient()
  }, [fetchClient])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }, [])

  const handleCheckboxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target
    setFormData(prev => ({ ...prev, [name]: checked }))
  }, [])

  const resetForm = useCallback(() => {
    setFormData(initialFormData)
    setEditingContactIndex(null)
    setShowAddForm(false)
  }, [])

  const startEdit = useCallback((contact: Contact, index: number) => {
    setFormData(contact)
    setEditingContactIndex(index)
    setShowAddForm(true)
  }, [])

  const startAdd = useCallback(() => {
    resetForm()
    setShowAddForm(true)
  }, [resetForm])

  const saveContact = useCallback(async () => {
    if (!client) return

    setIsSubmitting(true)
    try {
      let updatedContacts = [...(client.contacts || [])]
      
      // Determine the index of the contact being saved
      const targetIndex = editingContactIndex !== null 
        ? editingContactIndex 
        : updatedContacts.length // Will be the index after push

      if (editingContactIndex !== null) {
        // Update existing contact - preserve _key if it exists
        updatedContacts[editingContactIndex] = {
          ...formData,
          _key: updatedContacts[editingContactIndex]._key || formData._key || `contact-${editingContactIndex}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        }
      } else {
        // Add new contact - ensure it has _key
        updatedContacts.push({
          ...formData,
          _key: formData._key || `contact-${updatedContacts.length}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        })
      }

      // Ensure only one primary contact - if current contact is primary, set all others to false
      if (formData.isPrimary) {
        updatedContacts = updatedContacts.map((contact, index) => ({
          ...contact,
          isPrimary: index === targetIndex
        }))
      }

      const response = await fetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...client,
          contacts: updatedContacts,
        }),
      })

      if (response.ok) {
        await fetchClient()
        resetForm()
        // Signal that client data needs to be refreshed when user navigates back
        sessionStorage.setItem('refreshClients', 'true')
      } else {
        const errorData = await response.json()
        alert(`Failed to save contact: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error saving contact:', error)
      alert('Failed to save contact')
    } finally {
      setIsSubmitting(false)
    }
  }, [client, editingContactIndex, formData, clientId, fetchClient, resetForm])

  const deleteContact = useCallback(async (index: number) => {
    if (!client || !confirm('Are you sure you want to delete this contact?')) return

    setIsSubmitting(true)
    try {
      const updatedContacts = client.contacts?.filter((_, i) => i !== index) || []

      const response = await fetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...client,
          contacts: updatedContacts,
        }),
      })

      if (response.ok) {
        await fetchClient()
        // Signal that client data needs to be refreshed when user navigates back
        sessionStorage.setItem('refreshClients', 'true')
      } else {
        const errorData = await response.json()
        alert(`Failed to delete contact: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error deleting contact:', error)
      alert('Failed to delete contact')
    } finally {
      setIsSubmitting(false)
    }
  }, [client, clientId, fetchClient])

  // Memoize contacts list to prevent unnecessary re-renders
  const contactsList = useMemo(() => {
    if (!client?.contacts) return null

    return client.contacts.map((contact, index) => (
      <div key={`contact-${index}`} className="p-6 hover:bg-gray-50 transition-colors">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <h4 className="text-lg font-medium text-gray-900">
                {contact.firstName} {contact.lastName}
                {contact.isPrimary && (
                  <FiStar className="inline w-4 h-4 text-yellow-500 ml-2" title="Primary Contact" />
                )}
              </h4>
              {contact.title && (
                <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                  {contact.title}
                </span>
              )}
            </div>

            <div className="space-y-1 text-sm text-gray-600">
              <div className="flex items-center">
                <FiMail className="w-4 h-4 mr-2" />
                {contact.email}
              </div>
              {contact.officePhone && (
                <div className="flex items-center">
                  <FiPhone className="w-4 h-4 mr-2" />
                  {contact.officePhone} (Office)
                </div>
              )}
              {contact.mobilePhone && (
                <div className="flex items-center">
                  <FiPhone className="w-4 h-4 mr-2" />
                  {contact.mobilePhone} (Mobile)
                </div>
              )}
              {contact.faxNumber && (
                <div className="flex items-center">
                  <FiPhone className="w-4 h-4 mr-2" />
                  {contact.faxNumber} (Fax)
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => startEdit(contact, index)}
              disabled={isSubmitting}
              className="p-2 text-gray-400 hover:theme-color hover:theme-light-color-bg rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              title="Edit Contact"
            >
              <FiEdit2 className="w-5 h-5" />
            </button>
            <button
              onClick={() => deleteContact(index)}
              disabled={isSubmitting}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              title="Delete Contact"
            >
              <FiTrash2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    ))
  }, [client?.contacts, isSubmitting, startEdit, deleteContact])

  if (loading) {
    return (
      <DashboardLayout role={session?.user?.role === 'admin' ? 'admin' : 'manager'}>
        <div className="flex items-center justify-center min-h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p>Loading client contacts...</p>
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
      <Link
              href="/admin/manage?tab=clients"
              className="flex items-center text-gray-500 hover:text-gray-700 mb-4"
            >
              <FiArrowLeft className="w-5 h-5 mr-2" />
              Back to Clients
            </Link>
        <div className="flex items-center justify-between bg-white rounded-lg shadow-sm p-6">
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{client.name} - Contacts</h2>
              <p className="text-sm text-gray-500">
                Manage contacts for {client.name}
              </p>
            </div>
          </div>
          <button
            onClick={startAdd}
            disabled={isSubmitting}
            className="btn-primary bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            <FiPlus className="w-4 h-4" />
            <span>Add Contact</span>
          </button>
        </div>

        {/* Add/Edit Contact Form */}
        {showAddForm && (
          <div className="bg-white rounded-lg shadow-sm border p-6 animate-in slide-in-from-top-2 duration-300">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                {editingContactIndex !== null ? 'Edit Contact' : 'Add New Contact'}
              </h3>
              <button
                onClick={resetForm}
                className="text-gray-400 hover:text-gray-600 p-1"
                title="Close form"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name *
                </label>
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-transparent focus:border-black outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name *
                </label>
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-transparent focus:border-black outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-transparent focus:border-black outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-transparent focus:border-black outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Office Phone
                </label>
                <input
                  type="tel"
                  name="officePhone"
                  value={formData.officePhone}
                  onChange={handleInputChange}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-transparent focus:border-black outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mobile Phone
                </label>
                <input
                  type="tel"
                  name="mobilePhone"
                  value={formData.mobilePhone}
                  onChange={handleInputChange}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-transparent focus:border-black outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fax Number
                </label>
                <input
                  type="tel"
                  name="faxNumber"
                  value={formData.faxNumber}
                  onChange={handleInputChange}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-transparent focus:border-black outline-none"
                />
              </div>
            </div>

            <div className="flex items-center space-x-4 mb-6">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  name="isPrimary"
                  checked={formData.isPrimary}
                  onChange={handleCheckboxChange}
                  className="h-4 w-4 theme-color focus:ring-transparent focus:border-black outline-none border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Primary Contact</span>
              </label>
            </div>


            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {editingContactIndex !== null ? 'Editing existing contact' : 'Adding new contact'}
              </div>
              <div className="flex items-center space-x-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400 disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  onClick={saveContact}
                  disabled={isSubmitting || !formData.firstName || !formData.lastName || !formData.email}
                  className="btn-primary bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {isSubmitting && (
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  <span>
                    {isSubmitting
                      ? (editingContactIndex !== null ? 'Updating...' : 'Adding...')
                      : (editingContactIndex !== null ? 'Update Contact' : 'Add Contact')
                    }
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Contacts List */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">All Contacts</h3>
          </div>

          {client.contacts && client.contacts.length > 0 ? (
            <div className="divide-y divide-gray-200">
              {contactsList}
            </div>
          ) : (
            <div className="p-12 text-center">
              <FiMail className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No contacts yet</h3>
              <p className="text-gray-500 mb-4">Add your first contact to get started.</p>
              <button
                onClick={startAdd}
                className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700"
              >
                Add First Contact
              </button>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
