import { sanityFetch } from '@/lib/sanity'

interface Client {
  _id: string
  name: string
  contacts?: any[]
  address?: string
  preferredCurrency?: string
  isActive: boolean
}

interface Task {
  _id: string
  name: string
  slug: string
  projects: Array<{
    _id: string
    name: string
    code: string
    client: {
      name: string
    }
  }>
  description?: string
  isBillable: boolean
  isActive: boolean
  isArchived: boolean
  category?: {
    _id: string
    name: string
    slug: string
    color?: string
    icon?: string
  }
  pendingHours: number
  createdAt: string
  updatedAt: string
}

export async function getClientsData(): Promise<Client[]> {
  const query = `
    *[_type == "client" && !(_id in path("drafts.**"))] | order(createdAt desc) {
      _id,
      name,
      slug,
      contacts,
      address,
      preferredCurrency,
      isActive,
      isArchived,
      createdAt
    }
  `

  const clients = await sanityFetch<Client[]>({
    query
  })

  return clients
}

export async function getTasksData(): Promise<Task[]> {
  // OPTIMIZED: Remove expensive pendingHours calculation from initial query
  // pendingHours will be calculated in batch on client side when needed
  const query = `
    *[_type == "task" && !(_id in path("drafts.**"))] | order(createdAt desc) {
      _id,
      name,
      slug,
      description,
      projects[]->{
        _id,
        name,
        code,
        client->{name}
      },
      isBillable,
      isActive,
      isArchived,
      category->{
        _id,
        name,
        slug,
        color,
        icon
      },
      createdAt,
      updatedAt,
      "pendingHours": 0
    }
  `

  const tasks = await sanityFetch<Task[]>({
    query
  })

  return tasks
}
