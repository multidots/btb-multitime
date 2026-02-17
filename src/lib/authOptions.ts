import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { client, mutationClient } from '@/lib/sanity'
import { ensureSanityAdminInUserSchema } from '@/lib/sanityAdmins'

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code'
        }
      }
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/auth/signin',
    signOut: '/auth/signout',
    error: '/auth/error',
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        try {
          const email = user.email?.toLowerCase()
          if (!email) {
            return false
          }

          // Check if user exists in Sanity
          const existingUser = await client.fetch(
            `*[_type == "user" && email == $email][0]{
              _id,
              firstName,
              lastName,
              email,
              role,
              isActive,
              isArchived,
              googleId,
              isSanityAdmin,
              sanityUserId
            }`,
            { email }
          )

          if (existingUser) {
            // User exists - check if active
            if (!existingUser.isActive || existingUser.isArchived) {
              return '/auth/error?error=AccountInactive'
            }

            // If user exists but doesn't have googleId set, update it (linking accounts)
            if (!existingUser.googleId) {
              await mutationClient
                .patch(existingUser._id)
                .set({ 
                  googleId: account.providerAccountId,
                  authProvider: 'google'
                })
                .commit()
            }

            // If user is a Sanity admin but not admin role, ensure they have admin role
            if (existingUser.isSanityAdmin && existingUser.role !== 'admin') {
              ensureSanityAdminInUserSchema(existingUser.email, existingUser.sanityUserId, `${existingUser.firstName} ${existingUser.lastName}`)
                .catch(() => {})
            }

            return true
          }

          // User doesn't exist - only invited users can sign in
          return '/auth/error?error=NoUserFound'
        } catch (error) {
          return false
        }
      }

      return true
    },

    async jwt({ token, user, account, trigger, session }): Promise<any> {
      // Initial sign in with Google
      if (user && account?.provider === 'google') {
        const email = user.email?.toLowerCase()
        const sanityUser = await client.fetch(
          `*[_type == "user" && email == $email && isActive == true && isArchived != true][0]{
            _id,
            firstName,
            lastName,
            email,
            role,
            rate,
            timezone,
            avatar,
            permissions,
            team->{_id, name}
          }`,
          { email }
        )

        if (sanityUser) {
          token.id = sanityUser._id
          token.role = sanityUser.role
          token.firstName = sanityUser.firstName
          token.lastName = sanityUser.lastName
          token.rate = sanityUser.rate
          token.timezone = sanityUser.timezone
          token.avatar = sanityUser.avatar
          token.permissions = sanityUser.permissions
          token.team = sanityUser.team
        }
      }

      // Handle session updates
      if (trigger === 'update' && session) {
        token = { ...token, ...session }
      }

      // Periodically refresh user data from Sanity (every time JWT is accessed)
      // This ensures role changes in Studio are reflected without requiring re-login
      // IMPORTANT: If user is deleted/archived, invalidate the session to sign them out
      if (token.id && !user) {
        try {
          const freshUser = await client.fetch(
            `*[_type == "user" && _id == $userId && isActive == true && isArchived != true][0]{
              _id,
              firstName,
              lastName,
              email,
              role,
              rate,
              timezone,
              avatar,
              permissions,
              team->{_id, name}
            }`,
            { userId: token.id }
          )

          // If user is deleted or archived, invalidate the session
          if (!freshUser) {
            // Return null to invalidate the token and sign out the user
            return null
          }

          // Update token with fresh user data
          token.role = freshUser.role
          token.firstName = freshUser.firstName
          token.lastName = freshUser.lastName
          token.rate = freshUser.rate
          token.timezone = freshUser.timezone
          token.avatar = freshUser.avatar
          token.permissions = freshUser.permissions
          token.team = freshUser.team
        } catch (error) {
          // If there's an error fetching user data, invalidate session for safety
          // This prevents users from staying logged in if there's a data issue
          console.error('Error refreshing user data in JWT callback:', error)
          return null
        }
      }

      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as "admin" | "manager" | "user"
        session.user.firstName = token.firstName as string
        session.user.lastName = token.lastName as string
        session.user.rate = token.rate as number
        session.user.timezone = token.timezone as string
        session.user.avatar = token.avatar as any
        session.user.permissions = token.permissions as any
        session.user.team = token.team as any
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
}
