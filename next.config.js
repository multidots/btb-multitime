/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.sanity.io',
        port: '',
        pathname: '/images/**',
      },
    ],
  },
  experimental: {
    taint: true,
  },
  transpilePackages: ['sanity'],

  // Security headers
  async headers() {
    const isProduction = process.env.NODE_ENV === 'production'

    // Content Security Policy (omit upgrade-insecure-requests in dev so http://localhost works in Safari)
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // unsafe-eval needed for Next.js, unsafe-inline for inline scripts
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // Allow Google Fonts stylesheets
      "img-src 'self' data: https://cdn.sanity.io https://*.sanity.io https://ui-avatars.com", // Allow UI Avatars for generated avatars
      "font-src 'self' data: https://fonts.gstatic.com", // Allow Google Fonts font files
      "connect-src 'self' https://*.sanity.io https://*.sanity.run https://fonts.googleapis.com", // Allow font loading API
      "frame-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      ...(isProduction ? ["upgrade-insecure-requests"] : []),
    ].join('; ')

    return [
      {
        // Apply to all routes
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: cspDirectives,
          },
          // HSTS header - only in production
          ...(isProduction ? [{
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          }] : []),
        ],
      },
      {
        // API-specific headers
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, max-age=0',
          },
        ],
      },
    ]
  },

  webpack: (config, { dev, isServer }) => {
    config.externals = [...(config.externals || []), { canvas: 'canvas' }]

    // Improve hot reload in development
    if (dev && !isServer) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      }
    }

    return config
  },
}

module.exports = nextConfig
