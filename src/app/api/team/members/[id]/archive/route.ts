import { NextResponse } from 'next/server'
import { mutationClient } from '@/lib/sanity'
import { requireAdminOrManagerApi } from '@/lib/auth'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdminOrManagerApi()
    const { id } = params
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const updated = await mutationClient.patch(id).set({ isArchived: true, updatedAt: new Date().toISOString() }).commit()
    return NextResponse.json({ success: true, updated })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to archive member' }, { status: 500 })
  }
}
