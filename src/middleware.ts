import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

// Public API routes that don't require authentication
const PUBLIC_API_ROUTES = [
  '/api/auth',      // NextAuth routes must be public
  '/api/cron',      // Cron jobs (protected by CRON_SECRET)
  '/api/email-preview', // Development only (protected by NODE_ENV check)
]

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.NEXTAUTH_URL,
].filter(Boolean) as string[]

// Check if route is a public API route
function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_API_ROUTES.some(route => pathname.startsWith(route))
}

// Check if origin is allowed
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true // Same-origin requests don't have Origin header
  return ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed))
}

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const path = req.nextUrl.pathname
    const origin = req.headers.get('origin')

    // CORS check for API routes
    if (path.startsWith('/api/')) {
      // Block requests from unknown origins
      if (origin && !isAllowedOrigin(origin)) {
        return NextResponse.json(
          { error: 'CORS: Origin not allowed' },
          { status: 403 }
        )
      }

      // Add security headers to API responses
      const response = NextResponse.next()
      response.headers.set('X-Content-Type-Options', 'nosniff')
      response.headers.set('X-Frame-Options', 'DENY')
      response.headers.set('Cache-Control', 'no-store, max-age=0')
      
      // Set CORS headers for allowed origins
      if (origin && isAllowedOrigin(origin)) {
        response.headers.set('Access-Control-Allow-Origin', origin)
        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        response.headers.set('Access-Control-Allow-Credentials', 'true')
      }
      
      return response
    }

    // Allow Sanity Studio to handle its own authentication
    if (path.startsWith('/studio')) {
      if (token && token.role !== 'admin') {
        return NextResponse.redirect(new URL('/dashboard', req.url))
      }
      return NextResponse.next()
    }

    // Check if user is accessing admin routes
    if (path.startsWith('/admin')) {
      if (token?.role !== 'admin' && token?.role !== 'manager') {
        return NextResponse.redirect(new URL('/dashboard', req.url))
      }
    }

    // Check if manager is accessing restricted admin routes
    if (path.startsWith('/admin/users')) {
      if (token?.role !== 'admin') {
        return NextResponse.redirect(new URL('/admin', req.url))
      }
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname
        
        // Handle OPTIONS preflight requests
        if (req.method === 'OPTIONS') {
          return true
        }
        
        // Allow public API routes without authentication
        if (path.startsWith('/api/') && isPublicApiRoute(path)) {
          return true
        }
        
        // For Studio routes, allow Sanity native auth
        if (path.startsWith('/studio')) {
          return true
        }
        
        // All other routes require authentication
        return !!token
      },
    },
    pages: {
      signIn: '/auth/signin',
    },
  }
)

// Protect all important routes
export const config = {
  matcher: [
    // Protected pages
    '/dashboard/:path*',
    '/admin/:path*',
    '/studio/:path*',
    // ALL API routes
    '/api/:path*',
  ],
}
