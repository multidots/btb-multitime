import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { sanityClient } from '@/lib/sanity'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('avatar') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 2MB' }, { status: 400 })
    }

    // Convert file to buffer for Sanity upload
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload to Sanity
    const uploadedAsset = await sanityClient.assets.upload('image', buffer, {
      filename: `avatar-${session.user.id}-${Date.now()}.${file.type.split('/')[1]}`,
      contentType: file.type,
    })

    // Update user document with new avatar
    const result = await sanityClient
      .patch(session.user.id)
      .set({
        avatar: {
          _type: 'image',
          asset: {
            _type: 'reference',
            _ref: uploadedAsset._id
          }
        }
      })
      .commit()

    return NextResponse.json({
      success: true,
      avatar: {
        _id: uploadedAsset._id,
        url: uploadedAsset.url
      },
      user: result
    })

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to upload avatar' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Remove avatar from user document
    const result = await sanityClient
      .patch(session.user.id)
      .unset(['avatar'])
      .commit()

    return NextResponse.json({
      success: true,
      user: result
    })

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to remove avatar' },
      { status: 500 }
    )
  }
}
