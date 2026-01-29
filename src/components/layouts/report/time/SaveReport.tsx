'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { format } from 'date-fns'

interface FilterTag {
	id: string
	name: string
}

interface SaveReportProps {
	reportType?: 'time' | 'detailed_time' | 'project' | 'user' | 'client'
	// Support both Date objects and string dates
	startDate?: Date | string
	endDate?: Date | string
	timeframe?: 'week' | 'month' | 'year' | 'all' | 'custom' | string
	// Single ID filters (for time report)
	clientId?: string | null
	projectId?: string | null
	taskId?: string | null
	userId?: string | null
	// Array filters (for detailed time report)
	clients?: FilterTag[]
	projects?: FilterTag[]
	tasks?: FilterTag[]
	users?: FilterTag[]
	showActiveProjectsOnly?: boolean
}

const SaveReport = ({
	reportType = 'time',
	startDate,
	endDate,
	timeframe = 'week',
	clientId,
	projectId,
	taskId,
	userId,
	clients = [],
	projects = [],
	tasks = [],
	users = [],
	showActiveProjectsOnly = false,
}: SaveReportProps) => {
	const [isOpen, setIsOpen] = useState(false)
	const [name, setName] = useState('')
	const [description, setDescription] = useState('')
	const [isPublic, setIsPublic] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [success, setSuccess] = useState(false)
	const modalRef = useRef<HTMLDivElement>(null)

	// Normalize dates - convert string dates to Date objects
	const normalizedStartDate = useMemo(() => {
		if (!startDate) return undefined
		if (startDate instanceof Date) return startDate
		const parsed = new Date(startDate)
		return isNaN(parsed.getTime()) ? undefined : parsed
	}, [startDate])

	const normalizedEndDate = useMemo(() => {
		if (!endDate) return undefined
		if (endDate instanceof Date) return endDate
		const parsed = new Date(endDate)
		return isNaN(parsed.getTime()) ? undefined : parsed
	}, [endDate])

	// Check if we have array-based filters or single ID filters
	const hasArrayFilters = clients.length > 0 || projects.length > 0 || tasks.length > 0 || users.length > 0
	const hasSingleFilters = !!(clientId || projectId || taskId || userId)

	// Close modal when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
				if (!isSaving) {
					handleClose()
				}
			}
		}

		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside)
		}

		return () => {
			document.removeEventListener('mousedown', handleClickOutside)
		}
	}, [isOpen, isSaving])

	// Close modal on Escape key
	useEffect(() => {
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && !isSaving) {
				handleClose()
			}
		}

		if (isOpen) {
			document.addEventListener('keydown', handleEscape)
		}

		return () => {
			document.removeEventListener('keydown', handleEscape)
		}
	}, [isOpen, isSaving])

	const handleClose = () => {
		setIsOpen(false)
		setName('')
		setDescription('')
		setIsPublic(false)
		setError(null)
		setSuccess(false)
	}

	const handleSave = async () => {
		if (!name.trim()) {
			setError('Please enter a report name')
			return
		}

		setIsSaving(true)
		setError(null)

		try {
			const filters: any = {
				timeframe,
			}

			if (normalizedStartDate && normalizedEndDate) {
				filters.dateRange = {
					startDate: format(normalizedStartDate, 'yyyy-MM-dd'),
					endDate: format(normalizedEndDate, 'yyyy-MM-dd'),
				}
			}

			// Handle array-based filters (for detailed time report)
			if (clients.length > 0) {
				filters.clients = clients.map(c => c.id)
			} else if (clientId) {
				filters.clients = [clientId]
			}

			if (projects.length > 0) {
				filters.projects = projects.map(p => p.id)
			} else if (projectId) {
				filters.projects = [projectId]
			}

			if (tasks.length > 0) {
				filters.tasks = tasks.map(t => t.id)
			} else if (taskId) {
				filters.tasks = [taskId]
			}

			if (users.length > 0) {
				filters.users = users.map(u => u.id)
			} else if (userId) {
				filters.users = [userId]
			}

			const response = await fetch('/api/reports', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					name: name.trim(),
					type: reportType,
					description: description.trim(),
					filters,
					isPublic,
				}),
			})

			if (!response.ok) {
				const data = await response.json()
				throw new Error(data.error || 'Failed to save report')
			}

			setSuccess(true)
			setTimeout(() => {
				handleClose()
			}, 1500)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to save report')
		} finally {
			setIsSaving(false)
		}
	}

	// Check if we have enough data to save - need at least the timeframe
	const hasFilters = !!timeframe

	return (
		<>
			<button
				onClick={() => setIsOpen(true)}
				disabled={!hasFilters}
				className="disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors outline-none focus:ring-1 focus:ring-transparent focus:border-black"
			>
				Save report
			</button>

			{/* Modal */}
			{isOpen && (
				<div className="fixed inset-0 z-50 overflow-y-auto">
					{/* Backdrop */}
					<div className="fixed inset-0 bg-black/50 transition-opacity" />

					{/* Modal Content */}
					<div className="flex min-h-full items-center justify-center p-4">
						<div
							ref={modalRef}
							className="relative w-full max-w-md transform overflow-hidden rounded-xl bg-white shadow-2xl transition-all"
						>
							{/* Header */}
							<div className="border-b border-gray-100 px-6 py-4">
								<h3 className="text-lg font-semibold text-gray-900">Save Report</h3>
								<p className="text-sm text-gray-500 mt-1">
									Save your current report configuration for quick access later
								</p>
							</div>

							{/* Body */}
							<div className="px-6 py-4 space-y-4">
								{/* Success Message */}
								{success && (
									<div className="rounded-lg bg-green-50 border border-green-200 p-4">
										<div className="flex">
											<svg
												className="h-5 w-5 text-green-400"
												viewBox="0 0 20 20"
												fill="currentColor"
											>
												<path
													fillRule="evenodd"
													d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
													clipRule="evenodd"
												/>
											</svg>
											<p className="ml-3 text-sm font-medium text-green-800">
												Report saved successfully!
											</p>
										</div>
									</div>
								)}

								{/* Error Message */}
								{error && (
									<div className="rounded-lg bg-red-50 border border-red-200 p-4">
										<div className="flex">
											<svg
												className="h-5 w-5 text-red-400"
												viewBox="0 0 20 20"
												fill="currentColor"
											>
												<path
													fillRule="evenodd"
													d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
													clipRule="evenodd"
												/>
											</svg>
											<p className="ml-3 text-sm font-medium text-red-800">{error}</p>
										</div>
									</div>
								)}

								{!success && (
									<>
										{/* Report Name */}
										<div>
											<label
												htmlFor="report-name"
												className="block text-sm font-medium text-gray-700 mb-1"
											>
												Report Name <span className="text-red-500">*</span>
											</label>
											<input
												type="text"
												id="report-name"
												value={name}
												onChange={(e) => setName(e.target.value)}
												placeholder="e.g., Weekly Client Summary"
												className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-transparent"
												autoFocus
											/>
										</div>

										{/* Description */}
										<div>
											<label
												htmlFor="report-description"
												className="block text-sm font-medium text-gray-700 mb-1"
											>
												Description <span className="text-gray-400">(optional)</span>
											</label>
											<textarea
												id="report-description"
												value={description}
												onChange={(e) => setDescription(e.target.value)}
												placeholder="Add a brief description of this report..."
												rows={3}
												className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-transparent resize-none"
											/>
										</div>

										{/* Current Filters Preview */}
										<div className="rounded-lg bg-gray-50 p-3">
											<p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
												Saved Filters
											</p>
											<div className="space-y-1.5 text-sm text-gray-700">
												<div className="flex items-center gap-2">
													<span className="text-gray-500">Type:</span>
													<span className="font-medium capitalize">{reportType.replace('_', ' ')}</span>
												</div>
												<div className="flex items-center gap-2">
													<span className="text-gray-500">Period:</span>
													<span className="font-medium capitalize">{timeframe}</span>
												</div>
												{normalizedStartDate && normalizedEndDate && (
													<div className="flex items-center gap-2">
														<span className="text-gray-500">Date Range:</span>
														<span className="font-medium">
															{format(normalizedStartDate, 'MMM d, yyyy')} - {format(normalizedEndDate, 'MMM d, yyyy')}
														</span>
													</div>
												)}
												{/* Array-based filters (detailed time) */}
												{hasArrayFilters && (
													<div className="space-y-1">
														{clients.length > 0 && (
															<div className="flex items-start gap-2">
																<span className="text-gray-500 shrink-0">Clients:</span>
																<div className="flex flex-wrap gap-1">
																	{clients.map(c => (
																		<span key={c.id} className="inline-flex items-center rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
																			{c.name}
																		</span>
																	))}
																</div>
															</div>
														)}
														{projects.length > 0 && (
															<div className="flex items-start gap-2">
																<span className="text-gray-500 shrink-0">Projects:</span>
																<div className="flex flex-wrap gap-1">
																	{projects.map(p => (
																		<span key={p.id} className="inline-flex items-center rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700">
																			{p.name}
																		</span>
																	))}
																</div>
															</div>
														)}
														{tasks.length > 0 && (
															<div className="flex items-start gap-2">
																<span className="text-gray-500 shrink-0">Tasks:</span>
																<div className="flex flex-wrap gap-1">
																	{tasks.map(t => (
																		<span key={t.id} className="inline-flex items-center rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700">
																			{t.name}
																		</span>
																	))}
																</div>
															</div>
														)}
														{users.length > 0 && (
															<div className="flex items-start gap-2">
																<span className="text-gray-500 shrink-0">Users:</span>
																<div className="flex flex-wrap gap-1">
																	{users.map(u => (
																		<span key={u.id} className="inline-flex items-center rounded bg-orange-100 px-1.5 py-0.5 text-xs font-medium text-orange-700">
																			{u.name}
																		</span>
																	))}
																</div>
															</div>
														)}
													</div>
												)}
												{/* Single ID filters (time report) */}
												{hasSingleFilters && !hasArrayFilters && (
													<div className="flex items-center gap-2">
														<span className="text-gray-500">Filters:</span>
														<div className="flex flex-wrap gap-1">
															{clientId && (
																<span className="inline-flex items-center rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
																	Client
																</span>
															)}
															{projectId && (
																<span className="inline-flex items-center rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700">
																	Project
																</span>
															)}
															{taskId && (
																<span className="inline-flex items-center rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700">
																	Task
																</span>
															)}
															{userId && (
																<span className="inline-flex items-center rounded bg-orange-100 px-1.5 py-0.5 text-xs font-medium text-orange-700">
																	User
																</span>
															)}
														</div>
													</div>
												)}
											</div>
										</div>

										{/* Public Toggle */}
										<div className="flex items-center justify-between">
											<div>
												<label
													htmlFor="is-public"
													className="text-sm font-medium text-gray-700"
												>
													Make report public
												</label>
												<p className="text-xs text-gray-500">
													Allow other team members to view this report
												</p>
											</div>
											<button
												type="button"
												id="is-public"
												onClick={() => setIsPublic(!isPublic)}
												className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-transparent focus:ring-offset-2 ${
													isPublic ? 'theme-color-bg' : 'bg-gray-200'
												}`}
											>
												<span
													className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
														isPublic ? 'translate-x-5' : 'translate-x-0'
													}`}
												/>
											</button>
										</div>
									</>
								)}
							</div>

							{/* Footer */}
							{!success && (
								<div className="border-t border-gray-100 px-6 py-4 flex justify-end gap-3">
									<button
										type="button"
										onClick={handleClose}
										disabled={isSaving}
										className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
									>
										Cancel
									</button>
									<button
										type="button"
										onClick={handleSave}
										disabled={isSaving || !name.trim()}
										className="btn-primary rounded-lg theme-color-bg px-4 py-2 text-sm font-medium text-white hover:theme-color-bg-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
									>
										{isSaving ? (
											<>
												<svg
													className="animate-spin h-4 w-4 text-white"
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
												Saving...
											</>
										) : (
											'Save Report'
										)}
									</button>
								</div>
							)}
						</div>
					</div>
				</div>
			)}
		</>
	)
}

export { SaveReport }
