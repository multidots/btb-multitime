import React, { useState, useRef, useEffect } from 'react'
import { FiPrinter, FiChevronRight, FiDownload } from 'react-icons/fi'
import { format } from 'date-fns'

interface FilterActiveProjectProps {
	checked: boolean
	onChange: (checked: boolean) => void
}

const FilterActiveProject = ({ checked, onChange }: FilterActiveProjectProps) => {
	return (
		<label className="flex items-center space-x-2 cursor-pointer">
			<input
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				className="rounded border-gray-300 theme-color outline-none focus:ring-transparent focus:border-black"
			/>
			<span className="text-sm text-gray-700">Active projects only</span>
		</label>
	)
}

interface FilterDetailedReportProps {
	startDate: Date
	endDate: Date
	timeframe?: 'week' | 'month' | 'year' | 'all' | 'custom'
}

const FilterDetailedReport = ({ startDate, endDate, timeframe = 'custom' }: FilterDetailedReportProps) => {
	const href = `/admin/reports/detailed?start_date=${format(startDate, 'yyyy-MM-dd')}&end_date=${format(endDate, 'yyyy-MM-dd')}`
	
	return (
		<a 
			href={href}
			className="px-2 md:px-4 py-1 md:py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors outline-none focus:ring-1 focus:ring-transparent focus:border-black"
		>
			Detailed report
		</a>
	)
}


interface FilterExportProps {
	startDate: Date
	endDate: Date
	filterKind: 'week' | 'month' | 'year' | 'all' | 'custom'
	summaryStats: {
		totalHours: number
		billableHours: number
		nonBillableHours: number
		billablePercentage: number
	}
	activeSubTab: 'clients' | 'projects' | 'tasks' | 'team'
	currentTabData: TabDataItem[]
	clientName?: string | null
	projectName?: string | null
}

