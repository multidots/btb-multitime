import React, { useMemo, useState } from 'react'
import { FiCheckSquare, FiUsers, FiTrendingUp, FiBarChart } from 'react-icons/fi'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, ReferenceArea, Cell } from 'recharts'
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachWeekOfInterval, getWeek, getYear } from 'date-fns'
import { formatSimpleTime } from '@/lib/time'
import { Project } from '@/types'

interface TimesheetEntry {
    user: {
        _id: string
        firstName: string
        lastName: string
    }
    status: string
    entries: Array<{
        _key: string
        date: string
        hours: number
        isBillable: boolean
        notes?: string
        taskId?: string
    }>
}

interface SingleProjectChartProps {
    project: Project
    timesheetEntries?: TimesheetEntry[] | null
}

export default function SingleProjectChart({ project, timesheetEntries }: SingleProjectChartProps) {
    const [weekOffset, setWeekOffset] = useState(0)
	const [chartView, setChartView] = useState<'progress' | 'hours'>('progress')
	// Process time entries for chart - MUST be before early returns
	const chartData = useMemo(() => {
		// const hasTimeEntries = project?.timeEntries && Array.isArray(project.timeEntries) && project.timeEntries.length > 0
		const hasTimesheetEntries = timesheetEntries && Array.isArray(timesheetEntries) && timesheetEntries.length > 0
		
		if (!hasTimesheetEntries) return []
	
		const now = new Date()
		const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 })
		const viewWeekStart = addWeeks(currentWeekStart, weekOffset)
		const viewWeekEnd = endOfWeek(viewWeekStart, { weekStartsOn: 1 })
		
		// Get date range: 6 months before view week to view week end
		const startDate = subWeeks(viewWeekStart, 24)
		const endDate = viewWeekEnd
		
		// Get all weeks in range
		const weeks = eachWeekOfInterval(
			{ start: startDate, end: endDate },
			{ weekStartsOn: 1 }
		)
		
		// Flatten all timesheet entries
		const allTimesheetEntries = timesheetEntries?.flatMap(ts => 
			ts.entries?.map(entry => ({
				...entry,
				status: ts.status
			})) || []
		) || []
		
		// Group time entries by week
		const weeklyData = weeks.map(weekStart => {
			const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
			const weekKey = format(weekStart, 'yyyy-MM-dd')
			const monthLabel = format(weekStart, 'MMM yyyy')
			
			// Time entries for this week - commented out
			// const entriesInWeek = project.timeEntries?.filter((entry) => {
			// 	if (!entry.date) return false
			// 	const entryDate = new Date(entry.date)
			// 	return entryDate >= weekStart && entryDate <= weekEnd
			// }) || []
			// const totalHours = entriesInWeek.reduce((sum: number, entry) => sum + (entry.hours || 0), 0)
			// const billableHours = entriesInWeek.reduce((sum: number, entry) => {
			// 	const isBillable = entry.task?.isBillable !== false
			// 	return sum + (isBillable ? (entry.hours || 0) : 0)
			// }, 0)
			// const nonBillableHours = Math.round((totalHours - billableHours) * 100) / 100
			
			// Timesheet entries for this week
			const timesheetEntriesInWeek = allTimesheetEntries.filter((entry) => {
				if (!entry.date) return false
				const entryDate = new Date(entry.date)
				return entryDate >= weekStart && entryDate <= weekEnd
			})
			
			const timesheetTotalHours = timesheetEntriesInWeek.reduce((sum: number, entry) => sum + (entry.hours || 0), 0)
			const timesheetBillableHours = timesheetEntriesInWeek.reduce((sum: number, entry) => {
				return sum + (entry.isBillable ? (entry.hours || 0) : 0)
			}, 0)
			const timesheetNonBillableHours = Math.round((timesheetTotalHours - timesheetBillableHours) * 100) / 100
			
			// Show month label for all weeks (not just first week of month)
			// Format: "MMM yyyy" for all weeks
			const weekLabel = monthLabel
		  
			const weekNumber = getWeek(weekStart, { weekStartsOn: 1, firstWeekContainsDate: 4 })
			const year = getYear(weekStart)
			
			return {
				week: weekKey,
				weekStart: weekStart,
				weekEnd: weekEnd,
				label: weekLabel,
				monthLabel: monthLabel,
				// Time entries - commented out
				hours: 0,
				billableHours: 0,
				nonBillableHours: 0,
				// Timesheet entries
				timesheetHours: Math.round(timesheetTotalHours * 100) / 100,
				timesheetBillableHours: Math.round(timesheetBillableHours * 100) / 100,
				timesheetNonBillableHours: timesheetNonBillableHours,
				weekNumber: weekNumber,
				year: year,
				isCurrentWeek: weekStart.getTime() === currentWeekStart.getTime(),
				isSelectedWeek: weekStart.getTime() === viewWeekStart.getTime()
			}
		})
		return weeklyData
	}, [timesheetEntries, weekOffset])

	// Calculate cumulative progress data for line chart
	const progressData = useMemo(() => {
		if (!chartData || chartData.length === 0) return []
		
		// let cumulativeHours = 0
		let cumulativeTimesheetHours = 0
		return chartData.map((week, index) => {
			// cumulativeHours += week.hours
			cumulativeTimesheetHours += week.timesheetHours
			return {
				...week,
				cumulativeHours: 0,
				cumulativeTimesheetHours: Math.round(cumulativeTimesheetHours * 100) / 100
			}
		})
	}, [chartData])
	
	const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
	const viewWeekStart = addWeeks(currentWeekStart, weekOffset)
	
	// Calculate the earliest and latest week with data
	const weeksWithData = useMemo(() => {
		// Time entry dates - commented out
		// const timeEntryDates = (project?.timeEntries || [])
		// 	.map(entry => entry.date ? new Date(entry.date) : null)
		// 	.filter(date => date !== null) as Date[]
		
		const timesheetDates = (timesheetEntries || [])
			.flatMap(ts => ts.entries || [])
			.map(entry => entry.date ? new Date(entry.date) : null)
			.filter(date => date !== null) as Date[]
		
		const allDates = [...timesheetDates]
		
		if (allDates.length === 0) {
			return { earliest: null, latest: null }
		}
		
		const earliestDate = new Date(Math.min(...allDates.map(d => d.getTime())))
		const latestDate = new Date(Math.max(...allDates.map(d => d.getTime())))
		
		const earliestWeek = startOfWeek(earliestDate, { weekStartsOn: 1 })
		const latestWeek = startOfWeek(latestDate, { weekStartsOn: 1 })
		
		return { earliest: earliestWeek, latest: latestWeek }
	}, [timesheetEntries])
	
	// Calculate navigation limits based on data and current view
	const canGoBack = useMemo(() => {
		if (!weeksWithData.earliest) return false
		const earliestWeekOffset = Math.floor((weeksWithData.earliest.getTime() - currentWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
		// Allow going back if we haven't reached the earliest week with data
		return weekOffset > earliestWeekOffset
	}, [weeksWithData.earliest, currentWeekStart, weekOffset])
	
	const canGoForward = useMemo(() => {
		if (!weeksWithData.latest) return false
		const latestWeekOffset = Math.floor((weeksWithData.latest.getTime() - currentWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
		// Allow going forward if we haven't reached the latest week (current week or future)
		return weekOffset < 0
	}, [weeksWithData.latest, currentWeekStart, weekOffset])

	const handlePreviousWeek = () => {
		// Go back in time = decrease weekOffset (more negative)
		setWeekOffset(prev => prev - 1)
	}

	const handleNextWeek = () => {
		// Go forward in time = increase weekOffset (less negative, toward 0)
		setWeekOffset(prev => prev + 1)
	}

	return (
		<div className="border-b border-gray-200">
			{/* Chart Tabs */}
			<div className="px-6 pt-4">
				<nav className="-mb-px flex space-x-8">
				<button
					onClick={() => setChartView('progress')}
					className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
					chartView === 'progress'
						? 'theme-color theme-color-border font-semibold'
						: 'border-transparent text-gray-500 hover:theme-color hover:theme-color-border'
					}`}
				>
					<FiTrendingUp className="w-4 h-4" />
					<span>Project progress</span>
				</button>
				<button
					onClick={() => setChartView('hours')}
					className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
					chartView === 'hours'
						? 'theme-color theme-color-border font-semibold'
						: 'border-transparent text-gray-500 hover:theme-color hover:theme-color-border'
					}`}
				>
					<FiBarChart className="w-4 h-4" />
					<span>Hours per week</span>
				</button>
				</nav>
			</div>

			{/* Chart Content */}
			<div className="p-6">
				{chartView === 'hours' && (
				<div className="space-y-4">
					{/* Navigation Controls */}
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center space-x-3">
							<button
							onClick={handlePreviousWeek}
							disabled={!canGoBack}
							className={`px-3 py-1 text-sm rounded border ${
								canGoBack
								? 'border-gray-300 hover:bg-gray-50 text-gray-700'
								: 'border-gray-200 text-gray-400 cursor-not-allowed'
							}`}
							>
							←
							</button>
							<span className="text-sm font-medium text-gray-700">
							{weekOffset === 0 ? 'This week' : format(viewWeekStart, 'MMM d, yyyy')}
							</span>
							<button
							onClick={handleNextWeek}
							disabled={!canGoForward}
							className={`px-3 py-1 text-sm rounded border ${
								canGoForward
								? 'border-gray-300 hover:bg-gray-50 text-gray-700'
								: 'border-gray-200 text-gray-400 cursor-not-allowed'
							}`}
							>
							→
							</button>
						</div>
					</div>

					{/* Chart */}
					<div className="w-full h-[400px]">
					{chartData.length > 0 ? (
						<ResponsiveContainer width="100%" height="100%" key={`chart-${weekOffset}`}>
						<BarChart
							data={chartData}
							margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
						>
							<CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
							<XAxis
							dataKey="label"
							stroke="#6b7280"
							fontSize={12}
							tick={{ fill: '#6b7280' }}
							interval="preserveStartEnd"
							/>
							<YAxis
							stroke="#6b7280"
							fontSize={12}
							tick={{ fill: '#6b7280' }}
							label={{ value: 'Hours', angle: -90, position: 'insideLeft', style: { fill: '#6b7280' } }}
							/>
							{/* Light blue background for current week - spans full height */}
							{(() => {
								const currentWeekData = chartData.find(d => d.isCurrentWeek)
								if (currentWeekData) {
									const currentWeekIndex = chartData.findIndex(d => d.isCurrentWeek)
									// Get the Y-axis domain max value (timesheet hours only - time entries commented out)
									const maxHours = Math.max(...chartData.map(d => d.timesheetHours), 0)
									const yMax = maxHours > 0 ? maxHours * 2 : 20
									
									// ReferenceArea with index-based positioning for categorical X-axis
									// Place it after YAxis but before bars for proper layering
									return (
										<ReferenceArea
											x1={currentWeekIndex}
											x2={currentWeekIndex}
											y1={0}
											y2={yMax}
											fill="#dbeafe"
											fillOpacity={0.5}
											ifOverflow="visible"
										/>
									)
								}
								return null
							})()}
							<Tooltip
							contentStyle={{
								backgroundColor: 'white',
								border: '1px solid #e5e7eb',
								borderRadius: '6px',
								padding: '12px'
							}}
							content={({ active, payload }) => {
								if (active && payload && payload.length) {
									const data = payload[0].payload
									// Time entry percentages - commented out
									// const billablePercentage = data.hours > 0 ? Math.round((data.billableHours / data.hours) * 100) : 0
									// const nonBillablePercentage = data.hours > 0 ? Math.round((data.nonBillableHours / data.hours) * 100) : 0
									const timesheetBillablePercentage = data.timesheetHours > 0 
										? Math.round((data.timesheetBillableHours / data.timesheetHours) * 100) 
										: 0
									const dateRange = `${format(data.weekStart, 'd')} - ${format(data.weekEnd, 'd MMM yyyy')}`
									const weekLabel = `Week ${data.weekNumber}`
									
									return (
										<div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
											<div className="text-sm font-medium text-gray-900 mb-2">
												{dateRange} ({weekLabel})
											</div>
											<div className="text-sm text-gray-600 space-y-2">
												{/* Time Entries section - commented out
												<div className="border-b pb-2">
													<div className="font-medium text-gray-700 mb-1">Time Entries</div>
													<div>Total: <span className="font-medium text-gray-900">{formatSimpleTime(data.hours)}</span></div>
													<div>Billable: <span className="font-medium text-gray-900">{formatSimpleTime(data.billableHours)} ({billablePercentage}%)</span></div>
												</div>
												*/}
												<div>
													<div className="font-medium text-gray-700 mb-1">Hours</div>
													<div>Total: <span className="font-medium text-gray-900">{formatSimpleTime(data.timesheetHours)}</span></div>
													<div>Billable: <span className="font-medium text-gray-900">{formatSimpleTime(data.timesheetBillableHours)} ({timesheetBillablePercentage}%)</span></div>
												</div>
											</div>
										</div>
									)
								}
								return null
							}}
							/>
							{weekOffset === 0 && chartData.find(d => d.isCurrentWeek) && (
							<ReferenceLine
								x={chartData.findIndex(d => d.isCurrentWeek)}
								stroke="#374151"
								strokeDasharray="3 3"
								label={{ value: 'This week', position: 'top', fill: '#374151', fontSize: 12 }}
							/>
							)}
							{/* Time entry bars - commented out
							<Bar
							dataKey="billableHours"
							stackId="timeEntries"
							fill="#374151"
							name="Time Entries (Billable)"
							radius={[0, 0, 0, 0]}
							isAnimationActive={false}
							>
								{chartData.map((entry, index) => (
									<Cell
										key={`billable-cell-${index}`}
										fill="#374151"
									/>
								))}
							</Bar>
							<Bar
							dataKey="nonBillableHours"
							stackId="timeEntries"
							fill="#9ca3af"
							name="Time Entries (Non-Billable)"
							radius={[4, 4, 0, 0]}
							isAnimationActive={false}
							>
								{chartData.map((entry, index) => (
									<Cell
										key={`nonbillable-cell-${index}`}
										fill="#9ca3af"
									/>
								))}
							</Bar>
							*/}
							{/* Timesheet bars: match time entry colors (gray) */}
							<Bar
							dataKey="timesheetBillableHours"
							stackId="timesheets"
							fill="#374151"
							name="Billable"
							radius={[0, 0, 0, 0]}
							isAnimationActive={false}
							>
								{chartData.map((entry, index) => (
									<Cell
										key={`ts-billable-cell-${index}`}
										fill="#374151"
									/>
								))}
							</Bar>
							<Bar
							dataKey="timesheetNonBillableHours"
							stackId="timesheets"
							fill="#9ca3af"
							name="Non-Billable"
							radius={[4, 4, 0, 0]}
							isAnimationActive={false}
							>
								{chartData.map((entry, index) => (
									<Cell
										key={`ts-nonbillable-cell-${index}`}
										fill="#9ca3af"
									/>
								))}
							</Bar>
							<Legend />
						</BarChart>
						</ResponsiveContainer>
					) : (
						<div className="flex items-center justify-center h-full text-gray-500">
						<p>No timesheet data available</p>
						</div>
					)}
					</div>
				</div>
				)}
				{chartView === 'progress' && (
				<div className="space-y-4">
					{/* Navigation Controls */}
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center space-x-3">
							<button
							onClick={handlePreviousWeek}
							disabled={!canGoBack}
							className={`px-3 py-1 text-sm rounded border ${
								canGoBack
								? 'border-gray-300 hover:bg-gray-50 text-gray-700'
								: 'border-gray-200 text-gray-400 cursor-not-allowed'
							}`}
							>
							←
							</button>
							<span className="text-sm font-medium text-gray-700">
							{weekOffset === 0 ? 'This week' : format(viewWeekStart, 'MMM d, yyyy')}
							</span>
							<button
							onClick={handleNextWeek}
							disabled={!canGoForward}
							className={`px-3 py-1 text-sm rounded border ${
								canGoForward
								? 'border-gray-300 hover:bg-gray-50 text-gray-700'
								: 'border-gray-200 text-gray-400 cursor-not-allowed'
							}`}
							>
							→
							</button>
						</div>
					</div>

					{/* Chart */}
					<div className="w-full h-[400px]">
					{progressData.length > 0 ? (
						<ResponsiveContainer width="100%" height="100%">
						<LineChart
							data={progressData}
							margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
						>
							<CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
							<XAxis
							dataKey="label"
							stroke="#6b7280"
							fontSize={12}
							tick={{ fill: '#6b7280' }}
							interval="preserveStartEnd"
							/>
							<YAxis
							stroke="#6b7280"
							fontSize={12}
							tick={{ fill: '#6b7280' }}
							label={{ value: 'Cumulative Hours', angle: -90, position: 'insideLeft', style: { fill: '#6b7280' } }}
							/>
							<Tooltip
							contentStyle={{
								backgroundColor: 'white',
								border: '1px solid #e5e7eb',
								borderRadius: '6px',
								padding: '8px'
							}}
							content={({ active, payload }) => {
								if (active && payload && payload.length) {
									const data = payload[0].payload
									const dateRange = `${format(data.weekStart, 'd')} - ${format(data.weekEnd, 'd MMM yyyy')}`
									const weekLabel = `Week ${data.weekNumber}`
									
									return (
										<div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
											<div className="text-sm font-medium text-gray-900 mb-2">
												{dateRange} ({weekLabel})
											</div>
											<div className="text-sm text-gray-600 space-y-1">
												{/* <div>Time Entries: <span className="font-medium text-gray-900">{formatSimpleTime(data.cumulativeHours)}</span></div> */}
												<div>Hours: <span className="font-medium text-gray-900">{formatSimpleTime(data.cumulativeTimesheetHours)}</span></div>
											</div>
										</div>
									)
								}
								return null
							}}
							/>
							{weekOffset === 0 && progressData.find(d => d.isCurrentWeek) && (
							<ReferenceLine
								x={progressData.findIndex(d => d.isCurrentWeek)}
								stroke="#374151"
								strokeDasharray="3 3"
								label={{ value: 'This week', position: 'top', fill: '#374151', fontSize: 12 }}
							/>
							)}
							{/* Time Entries line - commented out
							<Line
							type="monotone"
							dataKey="cumulativeHours"
							stroke="#374151"
							strokeWidth={2}
							name="Time Entries"
							dot={{ fill: '#374151', r: 4 }}
							activeDot={{ r: 6 }}
							/>
							*/}
							<Line
							type="monotone"
							dataKey="cumulativeTimesheetHours"
							stroke="#374151"
							strokeWidth={2}
							name="Hours"
							dot={{ fill: '#374151', r: 4 }}
							activeDot={{ r: 6 }}
							/>
							<Legend />
						</LineChart>
						</ResponsiveContainer>
					) : (
						<div className="flex items-center justify-center h-full text-gray-500">
						<p>No timesheet data available</p>
						</div>
					)}
					</div>
				</div>
				)}
			</div>
		</div>
	)
}