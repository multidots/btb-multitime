import { createClient } from '@sanity/client'

// Create a client for mutations
const mutationClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',
  token: process.env.SANITY_API_TOKEN,
  apiVersion: '2024-01-01',
  useCdn: false,
})

/**
 * Recalculate and update a project's aggregated timesheet hours
 * Call this whenever timesheet entries are added, updated, or deleted
 */
export async function recalculateProjectTimesheetHours(projectId: string): Promise<void> {
  try {
    // Fetch all timesheet entries for this project
    // Note: $projectId is used instead of ^._id because this is a standalone query, not a nested projection
    const result = await mutationClient.fetch(`{
      "totalHours": math::sum(*[_type == "timesheet" && $projectId in entries[].project._ref].entries[project._ref == $projectId].hours),
      "approvedHours": math::sum(*[_type == "timesheet" && status == "approved" && $projectId in entries[].project._ref].entries[project._ref == $projectId].hours),
      "billableHours": math::sum(*[_type == "timesheet" && $projectId in entries[].project._ref].entries[project._ref == $projectId && isBillable == true].hours)
    }`, { projectId })

    // Update the project with aggregated hours
    await mutationClient.patch(projectId).set({
      timesheetHours: result.totalHours || 0,
      timesheetApprovedHours: result.approvedHours || 0,
      timesheetBillableHours: result.billableHours || 0,
    }).commit()
  } catch (error) {
    console.error(`Error recalculating project hours for ${projectId}:`, error)
    throw error
  }
}

/**
 * Recalculate hours for multiple projects at once
 * Useful when a timesheet with multiple project entries is updated
 */
export async function recalculateMultipleProjectHours(projectIds: string[]): Promise<void> {
  const uniqueProjectIds = [...new Set(projectIds)]
  
  await Promise.all(
    uniqueProjectIds.map(projectId => recalculateProjectTimesheetHours(projectId))
  )
}

/**
 * Get all unique project IDs from a timesheet's entries
 */
export function getProjectIdsFromTimesheetEntries(entries: Array<{ project?: { _ref?: string } }>): string[] {
  return entries
    .map(entry => entry.project?._ref)
    .filter((id): id is string => !!id)
}
