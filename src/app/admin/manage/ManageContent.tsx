'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { format } from 'date-fns'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  FiBriefcase,
  FiCheckSquare,
  FiPlus,
  FiEdit2,
  FiUsers,
  FiTrash2,
  FiMoreVertical,
  FiArchive,
  FiCopy,
  FiChevronDown,
  FiCode,
  FiEdit3,
  FiCalendar,
  FiCheckCircle,
  FiFileText,
  FiSearch,
  FiTag,
  FiX,
  FiLoader,
  FiDownload
} from 'react-icons/fi'
import DashboardLayout from '@/components/layouts/DashboardLayout'
import * as XLSX from 'xlsx'
import RolesTabContent from '@/components/manage/roles/RolesTabContent'
import { usePageTitle } from '@/lib/pageTitleImpl'

interface Client {
  _id: string
  name: string
  contacts?: any[]
  address?: string
  preferredCurrency?: string
  isActive: boolean
  isArchived?: boolean
}

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
  category?: {
    _id: string
    name: string
    slug: string
    color?: string
    icon?: string
  }
  estimatedHours?: number
  pendingHours: number
  createdAt: string
  updatedAt: string
}

interface ManageContentProps {
  initialClients: Client[]
  initialTasks: Task[]
  activeTab: 'clients' | 'tasks' | 'roles'
  userRole?: 'admin' | 'manager' | 'user'
}



function BulkActionsBar({
  selectedTasks,
  onClearSelection,
  onBulkArchive,
  onBulkDelete,
  isCalculatingPendingHours
}: {
  selectedTasks: Task[]
  onClearSelection: () => void
  onBulkArchive: () => void
  onBulkDelete: () => void
  isCalculatingPendingHours?: boolean
}) {
  const [isLoading, setIsLoading] = useState(false)

  const canBulkAction = useMemo(() => {
    if (isCalculatingPendingHours) return false;
    return selectedTasks.every(task => (task.pendingHours ?? 0) === 0);
  }, [selectedTasks, isCalculatingPendingHours]);

  const handleBulkArchive = async () => {
    if (!canBulkAction) {
      const tasksWithHours = selectedTasks.filter(task => (task.pendingHours ?? 0) > 0);
      const taskNames = tasksWithHours.map(t => t.name).join(', ');
      alert(`Cannot archive tasks with pending/unsubmitted hours: ${taskNames}`);
      return;
    }

    if (confirm(`Are you sure you want to archive ${selectedTasks.length} task(s)?`)) {
      setIsLoading(true)
      await onBulkArchive()
      setIsLoading(false)
    }
  }

  const handleBulkDelete = async () => {
    if (!canBulkAction) {
      const tasksWithHours = selectedTasks.filter(task => (task.pendingHours ?? 0) > 0);
      const taskNames = tasksWithHours.map(t => t.name).join(', ');
      alert(`Cannot delete tasks with pending/unsubmitted hours: ${taskNames}`);
      return;
    }

    if (confirm(`Are you sure you want to delete ${selectedTasks.length} task(s)? This action cannot be undone.`)) {
      setIsLoading(true)
      await onBulkDelete()
      setIsLoading(false)
    }
  }

  return (
    <div className="theme-light-color-bg border theme-color-border rounded-lg p-4 py-4 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <FiCheckSquare className="w-5 h-5 theme-color" />
            <span className="text-sm font-medium theme-color">
              {selectedTasks.length} task{selectedTasks.length !== 1 ? 's' : ''} selected
            </span>
          </div>
          <button
            onClick={onClearSelection}
            className="flex items-center space-x-1 text-sm theme-color hover:theme-color-hover"
          >
            <FiX className="w-4 h-4" />
            <span>Clear selection</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleBulkArchive}
            disabled={isLoading || !canBulkAction || isCalculatingPendingHours}
            title={isCalculatingPendingHours ? "Calculating pending hours..." : !canBulkAction ? "Cannot archive tasks that have pending/unsubmitted hours" : "Archive selected tasks"}
            className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-white theme-color-bg hover:theme-color-bg-hover rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiArchive className="w-4 h-4" />
            <span>Archive</span>
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={isLoading || !canBulkAction || isCalculatingPendingHours}
            title={isCalculatingPendingHours ? "Calculating pending hours..." : !canBulkAction ? "Cannot delete tasks that have pending/unsubmitted hours" : "Delete selected tasks"}
            className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-black bg-red-100 hover:bg-red-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiTrash2 className="w-4 h-4" />
            <span>Delete</span>
          </button>
        </div>
      </div>
    </div>
  )
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

