import { NextRequest, NextResponse } from 'next/server'
import { sanityFetch, createSanityDocument, updateSanityDocument } from '@/lib/sanity'
import { requireAdminOrManagerApi, AuthError } from '@/lib/auth'

// GET /api/clients - List all clients
export async function GET(request: NextRequest) {
  try {
    await requireAdminOrManagerApi()

    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100) // Cap at 100 for performance
    const offset = parseInt(searchParams.get('offset') || '0')

    const query = `
      *[_type == "client" && !(_id in path("drafts.**")) && isArchived != true] | order(createdAt desc) [$offset...$limit] {
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

    const clients = await sanityFetch<any[]>({ query, params: { offset, limit } })

    return NextResponse.json({ clients })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      )
    }
    return NextResponse.json(
      { error: 'Failed to fetch clients' },
      { status: 500 }
    )
  }
}

// POST /api/clients - Create new client
export async function POST(request: NextRequest) {
  try {
    await requireAdminOrManagerApi()

    const body = await request.json()
    const { name, contacts, address, preferredCurrency } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Client name is required' },
        { status: 400 }
      )
    }

    if (!preferredCurrency) {
      return NextResponse.json(
        { error: 'Preferred currency is required' },
        { status: 400 }
      )
    }

    // Generate slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    // Ensure only one primary contact
    if (contacts && contacts.length > 0) {
      const primaryContacts = contacts.filter((contact: any) => contact.isPrimary)
      if (primaryContacts.length > 1) {
        return NextResponse.json(
          { error: 'Only one primary contact is allowed' },
          { status: 400 }
        )
      }
    }

    // Ensure all contacts have _key property for Sanity Studio
    const processedContacts = (contacts || []).map((contact: any, index: number) => ({
      ...contact,
      _key: contact._key || `contact-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }))

    const clientData = {
      _type: 'client',
      name,
      slug: { _type: 'slug', current: slug },
      contacts: processedContacts,
      address,
      preferredCurrency,
      isActive: true,
      isArchived: false,
      createdAt: new Date().toISOString(),
    }

    const client = await createSanityDocument(clientData)

    return NextResponse.json({ client }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      )
    }
    return NextResponse.json(
      { error: 'Failed to create client' },
      { status: 500 }
    )
  }
}
