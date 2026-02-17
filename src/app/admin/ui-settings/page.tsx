import { Suspense } from 'react'
import DashboardLayout from '@/components/layouts/DashboardLayout'
import { requireAdmin, getCurrentUser } from '@/lib/auth'
import UISettingsClient from '@/components/admin/UISettingsClient'

export const metadata = {
  title: 'UI Settings',
  description: 'Manage font and color scheme settings for the entire project',
}

export default async function UISettingsPage() {
  // Require admin role only
  await requireAdmin()
  const user = await getCurrentUser()

  return (
    <DashboardLayout role="admin">
      <Suspense fallback={<UISettingsSkeleton />}>
        <UISettingsClient />
      </Suspense>
    </DashboardLayout>
  )
}

function UISettingsSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="bg-white rounded-lg p-6 h-96" />
    </div>
  )
}
