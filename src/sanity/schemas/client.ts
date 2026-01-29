import { defineField, defineType } from 'sanity'
import { FiBriefcase } from 'react-icons/fi'

export default defineType({
  name: 'client',
  title: 'Client',
  type: 'document',
  icon: FiBriefcase,
  fields: [
    defineField({
      name: 'name',
      title: 'Client Name',
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
      name: 'contacts',
      title: 'Contacts',
      type: 'array',
      of: [
        {
          type: 'contact',
        },
      ],
    }),
    defineField({
      name: 'address',
      title: 'Address',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'preferredCurrency',
      title: 'Preferred Currency',
      type: 'string',
      options: {
        list: [
          { title: 'USD ($)', value: 'USD' },
          { title: 'EUR (€)', value: 'EUR' },
          { title: 'GBP (£)', value: 'GBP' },
          { title: 'JPY (¥)', value: 'JPY' },
          { title: 'CAD (C$)', value: 'CAD' },
          { title: 'AUD (A$)', value: 'AUD' },
          { title: 'CHF (CHF)', value: 'CHF' },
          { title: 'CNY (¥)', value: 'CNY' },
          { title: 'SEK (kr)', value: 'SEK' },
          { title: 'NZD (NZ$)', value: 'NZD' },
        ],
      },
      validation: (Rule) => Rule.required(),
      initialValue: 'USD',
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
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
    }),
  ],
  preview: {
    select: {
      title: 'name',
      contacts: 'contacts',
    },
    prepare(selection) {
      const { title, contacts } = selection
      const primaryContact = contacts?.find((contact: any) => contact.isPrimary)
      const primaryName = primaryContact
        ? `${primaryContact.firstName} ${primaryContact.lastName}`.trim()
        : null

      return {
        title,
        subtitle: primaryName ? `Primary: ${primaryName}` : 'No primary contact',
      }
    },
  },
})

