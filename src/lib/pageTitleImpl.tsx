'use client'

import { useEffect } from 'react'

/**
 * Suffix used for document.title; should match root layout metadata template.
 * Use setPageTitle(segment) so the full title becomes "{segment} | Multidots | Multitime".
 */
const TITLE_SUFFIX = ' | Multidots | Multitime'

function getFullTitle(segment: string): string {
  return segment ? `${segment}${TITLE_SUFFIX}` : 'Multidots | Multitime'
}

/**
 * Sets the browser tab title from client-side code (e.g. in useEffect).
 * Can be overwritten by layout metadata; use usePageTitle(segment) to keep it applied.
 */
export function setPageTitle(segment: string): void {
  if (typeof document === 'undefined') return
  document.title = getFullTitle(segment)
}

/**
 * Renders a <title> tag so the browser tab shows the correct title.
 * Use this in client-only pages; Next.js hoists it to the head.
 */
export function PageTitle({ segment }: { segment: string }) {
  return <title>{getFullTitle(segment)}</title>
}

/**
 * Keeps the page title set to the given segment. Re-applies after every commit so it
 * stays correct when state changes and Next.js or the layout overwrites the title.
 * Use this in client-only pages where the layout keeps replacing the title.
 */
export function usePageTitle(segment: string): void {
  useEffect(() => {
    const title = getFullTitle(segment)
    document.title = title
    const raf = requestAnimationFrame(() => {
      document.title = title
    })
    return () => cancelAnimationFrame(raf)
  })
}
