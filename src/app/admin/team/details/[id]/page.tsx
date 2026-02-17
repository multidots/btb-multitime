import { Suspense } from 'react'
import DashboardLayout from '@/components/layouts/DashboardLayout'
import { requireAdminOrManager } from '@/lib/auth'
import MemberDetailsClient from './MemberDetailsClient'

export const metadata = {
  title: 'Member Details',
  description: 'View detailed time entries for a team member',
}

export default async function MemberDetailsPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireAdminOrManager()

  return (
    <DashboardLayout role={session.user.role === 'admin' ? 'admin' : 'manager'}>
      <Suspense fallback={<div className="p-6">Loading...</div>}>
        <MemberDetailsClient memberId={params.id} />
      </Suspense>
    </DashboardLayout>
  )
}
