import React from 'react'
import { formatDecimalHours } from '@/lib/time'

interface SummaryStats {
	totalHours: number
	billableHours: number
	nonBillableHours: number
	billablePercentage: number
}

interface ReportStatsDataProps {
	summaryStats: SummaryStats
	projectId?: string | null
	userRole?: string | null
}

export default function ReportStatsData({ summaryStats, projectId, userRole }: ReportStatsDataProps) {
	const canViewProjectReport = projectId && (userRole === 'admin' || userRole === 'manager')

	return (
		<div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
			<div>
				<h3 className="text-sm font-medium text-gray-500 mb-2">Total hours</h3>
				<p className="text-3xl font-semibold text-gray-900">
				{formatDecimalHours(summaryStats.totalHours).toFixed(2)}
				</p>
				{canViewProjectReport && (
					<a 
						href={`/admin/projects/${projectId}`} 
						className="text-sm text-blue-500 hover:text-blue-700 underline"
					>
						See full project report
					</a>
				)}
			</div>
			<div>
				<h3 className="text-sm font-medium text-gray-500 mb-2">Billable/Non-billable</h3>
				<div className="flex items-center space-x-4">
				<div className="relative w-24 h-24">
					<svg className="w-24 h-24 transform -rotate-90">
					<circle
						cx="48"
						cy="48"
						r="40"
						fill="none"
						stroke="#86b1f1"
						strokeWidth="8"
						strokeDasharray={`${2 * Math.PI * 40}`}
						strokeDashoffset="0"
					/>
					{summaryStats.billablePercentage > 0 && (
						<circle
						cx="48"
						cy="48"
						r="40"
						fill="none"
						stroke="#376bdd"
						strokeWidth="8"
						strokeDasharray={`${2 * Math.PI * 40}`}
						strokeDashoffset={`${2 * Math.PI * 40 * (1 - summaryStats.billablePercentage / 100)}`}
						/>
					)}
					</svg>
					<div className="absolute inset-0 flex items-center justify-center">
					<span className="text-sm font-medium text-gray-900">
						{summaryStats.billablePercentage.toFixed(0)}%
					</span>
					</div>
				</div>
				<div className="space-y-1">
					<div className="flex items-center space-x-2">
					<div className="w-4 h-4 bg-[#376bdd] rounded"></div>
					<span className="text-sm text-gray-700">
						Billable: {formatDecimalHours(summaryStats.billableHours).toFixed(2)}
					</span>
					</div>
					<div className="flex items-center space-x-2">
					<div className="w-4 h-4 bg-[#86b1f1] rounded"></div>
					<span className="text-sm text-gray-700">
						Non-billable: {formatDecimalHours(summaryStats.nonBillableHours).toFixed(2)}
					</span>
					</div>
				</div>
				</div>
			</div>
			<div>
				<h3 className="text-sm font-medium text-gray-500 mb-2">Billable amount</h3>
				<p className="text-3xl font-semibold text-gray-900">N/A</p>
			</div>
			<div>
				<h3 className="text-sm font-medium text-gray-500 mb-2">Uninvoiced amount</h3>
				<p className="text-3xl font-semibold text-gray-900">N/A</p>
			</div>
		</div>
	)
}