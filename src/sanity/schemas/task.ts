import { defineField, defineType } from 'sanity'
import { FiCheckSquare } from 'react-icons/fi'

export default defineType({
  name: 'task',
  title: 'Task',
  type: 'document',
  icon: FiCheckSquare,
  fields: [
    defineField({
      name: 'name',
      title: 'Task Name',
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
      name: 'isBillable',
      title: 'Billable',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'category',
      title: 'Task Category',
      type: 'reference',
      to: [{ type: 'category' }],
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
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
      initialValue: false,
    }),
    defineField({
      name: 'updatedAt',
      title: 'Updated At',
      type: 'datetime',
    }),
  ],
  preview: {
    select: {
      title: 'name',
      billable: 'isBillable',
      category: 'category.name',
      isActive: 'isActive',
      isArchived: 'isArchived',
    },
    prepare(selection) {
      const { title, billable, category, isActive, isArchived } = selection
      const status = billable ? 'Billable' : 'Non-Billable'
      const states = []
      
      if (isArchived) {
        states.push('Archived')
      } else if (!isActive) {
        states.push('Inactive')
      }
      
      const stateText = states.length > 0 ? ` • ${states.join(', ')}` : ''

      return {
        title,
        subtitle: `${category || 'No category'} • ${status}${stateText}`,
      }
    },
  },
})

