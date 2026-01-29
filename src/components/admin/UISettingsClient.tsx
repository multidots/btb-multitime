'use client'

import { useState, useEffect } from 'react'
import { FiSliders, FiType, FiSave, FiRefreshCw } from 'react-icons/fi'
import toast from 'react-hot-toast'

interface UISettings {
  fontFamily: string
  themeColor: string
  themeAltColor: string
  themeLightColor: string
  primaryButtonBg: string
  primaryButtonText: string
  primaryButtonHoverBg: string
  primaryButtonHoverText: string
  secondaryButtonBg: string
  secondaryButtonText: string
  secondaryButtonHoverBg: string
  secondaryButtonHoverText: string
  activeTabBg: string
  activeTabText: string
}

const fonts = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Raleway',
  'Source Sans Pro',
  'Nunito',
  'Work Sans',
]

export default function UISettingsClient() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<UISettings>({
    fontFamily: 'Inter',
    themeColor: '#0b1014',
    themeAltColor: '#ffffff',
    themeLightColor: '#ffe7d9',
    primaryButtonBg: '#0b1014',
    primaryButtonText: '#ffffff',
    primaryButtonHoverBg: '#0b1014',
    primaryButtonHoverText: '#ffffff',
    secondaryButtonBg: '#0b1014',
    secondaryButtonText: '#374151',
    secondaryButtonHoverBg: '#0b1014',
    secondaryButtonHoverText: '#ffffff',
    activeTabBg: '#ffffff33',
    activeTabText: '#ffffff',
  })

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/ui-settings')
      if (response.ok) {
        const data = await response.json()
        setSettings({
          fontFamily: data.fontFamily || 'Inter',
          themeColor: data.themeColor || '#0b1014',
          themeAltColor: data.themeAltColor || '#ffffff',
          themeLightColor: data.themeLightColor || '#ffe7d9',
          primaryButtonBg: data.primaryButtonBg || '#0b1014',
          primaryButtonText: data.primaryButtonText || '#ffffff',
          primaryButtonHoverBg: data.primaryButtonHoverBg || '#0b1014',
          primaryButtonHoverText: data.primaryButtonHoverText || '#ffffff',
          secondaryButtonBg: data.secondaryButtonBg || '#0b1014',
          secondaryButtonText: data.secondaryButtonText || '#374151',
          secondaryButtonHoverBg: data.secondaryButtonHoverBg || '#0b1014',
          secondaryButtonHoverText: data.secondaryButtonHoverText || '#374151',
          activeTabBg: data.activeTabBg || '#ffffff33',
          activeTabText: data.activeTabText || '#ffffff',
        })
      }
    } catch (error) {
      console.error('Error loading UI settings:', error)
      toast.error('Failed to load UI settings')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/ui-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      })

      if (response.ok) {
        toast.success('UI Settings saved successfully! Changes will be reflected across the entire project.')
        // Reload the page to apply changes
        setTimeout(() => {
          window.location.reload()
        }, 1000)
      } else {
        const error = await response.json()
        toast.error(error.message || 'Failed to save UI settings')
      }
    } catch (error) {
      console.error('Error saving UI settings:', error)
      toast.error('Failed to save UI settings')
    } finally {
      setSaving(false)
    }
  }

  const updateSetting = (key: keyof UISettings, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const resetToDefaults = () => {
    if (confirm('Are you sure you want to reset all settings to default values? This action cannot be undone.')) {
      setSettings({
        fontFamily: 'Inter',
        themeColor: '#0b1014',
        themeAltColor: '#ffffff',
        themeLightColor: '#ffffff',
        primaryButtonBg: '#0b1014',
        primaryButtonText: '#ffffff',
        primaryButtonHoverBg: '#0b1014',
        primaryButtonHoverText: '#ffffff',
        secondaryButtonBg: '#ffffff',
        secondaryButtonText: '#0b1014',
        secondaryButtonHoverBg: '#fff',
        secondaryButtonHoverText: '#0b1014',
        activeTabBg: '#ffffff33',
        activeTabText: '#ffffff',
      })
      toast.success('Settings reset to defaults. Click "Save Settings" to apply.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div 
          className="animate-spin rounded-full h-8 w-8 border-b-2"
          style={{ borderColor: 'var(--primary-button-bg)' }}
        ></div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <FiSliders className="w-8 h-8" style={{ color: 'var(--primary-button-bg)' }} />
          UI Settings
        </h1>
        <p className="mt-2 text-gray-600">
          Configure fonts and colors that will be applied across the entire project.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
        {/* Font Family Section */}
        <div>
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-3">
            <FiType className="w-5 h-5" style={{ color: 'var(--primary-button-bg)' }} />
            Font Family
          </label>
          <select
            value={settings.fontFamily}
            onChange={(e) => updateSetting('fontFamily', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-transparent focus:border-black"
          >
            {fonts.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
          <p className="mt-2 text-sm text-gray-500">
            This font will be applied to all text across the project.
          </p>
        </div>

        {/* Theme Colors */}
        <div className="border-t pt-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Theme Colors</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Theme Color
              </label>
              <div className="flex gap-3 items-center">
                <input
                  type="color"
                  value={settings.themeColor}
                  onChange={(e) => updateSetting('themeColor', e.target.value)}
                  className="w-16 h-12 rounded-lg bg-transparent border-gray-300 cursor-pointer focus:ring-transparent focus:border-black outline-none"
                  title="Pick theme color"
                />
                <input
                  type="text"
                  value={settings.themeColor}
                  onChange={(e) => updateSetting('themeColor', e.target.value)}
                  placeholder="#0b1014"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-transparent focus:border-black"
                />
              </div>
              <p className="mt-2 text-sm text-gray-500">
                Main theme color used throughout the application.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Theme Alt Color
              </label>
              <div className="flex gap-3 items-center">
                <input
                  type="color"
                  value={settings.themeAltColor}
                  onChange={(e) => updateSetting('themeAltColor', e.target.value)}
                  className="w-16 h-12 rounded-lg border-0 border-gray-300 bg-transparent cursor-pointer focus:ring-transparent focus:border-black outline-none"
                  title="Pick theme alt color"
                />
                <input
                  type="text"
                  value={settings.themeAltColor}
                  onChange={(e) => updateSetting('themeAltColor', e.target.value)}
                  placeholder="#ffffff"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-transparent focus:border-black outline-none"
                />
              </div>
              <p className="mt-2 text-sm text-gray-500">
                Text color when theme color is used as background.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Light Theme Color
              </label>
              <div className="flex gap-3 items-center">
                <input
                  type="color"
                  value={settings.themeLightColor}
                  onChange={(e) => updateSetting('themeLightColor', e.target.value)}
                  className="w-16 h-12 rounded-lg bg-transparent border-gray-300 cursor-pointer focus:ring-transparent focus:border-black outline-none"
                  title="Pick light theme color"
                />
                <input
                  type="text"
                  value={settings.themeLightColor}
                  onChange={(e) => updateSetting('themeLightColor', e.target.value)}
                  placeholder="#ffe7d9"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-transparent focus:border-black outline-none"
                />
              </div>
              <p className="mt-2 text-sm text-gray-500">
                Lighter variation of the theme color for backgrounds.
              </p>
            </div>
          </div>
        </div>

        {/* Primary Button Colors */}
        <div className="border-t pt-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Primary Button Colors</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Background Color
              </label>
              <div className="flex gap-3 items-center">
                <input
                  type="color"
                  value={settings.primaryButtonBg}
                  onChange={(e) => updateSetting('primaryButtonBg', e.target.value)}
                  className="w-16 h-12 rounded-lg bg-transparent border-gray-300 cursor-pointer focus:ring-transparent focus:border-black outline-none"
                  title="Pick background color"
                />
                <input
                  type="text"
                  value={settings.primaryButtonBg}
                  onChange={(e) => updateSetting('primaryButtonBg', e.target.value)}
                  placeholder="#0b1014"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-transparent focus:border-black outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Text Color
              </label>
              <div className="flex gap-3 items-center">
                <input
                  type="color"
                  value={settings.primaryButtonText}
                  onChange={(e) => updateSetting('primaryButtonText', e.target.value)}
                  className="w-16 h-12 rounded-lg bg-transparent border-gray-300 cursor-pointer focus:ring-transparent focus:border-black outline-none"
                  title="Pick text color"
                />
                <input
                  type="text"
                  value={settings.primaryButtonText}
                  onChange={(e) => updateSetting('primaryButtonText', e.target.value)}
                  placeholder="#ffffff"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-transparent focus:border-black outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hover Background Color
              </label>
              <div className="flex gap-3 items-center">
                <input
                  type="color"
                  value={settings.primaryButtonHoverBg}
                  onChange={(e) => updateSetting('primaryButtonHoverBg', e.target.value)}
                  className="w-16 h-12 rounded-lg bg-transparent border-gray-300 cursor-pointer focus:ring-transparent focus:border-black outline-none"
                  title="Pick hover background color"
                />
                <input
                  type="text"
                  value={settings.primaryButtonHoverBg}
                  onChange={(e) => updateSetting('primaryButtonHoverBg', e.target.value)}
                  placeholder="#0284c7"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-transparent focus:border-black outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hover Text Color
              </label>
              <div className="flex gap-3 items-center">
                <input
                  type="color"
                  value={settings.primaryButtonHoverText}
                  onChange={(e) => updateSetting('primaryButtonHoverText', e.target.value)}
                  className="w-16 h-12 rounded-lg bg-transparent border-gray-300 cursor-pointer focus:ring-transparent focus:border-black outline-none"
                  title="Pick hover text color"
                />
                <input
                  type="text"
                  value={settings.primaryButtonHoverText}
                  onChange={(e) => updateSetting('primaryButtonHoverText', e.target.value)}
                  placeholder="#ffffff"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-transparent focus:border-black outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Secondary Button Colors */}
        <div className="border-t pt-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Secondary Button Colors</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Background Color
              </label>
              <div className="flex gap-3 items-center">
                <input
                  type="color"
                  value={settings.secondaryButtonBg}
                  onChange={(e) => updateSetting('secondaryButtonBg', e.target.value)}
                  className="w-16 h-12 rounded-lg bg-transparent border-gray-300 cursor-pointer focus:ring-transparent focus:border-black outline-none"
                  title="Pick background color"
                />
                <input
                  type="text"
                  value={settings.secondaryButtonBg}
                  onChange={(e) => updateSetting('secondaryButtonBg', e.target.value)}
                  placeholder="#f3f4f6"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-transparent focus:border-black outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Text Color
              </label>
              <div className="flex gap-3 items-center">
                <input
                  type="color"
                  value={settings.secondaryButtonText}
                  onChange={(e) => updateSetting('secondaryButtonText', e.target.value)}
                  className="w-16 h-12 rounded-lg bg-transparent border-gray-300 cursor-pointer focus:ring-transparent focus:border-black outline-none"
                  title="Pick text color"
                />
                <input
                  type="text"
                  value={settings.secondaryButtonText}
                  onChange={(e) => updateSetting('secondaryButtonText', e.target.value)}
                  placeholder="#374151"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-transparent focus:border-black outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hover Background Color
              </label>
              <div className="flex gap-3 items-center">
                <input
                  type="color"
                  value={settings.secondaryButtonHoverBg}
                  onChange={(e) => updateSetting('secondaryButtonHoverBg', e.target.value)}
                  className="w-16 h-12 rounded-lg bg-transparent border-gray-300 cursor-pointer focus:ring-transparent focus:border-black outline-none"
                  title="Pick hover background color"
                />
                <input
                  type="text"
                  value={settings.secondaryButtonHoverBg}
                  onChange={(e) => updateSetting('secondaryButtonHoverBg', e.target.value)}
                  placeholder="#e5e7eb"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-transparent focus:border-black outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hover Text Color
              </label>
              <div className="flex gap-3 items-center">
                <input
                  type="color"
                  value={settings.secondaryButtonHoverText}
                  onChange={(e) => updateSetting('secondaryButtonHoverText', e.target.value)}
                  className="w-16 h-12 rounded-lg bg-transparent border-gray-300 cursor-pointer focus:ring-transparent focus:border-black outline-none"
                  title="Pick hover text color"
                />
                <input
                  type="text"
                  value={settings.secondaryButtonHoverText}
                  onChange={(e) => updateSetting('secondaryButtonHoverText', e.target.value)}
                  placeholder="#374151"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-transparent focus:border-black outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Active Tab Colors */}
        <div className="border-t pt-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Active Tab Colors</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Background Color
              </label>
              <div className="flex gap-3 items-center">
                <input
                  type="color"
                  value={settings.activeTabBg}
                  onChange={(e) => updateSetting('activeTabBg', e.target.value)}
                  className="w-16 h-12 rounded-lg bg-transparent border-gray-300 cursor-pointer focus:ring-transparent focus:border-black outline-none"
                  title="Pick background color"
                />
                <input
                  type="text"
                  value={settings.activeTabBg}
                  onChange={(e) => updateSetting('activeTabBg', e.target.value)}
                  placeholder="#0b1014"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-transparent focus:border-black outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Text Color
              </label>
              <div className="flex gap-3 items-center">
                <input
                  type="color"
                  value={settings.activeTabText}
                  onChange={(e) => updateSetting('activeTabText', e.target.value)}
                  className="w-16 h-12 rounded-lg bg-transparent border-gray-300 cursor-pointer focus:ring-transparent focus:border-black outline-none"
                  title="Pick text color"
                />
                <input
                  type="text"
                  value={settings.activeTabText}
                  onChange={(e) => updateSetting('activeTabText', e.target.value)}
                  placeholder="#0284c7"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-transparent focus:border-black outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between items-center pt-4 border-t gap-2">
          <button
            onClick={resetToDefaults}
            className="btn-secondary flex items-center gap-2 px-6 py-2 rounded-lg transition-colors"
          >
            <FiRefreshCw className="w-5 h-5" />
            Reset to Defaults
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex items-center gap-2 px-6 py-2 rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            style={{
              backgroundColor: saving ? undefined : 'var(--primary-button-bg)',
              color: saving ? undefined : 'var(--primary-button-text)',
            }}
            onMouseEnter={(e) => {
              if (!saving) {
                e.currentTarget.style.backgroundColor = 'var(--primary-button-hover-bg)'
                e.currentTarget.style.color = 'var(--primary-button-hover-text)'
              }
            }}
            onMouseLeave={(e) => {
              if (!saving) {
                e.currentTarget.style.backgroundColor = 'var(--primary-button-bg)'
                e.currentTarget.style.color = 'var(--primary-button-text)'
              }
            }}
          >
            <FiSave className="w-5 h-5" />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
