import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { mutationClient } from '@/lib/sanity'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user has admin or manager role
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { firstName, lastName, email, role, rate, timezone } = await request.json()

    // Update user in Sanity
    const updatedUser = await mutationClient
      .patch(params.id)
      .set({
        firstName,
        lastName,
        email: email.toLowerCase(),
        role,
        rate: parseFloat(rate),
        timezone,
        updatedAt: new Date().toISOString()
      })
      .commit()

    return NextResponse.json(updatedUser)
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
