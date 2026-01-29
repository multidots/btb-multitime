import { defineField, defineType } from 'sanity'
import { FiUser } from 'react-icons/fi'

export default defineType({
  name: 'contact',
  title: 'Contact',
  type: 'object',
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
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
    }),
    defineField({
      name: 'officePhone',
      title: 'Office Phone',
      type: 'string',
    }),
    defineField({
      name: 'mobilePhone',
      title: 'Mobile Phone',
      type: 'string',
    }),
    defineField({
      name: 'faxNumber',
      title: 'Fax Number',
      type: 'string',
    }),
    defineField({
      name: 'isPrimary',
      title: 'Primary Contact',
      type: 'boolean',
      initialValue: false,
    }),
  ],
  preview: {
    select: {
      firstName: 'firstName',
      lastName: 'lastName',
      email: 'email',
      title: 'title',
      primary: 'isPrimary',
    },
    prepare(selection) {
      const { firstName, lastName, email, title, primary } = selection
      const name = `${firstName} ${lastName}`.trim()
      return {
        title: name || email,
        subtitle: title ? `${title}${primary ? ' (Primary)' : ''}` : email,
      }
    },
  },
})