function ClientsTabContent({ clients, onRefresh }: { clients: Client[]; onRefresh: () => void }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [showExportModal, setShowExportModal] = useState(false)
  const [creatingClient, setCreatingClient] = useState(false)
  const [editingClientId, setEditingClientId] = useState<string | null>(null)
  const [managingContactsId, setManagingContactsId] = useState<string | null>(null)
  const [exportingClients, setExportingClients] = useState<'csv' | 'excel' | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
  const [dropdownPosition, setDropdownPosition] = useState<{ x: number; y: number } | null>(null)
  const router = useRouter()

  const clientsToDisplay = useMemo(() => {
    const filtered = clients.filter(client => showArchived ? client.isArchived : !client.isArchived);
    return searchClients(filtered, searchTerm);
  }, [clients, showArchived, searchTerm]);

  // Prepare data for export
  const prepareClientData = () => {
    return clientsToDisplay.map((client) => ({
      'Name': client.name,
      'Address': client.address || '',
      'Preferred Currency': client.preferredCurrency || '',
      'Contacts Count': client.contacts?.length || 0,
      'Active': client.isActive ? 'Yes' : 'No'
    }))
  }

  // Export to CSV
  const exportClientsToCSV = () => {
    setExportingClients('csv')
    try {
      const data = prepareClientData()
      if (data.length === 0) {
        alert('No data to export')
        return
      }

      const headers = Object.keys(data[0])
      const csvContent = [
        headers.join(','),
        ...data.map(row => headers.map(header => `"${row[header as keyof typeof row]}"`).join(','))
      ].join('\n')

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `clients-${format(new Date(), 'yyyy-MM-dd')}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setShowExportModal(false)
      alert('CSV exported successfully')
    } finally {
      setExportingClients(null)
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openDropdownId) {
        const target = event.target as HTMLElement
        // Check if click is outside both the button and the dropdown menu
        if (!target.closest('[data-dropdown-container]')) {
          setOpenDropdownId(null)
          setDropdownPosition(null)
        }
      }
    }

    // Always add listener, but only close if dropdown is open
    document.addEventListener('click', handleClickOutside)
    return () => {
      document.removeEventListener('click', handleClickOutside)
    }
  }, [openDropdownId])

  // Export to Excel
  const exportClientsToExcel = () => {
    setExportingClients('excel')
    try {
      const data = prepareClientData()
      if (data.length === 0) {
        alert('No data to export')
        return
      }

      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Clients')
      XLSX.writeFile(wb, `clients-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
      setShowExportModal(false)
      alert('Excel exported successfully')
    } finally {
      setExportingClients(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Clients</h3>
          <p className="text-sm text-gray-500">{showArchived ? `Viewing ${clientsToDisplay.length} archived clients` : 'Manage all clients in your organization'}</p>
        </div>
        <div className="flex items-center space-x-3 flex-wrap gap-2">
          {!showArchived && (
            <>
              <button
                onClick={() => setShowExportModal(true)}
                disabled={exportingClients !== null || clientsToDisplay.length === 0}
                className="btn-primary px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exportingClients ? (
                  <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <FiDownload className="w-4 h-4 mr-2" />
                )}
                {exportingClients ? 'Exporting...' : 'Export'}
              </button>
              <button
                onClick={() => {
                  setCreatingClient(true)
                  router.push('/admin/manage/clients/create')
                }}
                disabled={creatingClient}
                className="btn-secondary text-sm font-medium bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingClient ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <FiPlus className="w-4 h-4" />
                )}
                <span>New Client</span>
              </button>
            </>
          )}
          <button
            onClick={() => setShowArchived(prev => !prev)}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 flex items-center"
          >
            <FiArchive className="w-4 h-4 mr-2" />
            {showArchived ? 'View Active Clients' : 'View Archived Clients'}
          </button>
        </div>
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
          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:!ring-0 focus:border-black"
        />
      </div>

      {clientsToDisplay.length > 0 ? (
        <div className="bg-white shadow-sm overflow-x-auto overflow-hidden">
          <table className="min-w-full">
            <thead className="bg-[#eee]">
              <tr>
                <th className="px-6 py-2 text-left font-normal text-sm text-[#1d1e1c]">
                  Name
                </th>
                <th className="px-6 py-2 text-left font-normal text-sm text-[#1d1e1cb3]">
                  Currency
                </th>
                <th className="px-6 py-2 text-left font-normal text-sm text-[#1d1e1cb3]">
                  Contacts
                </th>
                <th className="px-6 py-2 text-right font-normal text-sm text-[#1d1e1cb3]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {clientsToDisplay.map((client) => (
                <tr key={client._id} className="capitalize relative hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-2 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      <div className="font-medium text-gray-900">{client.name}</div>
                      {!client.isActive && (
                        <span className="text-sm text-gray-500">(Inactive)</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap">
                    <div className="text-gray-500">{client.preferredCurrency || '-'}</div>
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap">
                    <div className="text-gray-500">
                      {client.contacts && client.contacts.length > 0 ? client.contacts.length : 0} contact{client.contacts && client.contacts.length !== 1 ? 's' : ''}
                    </div>
                  </td>
                  <td className="px-6 py-2 whitespace-nowrap text-right text-sm font-medium">
                    <div className="relative inline-block" data-dropdown-container>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          const buttonRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                          
                          if (openDropdownId === client._id) {
                            setOpenDropdownId(null)
                            setDropdownPosition(null)
                          } else {
                            // Calculate position - try to show below, but adjust if near bottom
                            const viewportHeight = window.innerHeight
                            const dropdownHeight = 200 // Approximate height of dropdown
                            const spaceBelow = viewportHeight - buttonRect.bottom
                            const spaceAbove = buttonRect.top
                            
                            let x = buttonRect.right - 192 // 192px = 48 * 4 (w-48)
                            let y: number
                            
                            if (spaceBelow >= dropdownHeight || spaceBelow > spaceAbove) {
                              // Show below button
                              y = buttonRect.bottom + 4
                            } else {
                              // Show above button
                              y = buttonRect.top - dropdownHeight - 4
                            }
                            
                            // Ensure dropdown doesn't go off screen
                            if (x < 8) x = 8
                            if (x + 192 > window.innerWidth - 8) {
                              x = window.innerWidth - 192 - 8
                            }
                            
                            setOpenDropdownId(client._id)
                            setDropdownPosition({ x, y })
                          }
                        }}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                        title="Client actions"
                      >
                        <FiMoreVertical className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        showArchived ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <FiArchive className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No archived clients</h3>
            <p className="text-gray-500">You have no archived clients at the moment.</p>
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
                  className="btn-primary inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-600"
            >
              <FiPlus className="w-4 h-4 mr-2" />
              Create your first client
            </Link>
          </div>
        )
      )}

      {/* Fixed Position Dropdown for Clients */}
      {openDropdownId && dropdownPosition && clientsToDisplay.some(c => c._id === openDropdownId) && (
        <div
          className="fixed w-48 bg-white rounded-md shadow-xl border border-gray-200 z-[9999]"
          data-dropdown-container
          style={{
            left: `${dropdownPosition.x}px`,
            top: `${dropdownPosition.y}px`
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {(() => {
            const client = clientsToDisplay.find(c => c._id === openDropdownId)
            if (!client) return null
            
            return (
              <div className="py-1">
                <button
                  className={`flex items-center w-full px-4 py-2 text-sm text-gray hover:theme-color-bg hover:text-white ${
                    editingClientId === client._id ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  disabled={editingClientId === client._id}
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpenDropdownId(null)
                    setDropdownPosition(null)
                    setEditingClientId(client._id)
                    router.push(`/admin/manage/clients/${client._id}/edit`)
                  }}
                >
                  {editingClientId === client._id ? (
                    <FiLoader className="w-4 h-4 mr-3 animate-spin" />
                  ) : (
                    <FiEdit2 className="w-4 h-4 mr-3" />
                  )}
                  {editingClientId === client._id ? 'Editing...' : 'Edit'}
                </button>
                <button
                  className={`flex items-center w-full px-4 py-2 text-sm text-gray hover:theme-color-bg hover:text-white ${
                    managingContactsId === client._id ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  disabled={managingContactsId === client._id}
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpenDropdownId(null)
                    setDropdownPosition(null)
                    setManagingContactsId(client._id)
                    router.push(`/admin/manage/clients/${client._id}/contacts`)
                  }}
                >
                  {managingContactsId === client._id ? (
                    <FiLoader className="w-4 h-4 mr-3 animate-spin" />
                  ) : (
                    <FiUsers className="w-4 h-4 mr-3" />
                  )}
                  {managingContactsId === client._id ? 'Loading...' : 'Manage Contacts'}
                </button>
              </div>
            )
          })()}
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Export Client Data</h3>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <FiX className="w-6 h-6" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Export the current client listing ({clientsToDisplay.length} clients) as CSV or Excel file.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={exportClientsToCSV}
                disabled={exportingClients !== null}
                className="btn-primary flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {exportingClients === 'csv' ? (
                  <>
                    <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Exporting...
                  </>
                ) : (
                  'Export as CSV'
                )}
              </button>
              <button
                onClick={exportClientsToExcel}
                disabled={exportingClients !== null}
                className="btn-primary flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {exportingClients === 'excel' ? (
                  <>
                    <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Exporting...
                  </>
                ) : (
                  'Export as Excel'
                )}
              </button>
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TasksTabContent({
  tasks,
  selectedTasks,
  onToggleTask,
  onToggleCategory,
  onToggleAll,
  onClearSelection,
  onBulkArchive,
  onBulkDelete,
  onRefresh,
  isCalculatingPendingHours
}: {
  tasks: Task[]
  selectedTasks: string[]
  onToggleTask: (taskId: string) => void
  onToggleCategory: (categoryKey: string) => void
  onToggleAll: (taskIds: string[]) => void
  onClearSelection: () => void
  onBulkArchive: () => void
  onBulkDelete: () => void
  onRefresh: () => void
  isCalculatingPendingHours?: boolean
}) {
  const [showExportModal, setShowExportModal] = useState(false)
  const [creatingTask, setCreatingTask] = useState(false)
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
  const [dropdownPosition, setDropdownPosition] = useState<{ x: number; y: number } | null>(null)
  const [archivingTaskId, setArchivingTaskId] = useState<string | null>(null)
  const [restoringTaskId, setRestoringTaskId] = useState<string | null>(null)
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null)
  const [exportingTasks, setExportingTasks] = useState<'csv' | 'excel' | null>(null)
  const [addingToAllProjects, setAddingToAllProjects] = useState<string | null>(null)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const router = useRouter()

  // Filter tasks based on view mode
  const tasksToDisplay = tasks.filter(task => showArchived ? task.isArchived : !task.isArchived)

  const handleDeleteTask = async (taskId: string) => {
    // Confirmation is handled in the button onClick handler
    setDeletingTaskId(taskId)
    try {
      const response = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
      if (response.ok) {
        const data = await response.json()
        alert(data.message || 'Task deleted successfully!')
        onRefresh()
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
      setDeletingTaskId(null)
    }
  }

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.fixed.w-48') && !target.closest('button[title="Task actions"]')) {
        setOpenDropdownId(null)
        setDropdownPosition(null)
      }
    }

    document.addEventListener('click', handleClickOutside)
    return () => {
      document.removeEventListener('click', handleClickOutside)
    }
  }, [])

  // Prepare data for export
  const prepareTaskData = () => {
    return tasksToDisplay.map((task) => {
      // Safe date formatter - returns empty string if date is invalid
      const safeFormatDate = (dateValue: string | undefined | null): string => {
        if (!dateValue) return ''
        try {
          const date = new Date(dateValue)
          if (isNaN(date.getTime())) return ''
          return format(date, 'yyyy-MM-dd')
        } catch {
          return ''
        }
      }

      return {
        'Name': task.name,
        'Category': task.category?.name || '',
        'Description': task.description || '',
        'Active': task.isActive ? 'Yes' : 'No',
        'Archived': task.isArchived ? 'Yes' : 'No',
        'Estimated Hours': task.estimatedHours || '',
        'Created Date': safeFormatDate(task.createdAt),
        'Updated Date': safeFormatDate(task.updatedAt)
      }
    })
  }

  // Export to CSV
  const exportTasksToCSV = () => {
    setExportingTasks('csv')
    try {
      const data = prepareTaskData()
      if (data.length === 0) {
        alert('No data to export')
        return
      }

      const headers = Object.keys(data[0])
      const csvContent = [
        headers.join(','),
        ...data.map(row => headers.map(header => `"${row[header as keyof typeof row]}"`).join(','))
      ].join('\n')

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `tasks-${format(new Date(), 'yyyy-MM-dd')}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setShowExportModal(false)
      alert('CSV exported successfully')
    } finally {
      setExportingTasks(null)
    }
  }

  // Export to Excel
  const exportTasksToExcel = () => {
    setExportingTasks('excel')
    try {
      const data = prepareTaskData()
      if (data.length === 0) {
        alert('No data to export')
        return
      }

      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Tasks')
      XLSX.writeFile(wb, `tasks-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
      setShowExportModal(false)
      alert('Excel exported successfully')
    } finally {
      setExportingTasks(null)
    }
  }

  // Group tasks by category (using visible tasks)
  const groupedTasks = tasksToDisplay.reduce((acc, task) => {
    const categoryKey = task.category?.slug || 'other'
    if (!acc[categoryKey]) {
      acc[categoryKey] = []
    }
    acc[categoryKey].push(task)
    return acc
  }, {} as Record<string, Task[]>)

  // Define category display names and icons
  const categoryConfig = {
    development: { name: 'Development', icon: FiCode },
    design: { name: 'Design', icon: FiEdit3 },
    planning: { name: 'Planning', icon: FiCalendar },
    testing: { name: 'Testing', icon: FiCheckCircle },
    meeting: { name: 'Meeting', icon: FiUsers },
    documentation: { name: 'Documentation', icon: FiFileText },
    research: { name: 'Research', icon: FiSearch },
    other: { name: 'Other', icon: FiTag }
  }

  // Calculate selection state for each category
  const categorySelectionState = Object.entries(groupedTasks).map(([categoryKey, categoryTasks]) => {
    const taskIds = categoryTasks.map(task => task._id)
    const selectedInCategory = taskIds.filter(id => selectedTasks.includes(id))
    const isAllSelected = taskIds.length > 0 && selectedInCategory.length === taskIds.length
    const isIndeterminate = selectedInCategory.length > 0 && selectedInCategory.length < taskIds.length
    return { categoryKey, isAllSelected, isIndeterminate }
  })

  const selectedTaskObjects = tasksToDisplay.filter(task => selectedTasks.includes(task._id))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Task</h3>
          <p className="text-sm text-gray-500">{showArchived ? `Viewing ${tasksToDisplay.length} archived tasks` : 'Create and manage task modules for projects'}</p>
        </div>
        <div className="flex items-center space-x-3 flex-wrap gap-2">
          {!showArchived && (
            <>
              <button
                onClick={() => setShowExportModal(true)}
                disabled={exportingTasks !== null || tasksToDisplay.length === 0}
                className="btn-primary px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exportingTasks ? (
                  <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <FiDownload className="w-4 h-4 mr-2" />
                )}
                {exportingTasks ? 'Exporting...' : 'Export'}
              </button>
              <button
                onClick={() => {
                  setCreatingTask(true)
                  router.push('/admin/manage/tasks/create')
                }}
                disabled={creatingTask}
                className="btn-secondary text-sm font-medium bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingTask ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <FiPlus className="w-4 h-4" />
                )}
                <span>New Task</span>
              </button>
            </>
          )}
          <button
            onClick={() => setShowArchived(prev => !prev)}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 flex items-center"
          >
            <FiArchive className="w-4 h-4 mr-2" />
            {showArchived ? 'View Active Tasks' : 'View Archived Tasks'}
          </button>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedTasks.length > 0 && !showArchived && (
        <BulkActionsBar
          selectedTasks={selectedTaskObjects}
          onClearSelection={onClearSelection}
          onBulkArchive={onBulkArchive}
          onBulkDelete={onBulkDelete}
          isCalculatingPendingHours={isCalculatingPendingHours}
        />
      )}

      {/* Tasks by Category */}
      {tasksToDisplay.length > 0 ? (
        showArchived ? (
          <div className="bg-white rounded-lg overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {tasksToDisplay.map((task) => (
                  <tr key={task._id} className="capitalize relative hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-2 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{task.name}</div>
                    </td>
                    <td className="px-6 py-2 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{task.category?.name || 'N/A'}</div>
                    </td>
                    <td className="px-6 py-2 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        className={`inline-flex items-center px-3 py-1 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md ${restoringTaskId === task._id ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={restoringTaskId === task._id}
                        onClick={async () => {
                          if (confirm('Are you sure you want to restore this archived task?')) {
                            setRestoringTaskId(task._id)
                            try {
                              const response = await fetch(`/api/tasks/${task._id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ isArchived: false })
                              })
                              if (response.ok) {
                                alert('Task restored successfully!')
                                onRefresh()
                              } else {
                                const errorData = await response.json()
                                alert(`Failed to restore task: ${errorData.error || 'Unknown error'}`)
                              }
                            } catch (error) {
                              console.error('Error restoring task:', error)
                              alert('Failed to restore task')
                            } finally {
                              setRestoringTaskId(null)
                            }
                          }
                        }}
                      >
                        {restoringTaskId === task._id ? <FiLoader className="w-4 h-4 mr-2 animate-spin" /> : <FiCheckCircle className="w-4 h-4 mr-2" />}
                        {restoringTaskId === task._id ? 'Restoring...' : 'Restore'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedTasks)
              .sort(([a], [b]) => {
                // Sort categories: Other last, then alphabetically
                if (a === 'other') return 1
                if (b === 'other') return -1
                return a.localeCompare(b)
              })
              .map(([categoryKey, categoryTasks]) => {
                // Get the first task's category to get the category info
                const firstTask = categoryTasks[0]
                const category = firstTask.category
                const config = categoryConfig[categoryKey as keyof typeof categoryConfig]
                const IconComponent = config?.icon || FiTag

                // Use category name from the actual category object, or fallback
                const categoryName = category?.name || config?.name || 'Other'
                const categoryIcon = category?.icon || categoryKey
                const categoryColor = category?.color || 'blue'

                // Color mapping for Tailwind classes
                const colorClasses = {
                  blue: { bg: 'bg-blue-100', text: 'text-blue-600' },
                  green: { bg: 'bg-green-100', text: 'text-green-600' },
                  yellow: { bg: 'bg-yellow-100', text: 'text-yellow-600' },
                  red: { bg: 'bg-red-100', text: 'text-red-600' },
                  purple: { bg: 'bg-purple-100', text: 'text-purple-600' },
                  orange: { bg: 'bg-orange-100', text: 'text-orange-600' },
                  pink: { bg: 'bg-pink-100', text: 'text-pink-600' },
                  gray: { bg: 'bg-gray-100', text: 'text-gray-600' }
                }

                const colorClass = colorClasses[categoryColor as keyof typeof colorClasses] || colorClasses.blue

                // Icon mapping for category icons
                const iconMap = {
                  development: FiCode,
                  design: FiEdit3,
                  planning: FiCalendar,
                  testing: FiCheckCircle,
                  meeting: FiUsers,
                  documentation: FiFileText,
                  research: FiSearch,
                  other: FiTag
                }
                const CategoryIconComponent = iconMap[categoryIcon as keyof typeof iconMap] || FiTag

                // Get selection state for this category
                const selectionState = categorySelectionState.find(s => s.categoryKey === categoryKey)
                const { isAllSelected, isIndeterminate } = selectionState || { isAllSelected: false, isIndeterminate: false }

                return (
                  <div key={categoryKey} className="space-y-1">
                    {/* Category Header */}
                    <div className="flex items-center space-x-3 pb-2 border-b border-gray-200 pl-6">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = isIndeterminate
                        }}
                        onChange={() => onToggleAll(categoryTasks.map(task => task._id))}
                        className="w-4 h-4 theme-color bg-gray-100 border-gray-300 rounded focus:ring-transparent focus:ring-2"
                      />
                      {/* <div className={`flex items-center justify-center w-8 h-8 ${colorClass.bg} rounded-lg`}>
                        <CategoryIconComponent className={`w-4 h-4 ${colorClass.text}`} />
                      </div> */}
                      <h4 className="text-lg font-semibold text-gray-900">
                        {categoryName}
                      </h4>
                      <span className="text-sm text-gray-500">
                        - ({categoryTasks.length} task{categoryTasks.length !== 1 ? 's' : ''})
                      </span>
                    </div>

                    {/* Tasks Table for Category */}
                    <div className="bg-white rounded-lg lg:overflow-hidden">
                      <table className="min-w-full divide-y divide-gray-200">
                        <tbody className="bg-white">
                          {categoryTasks.map((task) => (
                            <tr key={task._id} className="capitalize relative hover:bg-gray-50 transition-colors">
                              <td className="pl-6 pr-3 py-1 whitespace-nowrap w-12">
                                <input
                                  type="checkbox"
                                  checked={selectedTasks.includes(task._id)}
                                  onChange={() => onToggleTask(task._id)}
                                  className="w-4 h-4 theme-color bg-gray-100 border-gray-300 rounded focus:ring-transparent focus:ring-2"
                                />
                              </td>
                              <td className="pl-3 pr-6 py-1 whitespace-nowrap">
                                <div className="flex items-center space-x-2">
                                  <div className="text-sm font-medium text-gray-900">{task.name}</div>
                                  {task.isArchived && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                      <FiArchive className="w-3 h-3 mr-1" />
                                      Archived
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-1 whitespace-nowrap text-right text-sm font-medium">
                                <div className="relative inline-block">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      const buttonRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                                      
                                      if (openDropdownId === task._id) {
                                        setOpenDropdownId(null)
                                        setDropdownPosition(null)
                                      } else {
                                        // Calculate position - try to show below, but adjust if near bottom
                                        const viewportHeight = window.innerHeight
                                        const dropdownHeight = 200 // Approximate height of dropdown
                                        const spaceBelow = viewportHeight - buttonRect.bottom
                                        const spaceAbove = buttonRect.top
                                        
                                        let x = buttonRect.right - 192 // 192px = 48 * 4 (w-48)
                                        let y: number
                                        
                                        if (spaceBelow >= dropdownHeight || spaceBelow > spaceAbove) {
                                          // Show below button
                                          y = buttonRect.bottom + 4
                                        } else {
                                          // Show above button
                                          y = buttonRect.top - dropdownHeight - 4
                                        }
                                        
                                        // Ensure dropdown doesn't go off screen
                                        if (x < 8) x = 8
                                        if (x + 192 > window.innerWidth - 8) {
                                          x = window.innerWidth - 192 - 8
                                        }
                                        
                                        setOpenDropdownId(task._id)
                                        setDropdownPosition({ x, y })
                                      }
                                    }}
                                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                                    title="Task actions"
                                  >
                                    <FiMoreVertical className="w-5 h-5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Fixed Position Dropdown */}
                    {openDropdownId && dropdownPosition && categoryTasks.some(t => t._id === openDropdownId) && (
                      <div
                        className="fixed w-48 bg-white rounded-md shadow-xl border border-gray-200 z-[9999]"
                        style={{
                          left: `${dropdownPosition.x}px`,
                          top: `${dropdownPosition.y}px`
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(() => {
                          const task = categoryTasks.find(t => t._id === openDropdownId)
                          if (!task) return null
                          
                          return (
                            <div className="py-1">
                              <button
                                className={`flex items-center w-full px-4 py-2 text-sm text-gray hover:theme-color-bg hover:text-white ${
                                  editingTaskId === task._id ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                                disabled={editingTaskId === task._id}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setOpenDropdownId(null)
                                  setDropdownPosition(null)
                                  setEditingTaskId(task._id)
                                  router.push(`/admin/manage/tasks/${task._id}/edit`)
                                }}
                              >
                                {editingTaskId === task._id ? (
                                  <FiLoader className="w-4 h-4 mr-3 animate-spin" />
                                ) : (
                                  <FiEdit2 className="w-4 h-4 mr-3" />
                                )}
                                {editingTaskId === task._id ? 'Editing...' : 'Edit'}
                              </button>
                              <button
                                className={`flex items-center w-full px-4 py-2 text-sm text-gray hover:theme-color-bg hover:text-white ${
                                  addingToAllProjects === task._id ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                                disabled={addingToAllProjects === task._id}
                                onClick={async (e) => {
                                  e.stopPropagation()
                                  setOpenDropdownId(null)
                                  setDropdownPosition(null)
                                  setAddingToAllProjects(task._id)
                                  try {
                                    const response = await fetch('/api/tasks/add-to-all-projects', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ taskId: task._id })
                                    })

                                    if (response.ok) {
                                      const data = await response.json()
                                      alert(data.message || 'Task successfully added to all projects!')
                                      onRefresh()
                                    } else {
                                      const errorData = await response.json()
                                      alert(`Failed to add task to projects: ${errorData.error || 'Unknown error'}`)
                                    }
                                  } catch (error) {
                                    console.error('Error adding task to all projects:', error)
                                    alert('Failed to add task to all projects')
                                  } finally {
                                    setAddingToAllProjects(null)
                                  }
                                }}
                              >
                                {addingToAllProjects === task._id ? (
                                  <FiLoader className="w-4 h-4 mr-3 animate-spin" />
                                ) : (
                                  <FiCopy className="w-4 h-4 mr-3" />
                                )}
                                {addingToAllProjects === task._id ? 'Adding...' : 'Add to all projects'}
                              </button>
                              {!task.isArchived ? (
                                <button
                                  className={`flex items-center w-full px-4 py-2 text-sm text-orange-600 hover:theme-color-bg hover:text-white ${
                                    (archivingTaskId === task._id || (task.pendingHours ?? 0) > 0 || isCalculatingPendingHours) ? 'opacity-50 cursor-not-allowed' : ''
                                  }`}
                                  disabled={archivingTaskId === task._id || (task.pendingHours ?? 0) > 0 || isCalculatingPendingHours}
                                  title={isCalculatingPendingHours ? 'Calculating pending hours...' : (task.pendingHours ?? 0) > 0 ? `Cannot archive task with ${task.pendingHours} pending hours` : 'Archive Task'}
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    setOpenDropdownId(null)
                                    setDropdownPosition(null)
                                    if (confirm('Are you sure you want to archive this task?')) {
                                      setArchivingTaskId(task._id)
                                      try {
                                        const response = await fetch('/api/tasks/bulk', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({
                                            taskIds: [task._id],
                                            operation: 'archive'
                                          })
                                        })

                                        if (response.ok) {
                                          const data = await response.json()
                                          if (data.successCount > 0) {
                                            alert(data.message || 'Task archived successfully!')
                                            onRefresh()
                                          } else {
                                            alert(`Failed to archive task: ${data.errors?.[0]?.error || 'Unknown error'}`)
                                          }
                                        } else {
                                          const errorData = await response.json()
                                          alert(`Failed to archive task: ${errorData.error || 'Unknown error'}`)
                                        }
                                      } catch (error) {
                                        console.error('Error archiving task:', error)
                                        alert('Failed to archive task')
                                      } finally {
                                        setArchivingTaskId(null)
                                      }
                                    }
                                  }}
                                >
                                  {archivingTaskId === task._id ? (
                                    <FiLoader className="w-4 h-4 mr-3 animate-spin" />
                                  ) : (
                                    <FiArchive className="w-4 h-4 mr-3" />
                                  )}
                                  Archive Task
                                </button>
                                     ) : (
                                       <button
                                         className={`flex items-center w-full px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 hover:text-blue-700 ${
                                           restoringTaskId === task._id ? 'opacity-50 cursor-not-allowed' : ''
                                         }`}
                                         disabled={restoringTaskId === task._id}
                                         onClick={async (e) => {
                                           e.stopPropagation()
                                           setOpenDropdownId(null)
                                           setDropdownPosition(null)
                                           if (confirm('Are you sure you want to restore this archived task?')) {
                                             setRestoringTaskId(task._id)
                                             try {
                                               const response = await fetch(`/api/tasks/${task._id}`, {
                                                 method: 'PUT',
                                                 headers: { 'Content-Type': 'application/json' },
                                                 body: JSON.stringify({
                                                   isArchived: false
                                                 })
                                               })

                                               if (response.ok) {
                                                 alert('Task restored successfully!')
                                                 onRefresh()
                                               } else {
                                                 const errorData = await response.json()
                                                 alert(`Failed to restore task: ${errorData.error || 'Unknown error'}`)
                                               }
                                             } catch (error) {
                                               console.error('Error restoring task:', error)
                                               alert('Failed to restore task')
                                             } finally {
                                               setRestoringTaskId(null)
                                             }
                                           }
                                         }}
                                       >
                                         {restoringTaskId === task._id ? (
                                           <FiLoader className="w-4 h-4 mr-3 animate-spin" />
                                         ) : (
                                           <FiCheckCircle className="w-4 h-4 mr-3" />
                                         )}
                                         Restore Task
                                       </button>
                                     )}
                              <div className="border-t border-gray-100 my-1"></div>
                                     <button
                                       className={`flex items-center w-full px-4 py-2 text-sm text-red-600 hover:theme-color-bg hover:text-white ${
                                         (deletingTaskId === task._id || (task.pendingHours ?? 0) > 0 || isCalculatingPendingHours) ? 'opacity-50 cursor-not-allowed' : ''
                                       }`}
                                       disabled={deletingTaskId === task._id || (task.pendingHours ?? 0) > 0 || isCalculatingPendingHours}
                                       title={isCalculatingPendingHours ? 'Calculating pending hours...' : (task.pendingHours ?? 0) > 0 ? `Cannot delete task with ${task.pendingHours} pending/unsubmitted hours` : 'Delete Task'}
                                       onClick={(e) => {
                                         e.stopPropagation()
                                         setOpenDropdownId(null)
                                         setDropdownPosition(null)
                                         if (confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
                                           handleDeleteTask(task._id)
                                         }
                                       }}
                                     >
                                       {deletingTaskId === task._id ? (
                                         <FiLoader className="w-4 h-4 mr-3 animate-spin" />
                                       ) : (
                                         <FiTrash2 className="w-4 h-4 mr-3" />
                                       )}
                                       Delete Task
                                     </button>
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        )
      ) : (
        showArchived ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <FiArchive className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No archived tasks</h3>
            <p className="text-gray-500 mb-6">You have no archived tasks at the moment.</p>
          </div>
        ) : (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <FiCheckSquare className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No task modules yet</h3>
            <p className="text-gray-500 mb-6">Get started by creating your first task module.</p>
            <Link
              href="/admin/manage/tasks/create"
              className="btn-primary inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-600"
            >
              <FiPlus className="w-4 h-4 mr-2" />
              Create your first task module
            </Link>
          </div>
        )
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Export Task Data</h3>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <FiX className="w-6 h-6" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Export the current task listing ({tasksToDisplay.length} tasks) as CSV or Excel file.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={exportTasksToCSV}
                disabled={exportingTasks !== null}
                className="btn-primary flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {exportingTasks === 'csv' ? (
                  <>
                    <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Exporting...
                  </>
                ) : (
                  'Export as CSV'
                )}
              </button>
              <button
                onClick={exportTasksToExcel}
                disabled={exportingTasks !== null}
                className="btn-primary flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {exportingTasks === 'excel' ? (
                  <>
                    <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Exporting...
                  </>
                ) : (
                  'Export as Excel'
                )}
              </button>
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


export default function ManageContent({ initialClients, initialTasks, activeTab: initialActiveTab, userRole = 'admin' }: ManageContentProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  usePageTitle('Manage')

  // Use client-side state for instant tab switching
  const [activeTab, setActiveTab] = useState<'clients' | 'tasks' | 'roles'>(initialActiveTab)
  const [clients, setClients] = useState<Client[]>(initialClients)
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [selectedTasks, setSelectedTasks] = useState<string[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [isCalculatingPendingHours, setIsCalculatingPendingHours] = useState(false)

  // Sync activeTab with URL (but don't block on it)
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab') as 'clients' | 'tasks' | 'roles' | null
    if (tabFromUrl && ['clients', 'tasks', 'roles'].includes(tabFromUrl)) {
      setActiveTab(tabFromUrl)
    }
  }, [searchParams])

  // Function to refresh data
  const refreshData = () => {
    setRefreshKey(prev => prev + 1)
  }

  // Check for refresh flags from edit pages and refresh data accordingly
  useEffect(() => {
    // Use a small delay to ensure URL sync has completed
    const checkFlags = () => {
      // Check for client refresh flag
      const refreshClients = sessionStorage.getItem('refreshClients')
      if (refreshClients === 'true') {
        sessionStorage.removeItem('refreshClients')
        // Switch to clients tab if not already there
        if (activeTab !== 'clients') {
          setActiveTab('clients')
          // Refresh after tab switch (use setTimeout to ensure state update completes)
          setTimeout(() => {
            refreshData()
          }, 100)
        } else {
          // Already on clients tab, refresh immediately
          refreshData()
        }
        return // Exit early to avoid checking tasks flag
      }

      // Check for task refresh flag
      const refreshTasks = sessionStorage.getItem('refreshTasks')
      if (refreshTasks === 'true') {
        sessionStorage.removeItem('refreshTasks')
        // Switch to tasks tab if not already there
        if (activeTab !== 'tasks') {
          setActiveTab('tasks')
          // Refresh after tab switch (use setTimeout to ensure state update completes)
          setTimeout(() => {
            refreshData()
          }, 100)
        } else {
          // Already on tasks tab, refresh immediately
          refreshData()
        }
      }
    }

    // Small delay to ensure URL sync completes first
    const timeoutId = setTimeout(checkFlags, 50)
    return () => clearTimeout(timeoutId)
  }, [activeTab, searchParams]) // Run on mount and when tab/URL changes to catch navigation from edit pages

  // Helper function to calculate pendingHours for tasks in batch (highly optimized)
  const calculatePendingHours = useCallback(async (taskList: Task[]): Promise<Task[]> => {
    if (taskList.length === 0) return taskList

    try {
      const { sanityFetch } = await import('@/lib/sanity')
      const taskIds = taskList.map(t => t._id)
      
      // Highly optimized query: Only fetch task IDs, filter early, minimize data transfer
      // Using explicit status values and early filtering for better performance
      const pendingHoursData = await sanityFetch<Array<string>>({
        query: `*[_type == "timesheet" && status in ["unsubmitted", "submitted"] && count(entries[task._ref in $taskIds]) > 0].entries[task._ref in $taskIds].task._ref`,
        params: { taskIds }
      })

      // Count entries per task using Map (O(1) lookups, very fast)
      const pendingHoursMap = new Map<string, number>()
      pendingHoursData.forEach((taskId: string) => {
        if (taskId) {
          pendingHoursMap.set(taskId, (pendingHoursMap.get(taskId) || 0) + 1)
        }
      })

      return taskList.map(task => ({
        ...task,
        pendingHours: pendingHoursMap.get(task._id) || 0
      }))
    } catch (error) {
      console.error('Error calculating pendingHours:', error)
      return taskList.map(task => ({ ...task, pendingHours: task.pendingHours || 0 }))
    }
  }, [])

  // Calculate pendingHours immediately when tasks tab is accessed
  useEffect(() => {
    if (activeTab === 'tasks' && tasks.length > 0) {
      // Check if tasks need pendingHours calculated (if all are 0, they might need calculation)
      const needsCalculation = tasks.some(t => t.pendingHours === 0 || t.pendingHours === undefined)
      if (needsCalculation) {
        // Calculate immediately (not in background) to update button states quickly
        setIsCalculatingPendingHours(true)
        calculatePendingHours(tasks).then(tasksWithHours => {
          setTasks(tasksWithHours)
          setIsCalculatingPendingHours(false)
        }).catch(() => {
          // Silently fail - tasks will show with pendingHours = 0
          setIsCalculatingPendingHours(false)
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]) // Only run when tab changes to tasks

  // Track which tabs have been loaded using ref to avoid dependency issues
  const loadedTabsRef = useRef<Set<string>>(new Set<string>())
  
  // Initialize loaded tabs based on initial data (only once on mount)
  useEffect(() => {
    if (initialClients.length > 0) {
      loadedTabsRef.current.add('clients')
    }
    if (initialTasks.length > 0) {
      loadedTabsRef.current.add('tasks')
      // Set initial tasks with pendingHours = 0 (will be calculated in background)
      setTasks(initialTasks.map(task => ({ ...task, pendingHours: task.pendingHours || 0 })))
    }
  }, []) // Only run once on mount

  // OPTIMIZED: Fetch data when needed (tab change without data, or manual refresh)
  // Use initial data immediately, fetch fresh data when switching to tab without data
  useEffect(() => {
    // Check if we need to fetch data for the active tab
    const needsFetch = 
      refreshKey > 0 || // Manual refresh
      (activeTab === 'clients' && !loadedTabsRef.current.has('clients')) || // Clients tab not loaded yet
      (activeTab === 'tasks' && !loadedTabsRef.current.has('tasks')) // Tasks tab not loaded yet

    if (!needsFetch) {
      return // Use existing data
    }

    const fetchFreshData = async () => {
      try {
        // Import sanityFetch dynamically to avoid SSR issues
        const { sanityFetch } = await import('@/lib/sanity')

        if (activeTab === 'clients') {
          const query = `
            *[_type == "client" && !(_id in path("drafts.**"))] | order(createdAt desc) {
              _id,
              name,
              slug,
              contacts,
              address,
              preferredCurrency,
              isActive,
              isArchived,
              createdAt
            }
          `
          const freshClients = await sanityFetch<Client[]>({ query })
          setClients(freshClients || [])
          loadedTabsRef.current.add('clients')
        } else if (activeTab === 'tasks') {
          // Optimized: Fetch tasks without expensive pendingHours first
          const query = `
            *[_type == "task" && !(_id in path("drafts.**"))] | order(createdAt desc) {
              _id,
              name,
              slug,
              description,
              projects[]->{
                _id,
                name,
                code,
                client->{name}
              },
              isBillable,
              isActive,
              isArchived,
              category->{
                _id,
                name,
                slug,
                color,
                icon
              },
              updatedAt
            }
          `
          const freshTasks = await sanityFetch<Task[]>({ query })
          
          // Set tasks immediately (even if pendingHours calculation fails)
          setTasks(freshTasks || [])
          loadedTabsRef.current.add('tasks')
          
          // Calculate pendingHours immediately (not in background) to update button states quickly
          if (freshTasks && freshTasks.length > 0) {
            setIsCalculatingPendingHours(true)
            calculatePendingHours(freshTasks).then(tasksWithPendingHours => {
              setTasks(tasksWithPendingHours)
              setIsCalculatingPendingHours(false)
            }).catch(error => {
              // Silently fail - tasks already set without pendingHours
              console.error('Error calculating pendingHours:', error)
              setIsCalculatingPendingHours(false)
            })
          }
        }
      } catch (error) {
        console.error('Error fetching fresh data:', error)
      }
    }

    fetchFreshData()
  }, [refreshKey, activeTab, calculatePendingHours]) // Fetch when refreshKey changes OR tab changes to one without data

  // Selection handlers
  const handleToggleTask = (taskId: string) => {
    setSelectedTasks(prev =>
      prev.includes(taskId)
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    )
  }

  const handleToggleCategory = (categoryKey: string) => {
    // Group tasks by category for this operation
    const groupedTasks = tasks.reduce((acc, task) => {
      const categorySlug = task.category?.slug || 'other'
      if (!acc[categorySlug]) {
        acc[categorySlug] = []
      }
      acc[categorySlug].push(task)
      return acc
    }, {} as Record<string, Task[]>)

    const categoryTaskIds = groupedTasks[categoryKey]?.map(task => task._id) || []

    setSelectedTasks(prev => {
      const allSelectedInCategory = categoryTaskIds.every(id => prev.includes(id))
      if (allSelectedInCategory) {
        // Deselect all in category
        return prev.filter(id => !categoryTaskIds.includes(id))
      } else {
        // Select all in category
        return [...new Set([...prev, ...categoryTaskIds])]
      }
    })
  }

  const handleToggleAll = (taskIds: string[]) => {
    setSelectedTasks(prev => {
      const allSelected = taskIds.every(id => prev.includes(id))
      if (allSelected) {
        // Deselect all
        return prev.filter(id => !taskIds.includes(id))
      } else {
        // Select all
        return [...new Set([...prev, ...taskIds])]
      }
    })
  }

  const handleClearSelection = () => {
    setSelectedTasks([])
    setSelectedCategories([])
  }

  // Bulk operations
  const handleBulkArchive = async () => {
    try {
      const response = await fetch('/api/tasks/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskIds: selectedTasks,
          operation: 'archive'
        })
      })

      if (response.ok) {
        const data = await response.json()

        let message = data.message || `Successfully archived ${data.successCount} task${data.successCount !== 1 ? 's' : ''}`
        if (data.errorCount > 0) {
          message += `. ${data.errorCount} failed.`

          // Show detailed error information
          if (data.errors && data.errors.length > 0) {
            const errorDetails = data.errors.map((err: any) =>
              `Task ${err.id}: ${err.error}`
            ).join('\n')
            message += `\n\nError details:\n${errorDetails}`
          }
        }

        alert(message)

        if (data.successCount > 0) {
          setSelectedTasks([])
          setSelectedCategories([])
          refreshData() // Refresh the task list instead of reloading page
        }
      } else {
        const errorData = await response.json()
        alert(`Failed to archive tasks: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error archiving tasks:', error)
      alert('Failed to archive tasks')
    }
  }

  const handleBulkDelete = async () => {
    try {
      const response = await fetch('/api/tasks/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskIds: selectedTasks,
          operation: 'delete'
        })
      })

      if (response.ok) {
        const data = await response.json()

        let message = data.message || `Successfully deleted ${data.successCount} task${data.successCount !== 1 ? 's' : ''}`
        if (data.errorCount > 0) {
          message += `. ${data.errorCount} failed.`

          // Show detailed error information
          if (data.errors && data.errors.length > 0) {
            const errorDetails = data.errors.map((err: any) => {
              let detail = `• ${err.error}`
              if (err.suggestion) {
                detail += ` (${err.suggestion})`
              }
              return detail
            }).join('\n')
            message += `\n\nCould not delete:\n${errorDetails}`
          }
        }

        alert(message)

        if (data.successCount > 0) {
          setSelectedTasks([])
          setSelectedCategories([])
          refreshData() // Refresh the task list instead of reloading page
        }
      } else {
        const errorData = await response.json()
        alert(`Failed to delete tasks: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error deleting tasks:', error)
      alert('Failed to delete tasks')
    }
  }

  // Instant tab switching with URL sync (non-blocking)
  const handleTabChange = (tab: 'clients' | 'tasks' | 'roles') => {
    // Update state immediately (instant UI feedback)
    setActiveTab(tab)
    
    // Update URL without page reload (non-blocking)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    router.replace(`/admin/manage?${params.toString()}`, { scroll: false })
  }

  return (
    <DashboardLayout role={userRole === 'admin' ? 'admin' : 'manager'}>
      <div className="space-y-6">
        <div className="flex items-center justify-between bg-white rounded-lg shadow-sm p-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Manage</h2>
            <p className="mt-1 text-sm text-gray-500">
              Manage clients and task modules
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="border-b border-gray-200 overflow-y-hidden overflow-x-auto">
            <nav className="-mb-px flex space-x-8 px-6">
              <button
                onClick={() => handleTabChange('clients')}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                  activeTab === 'clients'
                    ? 'theme-color theme-color-border'
                    : 'border-transparent text-gray-500 hover:theme-color hover:theme-color-border'
                }`}
              >
                <FiBriefcase className="w-5 h-5" />
                <span>Clients</span>
              </button>
              <button
                onClick={() => handleTabChange('tasks')}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                  activeTab === 'tasks'
                    ? 'theme-color theme-color-border'
                    : 'border-transparent text-gray-500 hover:theme-color hover:theme-color-border'
                }`}
              >
                <FiCheckSquare className="w-5 h-5" />
                <span>Task</span>
              </button>
              {userRole === 'admin' && (
                <button
                  onClick={() => handleTabChange('roles')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                    activeTab === 'roles'
                      ? 'theme-color theme-color-border'
                      : 'border-transparent text-gray-500 hover:theme-color hover:theme-color-border'
                  }`}
                >
                  <FiCheckSquare className="w-5 h-5" />
                  <span>Roles</span>
                </button>
              )}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            <>
              {activeTab === 'clients' && <ClientsTabContent clients={clients} onRefresh={refreshData} />}
              {activeTab === 'tasks' && (
                <TasksTabContent
                  tasks={tasks}
                  selectedTasks={selectedTasks}
                  onToggleTask={handleToggleTask}
                  onToggleCategory={handleToggleCategory}
                  onToggleAll={handleToggleAll}
                  onClearSelection={handleClearSelection}
                  onBulkArchive={handleBulkArchive}
                  onBulkDelete={handleBulkDelete}
                  onRefresh={refreshData}
                  isCalculatingPendingHours={isCalculatingPendingHours}
                />
              )}
              {activeTab === 'roles' && userRole === 'admin' && <RolesTabContent />}
            </>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

