import React, { useMemo, useState } from 'react'
import { FiCheckSquare, FiUsers, FiTrendingUp, FiBarChart } from 'react-icons/fi'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, Cell } from 'recharts'
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachWeekOfInterval, getWeek, getYear } from 'date-fns'
import { formatSimpleTime } from '@/lib/time'
import { Project } from '@/types'

export default function SingleProjectChart({ project }: { project: Project }) {
    const [weekOffset, setWeekOffset] = useState(0)
	const [chartView, setChartView] = useState<'progress' | 'hours'>('progress')
	// Process time entries for chart - MUST be before early returns
	// console.log('project', project)
	const chartData = useMemo(() => {
		if (!project?.timeEntries || !Array.isArray(project.timeEntries) || project.timeEntries.length === 0) return []
	
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
		
		// Group time entries by week
		const weeklyData = weeks.map(weekStart => {
			const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
			const weekKey = format(weekStart, 'yyyy-MM-dd')
			const monthLabel = format(weekStart, 'MMM yyyy')
			
			const entriesInWeek = project.timeEntries?.filter((entry) => {
				if (!entry.date) return false
				const entryDate = new Date(entry.date)
				return entryDate >= weekStart && entryDate <= weekEnd
			}) || []
		  
			const totalHours = entriesInWeek.reduce((sum: number, entry) => sum + (entry.hours || 0), 0)
			const billableHours = entriesInWeek.reduce((sum: number, entry) => {
				// Check if task is billable (task is billable by default if not specified)
				const isBillable = entry.task?.isBillable !== false
				return sum + (isBillable ? (entry.hours || 0) : 0)
			}, 0)
			const nonBillableHours = Math.round((totalHours - billableHours) * 100) / 100
			
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
				hours: Math.round(totalHours * 100) / 100,
				billableHours: Math.round(billableHours * 100) / 100,
				nonBillableHours: nonBillableHours,
				weekNumber: weekNumber,
				year: year,
				isCurrentWeek: weekStart.getTime() === currentWeekStart.getTime(),
				isSelectedWeek: weekStart.getTime() === viewWeekStart.getTime()
			}
		})
		return weeklyData
	}, [project?.timeEntries, weekOffset])

	// Calculate cumulative progress data for line chart
	const progressData = useMemo(() => {
		if (!chartData || chartData.length === 0) return []
		
		let cumulativeHours = 0
		return chartData.map((week, index) => {
			cumulativeHours += week.hours
			return {
				...week,
				cumulativeHours: Math.round(cumulativeHours * 100) / 100
			}
		})
	}, [chartData])
	
	const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
	const viewWeekStart = addWeeks(currentWeekStart, weekOffset)
	
	// Calculate the earliest and latest week with data
	const weeksWithData = useMemo(() => {
		if (!project?.timeEntries || !Array.isArray(project.timeEntries) || project.timeEntries.length === 0) {
			return { earliest: null, latest: null }
		}
		
		const dates = project.timeEntries
			.map(entry => entry.date ? new Date(entry.date) : null)
			.filter(date => date !== null) as Date[]
		
		if (dates.length === 0) {
			return { earliest: null, latest: null }
		}
		
		const earliestDate = new Date(Math.min(...dates.map(d => d.getTime())))
		const latestDate = new Date(Math.max(...dates.map(d => d.getTime())))
		
		const earliestWeek = startOfWeek(earliestDate, { weekStartsOn: 1 })
		const latestWeek = startOfWeek(latestDate, { weekStartsOn: 1 })
		
		return { earliest: earliestWeek, latest: latestWeek }
	}, [project?.timeEntries])
	
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

	// console.log('week offset', weekOffset)
	// console.log('weeks with data', weeksWithData)
	// console.log('canGoBack', canGoBack, 'canGoForward', canGoForward)

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
									// Get the Y-axis domain max value - use a large multiplier to ensure full coverage
									const maxHours = Math.max(...chartData.map(d => d.hours), 0)
									const yMax = maxHours > 0 ? maxHours * 2 : 20 // Use a larger multiplier
									
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
									const billablePercentage = data.hours > 0 
										? Math.round((data.billableHours / data.hours) * 100) 
										: 0
									const nonBillablePercentage = data.hours > 0 
										? Math.round((data.nonBillableHours / data.hours) * 100) 
										: 0
									const dateRange = `${format(data.weekStart, 'd')} - ${format(data.weekEnd, 'd MMM yyyy')}`
									const weekLabel = `Week ${data.weekNumber}`
									
									return (
										<div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
											<div className="text-sm font-medium text-gray-900 mb-2">
												{dateRange} ({weekLabel})
											</div>
											<div className="text-sm text-gray-600 space-y-1">
												<div>Total hours: <span className="font-medium text-gray-900">{formatSimpleTime(data.hours)}</span></div>
												<div>Billable hours: <span className="font-medium text-gray-900">{formatSimpleTime(data.billableHours)} ({billablePercentage}%)</span></div>
												<div>Non-billable hours: <span className="font-medium text-gray-900">{formatSimpleTime(data.nonBillableHours)} ({nonBillablePercentage}%)</span></div>
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
								stroke="#3b82f6"
								strokeDasharray="3 3"
								label={{ value: 'This week', position: 'top', fill: '#3b82f6', fontSize: 12 }}
							/>
							)}
							{/* Stacked bars: Billable hours (gray #374151) on bottom, Non-billable hours (light gray) on top */}
							<Bar
							dataKey="billableHours"
							stackId="hours"
							fill="#374151"
							radius={[4, 4, 0, 0]}
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
							stackId="hours"
							fill="#9ca3af"
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
						</BarChart>
						</ResponsiveContainer>
					) : (
						<div className="flex items-center justify-center h-full text-gray-500">
						<p>No time entries data available</p>
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
							formatter={(value: number) => [formatSimpleTime(value), 'Cumulative Hours']}
							labelFormatter={(label) => {
								// Label now always contains the month (MMM yyyy format)
								return label ? `Week of ${label}` : 'Week'
							}}
							/>
							{weekOffset === 0 && progressData.find(d => d.isCurrentWeek) && (
							<ReferenceLine
								x={progressData.findIndex(d => d.isCurrentWeek)}
								stroke="#3b82f6"
								strokeDasharray="3 3"
								label={{ value: 'This week', position: 'top', fill: '#3b82f6', fontSize: 12 }}
							/>
							)}
							<Line
							type="monotone"
							dataKey="cumulativeHours"
							stroke="#374151"
							strokeWidth={2}
							dot={{ fill: '#374151', r: 4 }}
							activeDot={{ r: 6 }}
							/>
						</LineChart>
						</ResponsiveContainer>
					) : (
						<div className="flex items-center justify-center h-full text-gray-500">
						<p>No time entries data available</p>
						</div>
					)}
					</div>
				</div>
				)}
			</div>
		</div>
	)
}