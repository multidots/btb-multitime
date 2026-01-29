'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { urlFor } from '@/lib/sanity'
import {
  FiUser,
  FiBarChart2,
  FiBell,
  FiLogOut,
  FiChevronDown,
} from 'react-icons/fi'

export default function UserProfileMenu() {
  const { data: session, status } = useSession()
  const isLoading = status === 'loading'
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleSignOut = () => {
    signOut({ callbackUrl: '/' })
  }

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Determine role-based navigation
  const userRole = session?.user?.role || 'user'
  const isAdminOrManager = userRole === 'admin' || userRole === 'manager'
  
  const menuItems = [
    {
      name: 'My Profile',
      href: '/dashboard/settings',
      icon: FiUser,
      description: 'Update your profile information'
    },
    {
      name: 'My Time Report',
      href: isAdminOrManager ? '/admin/reports' : '/dashboard/reports',
      icon: FiBarChart2,
      description: 'View your time tracking reports'
    },
    // notification settings
    {
      name: 'Notifications',
      href: '/dashboard/settings?tab=notifications',
      icon: FiBell,
      description: 'Manage your account notification settings'
    },
  ]

  return (
    <div className="relative" ref={menuRef}>
      <button
        className="hover-tab flex items-center justify-between w-full p-2 text-left rounded-lg focus:outline-none transition-colors space-x-2"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center min-w-0 flex-1">
          <div className="flex-shrink-0">
            {isLoading ? (
              <div className="w-7 h-7 rounded-full bg-gray-200 animate-pulse" />
            ) : session?.user?.avatar ? (
              <img
                src={urlFor(session.user.avatar).fit('crop').url()}
                alt="Avatar"
                className="w-7 h-7 rounded-full object-cover object-top"
              />
            ) : (
                <div className="w-7 h-7 rounded-full uppercase bg-white theme-color btn-primary-black flex items-center justify-center font-semibold text-xs">
                {session?.user?.firstName?.[0]}{session?.user?.lastName?.[0]}
              </div>
            )}
          </div>
          <div className="ml-3 min-w-0 flex-1">
            {isLoading ? (
              <div className="h-2 w-10 bg-gray-200 rounded animate-pulse" />
            ) : (
              <p className="text-sm font-medium truncate">
                {session?.user?.firstName && session?.user?.lastName
                  // ? `${session.user.firstName} ${session.user.lastName}`
                  ? `${session.user.firstName}`
                  : session?.user?.name || ''}
              </p>
            )}
            {/* <p className="text-xs capitalize">
              {session?.user?.role || 'User'}
            </p> */}
          </div>
        </div>
        <FiChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 animate-in fade-in-0 zoom-in-95 duration-200">
          {menuItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="group flex items-center px-4 py-3 text-sm theme-color-hover hover:theme-color-bg hover:text-white transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <item.icon className="w-5 h-5 mr-3 text-gray-400 group-hover:text-white" />
              <div className="flex-1">
                <p className="font-medium text-gray-900 group-hover:text-white">{item.name}</p>
                <p className="text-xs text-gray-500 group-hover:text-gray-300">{item.description}</p>
              </div>
            </Link>
          ))}

          <div className="border-t border-gray-200 my-1"></div>

          <button
            onClick={() => {
              setIsOpen(false)
              handleSignOut()
            }}
            className="group flex items-center w-full px-4 py-3 text-sm text-left hover:bg-black hover:text-white transition-colors"
          >
            <FiLogOut className="w-5 h-5 mr-3 text-gray-400 group-hover:text-white" />
            <div className="flex-1">
              <p className="font-medium text-red-600 group-hover:text-white">Sign Out</p>
              <p className="text-xs text-gray-500 group-hover:text-gray-300">Log out of your account</p>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}
