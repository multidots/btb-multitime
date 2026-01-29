import 'next-auth'

declare module 'next-auth' {
  interface User {
    id: string
    email: string
    name: string
    firstName: string
    lastName: string
    role: 'admin' | 'manager' | 'user'
    isSanityAdmin?: boolean
    rate?: number
    timezone?: string
    avatar?: any
    permissions?: {
      canManageProjects?: boolean
      canManageUsers?: boolean
      canViewReports?: boolean
      canManageClients?: boolean
      canApproveTimeEntries?: boolean
    }
    team?: {
      _id: string
      name: string
    }
  }

  interface Session {
    user: User
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: string
    firstName: string
    lastName: string
    rate?: number
    timezone?: string
    avatar?: any
    permissions?: any
    team?: any
  }
}