const FilterExport = ({
	startDate,
	endDate,
	filterKind,
	summaryStats,
	activeSubTab,
	currentTabData,
	clientName,
	projectName
}: FilterExportProps) => {
	const [isOpen, setIsOpen] = useState(false)
	const dropdownRef = useRef<HTMLDivElement>(null)

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				setIsOpen(false)
			}
		}
		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [])

	// Get date range title for filename
	const getDateRangeTitle = () => {
		switch (filterKind) {
			case 'week':
				return `Week_${format(startDate, 'yyyy-MM-dd')}_to_${format(endDate, 'yyyy-MM-dd')}`
			case 'month':
				return format(startDate, 'MMMM_yyyy')
			case 'year':
				return `Year_${format(startDate, 'yyyy')}`
			case 'all':
				return 'All_Time'
			case 'custom':
				return `${format(startDate, 'yyyy-MM-dd')}_to_${format(endDate, 'yyyy-MM-dd')}`
			default:
				return `${format(startDate, 'yyyy-MM-dd')}_to_${format(endDate, 'yyyy-MM-dd')}`
		}
	}

	const getFileName = (extension: string) => {
		const prefix = clientName || projectName ? `${clientName || ''}${projectName ? '_' + projectName : ''}` : 'Time_Report'
		return `${prefix}_${activeSubTab}_${getDateRangeTitle()}.${extension}`.replace(/\s+/g, '_')
	}

	// Get dynamic label based on active subtab
	const getNameColumnLabel = () => {
		switch (activeSubTab) {
			case 'clients':
				return 'Client Name'
			case 'projects':
				return 'Project Name'
			case 'tasks':
				return 'Task Name'
			case 'team':
				return 'Team Member'
			default:
				return 'Name'
		}
	}

	// Generate CSV content
	const generateCSV = () => {
		const showClientColumn = activeSubTab === 'projects'
		const nameLabel = getNameColumnLabel()
		const headers = showClientColumn 
			? [nameLabel, 'Client', 'Hours', 'Billable Hours', 'Billable %']
			: [nameLabel, 'Hours', 'Billable Hours', 'Billable %']
		
		const rows = currentTabData.map(item => {
			const billablePercentage = item.hours > 0 ? ((item.billableHours / item.hours) * 100).toFixed(0) : '0'
			if (showClientColumn) {
				return [
					item.name,
					item.clientName || 'Unknown Client',
					item.hours.toFixed(2),
					item.billableHours.toFixed(2),
					`${billablePercentage}%`
				]
			}
			return [
				item.name,
				item.hours.toFixed(2),
				item.billableHours.toFixed(2),
				`${billablePercentage}%`
			]
		})

		// Add totals row
		const totalHours = currentTabData.reduce((sum, item) => sum + item.hours, 0)
		const totalBillableHours = currentTabData.reduce((sum, item) => sum + item.billableHours, 0)
		const totalBillablePercentage = totalHours > 0 ? ((totalBillableHours / totalHours) * 100).toFixed(0) : '0'
		
		if (showClientColumn) {
			rows.push(['Total', '', totalHours.toFixed(2), totalBillableHours.toFixed(2), `${totalBillablePercentage}%`])
		} else {
			rows.push(['Total', totalHours.toFixed(2), totalBillableHours.toFixed(2), `${totalBillablePercentage}%`])
		}

		// Convert to CSV string
		const csvContent = [
			headers.join(','),
			...rows.map(row => row.map(cell => `"${cell}"`).join(','))
		].join('\n')

		return csvContent
	}

	// Export to CSV
	const exportToCSV = () => {
		const csvContent = generateCSV()
		const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
		const link = document.createElement('a')
		link.href = URL.createObjectURL(blob)
		link.download = getFileName('csv')
		link.click()
		URL.revokeObjectURL(link.href)
		setIsOpen(false)
	}

	// Export to Excel (using CSV format that Excel can open)
	const exportToExcel = () => {
		const csvContent = generateCSV()
		// Add BOM for proper Excel encoding
		const BOM = '\uFEFF'
		const blob = new Blob([BOM + csvContent], { type: 'application/vnd.ms-excel;charset=utf-8;' })
		const link = document.createElement('a')
		link.href = URL.createObjectURL(blob)
		link.download = getFileName('xls')
		link.click()
		URL.revokeObjectURL(link.href)
		setIsOpen(false)
	}

	// Export to PDF
	const exportToPDF = () => {
		const showClientColumn = activeSubTab === 'projects'
		
		// Calculate max hours for bar widths
		const maxHours = currentTabData.length > 0 
			? Math.max(...currentTabData.map(item => item.hours))
			: 0

		const getDateRangeDisplayTitle = () => {
			const startFormatted = format(startDate, 'dd')
			const endFormatted = format(endDate, 'dd MMM yyyy')
			
			switch (filterKind) {
				case 'week':
					return `Week: ${startFormatted} – ${endFormatted}`
				case 'month':
					return format(startDate, 'MMMM yyyy')
				case 'year':
					return `Year: ${format(startDate, 'yyyy')}`
				case 'all':
					return `All Time: ${format(startDate, 'dd MMM yyyy')} – ${endFormatted}`
				case 'custom':
					return `${format(startDate, 'dd MMM yyyy')} – ${endFormatted}`
				default:
					return `${startFormatted} – ${endFormatted}`
			}
		}

		// Generate table rows
		const generateTableRows = () => {
			if (currentTabData.length === 0) {
				return `<tr><td colspan="${showClientColumn ? 4 : 3}" style="text-align: center; padding: 48px; color: #6b7280;">No time entries found for this period</td></tr>`
			}

			const rows = currentTabData.map(item => {
				const billablePercentage = item.hours > 0 ? (item.billableHours / item.hours) * 100 : 0
				const billableBarWidth = maxHours > 0 ? (item.billableHours / maxHours) * 100 : 0
				const nonBillableBarWidth = maxHours > 0 ? ((item.hours - item.billableHours) / maxHours) * 100 : 0

				return `
					<tr style="border-bottom: 1px solid #f3f4f6;">
						<td style="padding: 12px 16px; text-transform: capitalize;">${item.name}</td>
						${showClientColumn ? `<td style="padding: 12px 16px; text-transform: capitalize;">${item.clientName || 'Unknown Client'}</td>` : ''}
						<td style="padding: 12px 16px; text-align: right;">
							<div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
								<div style="width: 128px; height: 16px; background-color: #dbeafe; border-radius: 9999px; overflow: hidden; position: relative;">
									<div style="height: 100%; background-color: #1e40af; border-radius: 9999px; position: absolute; left: 0; top: 0; width: ${billableBarWidth}%;"></div>
									<div style="height: 100%; background-color: #60a5fa; border-radius: 9999px; position: absolute; top: 0; width: ${nonBillableBarWidth}%; left: ${billableBarWidth}%;"></div>
								</div>
								<span style="font-weight: 500; min-width: 48px; text-align: right;">${item.hours.toFixed(2)}</span>
							</div>
						</td>
						<td style="padding: 12px 16px; text-align: right; font-weight: 500;">
							${item.billableHours.toFixed(2)} (${billablePercentage.toFixed(0)}%)
						</td>
					</tr>
				`
			}).join('')

			// Add total row
			const totalHours = currentTabData.reduce((sum, item) => sum + item.hours, 0)
			const totalBillableHours = currentTabData.reduce((sum, item) => sum + item.billableHours, 0)

			return rows + `
				<tr style="background-color: #f9fafb; font-weight: 600;">
					<td style="padding: 12px 16px;">Total</td>
					${showClientColumn ? '<td style="padding: 12px 16px;"></td>' : ''}
					<td style="padding: 12px 16px; text-align: right;">${totalHours.toFixed(2)}</td>
					<td style="padding: 12px 16px; text-align: right;">${totalBillableHours.toFixed(2)}</td>
				</tr>
			`
		}

		const pdfContent = `
			<!DOCTYPE html>
			<html>
			<head>
				<title>Time Report - ${getDateRangeDisplayTitle()}</title>
				<style>
					* { margin: 0; padding: 0; box-sizing: border-box; }
					body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1f2937; padding: 40px; }
					.header { margin-bottom: 32px; }
					.title { font-size: 28px; font-weight: 600; color: #111827; margin-bottom: 8px; }
					.subtitle { font-size: 16px; color: #6b7280; }
					.stats-container { display: flex; gap: 32px; margin-bottom: 32px; align-items: center; }
					.stat-box { }
					.stat-label { font-size: 14px; color: #6b7280; margin-bottom: 4px; }
					.stat-value { font-size: 24px; font-weight: 700; color: #111827; }
					.stat-sub { font-size: 14px; color: #6b7280; }
					.donut-container { position: relative; width: 80px; height: 80px; }
					.donut { transform: rotate(-90deg); }
					.donut-center { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; }
					.donut-percentage { font-size: 16px; font-weight: 700; color: #1e40af; }
					.tabs { display: flex; gap: 16px; margin-bottom: 16px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
					.tab { padding: 8px 16px; font-size: 14px; font-weight: 500; color: #6b7280; }
					.tab.active { color: #1e40af; border-bottom: 2px solid #1e40af; margin-bottom: -9px; }
					table { width: 100%; border-collapse: collapse; }
					th { text-align: left; padding: 12px 16px; font-weight: 500; color: #374151; border-bottom: 1px solid #e5e7eb; }
					th.right { text-align: right; }
					@media print {
						body { padding: 20px; }
						.no-print { display: none; }
					}
				</style>
			</head>
			<body>
				<div class="header">
					${clientName || projectName ? `<div class="subtitle">${clientName || ''} ${projectName ? (clientName ? ' / ' + projectName : projectName) : ''}</div>` : ''}
					<div class="title">${getDateRangeDisplayTitle()}</div>
				</div>

				<div class="stats-container">
					<div class="stat-box">
						<div class="stat-label">Total hours</div>
						<div class="stat-value">${summaryStats.totalHours.toFixed(2)}</div>
					</div>
					
					<div class="donut-container">
						<svg class="donut" width="80" height="80" viewBox="0 0 42 42">
							<circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#dbeafe" stroke-width="4"></circle>
							<circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#1e40af" stroke-width="4" stroke-dasharray="${summaryStats.billablePercentage} ${100 - summaryStats.billablePercentage}" stroke-dashoffset="0"></circle>
						</svg>
						<div class="donut-center">
							<div class="donut-percentage">${summaryStats.billablePercentage.toFixed(0)}%</div>
						</div>
					</div>
					
					<div class="stat-box">
						<div class="stat-label">Billable</div>
						<div class="stat-value">${summaryStats.billableHours.toFixed(2)}</div>
						<div class="stat-sub">Non-billable</div>
						<div class="stat-value" style="font-size: 18px;">${summaryStats.nonBillableHours.toFixed(2)}</div>
					</div>
					
					<div class="stat-box">
						<div class="stat-label">Billable amount</div>
						<div class="stat-value">N/A</div>
					</div>
					
					<div class="stat-box">
						<div class="stat-label">Uninvoiced amount</div>
						<div class="stat-value">N/A</div>
					</div>
				</div>

				<div class="tabs">
					<span class="tab ${activeSubTab === 'clients' ? 'active' : ''}">Clients</span>
					<span class="tab ${activeSubTab === 'projects' ? 'active' : ''}">Projects</span>
					<span class="tab ${activeSubTab === 'tasks' ? 'active' : ''}">Tasks</span>
					<span class="tab ${activeSubTab === 'team' ? 'active' : ''}">Team</span>
				</div>

				<table>
					<thead>
						<tr>
							<th>${getNameColumnLabel()}</th>
							${showClientColumn ? '<th>Client</th>' : ''}
							<th class="right">Hours</th>
							<th class="right">Billable hours</th>
						</tr>
					</thead>
					<tbody>
						${generateTableRows()}
					</tbody>
				</table>
			</body>
			</html>
		`

		// Create hidden iframe for PDF printing
		const iframe = document.createElement('iframe')
		iframe.style.position = 'absolute'
		iframe.style.width = '0'
		iframe.style.height = '0'
		iframe.style.border = 'none'
		iframe.style.left = '-9999px'
		document.body.appendChild(iframe)

		const iframeDoc = iframe.contentWindow?.document
		if (iframeDoc) {
			iframeDoc.open()
			iframeDoc.write(pdfContent)
			iframeDoc.close()

			iframe.onload = () => {
				iframe.contentWindow?.focus()
				iframe.contentWindow?.print()
				setTimeout(() => {
					document.body.removeChild(iframe)
				}, 100)
			}
		}
		setIsOpen(false)
	}

	return (
		<div className="relative" ref={dropdownRef}>
			<button 
				onClick={() => setIsOpen(!isOpen)}
				className="px-2 md:px-4 py-1 md:py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 flex items-center space-x-2 cursor-pointer focus:outline-none focus:ring-1 focus:ring-transparent focus:border-black"
			>
				<span>Export</span>
				<FiChevronRight className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-[-90deg]' : 'rotate-90'}`} />
			</button>
			
			{isOpen && (
				<div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50">
					<div className="py-1">
						<button
							onClick={exportToExcel}
							className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-black hover:text-white flex items-center space-x-2 cursor-pointer"
						>
							<FiDownload className="w-4 h-4" />
							<span>Export to Excel</span>
						</button>
						<button
							onClick={exportToCSV}
							className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-black hover:text-white flex items-center space-x-2 cursor-pointer"
						>
							<FiDownload className="w-4 h-4" />
							<span>Export to CSV</span>
						</button>
						<button
							onClick={exportToPDF}
							className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-black hover:text-white flex items-center space-x-2 cursor-pointer"
						>
							<FiDownload className="w-4 h-4" />
							<span>Export to PDF</span>
						</button>
					</div>
				</div>
			)}
		</div>
	)
}

