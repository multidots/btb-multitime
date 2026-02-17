'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { FiPlus, FiEdit2, FiUsers, FiBriefcase, FiTrash2, FiSearch, FiLoader } from 'react-icons/fi'

interface Client {
  _id: string
  name: string
  contacts?: any[]
  address?: string
  preferredCurrency?: string
  isActive: boolean
  isArchived?: boolean
}

// Client-side search function
function searchClients(clients: Client[], searchTerm: string): Client[] {
  if (!searchTerm.trim()) return clients

  const term = searchTerm.toLowerCase().trim()

  return clients.filter(client => {
    // Search in client name
    if (client.name.toLowerCase().includes(term)) {
      return true
    }

    // Search in contacts
    if (client.contacts && client.contacts.length > 0) {
      return client.contacts.some(contact => {
        return (
          (contact.firstName && contact.firstName.toLowerCase().includes(term)) ||
          (contact.lastName && contact.lastName.toLowerCase().includes(term)) ||
          (contact.email && contact.email.toLowerCase().includes(term)) ||
          (contact.title && contact.title.toLowerCase().includes(term)) ||
          (contact.officePhone && contact.officePhone.includes(term)) ||
          (contact.mobilePhone && contact.mobilePhone.includes(term)) ||
          (contact.faxNumber && contact.faxNumber.includes(term))
        )
      })
    }

    return false
  })
}

async function handleDeleteClient(clientId: string, clientName: string, setArchiving: (archiving: boolean) => void) {
  if (!confirm(`Are you sure you want to archive "${clientName}"? This action cannot be undone.`)) {
    return
  }

  setArchiving(true)
  try {
    const response = await fetch(`/api/clients/${clientId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to archive client')
    }

    const result = await response.json()

    if (result.error) {
      alert(result.error)
      return
    }

    // Refresh the page to show updated data
    window.location.reload()
  } catch (error) {
    console.error('Error archiving client:', error)
    alert('Failed to archive client. Please try again.')
  } finally {
    setArchiving(false)
  }
}

function ClientCard({ client, isArchiving, onArchive }: { client: Client; isArchiving: boolean; onArchive: () => void }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900">{client.name}</h3>
          {client.address && (
            <p className="text-sm text-gray-500 mt-1">{client.address}</p>
          )}
          <div className="flex items-center mt-2 text-sm text-gray-500">
            <span className="font-medium">{client.preferredCurrency}</span>
            {client.contacts && client.contacts.length > 0 && (
              <>
                <span className="mx-1">•</span>
                <span>{client.contacts.length} contact{client.contacts.length !== 1 ? 's' : ''}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Link
            href={`/admin/manage/clients/${client._id}/edit`}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            title="Edit Client"
          >
            <FiEdit2 className="w-5 h-5" />
          </Link>
          <Link
            href={`/admin/manage/clients/${client._id}/contacts`}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            title="Manage Contacts"
          >
            <FiUsers className="w-5 h-5" />
          </Link>
          <button
            onClick={onArchive}
            disabled={isArchiving}
            className={`p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg ${
              isArchiving ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            title="Archive Client"
          >
            {isArchiving ? (
              <FiLoader className="w-5 h-5 animate-spin" />
            ) : (
              <FiTrash2 className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ManageClientsContent({ initialClients }: { initialClients: Client[] }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [archivingClientId, setArchivingClientId] = useState<string | null>(null)

  // Filter out archived clients (handle undefined/null as not archived)
  const activeClients = useMemo(() => {
    return initialClients.filter(client => client.isArchived !== true)
  }, [initialClients])

  const filteredClients = useMemo(() => {
    return searchClients(activeClients, searchTerm)
  }, [activeClients, searchTerm])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Clients</h2>
          <p className="mt-1 text-sm text-gray-500">
            Manage all clients in your organization
          </p>
        </div>
        <Link
          href="/admin/manage/clients/create"
          className="bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700 flex items-center space-x-2"
        >
          <FiPlus className="w-4 h-4" />
          <span>New Client</span>
        </Link>
      </div>

      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <FiSearch className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          placeholder="Filter by client or Contacts"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-transparent focus:border-black"
        />
      </div>

      {/* Clients List */}
      {filteredClients.length > 0 ? (
        <div className="space-y-4">
              {filteredClients.map((client) => (
                <ClientCard 
                  key={client._id} 
                  client={client}
                  isArchiving={archivingClientId === client._id}
                  onArchive={() => handleDeleteClient(client._id, client.name,  (archiving: boolean) => setArchivingClientId(archiving ? client._id : null))}
                />
              ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <FiBriefcase className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          {searchTerm ? (
            <>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No clients found</h3>
              <p className="text-gray-500 mb-6">
                No clients match your search for "{searchTerm}". Try a different search term.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No clients yet</h3>
              <p className="text-gray-500 mb-6">Get started by creating your first client.</p>
            </>
          )}
          <Link
            href="/admin/manage/clients/create"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white theme-color-bg hover:bg-orange-600"
          >
            <FiPlus className="w-4 h-4 mr-2" />
            Create your first client
          </Link>
        </div>
      )}
    </div>
  )
}

