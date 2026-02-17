'use client'

/**
 * This route is responsible for the built-in authoring environment using Sanity Studio.
 * All routes under your studio path is handled by this file using Next.js' catch-all routes:
 * https://nextjs.org/docs/routing/dynamic-routes#catch-all-routes
 *
 * You can learn more about the next-sanity package here:
 * https://github.com/sanity-io/next-sanity
 */

import { NextStudio } from 'next-sanity/studio'
// @ts-ignore - Avoid type conflicts between Sanity versions
import config from '../../../../sanity.config'
import AutoSyncSanityAdmin from '@/components/studio/AutoSyncSanityAdmin'

export default function StudioPage() {
  return (
    <>
      <AutoSyncSanityAdmin />
      <NextStudio config={config as any} />
    </>
  )
}

