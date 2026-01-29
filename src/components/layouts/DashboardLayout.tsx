'use client'

import { ReactNode, useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  FiHome,
  FiClock,
  FiFolder,
  FiUsers,
  FiBriefcase,
  FiBarChart2,
  FiSettings,
  FiMenu,
  FiX,
  FiSliders,
} from 'react-icons/fi'
import UserProfileMenu from '@/components/user/UserProfileMenu'

interface DashboardLayoutProps {
  children: ReactNode
  role: 'admin' | 'manager' | 'user'
}

export default function DashboardLayout({ children, role }: DashboardLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isNavigating, setIsNavigating] = useState(false)
  const pathname = usePathname()
  const previousPathRef = useRef(pathname)
  const { data: session } = useSession()

  // Reset navigation state when the route changes (with minimum display time for smooth UX)
  useEffect(() => {
    if (previousPathRef.current !== pathname) {
      const timer = setTimeout(() => {
        setIsNavigating(false)
      }, 300) // Minimum 300ms display time for smooth transition
      previousPathRef.current = pathname
      return () => clearTimeout(timer)
    }
  }, [pathname])

  // Handle navigation click
  const handleNavClick = (href: string) => {
    if (href !== pathname) {
      setIsNavigating(true)
    }
    setMobileMenuOpen(false)
  }

  const adminNavigationBase = [
    { name: 'Dashboard', href: '/admin', icon: FiHome },
    { name: 'Time', href: '/admin/time-entries', icon: FiClock },
    { name: 'Projects', href: '/admin/projects', icon: FiFolder },
    { name: 'Team', href: '/admin/team', icon: FiUsers },
    { name: 'Reports', href: '/admin/reports', icon: FiBarChart2 },
    { name: 'Manage', href: '/admin/manage', icon: FiBriefcase },
  ]
  
  const adminNavigation = role === 'admin'
    ? [
        ...adminNavigationBase,
        // { name: 'CMS Studio', href: '/studio', icon: FiSettings },
        { name: 'UI Settings', href: '/admin/ui-settings', icon: FiSliders },
      ]
    : adminNavigationBase

  const userNavigation = [
    { name: 'Time', href: '/dashboard', icon: FiClock },
    { name: 'Projects', href: '/dashboard/projects', icon: FiFolder },
    { name: 'Reports', href: '/dashboard/reports', icon: FiBarChart2 },
  ]

  const navigation = role === 'admin' || role === 'manager' ? adminNavigation : userNavigation

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="sticky top-0 z-20 theme-color-bg border-b">
        <div className="max-w-[1216px] mx-auto px-4">
          {/* <div className="flex items-center justify-between h-16"> */}
          <div className="flex items-center justify-between py-2">
            {/* Logo */}
            <Link href={role === 'admin' || role === 'manager' ? '/admin' : '/dashboard'} className="flex items-center space-x-2 shrink-0">
              <FiClock className="w-7 h-7" />
              <span className="text-lg font-bold">MD Hourlog</span>
            </Link>

            {/* Desktop navigation */}
            <nav className="hidden lg:flex items-center space-x-1 flex-1 justify-center">
              {navigation.map((item) => {
                const isDashboardLink = item.href === '/admin' || item.href === '/dashboard';
                const isActive = isDashboardLink
                  ? pathname === item.href
                  : (pathname === item.href || pathname.startsWith(item.href + '/'));
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => handleNavClick(item.href)}
                    className={`flex items-center px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                      isActive
                        ? 'active-tab'
                        : 'hover-tab'
                    }`}
                    style={isActive ? {
                      backgroundColor: 'var(--active-tab-bg)',
                      color: 'var(--active-tab-text)',
                    } : undefined}
                  >
                    <item.icon className="w-4 h-4 mr-2" />
                    {item.name}
                  </Link>
                )
              })}
            </nav>

            {/* Right side: user profile - hidden on mobile */}
            <div className="hidden lg:flex items-center space-x-4 shrink-0">
              <UserProfileMenu />
            </div>

            {/* Mobile menu button */}
            <button
              type="button"
              className="lg:hidden p-2 focus:outline-none"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <FiX className="w-6 h-6" />
              ) : (
                <FiMenu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile navigation dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t bg-white text-black">
            <div className="max-w-[1216px] mx-auto px-4">
              <nav className="py-3 space-y-1">
                {navigation.map((item) => {
                  const isDashboardLink = item.href === '/admin' || item.href === '/dashboard';
                  const isActive = isDashboardLink
                    ? pathname === item.href
                    : (pathname === item.href || pathname.startsWith(item.href + '/'));
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`flex items-center px-3 py-2 text-sm font-semibold transition-colors ${
                        isActive
                          ? 'bg-black text-white'
                          : 'hover:bg-black hover:text-white'
                      }`}
                      onClick={() => handleNavClick(item.href)}
                    >
                      <item.icon className="w-4 h-4 mr-2" />
                      {item.name}
                    </Link>
                  )
                })}
              </nav>
            </div>
          </div>
        )}
      </header>

      {/* Page content */}
      <main className="flex-1 relative">
        <div className="max-w-[1216px] mx-auto px-4 py-6">{children}</div>
        {isNavigating && (
          <div className="absolute inset-0 bg-white/70 z-10 flex items-center justify-center backdrop-blur-[2px] animate-fade-in">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-[3px] border-gray-300 border-t-gray-700 rounded-full animate-spin"></div>
              <span className="text-sm text-gray-600 font-medium animate-pulse">Loading...</span>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}