'use client'

// @ts-ignore - Avoid type conflicts between Sanity versions
import config from '../../../../sanity.config'

export default function StudioLoading() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '1.2rem',
        background: '#f1f3f6',
      }}
    >
      Loading {config.title || 'Sanity Studio'}...
    </div>
  )
}

