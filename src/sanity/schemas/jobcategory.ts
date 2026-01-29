import { defineField, defineType } from 'sanity'
import { FiBriefcase } from 'react-icons/fi'

export default defineType({
  name: 'jobcategory',
  title: 'Job Category',
  type: 'document',
  icon: FiBriefcase,
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
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
  ],
  preview: {
    select: {
      title: 'name',
      subtitle: 'slug.current',
    },
  },
})
