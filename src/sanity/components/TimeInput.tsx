import React, { useCallback } from 'react'
import { set, unset, PatchEvent } from 'sanity'
import { formatSimpleTime } from '@/lib/time'

interface TimeInputProps {
  value?: number
  onChange: (patch: PatchEvent | any) => void
  schemaType?: any
}

// Normalize H:MM format or decimal format - convert decimal to H:MM and normalize minutes >= 60 to hours
const normalizeTimeInput = (input: string): string | null => {
  if (!input || input.trim() === '') return null

  // Check for decimal format (e.g., "2.2")
  const decimalMatch = input.match(/^(\d*\.?\d+)$/)
  if (decimalMatch) {
    const decimalValue = parseFloat(decimalMatch[1])
    if (isNaN(decimalValue) || decimalValue < 0 || decimalValue > 24) {
      return null // Invalid range
    }

    // Convert decimal to H:MM
    const hours = Math.floor(decimalValue)
    const minutes = Math.round((decimalValue - hours) * 60)

    // Return normalized format
    return `${hours}:${minutes.toString().padStart(2, '0')}`
  }

  // Check for H:MM format
  const timeMatch = input.match(/^(\d+):(\d+)$/)
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10)
    let minutes = parseInt(timeMatch[2], 10)

    // Convert excess minutes to hours
    if (minutes >= 60) {
      const additionalHours = Math.floor(minutes / 60)
      hours += additionalHours
      minutes = minutes % 60
    }

    // Return normalized format
    return `${hours}:${minutes.toString().padStart(2, '0')}`
  }

  return null
}

// Convert H:MM format to decimal hours
const parseTimeInput = (input: string): number | null => {
  if (!input || input.trim() === '') return null
  
  // First normalize the input (handle minutes >= 60)
  const normalized = normalizeTimeInput(input)
  if (!normalized) return null
  
  // Parse the normalized input
  const timeMatch = normalized.match(/^(\d+):(\d{2})$/)
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10)
    const minutes = parseInt(timeMatch[2], 10)
    return hours + (minutes / 60)
  }
  
  return null
}

export const TimeInput = React.forwardRef<HTMLInputElement, TimeInputProps>(
  ({ value, onChange, schemaType }, ref) => {
    // Convert decimal hours to H:MM format for display
    const initialDisplayValue = value ? formatSimpleTime(value) : ''
    const [inputValue, setInputValue] = React.useState(initialDisplayValue)

    // Update input value when the prop value changes (e.g., when form resets)
    React.useEffect(() => {
      const newDisplayValue = value ? formatSimpleTime(value) : ''
      setInputValue(newDisplayValue)
    }, [value])

    const handleChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        // Allow typing freely, validation happens on blur
        setInputValue(event.target.value)
      },
      []
    )

    const handleBlur = useCallback(
      (event: React.FocusEvent<HTMLInputElement>) => {
        const trimmedValue = inputValue.trim()
        
        if (trimmedValue === '') {
          onChange(PatchEvent.from(unset()))
          setInputValue('')
          return
        }

        // Normalize and parse the input
        const normalized = normalizeTimeInput(trimmedValue)
        if (normalized) {
          const decimalHours = parseTimeInput(normalized)
          if (decimalHours !== null && decimalHours >= 0 && decimalHours <= 24) {
            onChange(PatchEvent.from(set(decimalHours)))
            setInputValue(normalized) // Update to normalized format
          } else {
            // Invalid value, revert to previous value
            const prevValue = value ? formatSimpleTime(value) : ''
            setInputValue(prevValue)
          }
        } else {
          // Invalid format, revert to previous value
          const prevValue = value ? formatSimpleTime(value) : ''
          setInputValue(prevValue)
        }
      },
      [onChange, inputValue, value]
    )

    return (
      <div>
        <input
          ref={ref}
          type="text"
          value={inputValue}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder="e.g., 2.2 or 8:30"
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid #cbd5e1',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
        />
        <p style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#6b7280' }}>
          Enter time in decimal (e.g., 2.2 for 2 hours 12 minutes) or H:MM format (e.g., 8:30)
        </p>
      </div>
    )
  }
)

TimeInput.displayName = 'TimeInput'

