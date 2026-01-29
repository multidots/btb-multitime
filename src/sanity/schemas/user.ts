import { defineField, defineType } from 'sanity'
import { FiUser } from 'react-icons/fi'

export default defineType({
  name: 'user',
  title: 'User',
  type: 'document',
  icon: FiUser,
  fields: [
    defineField({
      name: 'firstName',
      title: 'First Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'lastName',
      title: 'Last Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'email',
      title: 'Email',
      type: 'string',
      validation: (Rule) => Rule.required().email(),
    }),
    // Legacy password fields - kept for backward compatibility with existing data
    // Authentication is now handled via Google OAuth only
    defineField({
      name: 'password',
      title: 'Password (Deprecated)',
      type: 'string',
      description: 'Legacy field - authentication now uses Google OAuth',
      hidden: true,
      deprecated: { reason: 'Switched to Google-only authentication' },
    }),
    defineField({
      name: 'resetPasswordToken',
      title: 'Reset Password Token (Deprecated)',
      type: 'string',
      description: 'Legacy field - no longer used',
      hidden: true,
      deprecated: { reason: 'Switched to Google-only authentication' },
    }),
    defineField({
      name: 'resetPasswordExpires',
      title: 'Reset Password Token Expiry (Deprecated)',
      type: 'datetime',
      description: 'Legacy field - no longer used',
      hidden: true,
      deprecated: { reason: 'Switched to Google-only authentication' },
    }),
    defineField({
      name: 'avatar',
      title: 'Avatar',
      type: 'image',
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: 'role',
      title: 'Role',
      type: 'string',
      options: {
        list: [
          { title: 'Admin', value: 'admin' },
          { title: 'Manager', value: 'manager' },
          { title: 'User', value: 'user' },
        ],
      },
      validation: (Rule) => Rule.required(),
      initialValue: 'user',
    }),

    defineField({
      name: 'jobCategory',
      title: 'Designation',
      type: 'reference',
      to: [{ type: 'jobcategory' }],
    }),
    defineField({
      name: 'capacity',
      title: 'Weekly Capacity (hours)',
      type: 'number',
      description: 'Expected working hours per week',
      initialValue: 40,
    }),
    defineField({
      name: 'rate',
      title: 'Hourly Rate ($)',
      type: 'number',
      description: 'Hourly billing rate (admin/manager only)',
      hidden: ({ document }) => document?.role !== 'admin' && document?.role !== 'manager',
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
      description: 'Mark user as archived (soft-removed). Archived users remain in the DB but are excluded from active lists.',
      initialValue: false,
    }),
    defineField({
      name: 'isSanityAdmin',
      title: 'Sanity Studio Admin',
      type: 'boolean',
      description: 'Indicates this user is a Sanity Studio administrator synced from Sanity project settings',
      initialValue: false,
      hidden: true,
    }),
    defineField({
      name: 'sanityUserId',
      title: 'Sanity User ID',
      type: 'string',
      description: 'The Sanity user ID for Studio administrators',
      hidden: true,
    }),
    defineField({
      name: 'authProvider',
      title: 'Auth Provider',
      type: 'string',
      description: 'The authentication provider used (credentials, google)',
      options: {
        list: [
          { title: 'Credentials', value: 'credentials' },
          { title: 'Google', value: 'google' },
        ],
      },
      initialValue: 'credentials',
      hidden: true,
    }),
    defineField({
      name: 'googleId',
      title: 'Google ID',
      type: 'string',
      description: 'Google account ID for OAuth users',
      hidden: true,
    }),
    defineField({
      name: 'pinnedBy',
      title: 'Pinned By',
      type: 'array',
      of: [{ 
        type: 'reference', 
        to: [{ type: 'user' }],
        options: {
          filter: 'isActive == true && isArchived != true',
        }
      }],
      description: 'Users who have pinned this team member. This field is automatically updated when admins or managers pin/unpin team members.',
    }),
    defineField({
      name: 'startDate',
      title: 'Start Date',
      type: 'date',
    }),
    defineField({
      name: 'endDate',
      title: 'End Date',
      type: 'date',
      description: 'Leave blank for current employees',
    }),
    defineField({
      name: 'timezone',
      title: 'Timezone',
      type: 'string',
      initialValue: 'America/New_York',
    }),
    defineField({
      name: 'permissions',
      title: 'Permissions',
      type: 'object',
      hidden: true,
      fields: [
        {
          name: 'canManageProjects',
          title: 'Can Manage Projects',
          type: 'boolean',
          initialValue: false,
        },
        {
          name: 'canManageUsers',
          title: 'Can Manage Users',
          type: 'boolean',
          initialValue: false,
        },
        {
          name: 'canViewReports',
          title: 'Can View Reports',
          type: 'boolean',
          initialValue: false,
        },
        {
          name: 'canManageClients',
          title: 'Can Manage Clients',
          type: 'boolean',
          initialValue: false,
        },
        {
          name: 'canApproveTimeEntries',
          title: 'Can Approve Time Entries',
          type: 'boolean',
          initialValue: false,
        },
      ],
    }),
    defineField({
      name: 'notification',
      title: 'Notification Preferences',
      type: 'object',
      // hidden: true,
      fields: [
        // Timesheet Reminders
        {
          name: 'dailyPersonalReminders',
          title: 'Daily Personal Reminders',
          type: 'boolean',
          description: 'Help me track my time with daily personal reminders',
          initialValue: false,
        },
        {
          name: 'weeklyTeamReminders',
          title: 'Weekly Team-wide Reminders',
          type: 'boolean',
          description: 'Include me in weekly team-wide reminders',
          initialValue: true,
        },
        // Weekly Harvest
        {
          name: 'weeklyReportEmail',
          title: 'Weekly Report Email',
          type: 'boolean',
          description: 'Email me a weekly report of my time',
          initialValue: true,
        },
        // Approval (Manager & Admin only)
        {
          name: 'approvalNotifications',
          title: 'Approval Notifications',
          type: 'boolean',
          description: 'Email me if timesheets are submitted for projects or people I manage',
          initialValue: true,
        },
        // Other Notifications
        {
          name: 'projectDeletedNotifications',
          title: 'Project Deleted Notifications',
          type: 'boolean',
          description: 'Email me if a project I manage is deleted',
          initialValue: false,
        },
        {
          name: 'occasionalUpdates',
          title: 'Occasional Updates',
          type: 'boolean',
          description: 'Email me occasional updates, offers, tips, and interesting stories',
          initialValue: true,
        },
      ],
    }),
  ],
  preview: {
    select: {
      firstName: 'firstName',
      lastName: 'lastName',
      email: 'email',
      media: 'avatar',
      role: 'role',
    },
    prepare(selection) {
      const { firstName, lastName, email, role } = selection
      return {
        title: `${firstName} ${lastName}`,
        subtitle: `${email} - ${role}`,
        media: selection.media,
      }
    },
  },
})

