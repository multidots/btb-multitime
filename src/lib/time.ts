/**
 * Time formatting utilities
 */

/**
 * Format decimal hours to a clean 2-decimal format
 * @param hours - The hours value to format (can be string or number)
 * @returns Formatted hours as a number with max 2 decimal places
 */
export function formatDecimalHours(hours: number | string): number {
  const numHours = typeof hours === 'string' ? parseFloat(hours) : hours
  if (isNaN(numHours)) return 0

  // Use rounding to avoid floating point precision issues
  // First round to avoid floating point errors, then format to 2 decimals
  const rounded = Math.round(numHours * 10000) / 10000
  return Math.round(rounded * 100) / 100
}

/**
 * Format decimal hours to hours:minutes string (H:MM format)
 * @param decimalHours - The decimal hours to format
 * @returns Formatted time string (e.g., "1:30", "0:15", "8:45")
 */
export function formatSimpleTime(decimalHours: number | string): string {
  const numHours = typeof decimalHours === 'string' ? parseFloat(decimalHours) : decimalHours
  if (isNaN(numHours) || numHours < 0) return '0:00'

  // Round to 2 decimal places first to avoid precision issues
  const rounded = formatDecimalHours(numHours)
  
  // If less than 1 minute (0.0167 hours), return 0:00
  // This ensures timers that run for less than 1 minute show as 0:00
  if (rounded < 1 / 60) {
    return '0:00'
  }
  
  const hours = Math.floor(rounded)
  // Use Math.round instead of Math.floor to preserve minutes more accurately
  // This prevents issues like 4.73 (from 4:44) becoming 4:43
  const minutes = Math.round((rounded - hours) * 60)
  // Ensure minutes don't exceed 59 (shouldn't happen, but safety check)
  const finalMinutes = minutes >= 60 ? 59 : minutes
  return `${hours}:${finalMinutes.toString().padStart(2, '0')}`
}
