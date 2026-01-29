// Report generation utilities

import { TimeEntry, Project } from '@/types'
import { formatDecimalHours } from '@/lib/time'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

export interface TimeReportData {
  entries: TimeEntry[]
  startDate: string
  endDate: string
  groupBy: 'user' | 'project' | 'client' | 'date'
}

export interface ProjectReportData {
  project: Project
  timeEntries: TimeEntry[]
  totalHours: number
  billableHours: number
}

/**
 * Generate Time Report PDF
 */
export function generateTimeReportPDF(data: TimeReportData) {
  const doc = new jsPDF()
  
  // Title
  doc.setFontSize(18)
  doc.text('Time Report', 14, 20)
  
  // Date range
  doc.setFontSize(11)
  doc.text(`Period: ${data.startDate} to ${data.endDate}`, 14, 30)
  
  // Group data
  const grouped = groupTimeEntries(data.entries, data.groupBy)
  
  // Prepare table data
  const tableData = Object.entries(grouped).map(([key, entries]) => {
    const hours = entries.reduce((sum, e) => sum + e.hours, 0)
    const billable = entries.filter(e => e.isBillable).reduce((sum, e) => sum + e.hours, 0)
    return [key, entries.length, formatDecimalHours(hours), formatDecimalHours(billable)]
  })
  
  // Add summary
  const totalHours = data.entries.reduce((sum, e) => sum + e.hours, 0)
  const totalBillable = data.entries.filter(e => e.isBillable).reduce((sum, e) => sum + e.hours, 0)
  
  autoTable(doc, {
    head: [[`Grouped by ${data.groupBy}`, 'Entries', 'Total Hours', 'Billable Hours']],
    body: tableData,
    foot: [['Total', data.entries.length.toString(), formatDecimalHours(totalHours), formatDecimalHours(totalBillable)]],
    startY: 40,
    theme: 'grid',
    styles: { fontSize: 10 },
    headStyles: { fillColor: [14, 165, 233] },
    footStyles: { fillColor: [229, 231, 235], textColor: [0, 0, 0], fontStyle: 'bold' },
  })
  
  return doc
}

/**
 * Generate Project Report PDF
 */
export function generateProjectReportPDF(data: ProjectReportData) {
  const doc = new jsPDF()
  
  // Title
  doc.setFontSize(18)
  doc.text('Project Report', 14, 20)
  
  // Project info
  doc.setFontSize(11)
  doc.text(`Project: ${data.project.name}`, 14, 30)
  doc.text(`Client: ${data.project.client.name}`, 14, 36)
  doc.text(`Status: ${data.project.status}`, 14, 42)
  
  // Summary stats
  doc.setFontSize(12)
  doc.text('Summary', 14, 55)
  doc.setFontSize(10)
  doc.text(`Total Hours: ${formatDecimalHours(data.totalHours)}`, 14, 62)
  doc.text(`Billable Hours: ${formatDecimalHours(data.billableHours)}`, 14, 68)
  
  // Time entries table
  const tableData = data.timeEntries.map(entry => [
    entry.date,
    `${entry.user.firstName} ${entry.user.lastName}`,
    entry.task?.name || '-',
    formatDecimalHours(entry.hours),
    entry.isBillable ? 'Yes' : 'No'
  ])

  autoTable(doc, {
    head: [['Date', 'User', 'Task', 'Hours', 'Billable']],
    body: tableData,
    startY: 75,
    theme: 'grid',
    styles: { fontSize: 9 },
    headStyles: { fillColor: [14, 165, 233] },
  })
  
  return doc
}

/**
 * Export Time Report to Excel
 */
export function exportTimeReportToExcel(data: TimeReportData): Blob {
  const workbook = XLSX.utils.book_new()
  
  // Prepare data
  const excelData = data.entries.map(entry => ({
    Date: entry.date,
    User: `${entry.user.firstName} ${entry.user.lastName}`,
    Project: entry.project.name,
    Client: entry.project.client.name,
    Task: entry.task?.name || '-',
    Hours: formatDecimalHours(entry.hours),
    Billable: entry.isBillable ? 'Yes' : 'No',
    Notes: entry.notes || '',
  }))
  
  // Create worksheet
  const worksheet = XLSX.utils.json_to_sheet(excelData)
  
  // Set column widths
  const columnWidths = [
    { wch: 12 }, // Date
    { wch: 20 }, // User
    { wch: 25 }, // Project
    { wch: 20 }, // Client
    { wch: 20 }, // Task
    { wch: 8 },  // Hours
    { wch: 10 }, // Billable
    { wch: 40 }, // Notes
  ]
  worksheet['!cols'] = columnWidths
  
  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Time Report')
  
  // Generate Excel file
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

/**
 * Export to CSV
 */
export function exportToCSV(data: any[], filename: string) {
  const worksheet = XLSX.utils.json_to_sheet(data)
  const csv = XLSX.utils.sheet_to_csv(worksheet)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  
  // Download
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${filename}.csv`
  link.click()
}

/**
 * Group time entries by specified key
 */
function groupTimeEntries(entries: TimeEntry[], groupBy: string): Record<string, TimeEntry[]> {
  return entries.reduce((acc, entry) => {
    let key: string
    
    switch (groupBy) {
      case 'user':
        key = `${entry.user.firstName} ${entry.user.lastName}`
        break
      case 'project':
        key = entry.project.name
        break
      case 'client':
        key = entry.project.client.name
        break
      case 'date':
        key = entry.date
        break
      default:
        key = 'Unknown'
    }
    
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(entry)
    
    return acc
  }, {} as Record<string, TimeEntry[]>)
}

/**
 * Calculate utilization rate
 */
export function calculateUtilization(actualHours: number, capacity: number): number {
  if (capacity === 0) return 0
  return Math.round((actualHours / capacity) * 100)
}


