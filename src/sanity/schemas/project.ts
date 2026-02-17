import { defineField, defineType } from 'sanity'
import { FiFolder } from 'react-icons/fi'

export default defineType({
  name: 'project',
  title: 'Project',
  type: 'document',
  icon: FiFolder,
  fields: [
    defineField({
      name: 'name',
      title: 'Project Name',
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
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'code',
      title: 'Project Code',
      type: 'string',
      description: 'Short code for project identification (e.g., PROJ-001)',
    }),
    defineField({
      name: 'client',
      title: 'Client',
      type: 'reference',
      to: [{ type: 'client' }],
      options: {
        filter: 'isActive == true && isArchived != true',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 4,
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          { title: 'Planning', value: 'planning' },
          { title: 'Active', value: 'active' },
          { title: 'On Hold', value: 'on_hold' },
          { title: 'Completed', value: 'completed' },
          { title: 'Cancelled', value: 'cancelled' },
        ],
      },
      initialValue: 'planning',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'billableType',
      title: 'Billable Type',
      type: 'string',
      options: {
        list: [
          { title: 'Billable', value: 'billable' },
          { title: 'Non-Billable', value: 'non_billable' },
        ],
      },
      initialValue: 'billable',
    }),

    defineField({
      name: 'projectType',
      title: 'Project Type',
      type: 'string',
      options: {
        list: [
          { title: 'Time & Materials', value: 'timeAndMaterials' },
          { title: 'Fixed Fee', value: 'fixedFee' },
          { title: 'Non-Billable', value: 'nonBillable' }
        ],
        layout: 'radio'
      },
      initialValue: 'timeAndMaterials',
      description: 'Select how this project will be billed.'
    }),

    defineField({
      name: 'budget',
      title: 'Budget',
      type: 'object',
      initialValue: {
        type: 'no-budget'
      },
      fields: [
        {
          name: 'type',
          title: 'Type',
          type: 'string',
          options: {
            list: [
              { title: 'No Budget', value: 'no-budget' },
              { title: 'Total project hours', value: 'total-project-hours' },
            ]
          }
        },
        {
          name: 'totalProjectHours',
          title: 'Total Project Hours',
          type: 'number',
          hidden: ({ parent }) => parent?.type !== 'total-project-hours'
        }
      ],
      hidden: ({ document }) => document?.projectType === 'nonBillable'
    }),
    defineField({
      name: 'dates',
      title: 'Project Dates',
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
    }),
    defineField({
      name: 'permission',
      title: 'Permission',
      type: 'string',
      options: {
        list: [
          { title: 'Show project report to administrators and people who manage this project', value: 'admin' },
          { title: 'Show project report to everyone on this project', value: 'everyone' },
          // { title: 'Team Only', value: 'team' },
          // { title: 'Admin Only', value: 'admin' }
        ],
        layout: 'radio'
      },
      initialValue: 'admin'
    }),
    // defineField({
    //   name: 'projectManager',
    //   title: 'Project Manager',
    //   type: 'reference',
    //   to: [{ type: 'user' }],
    //   options: {
    //     filter: 'role == "manager" && isActive == true && isArchived != true',
    //   },
    // }),
    defineField({
      name: 'tasks',
      title: 'Tasks',
      type: 'array',
      of: [
        {
          type: 'reference',
          to: [{ type: 'task' }],
          options: {
            filter: ({ document }) => {
              const tasks = Array.isArray(document.tasks) ? document.tasks : []
              const taskIds = tasks.map((task: any) => task._ref).filter(Boolean)

              return {
                filter: 'isActive == true && isArchived != true && !(_id in $taskIds)',
                params: { taskIds },
              }
            },
          },
        },
      ],
    }),
    defineField({
      name: 'assignedUsers',
      title: 'Assigned Users',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {
              name: 'user',
              title: 'User',
              type: 'reference',
              to: [{ type: 'user' }],
              options: {
                filter: ({ document }) => {
                  const assignedUsers = Array.isArray(document.assignedUsers) ? document.assignedUsers : []
                  const userIds = assignedUsers.map((assignedUser: any) => assignedUser.user?._ref).filter(Boolean)

                  return {
                    filter: 'role == "user" && isActive == true && isArchived != true && !(_id in $userIds)',
                    params: { userIds },
                  }
                },
              },
            },
            // {
            //   name: 'role',
            //   title: 'Role',
            //   type: 'string',
            //   description: 'Role on this project',
            // },
            // {
            //   name: 'isActive',
            //   title: 'Active',
            //   type: 'boolean',
            //   initialValue: true,
            // },
          ],
          preview: {
            select: {
              firstName: 'user.firstName',
              lastName: 'user.lastName',
              role: 'role',
            },
            prepare(selection) {
              const { firstName, lastName, role } = selection
              return {
                title: `${firstName} ${lastName}`,
                subtitle: role,
              }
            },
          },
        },
      ],
    }),
    defineField({
      name: 'isActive',
      title: 'Active',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'isArchived',
      title: 'Archived',
      type: 'boolean',
      description: 'Mark project as archived (soft-removed). Archived projects remain in the DB but are excluded from active lists.',
      initialValue: false,
    }),
    // Aggregated timesheet hours (updated automatically when timesheet entries change)
    defineField({
      name: 'timesheetHours',
      title: 'Total Timesheet Hours',
      type: 'number',
      description: 'Total hours from all timesheets (auto-calculated)',
      initialValue: 0,
      readOnly: true,
    }),
    defineField({
      name: 'timesheetApprovedHours',
      title: 'Approved Timesheet Hours',
      type: 'number',
      description: 'Hours from approved timesheets only (auto-calculated)',
      initialValue: 0,
      readOnly: true,
    }),
    defineField({
      name: 'timesheetBillableHours',
      title: 'Billable Timesheet Hours',
      type: 'number',
      description: 'Billable hours from all timesheets (auto-calculated)',
      initialValue: 0,
      readOnly: true,
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
      client: 'client.name',
      status: 'status',
      code: 'code',
    },
    prepare(selection) {
      const { title, client, status, code } = selection
      return {
        title: code ? `[${code}] ${title}` : title,
        subtitle: `${client} - ${status}`,
      }
    },
  },
})

