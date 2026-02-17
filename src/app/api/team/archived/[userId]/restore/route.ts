import { NextResponse } from 'next/server'
import { mutationClient } from '@/lib/sanity'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'

export async function POST(req: Request, context: { params: { userId: string } }) {
  const { params } = context
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'admin' && session.user.role !== 'manager')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { userId } = params
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }

  try {
    await mutationClient.patch(userId).set({ isArchived: false, isActive: true, updatedAt: new Date().toISOString() }).commit()
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to restore user' }, { status: 500 })
  }
}
