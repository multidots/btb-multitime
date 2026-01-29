import { defineField, defineType } from 'sanity'
import { FiBarChart2 } from 'react-icons/fi'

export default defineType({
  name: 'report',
  title: 'Report',
  type: 'document',
  icon: FiBarChart2,
  fields: [
    defineField({
      name: 'name',
      title: 'Report Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'name',
        maxLength: 96,
      },
    }),
    defineField({
      name: 'type',
      title: 'Report Type',
      type: 'string',
      options: {
        list: [
          { title: 'Time Report', value: 'time' },
          { title: 'Project Report', value: 'project' },
          { title: 'User Report', value: 'user' },
          { title: 'Client Report', value: 'client' },
          { title: 'Detailed Time Report', value: 'detailed_time' },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'filters',
      title: 'Filters',
      type: 'object',
      fields: [
        {
          name: 'dateRange',
          title: 'Date Range',
          type: 'object',
          fields: [
            {
              name: 'startDate',
              title: 'Start Date',
              type: 'date',
            },
            {
              name: 'endDate',
              title: 'End Date',
              type: 'date',
            },
          ],
        },
        {
          name: 'clients',
          title: 'Clients',
          type: 'array',
          of: [{ type: 'reference', to: [{ type: 'client' }] }],
        },
        {
          name: 'projects',
          title: 'Projects',
          type: 'array',
          of: [{ type: 'reference', to: [{ type: 'project' }] }],
        },
        {
          name: 'tasks',
          title: 'Tasks',
          type: 'array',
          of: [{ type: 'reference', to: [{ type: 'task' }] }],
        },
        {
          name: 'users',
          title: 'Users',
          type: 'array',
          of: [{ type: 'reference', to: [{ type: 'user' }] }],
        },
        {
          name: 'teams',
          title: 'Teams',
          type: 'array',
          of: [{ type: 'reference', to: [{ type: 'team' }] }],
        },
        {
          name: 'timeframe',
          title: 'Time Frame',
          type: 'string',
          options: {
            list: [
              { title: 'Week', value: 'week' },
              { title: 'Month', value: 'month' },
              { title: 'Year', value: 'year' },
              { title: 'All', value: 'all' },
              { title: 'Custom', value: 'custom' },
            ],
          },
        }
      ],
    }),
    defineField({
      name: 'schedule',
      title: 'Schedule',
      type: 'object',
      description: 'Automated report generation schedule',
      fields: [
        {
          name: 'enabled',
          title: 'Enabled',
          type: 'boolean',
          initialValue: false,
        },
        {
          name: 'frequency',
          title: 'Frequency',
          type: 'string',
          options: {
            list: [
              { title: 'Daily', value: 'daily' },
              { title: 'Weekly', value: 'weekly' },
              { title: 'Monthly', value: 'monthly' },
              { title: 'Quarterly', value: 'quarterly' },
            ],
          },
        },
        {
          name: 'recipients',
          title: 'Email Recipients',
          type: 'array',
          of: [{ type: 'string' }],
        },
      ],
    }),
    defineField({
      name: 'createdBy',
      title: 'Created By',
      type: 'reference',
      to: [{ type: 'user' }],
    }),
    defineField({
      name: 'isPublic',
      title: 'Public',
      type: 'boolean',
      initialValue: false,
      description: 'Make report visible to all users',
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
    }),
  ],
  preview: {
    select: {
      title: 'name',
      type: 'type',
      createdBy: 'createdBy.firstName',
    },
    prepare(selection) {
      const { title, type, createdBy } = selection
      return {
        title,
        subtitle: `${type} - Created by ${createdBy}`,
      }
    },
  },
})

