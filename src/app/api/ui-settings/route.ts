import { NextResponse } from 'next/server'
import { sanityFetch, mutationClient } from '@/lib/sanity'
import { getSession } from '@/lib/auth'

export async function GET() {
  try {
    const query = `*[_type == "uiSettings"][0]`
    const settings = await sanityFetch<any>({ query })

    if (!settings) {
      // Return default settings if none exist
      return NextResponse.json({
        fontFamily: 'Inter',
        themeColor: '#0b1014',
        themeAltColor: '#ffffff',
        themeLightColor: '#ffffff',
        primaryButtonBg: '#0b1014',
        primaryButtonText: '#ffffff',
        primaryButtonHoverBg: '#0b1014',
        primaryButtonHoverText: '#ffffff',
        secondaryButtonBg: '#ffffff',
        secondaryButtonText: '#0b1014',
        secondaryButtonHoverBg: '#fff',
        secondaryButtonHoverText: '#0b1014',
        activeTabBg: '#ffffff33',
        activeTabText: '#ffffff',
      })
    }

    return NextResponse.json({
      fontFamily: settings.fontFamily || 'Inter',
      themeColor: settings.themeColor || '#0b1014',
      themeAltColor: settings.themeAltColor || '#ffffff',
      themeLightColor: settings.themeLightColor || '#ffffff',
      primaryButtonBg: settings.primaryButtonBg || '#0b1014',
      primaryButtonText: settings.primaryButtonText || '#ffffff',
      primaryButtonHoverBg: settings.primaryButtonHoverBg || '#0b1014',
      primaryButtonHoverText: settings.primaryButtonHoverText || '#ffffff',
      secondaryButtonBg: settings.secondaryButtonBg || '#0b1014',
      secondaryButtonText: settings.secondaryButtonText || '#374151',
      secondaryButtonHoverBg: settings.secondaryButtonHoverBg || '#0b1014',
      secondaryButtonHoverText: settings.secondaryButtonHoverText || '#ffffff',
      activeTabBg: settings.activeTabBg || '#ffffff33',
      activeTabText: settings.activeTabText || '#ffffff',
    })
  } catch (error) {
    return NextResponse.json(
      {
        fontFamily: 'Inter',
        themeColor: '#0b1014',
        themeAltColor: '#ffffff',
        themeLightColor: '#ffffff',
        primaryButtonBg: '#0b1014',
        primaryButtonText: '#ffffff',
        primaryButtonHoverBg: '#0b1014',
        primaryButtonHoverText: '#ffffff',
        secondaryButtonBg: '#ffffff',
        secondaryButtonText: '#0b1014',
        secondaryButtonHoverBg: '#ffffff',
        secondaryButtonHoverText: '#0b1014',
        activeTabBg: '#ffffff33',
        activeTabText: '#ffffff',
      },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    // Check if user is admin
    const session = await getSession()
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json(
        { message: 'Unauthorized. Admin access required.' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const {
      fontFamily,
      themeColor,
      themeAltColor,
      themeLightColor,
      primaryButtonBg,
      primaryButtonText,
      primaryButtonHoverBg,
      primaryButtonHoverText,
      secondaryButtonBg,
      secondaryButtonText,
      secondaryButtonHoverBg,
      secondaryButtonHoverText,
      activeTabBg,
      activeTabText,
    } = body

    // Validate input
    if (!fontFamily) {
      return NextResponse.json(
        { message: 'Font family is required' },
        { status: 400 }
      )
    }

    // Check if settings document exists
    const query = `*[_type == "uiSettings"][0]`
    const existing = await sanityFetch<any>({ query })

    if (existing) {
      // Update existing document
      await mutationClient
        .patch(existing._id)
        .set({
          fontFamily,
          themeColor: themeColor || '#0b1014',
          themeAltColor: themeAltColor || '#ffffff',
          themeLightColor: themeLightColor || '#ffe7d9',
          primaryButtonBg: primaryButtonBg || '#0b1014',
          primaryButtonText: primaryButtonText || '#ffffff',
          primaryButtonHoverBg: primaryButtonHoverBg || '#0b1014',
          primaryButtonHoverText: primaryButtonHoverText || '#ffffff',
          secondaryButtonBg: secondaryButtonBg || '#0b1014',
          secondaryButtonText: secondaryButtonText || '#374151',
          secondaryButtonHoverBg: secondaryButtonHoverBg || '#0b1014',
          secondaryButtonHoverText: secondaryButtonHoverText || '#374151',
          activeTabBg: activeTabBg || '#ffffff33',
          activeTabText: activeTabText || '#ffffff',
        })
        .commit()
    } else {
      // Create new document
      await mutationClient.create({
        _type: 'uiSettings',
        title: 'UI Settings',
        fontFamily,
        themeColor: themeColor || '#0b1014',
        themeAltColor: themeAltColor || '#ffffff',
        themeLightColor: themeLightColor || '#ffe7d9',
        primaryButtonBg: primaryButtonBg || '#0b1014',
        primaryButtonText: primaryButtonText || '#ffffff',
        primaryButtonHoverBg: primaryButtonHoverBg || '#0b1014',
        primaryButtonHoverText: primaryButtonHoverText || '#ffffff',
        secondaryButtonBg: secondaryButtonBg || '#0b1014',
        secondaryButtonText: secondaryButtonText || '#374151',
        secondaryButtonHoverBg: secondaryButtonHoverBg || '#0b1014',
        secondaryButtonHoverText: secondaryButtonHoverText || '#374151',
        activeTabBg: activeTabBg || '#ffffff33',
        activeTabText: activeTabText || '#ffffff',
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { message: 'Failed to save UI settings' },
      { status: 500 }
    )
  }
}
