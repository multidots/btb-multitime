import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { createSanityDocument, sanityFetch, hardDeleteSanityDocument } from '@/lib/sanity'

// GET - Fetch all reports for the current user
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const reports = await sanityFetch<any[]>({
      query: `*[_type == "report" && (createdBy._ref == $userId || isPublic == true)] | order(createdAt desc) {
        _id,
        name,
        slug,
        type,
        description,
        filters,
        schedule,
        isPublic,
        createdAt,
        "createdBy": createdBy->{
          _id,
          firstName,
          lastName,
          email
        }
      }`,
      params: { userId: session.user.id }
    })

    return NextResponse.json(reports)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 })
  }
}

// POST - Create a new report
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, type, description, filters, isPublic } = body

    if (!name || !type) {
      return NextResponse.json(
        { error: 'Name and type are required' },
        { status: 400 }
      )
    }

    // Generate slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    // Build the filters object with references
    const reportFilters: any = {}
    
    if (filters?.dateRange) {
      reportFilters.dateRange = {
        startDate: filters.dateRange.startDate,
        endDate: filters.dateRange.endDate
      }
    }
    
    if (filters?.timeframe) {
      reportFilters.timeframe = filters.timeframe
    }
    
    if (filters?.clients?.length > 0) {
      reportFilters.clients = filters.clients.map((id: string) => ({
        _type: 'reference',
        _ref: id,
        _key: id
      }))
    }
    
    if (filters?.projects?.length > 0) {
      reportFilters.projects = filters.projects.map((id: string) => ({
        _type: 'reference',
        _ref: id,
        _key: id
      }))
    }
    
    if (filters?.tasks?.length > 0) {
      reportFilters.tasks = filters.tasks.map((id: string) => ({
        _type: 'reference',
        _ref: id,
        _key: id
      }))
    }
    
    if (filters?.users?.length > 0) {
      reportFilters.users = filters.users.map((id: string) => ({
        _type: 'reference',
        _ref: id,
        _key: id
      }))
    }

    const reportData = {
      _type: 'report',
      name,
      slug: { _type: 'slug', current: slug },
      type,
      description: description || '',
      filters: reportFilters,
      createdBy: {
        _type: 'reference',
        _ref: session.user.id
      },
      isPublic: isPublic || false,
      createdAt: new Date().toISOString()
    }

    const report = await createSanityDocument(reportData)

    return NextResponse.json(report, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create report' }, { status: 500 })
  }
}

// DELETE - Delete a report
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const reportId = searchParams.get('id')

    if (!reportId) {
      return NextResponse.json({ error: 'Report ID is required' }, { status: 400 })
    }

    // Verify the user owns this report
    const report = await sanityFetch<any>({
      query: `*[_type == "report" && _id == $reportId][0] {
        _id,
        "createdById": createdBy._ref
      }`,
      params: { reportId }
    })

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    if (report.createdById !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    await hardDeleteSanityDocument(reportId)

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete report' }, { status: 500 })
  }
}

