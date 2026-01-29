import { defineField, defineType } from 'sanity'
import { FiSliders } from 'react-icons/fi'

export default defineType({
  name: 'uiSettings',
  title: 'UI Settings',
  type: 'document',
  icon: FiSliders,
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      initialValue: 'UI Settings',
      readOnly: true,
    }),
    defineField({
      name: 'fontFamily',
      title: 'Font Family',
      type: 'string',
      description: 'Select the primary font family for the entire project',
      options: {
        list: [
          { title: 'Inter', value: 'Inter' },
          { title: 'Roboto', value: 'Roboto' },
          { title: 'Open Sans', value: 'Open Sans' },
          { title: 'Lato', value: 'Lato' },
          { title: 'Montserrat', value: 'Montserrat' },
          { title: 'Poppins', value: 'Poppins' },
          { title: 'Raleway', value: 'Raleway' },
          { title: 'Source Sans Pro', value: 'Source Sans Pro' },
          { title: 'Nunito', value: 'Nunito' },
          { title: 'Work Sans', value: 'Work Sans' },
        ],
      },
      initialValue: 'Inter',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'themeColor',
      title: 'Theme Color',
      type: 'string',
      description: 'Main theme color for the entire application (hex code)',
      initialValue: '#0b1014',
      validation: (Rule) =>
        Rule.regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
          name: 'hex color',
          invert: false,
        }).error('Must be a valid hex color code'),
    }),
    defineField({
      name: 'themeAltColor',
      title: 'Theme Alt Color',
      type: 'string',
      description: 'Alternative color for text when theme color is used as background (hex code)',
      initialValue: '#ffffff',
      validation: (Rule) =>
        Rule.regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
          name: 'hex color',
          invert: false,
        }).error('Must be a valid hex color code'),
    }),
    defineField({
      name: 'themeLightColor',
      title: 'Light Theme Color',
      type: 'string',
      description: 'Lighter variation of the theme color for backgrounds (hex code)',
      initialValue: '#ffe7d9',
      validation: (Rule) =>
        Rule.regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
          name: 'hex color',
          invert: false,
        }).error('Must be a valid hex color code'),
    }),
    defineField({
      name: 'primaryButtonBg',
      title: 'Primary Button Background',
      type: 'string',
      description: 'Background color for primary buttons (hex code)',
      initialValue: '#0b1014',
      validation: (Rule) =>
        Rule.regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
          name: 'hex color',
          invert: false,
        }).error('Must be a valid hex color code'),
    }),
    defineField({
      name: 'primaryButtonText',
      title: 'Primary Button Text',
      type: 'string',
      description: 'Text color for primary buttons (hex code)',
      initialValue: '#ffffff',
      validation: (Rule) =>
        Rule.regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
          name: 'hex color',
          invert: false,
        }).error('Must be a valid hex color code'),
    }),
    defineField({
      name: 'primaryButtonHoverBg',
      title: 'Primary Button Hover Background',
      type: 'string',
      description: 'Background color for primary buttons on hover (hex code)',
      initialValue: '#0284c7',
      validation: (Rule) =>
        Rule.regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
          name: 'hex color',
          invert: false,
        }).error('Must be a valid hex color code'),
    }),
    defineField({
      name: 'primaryButtonHoverText',
      title: 'Primary Button Hover Text',
      type: 'string',
      description: 'Text color for primary buttons on hover (hex code)',
      initialValue: '#ffffff',
      validation: (Rule) =>
        Rule.regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
          name: 'hex color',
          invert: false,
        }).error('Must be a valid hex color code'),
    }),
    defineField({
      name: 'secondaryButtonBg',
      title: 'Secondary Button Background',
      type: 'string',
      description: 'Background color for secondary buttons (hex code)',
      initialValue: '#f3f4f6',
      validation: (Rule) =>
        Rule.regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
          name: 'hex color',
          invert: false,
        }).error('Must be a valid hex color code'),
    }),
    defineField({
      name: 'secondaryButtonText',
      title: 'Secondary Button Text',
      type: 'string',
      description: 'Text color for secondary buttons (hex code)',
      initialValue: '#374151',
      validation: (Rule) =>
        Rule.regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
          name: 'hex color',
          invert: false,
        }).error('Must be a valid hex color code'),
    }),
    defineField({
      name: 'secondaryButtonHoverBg',
      title: 'Secondary Button Hover Background',
      type: 'string',
      description: 'Background color for secondary buttons on hover (hex code)',
      initialValue: '#e5e7eb',
      validation: (Rule) =>
        Rule.regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
          name: 'hex color',
          invert: false,
        }).error('Must be a valid hex color code'),
    }),
    defineField({
      name: 'secondaryButtonHoverText',
      title: 'Secondary Button Hover Text',
      type: 'string',
      description: 'Text color for secondary buttons on hover (hex code)',
      initialValue: '#374151',
      validation: (Rule) =>
        Rule.regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
          name: 'hex color',
          invert: false,
        }).error('Must be a valid hex color code'),
    }),
    defineField({
      name: 'activeTabBg',
      title: 'Active Tab Background',
      type: 'string',
      description: 'Background color for active tabs (hex code)',
      initialValue: '#0b1014',
      validation: (Rule) =>
        Rule.regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
          name: 'hex color',
          invert: false,
        }).error('Must be a valid hex color code'),
    }),
    defineField({
      name: 'activeTabText',
      title: 'Active Tab Text',
      type: 'string',
      description: 'Text color for active tabs (hex code)',
      initialValue: '#0284c7',
      validation: (Rule) =>
        Rule.regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, {
          name: 'hex color',
          invert: false,
        }).error('Must be a valid hex color code'),
    }),
  ],
  preview: {
    select: {
      title: 'title',
      fontFamily: 'fontFamily',
    },
    prepare({ title, fontFamily }) {
      return {
        title: title || 'UI Settings',
        subtitle: `Font: ${fontFamily || 'Inter'}`,
      }
    },
  },
})
