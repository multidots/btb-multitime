import { defineField, defineType } from 'sanity'
import { FiUsers } from 'react-icons/fi'

export default defineType({
  name: 'team',
  title: 'Team',
  type: 'document',
  icon: FiUsers,
  fields: [
    defineField({
      name: 'name',
      title: 'Team Name',
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
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'manager',
      title: 'Team Manager',
      type: 'reference',
      to: [{ type: 'user' }],
      options: {
        filter: 'role == "manager" && isActive == true && isArchived != true',
      },
    }),
    defineField({
      name: 'members',
      title: 'Team Members',
      type: 'array',
      of: [
        {
          type: 'reference',
          to: [{ type: 'user' }],
          options: {
            filter: ({ document }) => {
              const members = Array.isArray(document.members) ? document.members : []
              const memberIds = members.map((member: any) => member._ref).filter(Boolean)

              return {
                filter:
                  'role in ["user", "manager"] && isActive == true && isArchived != true && !(_id in $memberIds)',
                params: { memberIds },
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
  ],
  preview: {
    select: {
      title: 'name',
      subtitle: 'description',
      manager: 'manager.firstName',
    },
    prepare(selection) {
      const { title, subtitle, manager } = selection
      return {
        title,
        subtitle: manager ? `Manager: ${manager}` : subtitle,
      }
    },
  },
})

