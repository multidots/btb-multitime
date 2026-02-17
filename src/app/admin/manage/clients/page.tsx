import { Suspense } from 'react'
import DashboardLayout from '@/components/layouts/DashboardLayout'
import { requireAdminOrManager, getCurrentUser } from '@/lib/auth'
import { sanityFetch } from '@/lib/sanity'
import ManageClientsContent from './ManageClientsContent'

interface Client {
  _id: string
  name: string
  contacts?: any[]
  address?: string
  preferredCurrency?: string
  isActive: boolean
  isArchived?: boolean
}

async function getClients(): Promise<Client[]> {
  const query = `
    *[_type == "client" && !(_id in path("drafts.**")) && isArchived != true] | order(createdAt desc) {
      _id,
      name,
      contacts,
      address,
      preferredCurrency,
      isActive,
      isArchived
    }
  `

  return await sanityFetch<Client[]>({ query })
}

export default async function ManageClientsPage() {
  await requireAdminOrManager()
  const user = await getCurrentUser()

  const clients = await getClients()

  return (
    <DashboardLayout role={user?.role === 'admin' ? 'admin' : 'manager'}>
      <Suspense fallback={<div>Loading...</div>}>
        <ManageClientsContent initialClients={clients} />
      </Suspense>
    </DashboardLayout>
  )
}
