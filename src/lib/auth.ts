import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/authOptions'
import { redirect } from 'next/navigation'

// Custom error class for API route authentication failures
export class AuthError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

export async function getSession() {
  return await getServerSession(authOptions)
}

export async function getCurrentUser() {
  const session = await getSession()
  return session?.user
}

export async function requireAuth() {
  const session = await getSession()
  
  if (!session) {
    redirect('/auth/signin')
  }
  
  return session
}

export async function requireAdmin() {
  const session = await requireAuth()

  if (session.user.role !== 'admin') {
    redirect('/dashboard')
  }

  return session
}

export async function requireAdminOrManager() {
  const session = await requireAuth()

  if (session.user.role !== 'admin' && session.user.role !== 'manager') {
    redirect('/dashboard')
  }

  return session
}

export function hasPermission(
  user: { role: string; permissions?: any },
  permission: string
): boolean {
  // Admin has all permissions
  if (user.role === 'admin') {
    return true
  }
  
  // Manager has admin-like permissions except for system settings
  if (user.role === 'manager') {
    return true
  }
  
  // Check specific permission
  return user.permissions?.[permission] === true
}

// API-specific versions that throw errors instead of redirecting
export async function requireAuthApi() {
  const session = await getSession()
  if (!session) {
    throw new AuthError(401, 'Unauthorized')
  }
  if (!session.user) {
    throw new AuthError(401, 'Unauthorized: User not found in session')
  }
  return session
}

export async function requireAdminApi() {
  const session = await requireAuthApi()
  
  // Check if role exists
  if (!session.user.role) {
    throw new AuthError(403, 'Forbidden: User role not found in session')
  }
  
  // Check if user is admin
  if (session.user.role !== 'admin') {
    throw new AuthError(403, 'Forbidden: Admin access required')
  }
  
  return session
}

export async function requireAdminOrManagerApi() {
  const session = await requireAuthApi()
  
  // Check if role exists
  if (!session.user.role) {
    throw new AuthError(403, 'Forbidden: User role not found in session')
  }
  
  // Check if user is admin or manager
  if (session.user.role !== 'admin' && session.user.role !== 'manager') {
    throw new AuthError(403, 'Forbidden: Admin or Manager access required')
  }
  
  return session
}
