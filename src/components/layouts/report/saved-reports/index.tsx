'use client'

import React, { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { useSession } from 'next-auth/react'
import { FiTrash2, FiExternalLink, FiCalendar, FiUsers, FiFolder, FiLayers, FiUser, FiGlobe, FiLock } from 'react-icons/fi'

interface Report {
	_id: string
	name: string
	type: 'time' | 'project' | 'user' | 'client' | 'detailed_time'
	description?: string
	filters?: {
		dateRange?: {
			startDate?: string
			endDate?: string
		}
		timeframe?: string
		clients?: { _ref: string }[]
		projects?: { _ref: string }[]
		tasks?: { _ref: string }[]
		users?: { _ref: string }[]
	}
	isPublic?: boolean
	createdAt?: string
	createdBy?: {
		_id: string
		firstName?: string
		lastName?: string
		email?: string
	}
}

interface SavedReportsProps {
	basePath?: string // '/admin/reports' or '/dashboard/reports'
}

export default function SavedReports({ basePath = '/admin/reports' }: SavedReportsProps) {
	const { data: session } = useSession()
	const [reports, setReports] = useState<Report[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [deletingId, setDeletingId] = useState<string | null>(null)
	
	const currentUserId = session?.user?.id

	const fetchReports = async () => {
		try {
			setLoading(true)
			const response = await fetch('/api/reports')
			if (!response.ok) {
				throw new Error('Failed to fetch reports')
			}
			const data = await response.json()
			setReports(data)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to fetch reports')
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		fetchReports()
	}, [])

	const handleDelete = async (reportId: string) => {
		if (!confirm('Are you sure you want to delete this report?')) {
			return
		}

		setDeletingId(reportId)
		try {
			const response = await fetch(`/api/reports?id=${reportId}`, {
				method: 'DELETE',
			})

			if (!response.ok) {
				throw new Error('Failed to delete report')
			}

			setReports((prev) => prev.filter((r) => r._id !== reportId))
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Failed to delete report')
		} finally {
			setDeletingId(null)
		}
	}

	const buildReportUrl = (report: Report): string => {
		const params = new URLSearchParams()

		// Handle detailed_time reports differently
		if (report.type === 'detailed_time') {
			// Set timeframe
			if (report.filters?.timeframe) {
				params.set('timeframe', report.filters.timeframe)
			}

			// Set date range
			if (report.filters?.dateRange?.startDate) {
				params.set('start_date', report.filters.dateRange.startDate)
			}
			if (report.filters?.dateRange?.endDate) {
				params.set('end_date', report.filters.dateRange.endDate)
			}

			// Set array filters for detailed time (uses clients[], projects[], tasks[])
			if (report.filters?.clients && report.filters.clients.length > 0) {
				report.filters.clients.forEach((c) => params.append('clients[]', c._ref))
			}
			if (report.filters?.projects && report.filters.projects.length > 0) {
				report.filters.projects.forEach((p) => params.append('projects[]', p._ref))
			}
			if (report.filters?.tasks && report.filters.tasks.length > 0) {
				report.filters.tasks.forEach((t) => params.append('tasks[]', t._ref))
			}

			return `${basePath}/detailed?${params.toString()}`
		}

		// Handle time reports
		params.set('tab', 'clients')

		// Set timeframe
		if (report.filters?.timeframe) {
			params.set('kind', report.filters.timeframe)
		}

		// Set date range
		if (report.filters?.dateRange?.startDate) {
			params.set('from', report.filters.dateRange.startDate)
		}
		if (report.filters?.dateRange?.endDate) {
			params.set('till', report.filters.dateRange.endDate)
		}

		// Set single filters for time report
		if (report.filters?.clients && report.filters.clients.length > 0) {
			params.set('client_id', report.filters.clients[0]._ref)
		}
		if (report.filters?.projects && report.filters.projects.length > 0) {
			params.set('project_id', report.filters.projects[0]._ref)
		}
		if (report.filters?.tasks && report.filters.tasks.length > 0) {
			params.set('task_id', report.filters.tasks[0]._ref)
		}
		if (report.filters?.users && report.filters.users.length > 0) {
			params.set('user_id', report.filters.users[0]._ref)
		}

		return `${basePath}?${params.toString()}`
	}

	const getReportTypeLabel = (type: string) => {
		switch (type) {
			case 'time':
				return 'Time Report'
			case 'detailed_time':
				return 'Detailed Time'
			case 'project':
				return 'Project Report'
			case 'user':
				return 'User Report'
			case 'client':
				return 'Client Report'
			default:
				return type
		}
	}

	const getReportTypeColor = (type: string) => {
		switch (type) {
			case 'time':
				return 'bg-blue-100 text-blue-700'
			case 'detailed_time':
				return 'bg-indigo-100 text-indigo-700'
			case 'project':
				return 'bg-green-100 text-green-700'
			case 'user':
				return 'bg-orange-100 text-orange-700'
			case 'client':
				return 'bg-purple-100 text-purple-700'
			default:
				return 'bg-gray-100 text-gray-700'
		}
	}

	if (loading) {
		return (
			<div className="bg-white rounded-lg shadow p-6">
				<div className="animate-pulse space-y-4">
					<div className="h-6 bg-gray-200 rounded w-1/4"></div>
					<div className="h-4 bg-gray-200 rounded w-3/4"></div>
					<div className="space-y-3 mt-6">
						{[1, 2, 3].map((i) => (
							<div key={i} className="h-24 bg-gray-100 rounded-lg"></div>
						))}
					</div>
				</div>
			</div>
		)
	}

	if (error) {
		return (
			<div className="bg-white rounded-lg shadow p-6">
				<div className="rounded-lg bg-red-50 border border-red-200 p-4">
					<p className="text-sm text-red-800">{error}</p>
				</div>
			</div>
		)
	}

	return (
		<div className="">
			<h3 className="text-lg font-medium text-gray-900 mb-2">Saved Reports</h3>
			<p className="text-gray-600 text-sm mb-6">
				Quick access to your frequently used report configurations. Click on a report to view it with the saved filters.
			</p>

			{reports.length === 0 ? (
				<div className="mt-6 p-8 bg-gray-50 rounded-lg text-center">
					<div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-4">
						<FiFolder className="w-6 h-6 text-gray-400" />
					</div>
					<p className="text-sm text-gray-600 mb-2">No saved reports yet</p>
					<p className="text-xs text-gray-500">
						Go to the Time or Detailed Time reports and click &quot;Save report&quot; to save your first configuration.
					</p>
				</div>
			) : (
				<div className="space-y-3">
					{reports.map((report) => (
						<div
							key={report._id}
							className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors group"
						>
							<div className="flex items-start justify-between">
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2 mb-1 flex-wrap md:flex-nowrap">
										<a
											href={buildReportUrl(report)}
											className="text-base font-medium text-gray-900 hover:text-orange-600 transition-colors truncate basis-full md:basis-auto"
										>
											{report.name}
										</a>
										<span
											className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getReportTypeColor(
												report.type
											)}`}
										>
											{getReportTypeLabel(report.type)}
										</span>
										{report.isPublic ? (
											<span className="inline-flex items-center text-gray-400" title="Public report">
												<FiGlobe className="w-3.5 h-3.5" />
											</span>
										) : (
											<span className="inline-flex items-center text-gray-400" title="Private report">
												<FiLock className="w-3.5 h-3.5" />
											</span>
										)}
									</div>
									{report.description && (
										<p className="text-sm text-gray-500 mb-2 line-clamp-2">{report.description}</p>
									)}
									<div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
										{/* Date Range */}
										{report.filters?.dateRange?.startDate && report.filters?.dateRange?.endDate && (
											<span className="inline-flex items-center gap-1">
												<FiCalendar className="w-3.5 h-3.5" />
												{format(new Date(report.filters.dateRange.startDate), 'MMM d, yyyy')} -{' '}
												{format(new Date(report.filters.dateRange.endDate), 'MMM d, yyyy')}
											</span>
										)}
										{/* Timeframe */}
										{report.filters?.timeframe && (
											<span className="capitalize inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100">
												{report.filters.timeframe}
											</span>
										)}
										{/* Active Filters */}
										{report.filters?.clients && report.filters.clients.length > 0 && (
											<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
												<FiUsers className="w-3 h-3" />
												Client filter
											</span>
										)}
										{report.filters?.projects && report.filters.projects.length > 0 && (
											<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-50 text-green-600">
												<FiFolder className="w-3 h-3" />
												Project filter
											</span>
										)}
										{report.filters?.tasks && report.filters.tasks.length > 0 && (
											<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-50 text-purple-600">
												<FiLayers className="w-3 h-3" />
												Task filter
											</span>
										)}
										{report.filters?.users && report.filters.users.length > 0 && (
											<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-50 text-orange-600">
												<FiUser className="w-3 h-3" />
												User filter
											</span>
										)}
									</div>
									{/* Created info */}
									<div className="mt-2 text-xs text-gray-400">
										Created{' '}
										{report.createdAt && (
											<>on {format(new Date(report.createdAt), 'MMM d, yyyy')}</>
										)}
										{report.createdBy && (
											<> by {report.createdBy.firstName} {report.createdBy.lastName}</>
										)}
									</div>
								</div>
								<div className="flex items-center gap-1 ml-4 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
									<a
										href={buildReportUrl(report)}
										className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-orange-600 hover:bg-orange-50 transition-colors"
										title="Open report"
									>
										<FiExternalLink className="w-4 h-4" />
									</a>
									{report.createdBy?._id === currentUserId && (
										<button
											onClick={() => handleDelete(report._id)}
											disabled={deletingId === report._id}
											className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
											title="Delete report"
										>
											{deletingId === report._id ? (
												<svg
													className="animate-spin h-4 w-4"
													xmlns="http://www.w3.org/2000/svg"
													fill="none"
													viewBox="0 0 24 24"
												>
													<circle
														className="opacity-25"
														cx="12"
														cy="12"
														r="10"
														stroke="currentColor"
														strokeWidth="4"
													/>
													<path
														className="opacity-75"
														fill="currentColor"
														d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
													/>
												</svg>
											) : (
												<FiTrash2 className="w-4 h-4" />
											)}
										</button>
									)}
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	)
}
