'use client'

import React, { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { FiChevronRight, FiChevronDown } from 'react-icons/fi'
import { formatDecimalHours } from '@/lib/time'
import { format } from 'date-fns'

interface TabDataItem {
	name: string
	hours: number
	billableHours: number
	clientName?: string
	clientId?: string
	projectId?: string
	taskId?: string
	userId?: string
	users?: {
		userId: string
		name: string
		firstName: string
		lastName: string
		hours: number
		billableHours: number
	}[]
	tasks?: {
		taskId: string
		name: string
		hours: number
		billableHours: number
	}[]
}

interface SubTabContentProps {
	currentTabData: TabDataItem[]
	maxHours: number
	activeSubTab: 'clients' | 'projects' | 'tasks' | 'team'
	basePath?: string // '/admin/reports' or '/dashboard/reports'
	currentUserId?: string // Current logged-in user's ID (for dashboard reports)
	userRole?: 'admin' | 'manager' | 'user' // Current user's role
}

export default function SubTabContent({currentTabData, maxHours, activeSubTab, basePath = '/admin/reports', currentUserId, userRole = 'user'} : SubTabContentProps) {
	const searchParams = useSearchParams()
	const showClientColumn = activeSubTab === 'projects'
	
	// Track expanded accordion items (by index)
	const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set())
	
	const toggleAccordion = (index: number) => {
		setExpandedItems(prev => {
			const newSet = new Set(prev)
			if (newSet.has(index)) {
				newSet.delete(index)
			} else {
				newSet.add(index)
			}
			return newSet
		})
	}
	
	// Check if project_id or client_id is in URL
	const hasClientId = searchParams.get('client_id')
	const hasProjectId = searchParams.get('project_id')
	const hasTaskId = searchParams.get('task_id')
	const hasUserId = searchParams.get('user_id')
	
	// Get date and filter params from URL
	const startDate = searchParams.get('from')
	const endDate = searchParams.get('till')
	const activeProjects = searchParams.get('active_projects')
	// URL user_id param (for admin filtering by specific user)
	const urlUserId = searchParams.get('user_id')

	// Show link if: no filters, OR if clientId is found and current tab is projects
	const shouldShowLink = (itemLink: string | null) => {
		if (!itemLink) return false
		if ( hasTaskId || hasUserId) return false // if task_id or user_id is in the url, then don't show link
		if (!hasClientId && !hasProjectId) return true // No filters, show link
		if (hasClientId && activeSubTab === 'projects') return true // Client filter + projects tab, show link
		return false
	}
	// console.log('currentTabData', currentTabData)
	const colSpan = (showClientColumn && !hasClientId) ? 4 : 3
	// const itemId = activeSubTab === 'clients' ? 'clientId' : activeSubTab === 'projects' ? 'projectId' : activeSubTab === 'tasks' ? 'taskId' : 'userId'
	// console.log('itemId', itemId)

	// Function to build URL with new parameter while preserving existing ones (except tab)
	const buildUrlWithParam = (paramName: string, paramValue: string | undefined) => {
		if (!paramValue || paramValue === 'unknown') return null
		
		const params = new URLSearchParams(searchParams.toString())
		// Remove tab parameter from URL
		params.delete('tab')
		params.delete('client_id')
		params.delete('project_id')
		params.delete('task_id')
		params.delete('user_id')
		params.set(paramName, paramValue)
		return `${basePath}?${params.toString()}`
	}
	return (
		<table className="w-full">
			<thead>
				<tr className="bg-[#eee]">
				<th className="text-left py-2 px-4 font-normal text-sm text-[#1d1e1c]">
					<div className="flex items-center space-x-1">
					<span>Name</span>
					<FiChevronRight className="w-4 h-4 rotate-90 text-gray-400" />
					</div>
				</th>
				{showClientColumn && !hasClientId && (
					<th className="text-left py-2 px-4 font-normal text-sm text-[#1d1e1c]">Client</th>
				)}
				<th className="text-right py-2 px-4 font-normal text-sm text-[#1d1e1c]">Hours</th>
				<th className="text-right py-2 px-4 font-normal text-sm text-[#1d1e1c]">Billable hours</th>
				</tr>
			</thead>
			<tbody>
				{currentTabData.length === 0 ? (
				<tr>
					<td colSpan={colSpan} className="py-12 text-center text-gray-500">
					No time entries found for this period
					</td>
				</tr>
				) : (
				<>
					{currentTabData.map((item, index) => {
					const percentage = maxHours > 0 ? (item.hours / maxHours) * 100 : 0
					const billablePercentage = item.hours > 0 ? (item.billableHours / item.hours) * 100 : 0
					const billableBarWidth = maxHours > 0 ? (item.billableHours / maxHours) * 100 : 0
					const nonBillableBarWidth = maxHours > 0 ? ((item.hours - item.billableHours) / maxHours) * 100 : 0
					// console.log('item', item);
					
					// Build URL with appropriate parameter based on active tab
					const getItemLink = () => {
						if (activeSubTab === 'clients') {
							return buildUrlWithParam('client_id', item.clientId)
						} else if (activeSubTab === 'projects') {
							return buildUrlWithParam('project_id', item.projectId)
						} else if (activeSubTab === 'tasks') {
							return buildUrlWithParam('task_id', item.taskId)
						} else {
							return buildUrlWithParam('user_id', item.userId)
						}
					}
					
					const itemLink = getItemLink()
					const clientLink = buildUrlWithParam('client_id', item.clientId)
					

					return (
						<tr key={index} className="hover:bg-gray-50 transition-colors">
						<td className="py-3 px-4 capitalize">
							{shouldShowLink(itemLink) ? (
								<a
									href={itemLink!}
										className="text-[#2a59c1] hover:text-[#2a59c1] underline"
								>
									{item.name}
								</a>
							) : (

								<span>
									{
										activeSubTab === 'projects' ? item.name : ''
									}
								</span>
							)}
							{/* if tab is task, then show user details */}
							{activeSubTab === 'tasks' && item.users && item.users.length > 0 && (
								// check if task id is in the url
								(searchParams.get('client_id') || searchParams.get('project_id') || searchParams.get('user_id')) && (
									<div>
										<button
											onClick={() => toggleAccordion(index)}
											className="flex items-center gap-1 hover:text-gray-700 transition-colors cursor-pointer"
										>
											{expandedItems.has(index) ? (
												<FiChevronDown className="w-4 h-4 text-gray-500" />
											) : (
												<FiChevronRight className="w-4 h-4 text-gray-500" />
											)}
											<span>{item.name}</span>
										</button>
										{expandedItems.has(index) && (
											<div className="text-gray-500 text-sm ml-5 mt-1 space-y-0.5">
												{item.users.map((user) => (
													<div key={user.userId}>{user.name}</div>
												))}
											</div>
										)}
									</div>
								)
							)}
							{/* if tab is team, then show task details */}
							{activeSubTab === 'team' && item.tasks && item.tasks.length > 0 && (
								(searchParams.get('client_id') || searchParams.get('task_id') || searchParams.get('project_id')) && (
									<div>
										<button
											onClick={() => toggleAccordion(index)}
											className="flex items-center gap-1 hover:text-gray-700 transition-colors cursor-pointer"
										>
											{expandedItems.has(index) ? (
												<FiChevronDown className="w-4 h-4 text-gray-500" />
											) : (
												<FiChevronRight className="w-4 h-4 text-gray-500" />
											)}
											<span>{item.name}</span>
										</button>
										{expandedItems.has(index) && (
											<div className="text-gray-500 text-sm ml-5 mt-1 space-y-0.5">
												{item.tasks.map((task) => (
													<div key={task.taskId}>{task.name}</div>
												))}
											</div>
										)}
									</div>
								)
							)}
						</td>
						{showClientColumn && !hasClientId && (
							<td className="py-3 px-4 capitalize text-gray-900">
								{clientLink && !hasTaskId && !hasUserId ? (
									<a
										href={clientLink}
										className="text-[#2a59c1] hover:text-[#2a59c1] underline"
									>
										{item.clientName || 'Unknown Client'}
									</a>
								) : (
									<span>{item.clientName || 'Unknown Client'}</span>
								)}
							</td>
						)}
						<td className="py-3 px-4 text-right">
							<div className="flex items-center justify-end space-x-2">
								<div className="w-32 h-4 bg-[#86B1F1] rounded-[4px] overflow-hidden relative">
								{/* Billable hours - blue-800 */}
								<div
									className="h-full bg-[#376bdd] rounded-s-[4px] overflow-hidden absolute left-0 top-0"
									style={{ width: `${billableBarWidth}%` }}
								/>
								{/* Non-billable hours - blue-200 */}
								<div
									className="h-full bg-[#86b1f1] absolute left-0 top-0"
									style={{ 
										width: `${nonBillableBarWidth}%`,
										left: `${billableBarWidth}%`
									}}
								/>
							</div>
							<span className="text-gray-900 font-normal underline min-w-[3rem] text-right">
								<a className="text-[#2a59c1] hover:text-[#2a59c1] hover:underline" href={`${basePath}/detailed?${[
									startDate ? `start_date=${startDate}` : '',
									endDate ? `end_date=${endDate}` : '',
									activeProjects ? `active_projects=${activeProjects}` : '',
									// User filter logic:
									// - Regular users: always use their session ID
									// - Admin/Manager on team tab: use item.userId (the person whose row was clicked)
									// - Admin/Manager with URL user_id: use that user ID
									// - Admin/Manager on other tabs: no user filter
									userRole === 'user' && currentUserId ? `user[]=${currentUserId}` : '',
									(userRole === 'admin' || userRole === 'manager') && activeSubTab === 'team' && item.userId ? `user[]=${item.userId}` : '',
									(userRole === 'admin' || userRole === 'manager') && activeSubTab !== 'team' && urlUserId ? `user[]=${urlUserId}` : '',
									activeSubTab === 'clients' && item.clientId ? `clients[]=${item.clientId}` : '',
									activeSubTab === 'projects' && item.clientId ? `clients[]=${item.clientId}` : '',
									activeSubTab === 'projects' && item.projectId ? `projects[]=${item.projectId}` : '',
									activeSubTab === 'tasks' && item.taskId ? `tasks[]=${item.taskId}` : '',
								].filter(Boolean).join('&')}`}>
									{formatDecimalHours(item.hours).toFixed(2)}
								</a>
							</span>
							</div>
						</td>
						<td className="py-3 px-4 text-right text-gray-900 font-normal">
							{formatDecimalHours(item.billableHours).toFixed(2)} ({billablePercentage.toFixed(0)}%)
						</td>
						</tr>
					)
					})}
					<tr className="font-semibold border-t border-[#1d1e1c40]">
					<td className="py-3 px-4 font-normal text-sm">Total</td>
					{showClientColumn && !hasClientId && <td className="py-3 px-4"></td>}
					<td className="py-3 px-4 text-right">
						{formatDecimalHours(
						currentTabData.reduce((sum, item) => sum + item.hours, 0)
						).toFixed(2)}
					</td>
					<td className="py-3 px-4 text-right">
						{formatDecimalHours(
						currentTabData.reduce((sum, item) => sum + item.billableHours, 0)
						).toFixed(2)}
					</td>
					</tr>
				</>
				)}
			</tbody>
		</table>
	)
}