'use client'

import { usePageTitle } from '@/lib/pageTitleImpl'
import { useState, useEffect } from 'react'
import { FiInfo, FiSave } from 'react-icons/fi'

interface NotificationSettings {
  dailyPersonalReminders: boolean
  weeklyTeamReminders: boolean
  weeklyReportEmail: boolean
  approvalNotifications: boolean
  projectDeletedNotifications: boolean
  occasionalUpdates: boolean
}

interface NotificationsTabProps {
  user: {
    id: string
    role?: 'admin' | 'manager' | 'user'
  }
  teamManagerName?: string
}

export default function NotificationsTab({ user, teamManagerName }: NotificationsTabProps) {
  usePageTitle('Notifications')
  const [settings, setSettings] = useState<NotificationSettings>({
    dailyPersonalReminders: false,
    weeklyTeamReminders: true,
    weeklyReportEmail: true,
    approvalNotifications: true,
    projectDeletedNotifications: false,
    occasionalUpdates: true,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const isManager = user.role === 'manager'
  const isAdmin = user.role === 'admin'
  const canSeeApproval = isManager || isAdmin
  const canSeeProjectDeleted = isManager || isAdmin

  // Fetch current notification settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch(`/api/user/profile?userId=${user.id}`)
        if (response.ok) {
          const data = await response.json()
          if (data.notification) {
            setSettings({
              dailyPersonalReminders: data.notification.dailyPersonalReminders ?? false,
              weeklyTeamReminders: data.notification.weeklyTeamReminders ?? true,
              weeklyReportEmail: data.notification.weeklyReportEmail ?? true,
              approvalNotifications: data.notification.approvalNotifications ?? true,
              projectDeletedNotifications: data.notification.projectDeletedNotifications ?? false,
              occasionalUpdates: data.notification.occasionalUpdates ?? true,
            })
          }
        }
      } catch (error) {
        console.error('Error fetching notification settings:', error)
      } finally {
        setLoading(false)
      }
    }

    if (user.id) {
      fetchSettings()
    } else {
      setLoading(false)
    }
  }, [user.id])

  const handleToggle = (key: keyof NotificationSettings) => {
    setSettings(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)

    try {
      const response = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          notification: settings,
        }),
      })

      if (response.ok) {
        setMessage({ type: 'success', text: 'Notification preferences updated successfully!' })
      } else {
        const error = await response.json()
        setMessage({ type: 'error', text: error.message || 'Failed to update preferences' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'An error occurred while saving' })
    } finally {
      setSaving(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        <span className="ml-3 text-gray-600">Loading notification settings...</span>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Notifications</h3>

        <div className="space-y-8">
          {/* Timesheet Reminders Section */}
          <div className="border-b border-gray-100 pb-6">
            <h4 className="text-sm font-medium theme-color mb-4">Timesheet reminders</h4>
            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-not-allowed opacity-50">
                <input
                  type="checkbox"
                  checked={settings.dailyPersonalReminders}
                  disabled
                  className="h-4 w-4 border-gray-300 theme-color outline-none focus:ring-transparent focus:border-black rounded cursor-not-allowed"
                />
                <span className="text-sm text-gray-500">
                  Help me track my time with daily personal reminders
                  <span className="ml-2 text-xs text-gray-400">(Coming soon)</span>
                </span>
              </label>

              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.weeklyTeamReminders}
                    onChange={() => handleToggle('weeklyTeamReminders')}
                    className="h-4 w-4 border-gray-300 theme-color outline-none focus:ring-transparent focus:border-black rounded focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">
                    Include me in weekly team-wide reminders
                  </span>
                </label>

                {settings.weeklyTeamReminders && teamManagerName && (
                  <div className="ml-7 bg-blue-50 border border-blue-100 rounded-md p-3 flex items-start gap-2">
                    <FiInfo className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-blue-700">
                      {teamManagerName} has set up reminders for your team. When this is checked and you're
                      behind on your tracking for the week, you'll automatically be reminded that
                      timesheets are due by Friday at 5:00pm.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Your Weekly Harvest Section */}
          <div className="border-b border-gray-100 pb-6">
            <h4 className="text-sm font-medium text-gray-700 mb-4">Your Weekly Harvest</h4>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.weeklyReportEmail}
                onChange={() => handleToggle('weeklyReportEmail')}
                className="h-4 w-4 border-gray-300 theme-color outline-none focus:ring-transparent focus:border-black rounded focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">
                Email me a weekly report of my time
              </span>
            </label>
          </div>

          {/* Approval Section - Manager & Admin only */}
          {canSeeApproval && (
            <div className="border-b border-gray-100 pb-6">
              <h4 className="text-sm font-medium text-gray-700 mb-4">Approval</h4>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.approvalNotifications}
                  onChange={() => handleToggle('approvalNotifications')}
                  className="h-4 w-4 border-gray-300 theme-color outline-none focus:ring-transparent focus:border-black rounded focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">
                  Email me if timesheets are submitted for projects or people I manage
                </span>
              </label>
            </div>
          )}

          {/* Other Notifications Section */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-4">Other notifications</h4>
            <div className="space-y-4">
              {/* Project Deleted - Manager & Admin only */}
              {canSeeProjectDeleted && (
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.projectDeletedNotifications}
                    onChange={() => handleToggle('projectDeletedNotifications')}
                    className="h-4 w-4 border-gray-300 theme-color outline-none focus:ring-transparent focus:border-black rounded focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">
                    Email me if a project I manage is deleted
                  </span>
                </label>
              )}

              <label className="flex items-center gap-3 cursor-not-allowed opacity-50">
                <input
                  type="checkbox"
                  checked={settings.occasionalUpdates}
                  disabled
                  className="h-4 w-4 border-gray-300 theme-color outline-none focus:ring-transparent focus:border-black rounded cursor-not-allowed"
                />
                <span className="text-sm text-gray-500">
                  Email me occasional updates, offers, tips, and interesting stories
                  <span className="ml-2 text-xs text-gray-400">(Coming soon)</span>
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="mt-8 flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 theme-color-bg text-white text-sm font-semibold rounded-md hover:theme-color-bg-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                Saving...
              </>
            ) : (
              <>
                <FiSave className="h-4 w-4" />
                Update notifications
              </>
            )}
          </button>

          {message && (
            <span className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {message.text}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

