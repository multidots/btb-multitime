'use client'

import React, { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FiChevronDown, FiCalendar } from 'react-icons/fi'
import { 
	startOfWeek, 
	endOfWeek, 
	startOfMonth, 
	endOfMonth, 
	startOfYear, 
	endOfYear,
	format,
	parse,
	isValid
} from 'date-fns'

type FilterType = 'week' | 'month' | 'year' | 'all' | 'custom'

const filterOptions: { value: FilterType; label: string }[] = [
	{ value: 'week', label: 'Week' },
	{ value: 'month', label: 'Month' },
	{ value: 'year', label: 'Year' },
	{ value: 'all', label: 'All' },
	{ value: 'custom', label: 'Custom' },
]

const getDisplayLabel = (value: FilterType, fromDate?: string, tillDate?: string): string => {
	switch (value) {
		case 'week':
			return 'Week'
		case 'month':
			return 'Month'
		case 'year':
			return 'Year'
		case 'all':
			return 'All Time'
		case 'custom':
			// if (fromDate && tillDate) {
			// 	const from = parse(fromDate, 'yyyy-MM-dd', new Date())
			// 	const till = parse(tillDate, 'yyyy-MM-dd', new Date())
			// 	if (isValid(from) && isValid(till)) {
			// 		return `${format(from, 'd MMM')} - ${format(till, 'd MMM')}`
			// 	}
			// }
			return 'Custom'
		default:
			return 'Week'
	}
}

export default function DateFilter() {
	const router = useRouter()
	const searchParams = useSearchParams()
	const [isOpen, setIsOpen] = useState(false)
	const [showCustomPicker, setShowCustomPicker] = useState(false)
	const dropdownRef = useRef<HTMLDivElement>(null)
	
	// Get current filter from URL or default to 'week'
	const currentKind = (searchParams.get('kind') as FilterType) || 'week'
	const currentFrom = searchParams.get('from') || ''
	const currentTill = searchParams.get('till') || ''
	
	// Local state for custom date inputs
	const [customStartDate, setCustomStartDate] = useState(currentFrom)
	const [customEndDate, setCustomEndDate] = useState(currentTill)
	
	// Update local state when URL params change
	useEffect(() => {
		if (currentKind === 'custom') {
			setCustomStartDate(currentFrom)
			setCustomEndDate(currentTill)
		}
	}, [currentFrom, currentTill, currentKind])
	
	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				setIsOpen(false)
				setShowCustomPicker(false)
			}
		}
		
		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [])
	
	const handleSelect = (value: FilterType) => {
		const params = new URLSearchParams(searchParams.toString())
		const today = new Date()
		
		let startDate: Date
		let endDate: Date
		
		switch (value) {
			case 'week':
				startDate = startOfWeek(today, { weekStartsOn: 1 })
				endDate = endOfWeek(today, { weekStartsOn: 1 })
				break
			case 'month':
				startDate = startOfMonth(today)
				endDate = endOfMonth(today)
				break
			case 'year':
				startDate = startOfYear(today)
				endDate = endOfYear(today)
				break
			case 'all':
				// Set a very old start date and today as end date for "all time"
				startDate = new Date('2020-01-01')
				endDate = today
				break
			case 'custom':
				// Show custom date picker instead of closing
				setShowCustomPicker(true)
				setIsOpen(false)
				// Initialize with current dates if available
				if (!customStartDate) {
					setCustomStartDate(format(today, 'yyyy-MM-dd'))
				}
				if (!customEndDate) {
					setCustomEndDate(format(today, 'yyyy-MM-dd'))
				}
				return
			default:
				startDate = startOfWeek(today, { weekStartsOn: 1 })
				endDate = endOfWeek(today, { weekStartsOn: 1 })
		}
		
		params.set('kind', value)
		params.set('from', format(startDate, 'yyyy-MM-dd'))
		params.set('till', format(endDate, 'yyyy-MM-dd'))
		
		router.push(`?${params.toString()}`, { scroll: false })
		setIsOpen(false)
		setShowCustomPicker(false)
	}
	
	const handleApplyCustomDates = () => {
		if (!customStartDate || !customEndDate) return
		
		const params = new URLSearchParams(searchParams.toString())
		params.set('kind', 'custom')
		params.set('from', customStartDate)
		params.set('till', customEndDate)
		
		router.push(`?${params.toString()}`, { scroll: false })
		setShowCustomPicker(false)
	}
	
	const handleCancelCustom = () => {
		setShowCustomPicker(false)
		// Reset to current URL values
		setCustomStartDate(currentFrom)
		setCustomEndDate(currentTill)
	}
	
	return (
		<div className="relative" ref={dropdownRef}>
			<button
				onClick={() => {
					if (showCustomPicker) {
						setShowCustomPicker(false)
					} else {
						setIsOpen(!isOpen)
					}
				}}
				className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 focus:border-black rounded-md hover:bg-gray-50 outline-none"
			>
				<span>{getDisplayLabel(currentKind, currentFrom, currentTill)}</span>
				<FiChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
			</button>
			
			{/* Filter Type Dropdown */}
			{isOpen && (
				<div className="absolute right-0 z-20 mt-2 w-40 bg-white border border-gray-200 rounded-md shadow-lg">
					<div className="py-1">
						{filterOptions.map((option) => (
							<button
								key={option.value}
								onClick={() => handleSelect(option.value)}
								className={`w-full text-left px-4 py-2 text-sm hover:bg-black hover:text-white ${
									currentKind === option.value
										? 'bg-black text-white'
										: 'text-gray-700'
								}`}
							>
								{option.label}
							</button>
						))}
					</div>
				</div>
			)}
			
			{/* Custom Date Picker */}
			{showCustomPicker && (
				<div className="absolute right-0 z-20 mt-2 w-72 bg-white border border-gray-200 rounded-md shadow-lg p-4">
					<div className="space-y-4">
						<div className="text-sm font-medium text-gray-700 mb-2">Select Date Range</div>
						
						<div className="space-y-3">
							<div>
								<label className="block text-xs text-gray-500 mb-1">From</label>
								<div className="relative">
									<FiCalendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
									<input
										type="date"
										value={customStartDate}
										onChange={(e) => setCustomStartDate(e.target.value)}
										max={customEndDate || undefined}
										className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
									/>
								</div>
							</div>
							
							<div>
								<label className="block text-xs text-gray-500 mb-1">To</label>
								<div className="relative">
									<FiCalendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
									<input
										type="date"
										value={customEndDate}
										onChange={(e) => setCustomEndDate(e.target.value)}
										min={customStartDate || undefined}
										className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
									/>
								</div>
							</div>
						</div>
						
						<div className="flex gap-2 pt-2">
							<button
								onClick={handleCancelCustom}
								className="flex-1 px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
							>
								Cancel
							</button>
							<button
								onClick={handleApplyCustomDates}
								disabled={!customStartDate || !customEndDate}
								className="btn-primary flex-1 px-3 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
							>
								Apply
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
