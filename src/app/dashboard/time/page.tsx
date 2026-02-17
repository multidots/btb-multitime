import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth'

export default async function TimePage() {
  await requireAuth()

  redirect('/dashboard/timesheet')
}
