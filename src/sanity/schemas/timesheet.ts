import { defineField, defineType, defineArrayMember } from 'sanity'
import { FiCalendar } from 'react-icons/fi'
import { formatSimpleTime } from '@/lib/time'
import { TimeInput } from '../components/TimeInput'

// Entry object type for the entries array
const timesheetEntry = {
  name: 'timesheetEntry',
  title: 'Timesheet Entry',
  type: 'object',
  fields: [
    defineField({
      name: 'date',
      title: 'Date',
      type: 'date',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'project',
      title: 'Project',
      type: 'reference',
      to: [{ type: 'project' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'task',
      title: 'Task',
      type: 'reference',
      to: [{ type: 'task' }],
    }),
    defineField({
      name: 'hours',
      title: 'Hours (H:MM format)',
      type: 'number',
      validation: (Rule) => Rule.required().min(0).max(24),
      components: {
        input: TimeInput,
      },
    }),
    defineField({
      name: 'notes',
      title: 'Notes',
      type: 'text',
      rows: 2,
    }),
    defineField({
      name: 'isBillable',
      title: 'Billable',
      type: 'boolean',
      initialValue: true,
    }),
    // Timer fields
    defineField({
      name: 'startTime',
      title: 'Start Time',
      type: 'datetime',
      description: 'For timer-based entries',
    }),
    defineField({
      name: 'endTime',
      title: 'End Time',
      type: 'datetime',
      description: 'For timer-based entries',
    }),
    defineField({
      name: 'isRunning',
      title: 'Timer Running',
      type: 'boolean',
      initialValue: false,
    }),
    // Timestamps
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
    }),
    defineField({
      name: 'updatedAt',
      title: 'Updated At',
      type: 'datetime',
    }),
  ],
  preview: {
    select: {
      date: 'date',
      hours: 'hours',
      projectName: 'project.name',
    },
    prepare(selection: Record<string, unknown>) {
      const { date, hours, projectName } = selection as { date: string; hours: number; projectName: string }
      return {
        title: `${projectName || 'No project'} - ${formatSimpleTime(hours || 0)}`,
        subtitle: date || '',
      }
    },
  },
}

export default defineType({
  name: 'timesheet',
  title: 'Timesheet',
  type: 'document',
  icon: FiCalendar,
  fields: [
    defineField({
      name: 'user',
      title: 'User',
      type: 'reference',
      to: [{ type: 'user' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'weekStart',
      title: 'Week Start',
      type: 'date',
      description: 'Monday of the week',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'weekEnd',
      title: 'Week End',
      type: 'date',
      description: 'Sunday of the week',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'year',
      title: 'Year',
      type: 'number',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'weekNumber',
      title: 'Week Number',
      type: 'number',
      validation: (Rule) => Rule.required().min(1).max(53),
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          { title: 'Unsubmitted', value: 'unsubmitted' },
          { title: 'Submitted', value: 'submitted' },
          { title: 'Approved', value: 'approved' },
          { title: 'Rejected', value: 'rejected' },
        ],
        layout: 'radio',
      },
      initialValue: 'unsubmitted',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'entries',
      title: 'Time Entries',
      type: 'array',
      of: [defineArrayMember(timesheetEntry)],
    }),
    // Computed totals
    defineField({
      name: 'totalHours',
      title: 'Total Hours',
      type: 'number',
      initialValue: 0,
      components: {
        input: TimeInput,
      },
    }),
    defineField({
      name: 'billableHours',
      title: 'Billable Hours',
      type: 'number',
      initialValue: 0,
      components: {
        input: TimeInput,
      },
    }),
    defineField({
      name: 'nonBillableHours',
      title: 'Non-Billable Hours',
      type: 'number',
      initialValue: 0,
      components: {
        input: TimeInput,
      },
    }),
    // Timer tracking
    defineField({
      name: 'hasRunningTimer',
      title: 'Has Running Timer',
      type: 'boolean',
      initialValue: false,
    }),
    // Submission & Approval
    defineField({
      name: 'submittedAt',
      title: 'Submitted At',
      type: 'datetime',
    }),
    defineField({
      name: 'approvedBy',
      title: 'Approved By',
      type: 'reference',
      to: [{ type: 'user' }],
    }),
    defineField({
      name: 'approvedAt',
      title: 'Approved At',
      type: 'datetime',
    }),
    defineField({
      name: 'rejectedAt',
      title: 'Rejected At',
      type: 'datetime',
    }),
    defineField({
      name: 'rejectionReason',
      title: 'Rejection Reason',
      type: 'text',
      rows: 2,
    }),
    defineField({
      name: 'isLocked',
      title: 'Locked',
      type: 'boolean',
      initialValue: false,
    }),
    // Timestamps
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
    }),
    defineField({
      name: 'updatedAt',
      title: 'Updated At',
      type: 'datetime',
    }),
  ],
  preview: {
    select: {
      userName: 'user.firstName',
      userLastName: 'user.lastName',
      weekStart: 'weekStart',
      totalHours: 'totalHours',
      status: 'status',
    },
    prepare(selection) {
      const { userName, userLastName, weekStart, totalHours, status } = selection
      const statusEmoji: Record<string, string> = {
        unsubmitted: '📝',
        submitted: '📤',
        approved: '✅',
        rejected: '❌',
      }
      
      return {
        title: `${userName || ''} ${userLastName || ''} - Week ${weekStart}`,
        subtitle: `${statusEmoji[status] || '📝'} ${status} | ${formatSimpleTime(totalHours || 0)} hours`,
      }
    },
  },
})
