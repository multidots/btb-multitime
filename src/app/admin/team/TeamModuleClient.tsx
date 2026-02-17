'use client'

import { urlFor } from '@/lib/sanity'
import { formatSimpleTime } from '@/lib/time'
import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import {
  FiMoreVertical,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiUsers,
  FiDollarSign,
  FiX,
  FiDownload,
  FiArchive,
  FiTrash2
} from 'react-icons/fi'
import { MdPushPin } from 'react-icons/md'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

interface TeamMemberStats {
  _id: string
  firstName: string
  lastName: string
  email: string
  avatar?: any
  capacity?: number
  totalHours: number
  billableHours: number
  nonBillableHours: number
  timesheetHours?: number
  timesheetBillableHours?: number
  role?: string

  jobCategory?: {
    _id: string
    name: string
    slug: {
      current: string
    }
  }
  isPinned?: boolean
  hasLoggedHours?: boolean
  manager?: {
    _id: string
    firstName: string
    lastName: string
  }
}

interface WeeklyTeamStats {
  totalHours: number
  teamCapacity: number
  billableHours: number
  nonBillableHours: number
  teamMembers: TeamMemberStats[]
}

export default function TeamModuleClient() {
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null)
  // Initialize currentWeek from localStorage or default to current week
  const [currentWeek, setCurrentWeek] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('team_listing_viewed_week')
      if (stored) {
        const parsedDate = parseISO(stored)
        if (!isNaN(parsedDate.getTime())) {
          return startOfWeek(parsedDate, { weekStartsOn: 1 })
        }
      }
    }
    return startOfWeek(new Date(), { weekStartsOn: 1 })
  })
  const [stats, setStats] = useState<WeeklyTeamStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [pinningMember, setPinningMember] = useState<string | null>(null)
  const [archivingMember, setArchivingMember] = useState<string | null>(null)
  const [deletingMember, setDeletingMember] = useState<string | null>(null)
  const [membersWithPendingApprovals, setMembersWithPendingApprovals] = useState<Set<string>>(new Set())
  const [checkingPendingApprovals, setCheckingPendingApprovals] = useState(false)
  const [filterCategory, setFilterCategory] = useState<string>('everyone')
  const [categories, setCategories] = useState<Array<{ _id: string; name: string; slug: { current: string } }>>([])
  const [showExportModal, setShowExportModal] = useState(false)
  const [navigatingToArchived, setNavigatingToArchived] = useState(false)
  const [exporting, setExporting] = useState<'csv' | 'excel' | null>(null)
  const [archivedPeopleCount, setArchivedPeopleCount] = useState<number>(0)
  const [menuPositions, setMenuPositions] = useState<Record<string, 'above' | 'below'>>({})
  const [menuButtonPositions, setMenuButtonPositions] = useState<Record<string, { top: number; right: number; height: number }>>({})
  const router = useRouter()
  const actionMenuRef = useRef<HTMLDivElement>(null)
  const actionButtonRefs = useRef<Record<string, HTMLButtonElement>>({})
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const isManager = session?.user?.role === 'manager'

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
        setOpenActionMenu(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Update menu position on resize or scroll
  useEffect(() => {
    if (!openActionMenu) return

    let rafId: number | null = null

    const updateMenuPosition = () => {
      const memberId = openActionMenu
      if (!memberId || !actionButtonRefs.current[memberId]) return

      const button = actionButtonRefs.current[memberId]
      const buttonRect = button.getBoundingClientRect()
      
      // Update button position
      const buttonRight = window.innerWidth - buttonRect.right
      const buttonTop = buttonRect.top
      const buttonHeight = buttonRect.height
      
      setMenuButtonPositions(prev => ({
        ...prev,
        [memberId]: { top: buttonTop, right: buttonRight, height: buttonHeight }
      }))

      // Recalculate if menu should be above or below
      const viewportHeight = window.innerHeight
      const menuItemHeight = 40
      const menuItemCount = 2 + (isAdmin ? 2 : 0)
      const estimatedMenuHeight = menuItemCount * menuItemHeight
      
      const viewportSpaceBelow = viewportHeight - buttonRect.bottom
      const viewportSpaceAbove = buttonRect.top
      
      // Check if this is one of the last few rows
      const currentFilteredMembers = stats?.teamMembers.filter((member) => {
        if (filterCategory === 'pinned') return member.isPinned
        if (filterCategory === 'everyone') return true
        return member.jobCategory?.slug?.current === filterCategory
      }) || []
      
      const currentIndex = currentFilteredMembers.findIndex(m => m._id === memberId)
      const isLastFewRows = currentIndex >= currentFilteredMembers.length - 2
      
      // Determine position
      let position: 'above' | 'below' = 'below'
      if (isLastFewRows && viewportSpaceAbove > 100) {
        position = 'above'
      } else if (viewportSpaceBelow < estimatedMenuHeight && viewportSpaceAbove > estimatedMenuHeight) {
        position = 'above'
      }
      
      setMenuPositions(prev => ({ ...prev, [memberId]: position }))
    }

    const throttledUpdate = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        updateMenuPosition()
        rafId = null
      })
    }

    // Update position immediately
    updateMenuPosition()

    // Add event listeners with throttling for scroll
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', throttledUpdate, true) // Use capture to catch all scroll events

    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', throttledUpdate, true)
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
    }
  }, [openActionMenu, isAdmin, stats?.teamMembers, filterCategory])


  const weekStart = format(currentWeek, 'yyyy-MM-dd')
  const weekEnd = format(endOfWeek(currentWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  
  // Check if we're viewing the current week (disable next button)
  const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const isCurrentWeek = currentWeek.getTime() === thisWeekStart.getTime()

  // Track previous member IDs to prevent unnecessary pending approvals checks
  const prevMemberIdsRef = useRef<string>('')

  // Fetch categories and archived count only once on mount (they don't change with week) - parallel fetch
  useEffect(() => {
    Promise.all([
      fetchCategories(),
      fetchArchivedPeopleCount()
    ]).catch(err => console.error('Error fetching initial data:', err))
  }, [])

  // Fetch weekly stats when week changes
  useEffect(() => {
    fetchWeeklyStats()
  }, [currentWeek])

  // Persist current week to localStorage for page refresh persistence
  useEffect(() => {
    localStorage.setItem('team_listing_viewed_week', format(currentWeek, 'yyyy-MM-dd'))
  }, [currentWeek])

  // Only check pending approvals when member IDs actually change
  useEffect(() => {
    if (!stats?.teamMembers || !isAdmin || stats.teamMembers.length === 0) return
    
    const currentMemberIds = stats.teamMembers.map(m => m._id).sort().join(',')
    if (currentMemberIds !== prevMemberIdsRef.current) {
      prevMemberIdsRef.current = currentMemberIds
      checkPendingApprovalsForMembers()
    }
  }, [stats?.teamMembers, isAdmin])

  const checkPendingApprovalsForMembers = async () => {
    if (!stats?.teamMembers || checkingPendingApprovals || stats.teamMembers.length === 0) return
    
    setCheckingPendingApprovals(true)
    try {
      const memberIds = stats.teamMembers.map(m => m._id)
      
      // Use a single query to check all members for pending approvals
      const response = await fetch('/api/team/pending-approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIds }),
        cache: 'no-store'
      })
      
      if (response.ok) {
        const data = await response.json()
        const memberIdsWithPending = data.memberIds || []
        setMembersWithPendingApprovals(new Set(memberIdsWithPending))
      } else {
        console.error('Failed to check pending approvals:', response.status, response.statusText)
      }
    } catch (error) {
      console.error('Error checking pending approvals:', error)
    } finally {
      setCheckingPendingApprovals(false)
    }
  }

  const fetchWeeklyStats = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/team/weekly?weekStart=${weekStart}&weekEnd=${weekEnd}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Failed to fetch team stats')
      const data = await response.json()
      setStats(data)
    } catch (error) {
      console.error('Error fetching weekly stats:', error)
      toast.error('Failed to load team statistics')
      setStats({
        totalHours: 0,
        teamCapacity: 0,
        billableHours: 0,
        nonBillableHours: 0,
        teamMembers: []
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/categories', { cache: 'no-store' })
      if (!response.ok) throw new Error('Failed to fetch categories')
      const data = await response.json()
      setCategories(data)
    } catch (error) {
      console.error('Error fetching categories:', error)
    }
  }

  const fetchArchivedPeopleCount = async () => {
    try {
      const response = await fetch('/api/team/archived', { cache: 'no-store' })
      if (!response.ok) throw new Error('Failed to fetch archived people count')
      const data = await response.json()
      setArchivedPeopleCount(data.length)
    } catch (error) {
      console.error('Error fetching archived people count:', error)
      setArchivedPeopleCount(0)
    }
  }

  const handlePreviousWeek = () => {
    setCurrentWeek(subWeeks(currentWeek, 1))
    // useEffect will automatically fetch when currentWeek changes
  }
  
  const handleNextWeek = () => {
    setCurrentWeek(addWeeks(currentWeek, 1))
    // useEffect will automatically fetch when currentWeek changes
  }
  
  const handleToday = () => {
    setCurrentWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))
    // useEffect will automatically fetch when currentWeek changes
  }

  const formatHours = (hours: number) => formatSimpleTime(hours)

  // 👇 Handle opening/closing member action menu
  const handleMemberAction = (memberId: string, event?: React.MouseEvent<HTMLButtonElement>) => {
    const isOpening = openActionMenu !== memberId
    
    if (isOpening && event?.currentTarget) {
      // Calculate filtered members for position check
      const currentFilteredMembers = stats?.teamMembers.filter((member) => {
        if (filterCategory === 'pinned') return member.isPinned
        if (filterCategory === 'everyone') return true
        return member.jobCategory?.slug?.current === filterCategory
      }) || []
      
      // Calculate if menu should be positioned above or below
      const buttonRect = event.currentTarget.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      // Calculate actual menu height based on number of items (40px per item)
      const menuItemHeight = 40
      const menuItemCount = 2 + (isAdmin ? 2 : 0) // Edit + Pin + (Archive + Delete if admin)
      const estimatedMenuHeight = menuItemCount * menuItemHeight
      
      // Find the table container to check its boundaries
      let containerRect: DOMRect | null = null
      // Look for the overflow container or table/tbody element
      const tableContainer = event.currentTarget.closest('.overflow-x-auto') || 
                            event.currentTarget.closest('tbody')?.parentElement ||
                            event.currentTarget.closest('table')
      if (tableContainer) {
        containerRect = tableContainer.getBoundingClientRect()
      }
      
      // Calculate available space
      const viewportSpaceBelow = viewportHeight - buttonRect.bottom
      const viewportSpaceAbove = buttonRect.top
      
      // If we have a container, also check container boundaries
      let containerSpaceBelow = viewportSpaceBelow
      let containerSpaceAbove = viewportSpaceAbove
      if (containerRect) {
        containerSpaceBelow = containerRect.bottom - buttonRect.bottom
        containerSpaceAbove = buttonRect.top - containerRect.top
      }
      
      // Check if this is one of the last few rows
      const currentIndex = currentFilteredMembers.findIndex(m => m._id === memberId)
      const isLastFewRows = currentIndex >= currentFilteredMembers.length - 2
      
      // Store button position for fixed positioning (to avoid overflow clipping)
      const buttonRight = window.innerWidth - buttonRect.right
      const buttonTop = buttonRect.top
      const buttonHeight = buttonRect.height
      setMenuButtonPositions(prev => ({ ...prev, [memberId]: { top: buttonTop, right: buttonRight, height: buttonHeight } }))
      
      // For last few rows, prioritize positioning above if there's any space above
      // This prevents cutoff when there are only 2-3 rows
      if (isLastFewRows && viewportSpaceAbove > 100) {
        const position = 'above'
        setMenuPositions(prev => ({ ...prev, [memberId]: position }))
        setOpenActionMenu(openActionMenu === memberId ? null : memberId)
        return
      }
      
      // For other cases, check available space
      const shouldPositionAbove = 
        ((viewportSpaceBelow < estimatedMenuHeight || containerSpaceBelow < estimatedMenuHeight) && 
         viewportSpaceAbove > estimatedMenuHeight && 
         (containerSpaceAbove > estimatedMenuHeight || !containerRect))
      
      const position = shouldPositionAbove ? 'above' : 'below'
      setMenuPositions(prev => ({ ...prev, [memberId]: position }))
    }
    
    setOpenActionMenu(openActionMenu === memberId ? null : memberId)
  }

  // 👇 Handle edit action (navigate to edit page)
  const handleMemberEdit = (memberId: string) => {
    setOpenActionMenu(null)
    router.push(`/admin/team/edit/${memberId}`)
  }

  // 👇 Handle pin/unpin (API route: /api/team/members/[memberId]/pin)
  const handleMemberPin = async (memberId: string, pin: boolean) => {
    setPinningMember(memberId)
    // Keep menu open to show spinner
    setTimeout(() => setOpenActionMenu(null), 200)
    
    // Optimistic update - update UI immediately
    const previousStats = stats
    if (stats) {
      setStats({
        ...stats,
        teamMembers: stats.teamMembers.map(m => 
          m._id === memberId ? { ...m, isPinned: pin } : m
        )
      })
    }
    
    try {
      const response = await fetch(`/api/team/members/${memberId}/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPinned: pin })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to update pin status')
      }

      toast.success(`Member ${pin ? 'pinned' : 'unpinned'} successfully`)

      // Refresh in background (non-blocking) to ensure data consistency
      fetchWeeklyStats().catch(err => {
        console.error('Background refresh failed after pin:', err)
        // Revert optimistic update on error
        if (previousStats) {
          setStats(previousStats)
        }
      })
    } catch (error) {
      console.error('Error pinning member:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to update pin status')
      // Revert optimistic update on error
      if (previousStats) {
        setStats(previousStats)
      }
    } finally {
      setPinningMember(null)
    }
  }

  const handleArchiveMember = async (memberId: string) => {
    setOpenActionMenu(null)
    if (!window.confirm('Are you sure you want to archive this member?')) {
      return
    }
    
    setArchivingMember(memberId)
    
    // Optimistic update - remove member from list immediately
    const previousStats = stats
    const previousArchivedCount = archivedPeopleCount
    if (stats) {
      setStats({
        ...stats,
        teamMembers: stats.teamMembers.filter(m => m._id !== memberId)
      })
    }
    setArchivedPeopleCount(prev => prev + 1)
    
    try {
      const response = await fetch(`/api/team/members/${memberId}/archive`, {
        method: 'POST',
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to archive member')
      }
      toast.success('Member archived successfully')
      // Refresh in background to ensure data consistency
      Promise.all([
        fetchWeeklyStats(),
        fetchArchivedPeopleCount()
      ]).catch(err => {
        console.error('Background refresh failed after archive:', err)
        // Revert optimistic update on error
        if (previousStats) {
          setStats(previousStats)
        }
        setArchivedPeopleCount(previousArchivedCount)
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to archive member')
      // Revert optimistic update on error
      if (previousStats) {
        setStats(previousStats)
      }
      setArchivedPeopleCount(previousArchivedCount)
    } finally {
      setArchivingMember(null)
    }
  }

  const handleDeleteMember = async (memberId: string) => {
    setOpenActionMenu(null)
    
    // Prevent deletion if member has pending or unsubmitted time entries
    if (membersWithPendingApprovals.has(memberId)) {
      toast.error('Cannot delete member with pending or unsubmitted time entries')
      return
    }
    
    if (window.confirm('Are you sure you want to delete this member? This action cannot be undone.')) {
      setDeletingMember(memberId)
      
      // Optimistic update - remove member from list immediately
      const previousStats = stats
      if (stats) {
        setStats({
          ...stats,
          teamMembers: stats.teamMembers.filter(m => m._id !== memberId)
        })
      }
      
      try {
        const response = await fetch(`/api/team/members/${memberId}`, {
          method: 'DELETE',
        })
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || 'Failed to delete member')
        }
        toast.success('Member deleted successfully')
        // Refresh in background to ensure data consistency
        Promise.all([
          fetchWeeklyStats(),
          fetchArchivedPeopleCount()
        ]).catch(err => {
          console.error('Background refresh failed after delete:', err)
          // Revert optimistic update on error
          if (previousStats) {
            setStats(previousStats)
          }
        })
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to delete member')
        // Revert optimistic update on error
        if (previousStats) {
          setStats(previousStats)
        }
      } finally {
        setDeletingMember(null)
      }
    }
  }



  // Get filtered members based on current filter
  const filteredMembers = stats?.teamMembers.filter((member) => {
    if (filterCategory === 'pinned') return member.isPinned
    if (filterCategory === 'everyone') return true
    return member.jobCategory?.slug?.current === filterCategory
  }) || []

  // Prepare data for export
  const prepareData = () => {
    return filteredMembers.map((member) => {
      const utilization = member.capacity && member.capacity > 0
        ? (member.totalHours / member.capacity) * 100
        : 0

      return {
        'Name': `${member.firstName} ${member.lastName}`,
        'Email': member.email,
        'Job Title': member.jobCategory?.name || '',
        'Category': member.jobCategory?.name || '',
        'Capacity (hours)': member.capacity || 0,
        'Total Hours': member.totalHours,
        'Billable Hours': member.billableHours,
        'Non-Billable Hours': member.nonBillableHours,
        'Utilization %': member.capacity ? utilization.toFixed(1) : 'N/A',
        'Pinned': member.isPinned ? 'Yes' : 'No'
      }
    })
  }

  // Export to CSV
  const exportToCSV = () => {
    setExporting('csv')
    try {
      const data = prepareData()
      if (data.length === 0) {
        toast.error('No data to export')
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
      link.setAttribute('download', `team-members-${format(currentWeek, 'yyyy-MM-dd')}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setShowExportModal(false)
      toast.success('CSV exported successfully')
    } finally {
      setExporting(null)
    }
  }

  // Export to Excel
  const exportToExcel = () => {
    setExporting('excel')
    try {
      const data = prepareData()
      if (data.length === 0) {
        toast.error('No data to export')
        return
      }

      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Team Members')
      XLSX.writeFile(wb, `team-members-${format(currentWeek, 'yyyy-MM-dd')}.xlsx`)
      setShowExportModal(false)
      toast.success('Excel exported successfully')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between bg-white rounded-lg shadow p-4 flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Team Overview</h2>
          <p className="mt-1 text-sm text-gray-500">
            View team hours, capacity, and billable time by week
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowExportModal(true)}
            disabled={loading || exporting !== null || filteredMembers.length === 0}
            className="btn-primary px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? (
              <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <FiDownload className="w-4 h-4 mr-2" />
            )}
            {exporting ? 'Exporting...' : 'Export'}
          </button>
          <button
            onClick={() => {
              setNavigatingToArchived(true)
              router.push('/admin/team/archived')
            }}
            disabled={navigatingToArchived || !(isAdmin || isManager) || archivedPeopleCount === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-700 rounded-lg hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            title={archivedPeopleCount === 0 ? 'No archived people available' : 'View archived people'}
          >
            {navigatingToArchived ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Loading...
              </>
            ) : (
              'Archived People'
            )}
          </button>
        </div>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center space-x-2 gap-4 flex-wrap">
        <div className="flex">
        <button
          onClick={handlePreviousWeek}
          disabled={loading}
          className="p-1.5 rounded-s-md border border-[#1d1e1c40] hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FiChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <button
          onClick={handleNextWeek}
          disabled={loading || isCurrentWeek}
          className="p-1.5 rounded-e-md border border-l-0 border-[#1d1e1c40] hover:bg-gray-100 transition-colors disabled:cursor-not-allowed"
        >
          <FiChevronRight className="w-5 h-5 text-gray-600 " />
        </button>
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-center flex flex-wrap gap-x-3 gap-y-1 justify-center">
            <div className="font-medium text-gray-900">
              {(() => {
                const weekStart = currentWeek
                const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 })
                // Check if week spans two different years
                if (weekStart.getFullYear() !== weekEnd.getFullYear()) {
                  // Show year for both dates when spanning years
                  return `${format(weekStart, 'MMM d, yyyy')} - ${format(weekEnd, 'MMM d, yyyy')}`
                } else if (weekStart.getMonth() !== weekEnd.getMonth()) {
                  // Same year but different months
                  return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`
                } else {
                  // Same month and year
                  return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'd, yyyy')}`
                }
              })()}
            </div>
            <div className="">Week of {format(currentWeek, 'EEEE')}</div>
          </div>
          {format(currentWeek, 'yyyy-MM-dd') !== format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd') && (
            <button
              onClick={handleToday}
              disabled={loading}
              className="px-3 py-1 text-sm text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Return to this week
            </button>
          )}
        </div>
      </div>



      {/* Weekly Summary */}
      {stats && (() => {
        const totalTimesheetHours = stats.teamMembers.reduce((sum, member) => sum + (member.timesheetHours ?? 0), 0)
        const totalTimesheetBillableHours = stats.teamMembers.reduce((sum, member) => sum + (member.timesheetBillableHours ?? 0), 0)
        const totalTimesheetNonBillableHours = totalTimesheetHours - totalTimesheetBillableHours
        
        return (
        <div className="flex flex-wrap gap-4">
          <div className="flex-1">
            <div className="flex items-center">
              <FiClock className="w-8 h-8 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Hours</p>
                {/* <p className="text-2xl font-bold text-gray-900">{formatSimpleTime(stats.totalHours)}</p> */}
                <p className="text-2xl font-bold text-gray-900">{formatSimpleTime(totalTimesheetHours)}</p>
              </div>
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center">
              <FiUsers className="w-8 h-8 text-[#188433]" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Team Capacity</p>
                <p className="text-2xl font-bold text-gray-900">{formatSimpleTime(stats.teamCapacity)}</p>
              </div>
            </div>
          </div>
          <div className="flex-2 flex flex-wrap gap-4 items-center">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <FiDollarSign className="w-8 h-8 text-blue-600" />
                <div className="ml-4">
                  {/* <div className="flex items-center">
                    <div className="w-3 h-3 bg-[#376bdd] mr-2"></div>
                    <span className="text-sm font-medium text-gray-600">Billable: {formatSimpleTime(stats.billableHours)}</span>
                  </div> */}
                  {/* <div className="flex items-center mt-1">
                    <div className="w-3 h-3 bg-[#86b1f1] mr-2"></div>
                    <span className="text-sm font-medium text-gray-600">Non-Billable: {formatSimpleTime(stats.nonBillableHours)}</span>
                  </div> */}
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-[#376bdd] mr-2"></div>
                    <span className="text-sm font-medium text-gray-500">Billable: {formatSimpleTime(totalTimesheetBillableHours)}</span>
                  </div>
                  <div className="flex items-center mt-1">
                    <div className="w-3 h-3 bg-[#86b1f1] mr-2"></div>
                    <span className="text-sm font-medium text-gray-500">Non-Billable: {formatSimpleTime(totalTimesheetNonBillableHours)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-0">
              {/* <div className="w-full bg-gray-200 h-4 overflow-hidden relative">
                {stats.teamCapacity > 0 ? (
                  <>
                    <div
                      className="h-4 bg-[#376bdd] absolute left-0 top-0"
                      style={{ width: `${(stats.billableHours / stats.teamCapacity) * 100}%` }}
                    ></div>
                    <div
                      className="h-4 bg-[#86b1f1] absolute top-0"
                      style={{
                        left: `${(stats.billableHours / stats.teamCapacity) * 100}%`,
                        width: `${(stats.nonBillableHours / stats.teamCapacity) * 100}%`
                      }}
                    ></div>
                    <div
                      className="h-4 bg-[#86B1F1] absolute top-0"
                      style={{
                        left: `${((stats.billableHours + stats.nonBillableHours) / stats.teamCapacity) * 100}%`,
                        width: `${Math.max(0, 100 - ((stats.billableHours + stats.nonBillableHours) / stats.teamCapacity) * 100)}%`
                      }}
                    ></div>
                  </>
                ) : (
                    <div className="h-4 bg-[#86B1F1] w-full rounded-full"></div>
                )}
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-3">
                <span>Billable: {stats.teamCapacity > 0 ? ((stats.billableHours / stats.teamCapacity) * 100).toFixed(1) : 0}%</span>
                <span>Non-Billable: {stats.teamCapacity > 0 ? ((stats.nonBillableHours / stats.teamCapacity) * 100).toFixed(1) : 0}%</span>
                <span>Remaining: {stats.teamCapacity > 0 ? Math.max(0, 100 - ((stats.billableHours + stats.nonBillableHours) / stats.teamCapacity) * 100).toFixed(1) : 100}%</span>
              </div> */}
              {/* Timesheet Progress Bar */}
              <div className="mt-0">
                {/* <p className="text-xs text-gray-500 mb-2">Timesheet</p> */}
                <div className="w-full bg-gray-200 h-4 overflow-hidden relative">
                  {stats.teamCapacity > 0 ? (
                    <>
                      <div
                        className="h-4 bg-[#376bdd] absolute left-0 top-0"
                        style={{ width: `${(totalTimesheetBillableHours / stats.teamCapacity) * 100}%` }}
                      ></div>
                      <div
                        className="h-4 bg-[#86b1f1] absolute top-0"
                        style={{
                          left: `${(totalTimesheetBillableHours / stats.teamCapacity) * 100}%`,
                          width: `${(totalTimesheetNonBillableHours / stats.teamCapacity) * 100}%`
                        }}
                      ></div>
                      <div
                        className="h-4 bg-[#86B1F1] absolute top-0"
                        style={{
                          left: `${((totalTimesheetBillableHours + totalTimesheetNonBillableHours) / stats.teamCapacity) * 100}%`,
                          width: `${Math.max(0, 100 - ((totalTimesheetBillableHours + totalTimesheetNonBillableHours) / stats.teamCapacity) * 100)}%`
                        }}
                      ></div>
                    </>
                  ) : (
                    <div className="h-4 bg-[#86B1F1] w-full rounded-full"></div>
                  )}
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-3">
                  <span>Billable: {stats.teamCapacity > 0 ? ((totalTimesheetBillableHours / stats.teamCapacity) * 100).toFixed(1) : 0}%</span>
                  <span>Non-Billable: {stats.teamCapacity > 0 ? ((totalTimesheetNonBillableHours / stats.teamCapacity) * 100).toFixed(1) : 0}%</span>
                  <span>Remaining: {stats.teamCapacity > 0 ? Math.max(0, 100 - ((totalTimesheetBillableHours + totalTimesheetNonBillableHours) / stats.teamCapacity) * 100).toFixed(1) : 100}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        )
      })()}

      {/* Members Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Team Members</h3>
              <p className="mt-1 text-sm text-gray-500">Weekly hours breakdown for each team member</p>
            </div>
            <div className="flex items-center space-x-4">
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-3 pr-8 py-2 min-w-[215px] border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-transparent focus:border-black"
              >
                {categories.map((category) => (
                  <option key={category._id} value={category.slug.current}>
                    {category.name}
                  </option>
                ))}
                <option value="pinned">My Pinned</option>
                <option value="everyone">Everyone</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-s font-medium">Team Member</th>
                  <th className="px-6 py-3 text-left text-s font-medium">Manager</th>
                  {/* <th className="px-6 py-3 text-left text-s font-medium">Hours</th> */}
                  <th className="px-6 py-3 text-left text-s font-medium">Hours</th>
                  <th className="px-6 py-3 text-right text-s font-medium">Capacity</th>
                  {/* <th className="px-6 py-3 text-right text-s font-medium">Billable Hours</th> */}
                  <th className="px-6 py-3 text-right text-s font-medium">Billable Hours</th>
                  <th className="px-6 py-3 text-center text-s font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {[1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
                        <div className="ml-4 space-y-2">
                          <div className="h-4 bg-gray-200 rounded w-32"></div>
                          <div className="h-3 bg-gray-200 rounded w-20"></div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 bg-gray-200 rounded w-24"></div>
                    </td>
                    {/* <td className="px-6 py-4">
                      <div className="h-4 bg-gray-200 rounded w-16"></div>
                    </td> */}
                    <td className="px-6 py-4 text-right">
                      <div className="h-4 bg-gray-200 rounded w-12 ml-auto"></div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="h-4 bg-gray-200 rounded w-12 ml-auto"></div>
                    </td>
                    {/* <td className="px-6 py-4 text-right">
                      <div className="h-4 bg-gray-200 rounded w-12 ml-auto"></div>
                    </td> */}
                    <td className="px-6 py-4 text-right">
                      <div className="h-4 bg-gray-200 rounded w-12 ml-auto"></div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="h-4 bg-gray-200 rounded w-6 mx-auto"></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : stats && stats.teamMembers.length > 0 ? (
          <div className="overflow-x-auto relative">
            <table className="min-w-full">
              <thead className="bg-[#eee]">
                <tr>
                  <th className="px-6 py-2 text-left text-sm font-normal text-[#1d1e1c]">
                    Team Member
                  </th>
                  <th className="px-6 py-2 text-left text-sm font-normal text-[#1d1e1c]">Manager</th>
                  {/* <th className="px-6 py-2 text-left text-sm font-normal text-[#1d1e1c]">Hours</th> */}
                  <th className="px-6 py-2 text-center text-sm font-normal text-[#1d1e1c]">Hours</th>
                  <th className="px-6 py-2 text-right text-sm font-normal text-[#1d1e1c]">Capacity</th>
                  {/* <th className="px-6 py-2 text-right text-sm font-normal text-[#1d1e1c]">Billable Hours</th> */}
                  <th className="px-6 py-2 text-right text-sm font-normal text-[#1d1e1c]">Billable Hours</th>
                  <th className="px-6 py-2 text-center text-sm font-normal text-[#1d1e1c]">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white relative">
                {filteredMembers.map((member, index) => {

                  return (
                    <tr key={member._id} className="relative hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-2 whitespace-nowrap cursor-pointer" onClick={() => router.push(`/admin/team/details/${member._id}?week=${format(currentWeek, 'yyyy-MM-dd')}`)}>
                        <div className="flex items-center">
                          {member.isPinned && (
                            <MdPushPin className="w-4 h-4 text-yellow-500 mr-2" />
                          )}
                          <div className="h-10 w-10 rounded-full bg-black text-white flex items-center justify-center uppercase">
                            {member.avatar ? (
                              <img src={urlFor(member.avatar).fit('crop').url()} alt={`${member.firstName} ${member.lastName}`} className="h-10 w-10 rounded-full object-cover object-top" />
                            ) : (
                              <span>{member.firstName[0]}{member.lastName[0]}</span>
                            )}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900 capitalize">
                              {member.firstName} {member.lastName} ({member.role ? member.role.charAt(0).toUpperCase() + member.role.slice(1) : 'Unknown'})
                            </div>
                            <div className="text-xs text-gray-500">{member.jobCategory?.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-2 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full empty:hidden ${member.manager ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
                          {member.manager ? `${member.manager.firstName} ${member.manager.lastName}` : 'None'}
                        </span>
                      </td>
                      {/* Hours (time entry) column commented out
                      <td className="px-6 py-2 whitespace-nowrap text-right">
                        <div className="flex items-center gap-3">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{formatHours(member.totalHours)}</div>
                            <div className="text-xs text-gray-500">
                              <div className="flex items-center">
                                <div className="w-2 h-2 bg-[#376bdd] mr-1"></div>
                                <span>{formatHours(member.billableHours)}</span>
                              </div>
                              <div className="flex items-center mt-1">
                                <div className="w-2 h-2 bg-[#86b1f1] mr-1"></div>
                                <span>{formatHours(member.nonBillableHours)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="w-20 bg-gray-200 h-3 overflow-hidden relative rounded-[4px]">
                            {member.capacity && member.capacity > 0 ? (
                              <>
                                <div
                                  className={`h-3 absolute left-0 top-0 ${
                                    member.totalHours > member.capacity ? 'bg-red-600' : 'bg-[#376bdd]'
                                  }`}
                                  style={{ width: `${Math.min((member.billableHours / member.capacity) * 100, 100)}%` }}
                                ></div>
                                <div
                                  className={`h-3 absolute top-0 ${
                                    member.totalHours > member.capacity ? 'bg-red-400' : 'bg-[#86b1f1]'
                                  }`}
                                  style={{
                                    left: `${Math.min((member.billableHours / member.capacity) * 100, 100)}%`,
                                    width: `${Math.min((member.nonBillableHours / member.capacity) * 100, Math.max(0, 100 - (member.billableHours / member.capacity) * 100))}%`
                                  }}
                                ></div>
                                <div
                                  className="h-3 bg-[#86B1F1] absolute top-0"
                                  style={{
                                    left: `${Math.min(((member.billableHours + member.nonBillableHours) / member.capacity) * 100, 100)}%`,
                                    width: `${Math.max(0, 100 - Math.min(((member.billableHours + member.nonBillableHours) / member.capacity) * 100, 100))}%`
                                  }}
                                ></div>
                              </>
                            ) : (
                              <div className="h-3 bg-gray-300 w-full"></div>
                            )}
                          </div>
                        </div>
                      </td>
                      */}
                      <td className="px-6 py-2 whitespace-nowrap text-right">
                        <div className="flex items-center gap-3 justify-end">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{formatHours(member.timesheetHours ?? 0)}</div>
                            <div className="text-xs text-gray-500">
                              <div className="flex items-center">
                                <div className="w-2 h-2 bg-[#376bdd] mr-1"></div>
                                <span>{formatHours(member.timesheetBillableHours ?? 0)}</span>
                              </div>
                              <div className="flex items-center mt-1">
                                <div className="w-2 h-2 bg-[#86b1f1] mr-1"></div>
                                <span>{formatHours((member.timesheetHours ?? 0) - (member.timesheetBillableHours ?? 0))}</span>
                              </div>
                            </div>
                          </div>
                          <div className="w-20 bg-gray-200 h-3 overflow-hidden relative rounded-[4px]">
                            {member.capacity && member.capacity > 0 ? (
                              <>
                                <div
                                  className={`h-3 absolute left-0 top-0 ${
                                    (member.timesheetHours ?? 0) > member.capacity ? 'bg-red-600' : 'bg-[#376bdd]'
                                  }`}
                                  style={{ width: `${Math.min(((member.timesheetBillableHours ?? 0) / member.capacity) * 100, 100)}%` }}
                                ></div>
                                <div
                                  className={`h-3 absolute top-0 ${
                                    (member.timesheetHours ?? 0) > member.capacity ? 'bg-red-400' : 'bg-[#86b1f1]'
                                  }`}
                                  style={{
                                    left: `${Math.min(((member.timesheetBillableHours ?? 0) / member.capacity) * 100, 100)}%`,
                                    width: `${Math.min(((member.timesheetHours ?? 0) - (member.timesheetBillableHours ?? 0)) / member.capacity * 100, Math.max(0, 100 - ((member.timesheetBillableHours ?? 0) / member.capacity) * 100))}%`
                                  }}
                                ></div>
                                <div
                                  className="h-3 bg-[#86B1F1] absolute top-0"
                                  style={{
                                    left: `${Math.min(((member.timesheetHours ?? 0) / member.capacity) * 100, 100)}%`,
                                    width: `${Math.max(0, 100 - Math.min(((member.timesheetHours ?? 0) / member.capacity) * 100, 100))}%`
                                  }}
                                ></div>
                              </>
                            ) : (
                              <div className="h-3 bg-gray-300 w-full"></div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-2 text-sm text-right">{member.capacity ? formatHours(member.capacity) : '—'}</td>
                      {/* <td className="px-6 py-2 text-sm text-green-600 text-right">{formatHours(member.billableHours)}</td> */}
                      <td className="px-6 py-2 text-sm text-green-600 text-right">{formatHours(member.timesheetBillableHours ?? 0)}</td>
                      <td className="px-6 py-2 text-center relative">
                        <div className="flex items-center justify-center gap-2">
                          {(pinningMember === member._id || archivingMember === member._id || deletingMember === member._id) && (
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
                          )}
                          <button
                            type="button"
                            ref={(el) => {
                              if (el) {
                                actionButtonRefs.current[member._id] = el
                              } else {
                                delete actionButtonRefs.current[member._id]
                              }
                            }}
                            onClick={(e) => handleMemberAction(member._id, e)}
                            className="text-gray-400 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={pinningMember !== null || archivingMember !== null || deletingMember !== null}
                          >
                            <FiMoreVertical className="w-5 h-5" />
                          </button>
                        </div>

                        {openActionMenu === member._id && (() => {
                          let buttonPos = menuButtonPositions[member._id]
                          
                          // Fallback: calculate from button ref if position not in state yet
                          if (!buttonPos && actionButtonRefs.current[member._id]) {
                            const buttonRect = actionButtonRefs.current[member._id].getBoundingClientRect()
                            buttonPos = {
                              top: buttonRect.top,
                              right: window.innerWidth - buttonRect.right,
                              height: buttonRect.height
                            }
                          }
                          
                          // Calculate actual menu height based on number of items
                          // Each menu item is approximately 40px (py-2 = 8px top + 8px bottom + ~24px text height)
                          const menuItemHeight = 40
                          const menuItemCount = 2 + (isAdmin ? 2 : 0) // Edit + Pin + (Archive + Delete if admin)
                          const menuHeight = menuItemCount * menuItemHeight
                          const buttonHeight = buttonPos?.height || 20
                          
                          const position = menuPositions[member._id] || 'below'
                          
                          // Calculate top position: 
                          // - If above: position so bottom of menu aligns with top of button (buttonPos.top - 4px gap)
                          // - If below: position so top of menu aligns with bottom of button (buttonPos.top + buttonHeight + 4px gap)
                          const top = buttonPos ? (position === 'above' 
                            ? buttonPos.top - menuHeight - 4
                            : buttonPos.top + buttonHeight + 4) : 0
                          
                          const right = buttonPos ? (buttonPos.right - 24) : 24 // 24px offset from right edge
                          
                          return (
                            <div
                              ref={actionMenuRef}
                              className="fixed w-40 bg-white border border-gray-200 rounded-md shadow-lg z-50"
                              style={{
                                top: `${top}px`,
                                right: `${right}px`
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                            <button
                              onClick={() => handleMemberEdit(member._id)}
                              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-black hover:text-white"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleMemberPin(member._id, !member.isPinned)}
                              disabled={pinningMember === member._id}
                              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-black hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {pinningMember === member._id ? (
                                <div className="flex items-center">
                                  <div className="animate-spin rounded-full h-3 w-3 border-b border-gray-700 mr-2"></div>
                                  {member.isPinned ? 'Unpinning...' : 'Pinning...'}
                                </div>
                              ) : (
                                member.isPinned ? 'Unpin' : 'Pin'
                              )}
                            </button>
                            {isAdmin && (
                              <>
                                <button
                                  onClick={() => handleArchiveMember(member._id)}
                                  disabled={archivingMember === member._id || deletingMember === member._id}
                                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-black hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {archivingMember === member._id ? (
                                    <div className="flex items-center">
                                      <div className="animate-spin rounded-full h-3 w-3 border-b border-gray-700 mr-2"></div>
                                      Archiving...
                                    </div>
                                  ) : (
                                    <div className="flex items-center">
                                      <FiArchive className="w-4 h-4 mr-2" />
                                      Archive
                                    </div>
                                  )}
                                </button>
                                <button
                                  onClick={(e) => {
                                    if (deletingMember === member._id || archivingMember === member._id || membersWithPendingApprovals.has(member._id)) {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      return
                                    }
                                    handleDeleteMember(member._id)
                                  }}
                                  disabled={deletingMember === member._id || archivingMember === member._id || membersWithPendingApprovals.has(member._id)}
                                  title={membersWithPendingApprovals.has(member._id) ? 'Cannot delete member with pending or unsubmitted time entries' : ''}
                                  className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-black hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {deletingMember === member._id ? (
                                    <div className="flex items-center">
                                      <div className="animate-spin rounded-full h-3 w-3 border-b border-red-600 mr-2"></div>
                                      Deleting...
                                    </div>
                                  ) : (
                                    <div className="flex items-center">
                                      <FiTrash2 className="w-4 h-4 mr-2" />
                                      Delete
                                    </div>
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                          )
                        })()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-gray-500">No team members found</div>
        )}
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Export Team Data</h3>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <FiX className="w-6 h-6" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Export the current team listing ({filteredMembers.length} members) as CSV or Excel file.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={exportToCSV}
                disabled={exporting !== null}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {exporting === 'csv' ? (
                  <>
                    <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Exporting...
                  </>
                ) : (
                  'Export as CSV'
                )}
              </button>
              <button
                onClick={exportToExcel}
                disabled={exporting !== null}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {exporting === 'excel' ? (
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

