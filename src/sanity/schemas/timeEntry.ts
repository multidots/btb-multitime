import { defineField, defineType } from 'sanity'
import { FiClock } from 'react-icons/fi'
import { formatSimpleTime } from '@/lib/time'
import { TimeInput } from '../components/TimeInput'

export default defineType({
  name: 'timeEntry',
  title: 'Time Entry',
  type: 'document',
  icon: FiClock,
  fields: [
    defineField({
      name: 'user',
      title: 'User',
      type: 'reference',
      to: [{ type: 'user' }],
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
      name: 'date',
      title: 'Date',
      type: 'date',
      validation: (Rule) => Rule.required(),
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
      name: 'startTime',
      title: 'Start Time',
      type: 'datetime',
      description: 'Optional - for timer-based entries',
    }),
    defineField({
      name: 'endTime',
      title: 'End Time',
      type: 'datetime',
      description: 'Optional - for timer-based entries',
    }),
    defineField({
      name: 'isRunning',
      title: 'Timer Running',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'notes',
      title: 'Notes',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'isBillable',
      title: 'Billable',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'isApproved',
      title: 'Approved',
      type: 'boolean',
      initialValue: false,
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
      name: 'isLocked',
      title: 'Locked',
      type: 'boolean',
      initialValue: false,
      description: 'Locked entries cannot be edited (only set to true after approval)',
    }),
    defineField({
      name: 'submittedAt',
      title: 'Submitted At',
      type: 'datetime',
      description: 'Timestamp when the entry was submitted for approval (pending state)',
    }),
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
      project: 'project.name',
      hours: 'hours',
      date: 'date',
    },
    prepare(selection) {
      const { userName, userLastName, project, hours, date } = selection
      return {
        title: `${userName} ${userLastName} - ${project}`,
        subtitle: `${formatSimpleTime(hours)} on ${date}`,
      }
    },
  },
})

