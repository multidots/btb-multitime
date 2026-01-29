import { client, mutationClient } from '@/lib/sanity'
import { projectId } from '@/sanity/env'

/**
 * Checks if an email belongs to a Sanity Studio admin and adds/updates them in the user schema
 * This is called automatically when a Sanity admin logs in
 */
export async function ensureSanityAdminInUserSchema(
  email: string,
  sanityUserId?: string,
  name?: string
): Promise<'created' | 'updated' | 'skipped' | 'error'> {
  try {
    if (!email) {
      return 'skipped'
    }

    const normalizedEmail = email.toLowerCase()

    // Check if user already exists by email
    const existingUser = await client.fetch(
      `*[_type == "user" && email == $email][0]{
        _id,
        email,
        isSanityAdmin,
        sanityUserId,
        role,
        isActive,
        isArchived
      }`,
      { email: normalizedEmail }
    )

    // Split name into first and last name if provided
    let firstName = ''
    let lastName = ''
    if (name) {
      const nameParts = name.trim().split(/\s+/)
      firstName = nameParts[0] || normalizedEmail.split('@')[0]
      lastName = nameParts.slice(1).join(' ') || ''
    } else {
      // Extract from email as fallback
      const emailParts = normalizedEmail.split('@')[0]
      const nameParts = emailParts.split(/[._-]/)
      firstName = nameParts[0] || emailParts
      lastName = nameParts.slice(1).join(' ') || ''
    }

    if (existingUser) {
      // Check if update is actually needed
      const needsUpdate = 
        existingUser.isSanityAdmin !== true ||
        existingUser.role !== 'admin' ||
        existingUser.isActive !== true ||
        existingUser.isArchived === true ||
        (sanityUserId && existingUser.sanityUserId !== sanityUserId)

      // Only update if something actually needs to change
      if (needsUpdate) {
        await mutationClient
          .patch(existingUser._id)
          .set({
            isSanityAdmin: true,
            sanityUserId: sanityUserId || existingUser.sanityUserId,
            role: 'admin', // Ensure they have admin role
            isActive: true,
            isArchived: false,
          })
          .commit()

        return 'updated'
      } else {
        // User is already properly synced, no update needed
        return 'skipped'
      }
    } else {
      // Create new user document for Sanity admin
      const newUser = {
        _type: 'user',
        firstName,
        lastName,
        email: normalizedEmail,
        role: 'admin',
        isActive: true,
        isArchived: false,
        isSanityAdmin: true,
        sanityUserId: sanityUserId || '',
        capacity: 40, // Default capacity
        timezone: 'America/New_York', // Default timezone
        permissions: {
          canManageProjects: true,
          canManageUsers: true,
          canViewReports: true,
          canManageClients: true,
          canApproveTimeEntries: true,
        },
        notification: {
          email: true,
          weeklyReminder: true,
          projectAssignment: true,
        },
      }

      await mutationClient.create(newUser)
      return 'created'
    }
  } catch (error: any) {
    return 'error'
  }
}

