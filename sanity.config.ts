import {visionTool} from '@sanity/vision'
import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { schemaTypes } from './src/sanity/schemas'
import { structure } from './src/sanity/structure'
import { FiClock } from 'react-icons/fi'
import {apiVersion, dataset, projectId} from './src/sanity/env'

export default defineConfig({
  name: 'default',
  title: 'Multitime',
  icon: FiClock,
  projectId: projectId,
  dataset: dataset,

  basePath: '/studio',
  plugins: [
    structureTool({
      structure,
    }),
    visionTool({defaultApiVersion: apiVersion}),
  ],

  schema: {
    types: schemaTypes,
  },

  document: {
    // Customize document actions
    actions: (prev, context) => {
      // Remove delete action for critical documents
      if (context.schemaType === 'appSettings') {
        return prev.filter(({ action }) => action !== 'delete')
      }
      return prev
    },
  },
})
