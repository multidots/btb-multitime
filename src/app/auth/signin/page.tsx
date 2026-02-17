'use client'

import { useState, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { FiClock, FiAlertCircle } from 'react-icons/fi'

// Google Icon Component
const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
)

function SignInContent() {
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'
  const error = searchParams.get('error')
  const [isLoading, setIsLoading] = useState(false)

  const handleGoogleSignIn = () => {
    setIsLoading(true)
    // Google OAuth uses redirect flow - browser redirects to Google, then back
    // Role-based routing is handled by middleware after successful sign-in
    signIn('google', { callbackUrl })
  }

  const getErrorMessage = (errorCode: string): string => {
    switch (errorCode) {
      case 'NoUserFound':
        return 'No account found with this email. Please contact your administrator for access.'
      case 'AccountInactive':
        return 'Your account is inactive or archived. Please contact your administrator.'
      case 'OAuthAccountNotLinked':
        return 'This email is already registered with a different sign-in method.'
      case 'OAuthSignin':
        return 'Error occurred during Google sign-in. Please try again.'
      case 'OAuthCallback':
        return 'Error occurred during authentication callback. Please try again.'
      case 'OAuthCreateAccount':
        return 'Could not create account. Please contact your administrator.'
      case 'Callback':
        return 'Authentication callback error. Please try again.'
      case 'AccessDenied':
        return 'Access denied. You do not have permission to sign in.'
      default:
        return 'An error occurred during sign-in. Please try again.'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center space-x-2">
            <FiClock className="w-12 h-12 theme-color" />
            <span className="text-3xl font-bold theme-color">Multitime</span>
          </Link>
          <p className="mt-2 text-gray-600">Sign in to your account</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start">
              <FiAlertCircle className="w-5 h-5 text-red-600 mr-2 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-800">{getErrorMessage(error)}</p>
            </div>
          </div>
        )}

        {/* Sign In Card */}
        <div className="bg-white rounded-lg shadow-custom-lg p-8">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-300 rounded-lg shadow-sm text-base font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <GoogleIcon />
            )}
            {isLoading ? 'Signing in...' : 'Continue with Google'}
          </button>

          <p className="mt-6 text-center text-sm text-gray-500">
            Don&apos;t have access? Contact your administrator.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    }>
      <SignInContent />
    </Suspense>
  )
}
