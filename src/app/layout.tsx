import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import { Providers } from './providers'
import { UISettingsProvider } from '@/components/UISettingsProvider'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: {
    default: 'Multidots | Multitime',
    template: '%s | Multidots | Multitime',
  },
  description: 'Time tracking and project management application',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <UISettingsProvider>
          <Providers>
            {children}
            <Toaster position="top-right" />
          </Providers>
        </UISettingsProvider>
      </body>
    </html>
  )
}

