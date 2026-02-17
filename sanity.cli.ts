// sanity.cli.ts
import { defineCliConfig } from 'sanity/cli'
import {apiVersion, dataset, projectId} from './src/sanity/env'

export default defineCliConfig({
  api: {
    // projectId: process.env.SANITY_STUDIO_PROJECT_ID',
    projectId: projectId,
    dataset: dataset,
  },
})