interface TabDataItem {
	name: string
	hours: number
	billableHours: number
	clientName?: string
	clientId?: string
	projectId?: string
	taskId?: string
	userId?: string
}

interface FilterPrintProps {
	startDate: Date
	endDate: Date
	filterKind: 'week' | 'month' | 'year' | 'all' | 'custom'
	summaryStats: {
		totalHours: number
		billableHours: number
		nonBillableHours: number
		billablePercentage: number
	}
	activeSubTab: 'clients' | 'projects' | 'tasks' | 'team'
	currentTabData: TabDataItem[]
	clientName?: string | null
	projectName?: string | null
}

const FilterPrint = ({
	startDate,
	endDate,
	filterKind,
	summaryStats,
	activeSubTab,
	currentTabData,
	clientName,
	projectName
}: FilterPrintProps) => {
	const handlePrint = () => {
		// Get dynamic label based on active subtab
		const getNameColumnLabel = () => {
			switch (activeSubTab) {
				case 'clients':
					return 'Client Name'
				case 'projects':
					return 'Project Name'
				case 'tasks':
					return 'Task Name'
				case 'team':
					return 'Team Member'
				default:
					return 'Name'
			}
		}

		// Format date range title
		const getDateRangeTitle = () => {
			const startFormatted = format(startDate, 'dd')
			const endFormatted = format(endDate, 'dd MMM yyyy')
			
			switch (filterKind) {
				case 'week':
					return `Week: ${startFormatted} – ${endFormatted}`
				case 'month':
					return `${format(startDate, 'MMMM yyyy')}`
				case 'year':
					return `Year: ${format(startDate, 'yyyy')}`
				case 'all':
					return `All Time: ${format(startDate, 'dd MMM yyyy')} – ${endFormatted}`
				case 'custom':
					return `${format(startDate, 'dd MMM yyyy')} – ${endFormatted}`
				default:
					return `${startFormatted} – ${endFormatted}`
			}
		}

		// Calculate max hours for bar widths
		const maxHours = currentTabData.length > 0 
			? Math.max(...currentTabData.map(item => item.hours))
			: 0

		// Build base query params with date filters
		const buildBaseParams = () => {
			const params = new URLSearchParams()
			params.set('from', format(startDate, 'yyyy-MM-dd'))
			params.set('till', format(endDate, 'yyyy-MM-dd'))
			params.set('kind', filterKind)
			params.set('tab', activeSubTab)
			return params
		}

		// Build link URL based on active tab and item
		const buildItemLink = (item: TabDataItem) => {
			const baseUrl = window.location.origin + '/admin/reports'
			const params = buildBaseParams()
			
			if (activeSubTab === 'clients' && item.clientId) {
				params.set('client_id', item.clientId)
			} else if (activeSubTab === 'projects' && item.projectId) {
				params.set('project_id', item.projectId)
			} else if (activeSubTab === 'tasks' && item.taskId) {
				params.set('task_id', item.taskId)
			} else if (activeSubTab === 'team' && item.userId) {
				params.set('user_id', item.userId)
			} else {
				return null
			}
			
			return `${baseUrl}?${params.toString()}`
		}

		const buildClientLink = (clientId?: string) => {
			if (!clientId) return null
			const baseUrl = window.location.origin + '/admin/reports'
			const params = buildBaseParams()
			params.set('client_id', clientId)
			return `${baseUrl}?${params.toString()}`
		}

		// Generate table rows
		const generateTableRows = () => {
			if (currentTabData.length === 0) {
				return `<tr><td colspan="3" style="text-align: center; padding: 48px; color: #6b7280;">No time entries found for this period</td></tr>`
			}

			const showClientColumn = activeSubTab === 'projects'
			const linkStyle = 'color: #2563eb; text-decoration: none;'
			const rows = currentTabData.map(item => {
				const billablePercentage = item.hours > 0 ? (item.billableHours / item.hours) * 100 : 0
				const billableBarWidth = maxHours > 0 ? (item.billableHours / maxHours) * 100 : 0
				const nonBillableBarWidth = maxHours > 0 ? ((item.hours - item.billableHours) / maxHours) * 100 : 0
				
				const itemLink = buildItemLink(item)
				const clientLink = buildClientLink(item.clientId)
				
				const nameContent = itemLink 
					? `<a href="${itemLink}" style="${linkStyle}">${item.name}</a>`
					: item.name
				
				const clientContent = clientLink
					? `<a href="${clientLink}" style="${linkStyle}">${item.clientName || 'Unknown Client'}</a>`
					: (item.clientName || 'Unknown Client')

				return `
					<tr style="border-bottom: 1px solid #f3f4f6;">
						<td style="padding: 12px 16px; text-transform: capitalize;">${nameContent}</td>
						${showClientColumn ? `<td style="padding: 12px 16px; text-transform: capitalize;">${clientContent}</td>` : ''}
						<td style="padding: 12px 16px; text-align: right;">
							<div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
								<div style="width: 128px; height: 16px; background-color: #dbeafe; border-radius: 9999px; overflow: hidden; position: relative;">
									<div style="height: 100%; background-color: #1e40af; border-radius: 9999px; position: absolute; left: 0; top: 0; width: ${billableBarWidth}%;"></div>
									<div style="height: 100%; background-color: #60a5fa; border-radius: 9999px; position: absolute; top: 0; width: ${nonBillableBarWidth}%; left: ${billableBarWidth}%;"></div>
								</div>
								<span style="font-weight: 500; min-width: 48px; text-align: right;">${item.hours.toFixed(2)}</span>
							</div>
						</td>
						<td style="padding: 12px 16px; text-align: right; font-weight: 500;">
							${item.billableHours.toFixed(2)} (${billablePercentage.toFixed(0)}%)
						</td>
					</tr>
				`
			}).join('')

			// Add total row
			const totalHours = currentTabData.reduce((sum, item) => sum + item.hours, 0)
			const totalBillableHours = currentTabData.reduce((sum, item) => sum + item.billableHours, 0)
			const colSpan = showClientColumn ? 4 : 3

			return rows + `
				<tr style="background-color: #f9fafb; font-weight: 600;">
					<td style="padding: 12px 16px;">Total</td>
					${showClientColumn ? '<td style="padding: 12px 16px;"></td>' : ''}
					<td style="padding: 12px 16px; text-align: right;">${totalHours.toFixed(2)}</td>
					<td style="padding: 12px 16px; text-align: right;">${totalBillableHours.toFixed(2)}</td>
				</tr>
			`
		}

		const showClientColumn = activeSubTab === 'projects'

		// Create print HTML
		const printContent = `
			<!DOCTYPE html>
			<html>
			<head>
				<title>Time Report - ${getDateRangeTitle()}</title>
				<style>
					* { margin: 0; padding: 0; box-sizing: border-box; }
					body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1f2937; padding: 40px; }
					.header { margin-bottom: 32px; }
					.title { font-size: 28px; font-weight: 600; color: #111827; margin-bottom: 8px; }
					.subtitle { font-size: 16px; color: #6b7280; }
					.stats-container { display: flex; gap: 32px; margin-bottom: 32px; align-items: center; }
					.stat-box { }
					.stat-label { font-size: 14px; color: #6b7280; margin-bottom: 4px; }
					.stat-value { font-size: 24px; font-weight: 700; color: #111827; }
					.stat-sub { font-size: 14px; color: #6b7280; }
					.donut-container { position: relative; width: 80px; height: 80px; }
					.donut { transform: rotate(-90deg); }
					.donut-center { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; }
					.donut-percentage { font-size: 16px; font-weight: 700; color: #1e40af; }
					.tabs { display: flex; gap: 16px; margin-bottom: 16px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
					.tab { padding: 8px 16px; font-size: 14px; font-weight: 500; color: #6b7280; }
					.tab.active { color: #1e40af; border-bottom: 2px solid #1e40af; margin-bottom: -9px; }
					table { width: 100%; border-collapse: collapse; }
					th { text-align: left; padding: 12px 16px; font-weight: 500; color: #374151; border-bottom: 1px solid #e5e7eb; }
					th.right { text-align: right; }
					@media print {
						body { padding: 20px; }
						.no-print { display: none; }
					}
				</style>
			</head>
			<body>
				<div class="header">
					${clientName || projectName ? `<div class="subtitle">${clientName || ''} ${projectName ? (clientName ? ' / ' + projectName : projectName) : ''}</div>` : ''}
					<div class="title">${getDateRangeTitle()}</div>
				</div>

				<div class="stats-container">
					<div class="stat-box">
						<div class="stat-label">Total hours</div>
						<div class="stat-value">${summaryStats.totalHours.toFixed(2)}</div>
					</div>
					
					<div class="donut-container">
						<svg class="donut" width="80" height="80" viewBox="0 0 42 42">
							<circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#dbeafe" stroke-width="4"></circle>
							<circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="#1e40af" stroke-width="4" stroke-dasharray="${summaryStats.billablePercentage} ${100 - summaryStats.billablePercentage}" stroke-dashoffset="0"></circle>
						</svg>
						<div class="donut-center">
							<div class="donut-percentage">${summaryStats.billablePercentage.toFixed(0)}%</div>
						</div>
					</div>
					
					<div class="stat-box">
						<div class="stat-label">Billable</div>
						<div class="stat-value">${summaryStats.billableHours.toFixed(2)}</div>
						<div class="stat-sub">Non-billable</div>
						<div class="stat-value" style="font-size: 18px;">${summaryStats.nonBillableHours.toFixed(2)}</div>
					</div>
					
					<div class="stat-box">
						<div class="stat-label">Billable amount</div>
						<div class="stat-value">N/A</div>
					</div>
					
					<div class="stat-box">
						<div class="stat-label">Uninvoiced amount</div>
						<div class="stat-value">N/A</div>
					</div>
				</div>

				<div class="tabs">
					<span class="tab ${activeSubTab === 'clients' ? 'active' : ''}">Clients</span>
					<span class="tab ${activeSubTab === 'projects' ? 'active' : ''}">Projects</span>
					<span class="tab ${activeSubTab === 'tasks' ? 'active' : ''}">Tasks</span>
					<span class="tab ${activeSubTab === 'team' ? 'active' : ''}">Team</span>
				</div>

				<table>
					<thead>
						<tr>
							<th>${getNameColumnLabel()}</th>
							${showClientColumn ? '<th>Client</th>' : ''}
							<th class="right">Hours</th>
							<th class="right">Billable hours</th>
						</tr>
					</thead>
					<tbody>
						${generateTableRows()}
					</tbody>
				</table>
			</body>
			</html>
		`

		// Create hidden iframe for printing
		const iframe = document.createElement('iframe')
		iframe.style.position = 'absolute'
		iframe.style.width = '0'
		iframe.style.height = '0'
		iframe.style.border = 'none'
		iframe.style.left = '-9999px'
		document.body.appendChild(iframe)

		const iframeDoc = iframe.contentWindow?.document
		if (iframeDoc) {
			iframeDoc.open()
			iframeDoc.write(printContent)
			iframeDoc.close()

			// Wait for content to load before printing
			iframe.onload = () => {
				iframe.contentWindow?.focus()
				iframe.contentWindow?.print()
				// Remove iframe after printing
				setTimeout(() => {
					document.body.removeChild(iframe)
				}, 100)
			}
		}
	}

	return (
		<button 
			onClick={handlePrint}
			className="p-2 text-gray-700 cursor-pointer transition-all duration-300 bg-white border border-gray-300 rounded-md hover:bg-gray-50 outline-none focus:ring-1 focus:ring-transparent focus:border-black"
			title="Print report"
		>
			<FiPrinter className="w-5 h-5" />
		</button>
	)
}

export { FilterActiveProject, FilterDetailedReport, FilterExport, FilterPrint }