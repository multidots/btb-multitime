import { NextResponse } from 'next/server'
import { sanityFetch } from '@/lib/sanity'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'

export async function GET() {
  // Only allow admin/manager
  const session = await getServerSession(authOptions)
  if (!session || (session.user.role !== 'admin' && session.user.role !== 'manager')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // GROQ query for archived users
  const query = `*[_type == "user" && isArchived == true]{
    _id,
    firstName,
    lastName,
    email
  }`

  try {
    const archivedUsers = await sanityFetch({ query, params: { userId: session.user.id } })
    return NextResponse.json(archivedUsers)
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch archived users' }, { status: 500 })
  }
}
