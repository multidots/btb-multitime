import { NextRequest, NextResponse } from 'next/server'
import { mutationClient } from '@/lib/sanity'
import { requireAdminOrManagerApi, AuthError } from '@/lib/auth'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Admins and managers can upload avatars for team members
    await requireAdminOrManagerApi()

    const { id } = params
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
    const uploadedAsset = await mutationClient.assets.upload('image', buffer, {
      filename: `avatar-${id}-${Date.now()}.${file.type.split('/')[1]}`,
      contentType: file.type,
    })

    // Update user document with new avatar
    const result = await mutationClient
      .patch(id)
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
      avatar: result.avatar, // Return the avatar from the updated member document
      member: result
    })

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      )
    }
    return NextResponse.json(
      { error: 'Failed to upload avatar' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Admins and managers can remove avatars for team members
    await requireAdminOrManagerApi()

    const { id } = params

    // Remove avatar from user document
    const result = await mutationClient
      .patch(id)
      .unset(['avatar'])
      .commit()

    return NextResponse.json({
      success: true,
      member: result
    })

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      )
    }
    return NextResponse.json(
      { error: 'Failed to remove avatar' },
      { status: 500 }
    )
  }
}
