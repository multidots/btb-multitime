import { sanityFetch } from '@/lib/sanity'

// Reusable data fetchers for common patterns

export async function getPaginatedData<T>({
  query,
  params = {},
  defaultLimit = 50,
  maxLimit = 100,
}: {
  query: string
  params?: any
  defaultLimit?: number
  maxLimit?: number
}): Promise<{ data: T[], total?: number }> {
  // Add pagination parameters
  const limit = Math.min(defaultLimit, maxLimit)
  const offset = 0

  const finalParams = { ...params, limit, offset }

  const data = await sanityFetch<T[]>({
    query,
    params: finalParams
  })

  return { data }
}

export async function getEntity<T>(
  type: string,
  id: string
): Promise<T | null> {
  const query = `*[_type == $type && _id == $id][0]`
  const data = await sanityFetch<T | null>({
    query,
    params: { type, id }
  })

  return data
}

export async function getCollection<T>(
  type: string,
  filters: Record<string, any> = {}
): Promise<T[]> {
  const filterString = Object.keys(filters).length > 0
    ? Object.entries(filters).map(([key, value]) => `${key} == ${JSON.stringify(value)}`).join(' && ')
    : ''

  const query = `*[_type == $type${filterString ? ` && ${filterString}` : ''}] | order(createdAt desc)`

  const data = await sanityFetch<T[]>({
    query,
    params: { type }
  })

  return data
}

