'use client'

import React from 'react'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, isSameDay } from 'date-fns'
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi'

type FilterKind = 'week' | 'month' | 'year' | 'all' | 'custom'

interface ReportDateNavigationProps {
	handlePreviousPeriod: () => void
	handleNextPeriod: () => void
	handleReturnToCurrentPeriod?: () => void
	startDate: Date
	endDate: Date
	loading?: boolean
	filterKind: FilterKind
}

export default function ReportDateNavigation({ 
	handlePreviousPeriod, 
	handleNextPeriod, 
	handleReturnToCurrentPeriod,
	startDate, 
	endDate, 
	loading = false,
	filterKind
}: ReportDateNavigationProps) {
	const today = new Date()
	
	// Check if navigation should be hidden (for 'all' and 'custom' filters)
	const hideNavigation = filterKind === 'all' || filterKind === 'custom'
	
	// Check if we're in the current period (to disable next button)
	const isCurrentPeriod = (() => {
		switch (filterKind) {
			case 'week': {
				const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 })
				const currentWeekEnd = endOfWeek(today, { weekStartsOn: 1 })
				return isSameDay(startDate, currentWeekStart) && isSameDay(endDate, currentWeekEnd)
			}
			case 'month': {
				const currentMonthStart = startOfMonth(today)
				const currentMonthEnd = endOfMonth(today)
				return isSameDay(startDate, currentMonthStart) && isSameDay(endDate, currentMonthEnd)
			}
			case 'year': {
				const currentYearStart = startOfYear(today)
				const currentYearEnd = endOfYear(today)
				return isSameDay(startDate, currentYearStart) && isSameDay(endDate, currentYearEnd)
			}
			case 'all':
			case 'custom':
			default:
				return false
		}
	})()
	
	const isNextDisabled = loading || isCurrentPeriod
	
	// Get display text based on filter type
	const getDisplayText = () => {
		// Check if start and end dates are in different months/years
		const isSameYearRange = format(startDate, 'yyyy') === format(endDate, 'yyyy')
		const isSameMonthRange = format(startDate, 'MMM yyyy') === format(endDate, 'MMM yyyy')
		const startFormatWithMonth = isSameMonthRange ? 'd' : (isSameYearRange ? 'd MMM' : 'd MMM yyyy')
		
		switch (filterKind) {
			case 'week': {
				const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 })
				const isThisWeek = isSameDay(startDate, currentWeekStart)
				const prefix = isThisWeek ? 'This week: ' : ''
				return `${prefix}${format(startDate, startFormatWithMonth)} – ${format(endDate, 'd MMM yyyy')}`
			}
			case 'month': {
				const currentMonthStart = startOfMonth(today)
				const isThisMonth = isSameDay(startDate, currentMonthStart)
				const prefix = isThisMonth ? 'This month: ' : ''
				return `${prefix}${format(startDate, 'MMMM yyyy')}`
			}
			case 'year': {
				const currentYearStart = startOfYear(today)
				const isThisYear = isSameDay(startDate, currentYearStart)
				const prefix = isThisYear ? 'This year: ' : ''
				return `${prefix}${format(startDate, 'yyyy')}`
			}
			case 'all':
				return 'All Time'
			case 'custom':
				return `${format(startDate, 'd MMM yyyy')} – ${format(endDate, 'd MMM yyyy')}`
			default:
				return `${format(startDate, startFormatWithMonth)} – ${format(endDate, 'd MMM yyyy')}`
		}
	}

	// Get return button text based on filter type
	const getReturnButtonText = () => {
		switch (filterKind) {
			case 'week':
				return 'Return to this week'
			case 'month':
				return 'Return to this month'
			case 'year':
				return 'Return to this year'
			default:
				return ''
		}
	}
	
	return (
		<div className="flex items-center flex-wrap gap-2 sm-gap-4">
		<div className="flex">
			{!hideNavigation && (
				<button
					onClick={handlePreviousPeriod}
					disabled={loading}
					className={`p-1.5 rounded-s-md border border-[#1d1e1c40] hover:bg-gray-100 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
				>
					<FiChevronLeft className="w-5 h-5 text-gray-600" />
				</button>
			)}
			{!hideNavigation && (
				<button
					onClick={handleNextPeriod}
					disabled={isNextDisabled}
					className={`p-1.5 rounded-e-md border border-l-0 border-[#1d1e1c40] hover:bg-gray-100 ${isNextDisabled ? 'cursor-not-allowed' : ''}`}
				>
					<FiChevronRight className={`w-5 h-5 text-gray-600 ${isNextDisabled ? 'opacity-50' : ''}`} />
				</button>
			)}
		</div>
		<span className="font-medium text-gray-900">
			{getDisplayText()}
		</span>
	{!hideNavigation && !isCurrentPeriod && handleReturnToCurrentPeriod && (
		<button
			onClick={handleReturnToCurrentPeriod}
			disabled={loading}
			className="py-1 text-sm text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
		>
			{getReturnButtonText()}
		</button>
	)}
	</div>
	)
}
