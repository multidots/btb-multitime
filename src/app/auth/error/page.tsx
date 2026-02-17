'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { FiAlertCircle, FiArrowLeft } from 'react-icons/fi'

const errorMessages: Record<string, { title: string; description: string }> = {
  Configuration: {
    title: 'Configuration Error',
    description: 'There is a problem with the server configuration. Please check that NEXTAUTH_SECRET and NEXTAUTH_URL are set in your environment variables.',
  },
  AccessDenied: {
    title: 'Access Denied',
    description: "You don't have permission to access this resource.",
  },
  Verification: {
    title: 'Verification Failed',
    description: 'The verification token has expired or has already been used.',
  },
  OAuthSignin: {
    title: 'OAuth Sign-In Error',
    description: 'Error occurred while trying to sign in with the OAuth provider. Please try again.',
  },
  OAuthCallback: {
    title: 'OAuth Callback Error',
    description: 'Error occurred while processing the OAuth callback. Please try again.',
  },
  OAuthCreateAccount: {
    title: 'Account Creation Error',
    description: 'Could not create your account. The email may already be registered with a different sign-in method.',
  },
  OAuthAccountNotLinked: {
    title: 'Account Not Linked',
    description: 'This email is already registered with a different sign-in method. Please sign in using your original method.',
  },
  Callback: {
    title: 'Callback Error',
    description: 'An error occurred during the authentication callback. Please try again.',
  },
  NoUserFound: {
    title: 'Account Not Found',
    description: 'No account found with this email. Please contact your administrator to get access.',
  },
  AccountInactive: {
    title: 'Account Inactive',
    description: 'Your account is inactive or archived. Please contact your administrator.',
  },
  Default: {
    title: 'Authentication Error',
    description: 'An error occurred during authentication. Please try again.',
  },
}

function AuthErrorContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error') || 'Default'

  const errorInfo = errorMessages[error] || errorMessages.Default

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-lg shadow-custom-lg p-8">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
              <FiAlertCircle className="w-8 h-8 text-red-600" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
            {errorInfo.title}
          </h1>

          <p className="text-gray-600 text-center mb-8">
            {errorInfo.description}
          </p>

          {error === 'Configuration' && (
            <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm font-medium text-yellow-800 mb-2">
                Quick Fix:
              </p>
              <ol className="text-sm text-yellow-700 space-y-1 list-decimal list-inside">
                <li>Check your <code className="bg-yellow-100 px-1 rounded">.env.local</code> file</li>
                <li>Ensure <code className="bg-yellow-100 px-1 rounded">NEXTAUTH_SECRET</code> is set</li>
                <li>Ensure <code className="bg-yellow-100 px-1 rounded">NEXTAUTH_URL</code> is set</li>
                <li>Restart your development server</li>
              </ol>
              <p className="text-xs text-yellow-600 mt-3">
                Generate a secret: <code className="bg-yellow-100 px-1 rounded">openssl rand -base64 32</code>
              </p>
            </div>
          )}

          <div className="space-y-3">
            <Link
              href="/auth/signin"
              className="block w-full text-center py-2.5 px-4 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              Try Signing In Again
            </Link>

            <Link
              href="/"
              className="flex items-center justify-center text-gray-500 hover:text-gray-700"
            >
              <FiArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 flex items-center justify-center px-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
      </div>
    }>
      <AuthErrorContent />
    </Suspense>
  )
}


