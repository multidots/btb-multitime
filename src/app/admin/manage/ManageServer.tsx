import { getClientsData, getTasksData } from './ManageData'
import ManageContent from './ManageContent'
import { requireAdminOrManager, getCurrentUser } from '@/lib/auth'

interface ManageServerProps {
  searchParams: { tab?: string }
}

// Type definitions matching ManageData
type Client = Awaited<ReturnType<typeof getClientsData>>[0]
type Task = Awaited<ReturnType<typeof getTasksData>>[0]

export default async function ManageServer({ searchParams }: ManageServerProps) {
  const session = await requireAdminOrManager()
  const user = await getCurrentUser()
  const activeTab = (searchParams.tab as 'clients' | 'tasks' | 'roles') || 'clients'

  // OPTIMIZED: Only fetch data for the active tab (faster initial load)
  // For roles tab, we still fetch clients/tasks in case user switches tabs
  let clients: Client[] = []
  let tasks: Task[] = []
  
  if (activeTab === 'clients') {
    clients = await getClientsData()
    // Prefetch tasks in background for faster tab switching (optional)
    getTasksData().catch(() => {}) // Fire and forget
  } else if (activeTab === 'tasks') {
    tasks = await getTasksData()
    // Prefetch clients in background for faster tab switching (optional)
    getClientsData().catch(() => {}) // Fire and forget
  } else {
    // For roles tab, fetch both in case user switches tabs
    [clients, tasks] = await Promise.all([
      getClientsData(),
      getTasksData()
    ])
  }

  return (
    <ManageContent
      initialClients={clients}
      initialTasks={tasks}
      activeTab={activeTab}
      userRole={user?.role || 'user'}
    />
  )
}
