import { createClient } from '@sanity/client'
import imageUrlBuilder from '@sanity/image-url'

const projectId =
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID
const dataset =
  process.env.NEXT_PUBLIC_SANITY_DATASET || process.env.SANITY_STUDIO_DATASET

if (!projectId) {
  throw new Error('The Sanity Project ID is not set. Check your environment variables.')
}
if (!dataset) {
  throw new Error('The Sanity Dataset is not set. Check your environment variables.')
}
// Main client with CDN enabled for read operations
export const client = createClient({
  projectId,
  dataset,
  apiVersion: '2024-01-01',
  useCdn: false, // Enable CDN for better performance on read operations
  token: process.env.SANITY_API_TOKEN,
})

// Separate client for mutations (write operations) - no CDN
export const mutationClient = client.withConfig({
  useCdn: false,
  token: process.env.SANITY_API_TOKEN,
  apiVersion: '2024-01-01'
})

// Export mutationClient as sanityClient for backward compatibility
export const sanityClient = mutationClient


const builder = imageUrlBuilder(client)

export function urlFor(source: any) {
  return builder.image(source)
}

// Helper function to fetch data - always use fresh data (no CDN cache)
export async function sanityFetch<T>({
  query,
  params = {},
}: {
  query: string
  params?: any
}): Promise<T> {
  // Fetch from Sanity using mutationClient (no CDN) to ensure fresh data
  const data = await mutationClient.fetch<T>(query, params)

  return data
}

// Helper function to create a document
export async function createSanityDocument(data: any) {
  return mutationClient.create(data)
}

// Helper function to update a document
export async function updateSanityDocument(id: string, data: any) {
  // Use mutationClient for all operations (no CDN, consistent)
  const result = await mutationClient.patch(id).set(data).commit()
  return result
}

// Helper function to delete a document (soft delete by setting isActive to false)
export async function deleteSanityDocument(id: string) {
  return mutationClient.patch(id).set({ isActive: false }).commit()
}

// Helper function to hard delete a document (permanently remove from database)
export async function hardDeleteSanityDocument(id: string) {
  return mutationClient.delete(id)
}

