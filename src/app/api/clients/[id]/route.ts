import { NextRequest, NextResponse } from 'next/server'
import { sanityFetch, updateSanityDocument, deleteSanityDocument, mutationClient } from '@/lib/sanity'
import { requireAdminOrManagerApi, AuthError } from '@/lib/auth'

// GET /api/clients/[id] - Get specific client
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdminOrManagerApi()

    const { id } = params

    const query = `
      *[_type == "client" && _id == $id][0] {
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

    const client = await sanityFetch<any>({
      query,
      params: { id }
    })

    if (!client) {
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ client })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      )
    }
    return NextResponse.json(
      { error: 'Failed to fetch client' },
      { status: 500 }
    )
  }
}

// PUT /api/clients/[id] - Update specific client
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdminOrManagerApi()

    const { id } = params
    const body = await request.json()

    // If only isArchived is being changed to false, treat as a patch for restore
    if (Object.keys(body).length === 1 && body.isArchived === false) {
      const client = await updateSanityDocument(id, { isArchived: false });
      return NextResponse.json({ client, message: 'Client restored successfully' });
    }

    const { name, contacts, address, preferredCurrency, isActive, isArchived } = body

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

    // Check if trying to archive a client with active projects
    if (isArchived === true) {
      const activeProjectsQuery = `
        count(*[_type == "project" && client._ref == $clientId && isActive == true])
      `
      const activeProjectsCount = await sanityFetch<number>({
        query: activeProjectsQuery,
        params: { clientId: id }
      })

      if (activeProjectsCount > 0) {
        return NextResponse.json(
          {
            error: `Cannot archive client. ${activeProjectsCount} active project${activeProjectsCount > 1 ? 's' : ''} must be completed or archived first.`
          },
          { status: 400 }
        )
      }
    }

    // Ensure all contacts have _key property for Sanity Studio
    const processedContacts = (contacts || []).map((contact: any, index: number) => ({
      ...contact,
      _key: contact._key || `contact-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }))

    const updateData = {
      name,
      contacts: processedContacts,
      address,
      preferredCurrency,
      isActive,
      isArchived: isArchived !== undefined ? isArchived : false,
    }

    const client = await updateSanityDocument(id, updateData)

    return NextResponse.json({ client })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      )
    }
    return NextResponse.json(
      { error: 'Failed to update client' },
      { status: 500 }
    )
  }
}

// DELETE /api/clients/[id] - Archive specific client
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdminOrManagerApi()

    const { id } = params

    // First, fetch the client to ensure it exists
    const clientQuery = `
      *[_type == "client" && _id == $id][0] {
        _id,
        name,
        isActive,
        isArchived
      }
    `
    const existingClient = await sanityFetch<any>({
      query: clientQuery,
      params: { id }
    })

    if (!existingClient) {
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      )
    }

    // Check if client has any active projects before archiving
    const activeProjectsQuery = `
      count(*[_type == "project" && client._ref == $clientId && isActive == true])
    `
    const activeProjectsCount = await sanityFetch<number>({
      query: activeProjectsQuery,
      params: { clientId: id }
    })

    if (activeProjectsCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot archive client. ${activeProjectsCount} active project${activeProjectsCount > 1 ? 's' : ''} must be completed or archived first.`,
          activeProjectsCount
        },
        { status: 400 }
      )
    }

    // Archive the client by setting isArchived to true
    const client = await mutationClient
      .patch(id)
      .set({ isArchived: true })
      .commit()

    return NextResponse.json({
      client,
      message: 'Client archived successfully'
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      )
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Failed to archive client: ${errorMessage}` },
      { status: 500 }
    )
  }
}
