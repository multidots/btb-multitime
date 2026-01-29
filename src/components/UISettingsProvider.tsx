'use client'

import { useEffect, useState } from 'react'

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

export function UISettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<UISettings | null>(null)
  const [fontLoaded, setFontLoaded] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState(0)

  // Preload Google Fonts connections on mount
  useEffect(() => {
    // Add preconnect links for faster font loading
    const preconnectGoogle = document.createElement('link')
    preconnectGoogle.rel = 'preconnect'
    preconnectGoogle.href = 'https://fonts.googleapis.com'
    document.head.appendChild(preconnectGoogle)

    const preconnectGstatic = document.createElement('link')
    preconnectGstatic.rel = 'preconnect'
    preconnectGstatic.href = 'https://fonts.gstatic.com'
    preconnectGstatic.crossOrigin = 'anonymous'
    document.head.appendChild(preconnectGstatic)

    return () => {
      preconnectGoogle.remove()
      preconnectGstatic.remove()
    }
  }, [])

  useEffect(() => {
    fetchUISettings()
  }, [])

  useEffect(() => {
    if (settings) {
      applyUISettings(settings)
    }
  }, [settings])

  // Set ready state when font is loaded
  useEffect(() => {
    if (fontLoaded && settings) {
      setIsReady(true)
    }
  }, [fontLoaded, settings])

  // Fallback timeout to prevent infinite loading state
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isReady && settings) {
        setFontLoaded(true)
        setIsReady(true)
      }
    }, 3000) // 3 second max wait time

    return () => clearTimeout(timeout)
  }, [isReady, settings])

  // Animated loading progress
  useEffect(() => {
    if (isReady) {
      setLoadingProgress(100)
      return
    }

    const interval = setInterval(() => {
      setLoadingProgress((prev) => {
        if (prev < 30) {
          return prev + Math.random() * 8 + 4
        } else if (prev < 60) {
          return prev + Math.random() * 4 + 2
        } else if (prev < 85) {
          return prev + Math.random() * 2 + 0.5
        } else if (prev < 95) {
          return prev + Math.random() * 0.5
        }
        return prev
      })
    }, 50)

    return () => clearInterval(interval)
  }, [isReady])


  const fetchUISettings = async () => {
    try {
      const response = await fetch('/api/ui-settings')
      const data = await response.json()
      setSettings(data)
    } catch (error) {
      console.error('Error fetching UI settings:', error)
      // Use defaults
      setSettings({
        fontFamily: 'Inter',
        themeColor: '#0b1014',
        themeAltColor: '#ffffff',
        themeLightColor: '#ffffff',
        primaryButtonBg: '#0b1014',
        primaryButtonText: '#ffffff',
        primaryButtonHoverBg: '#0b1014',
        primaryButtonHoverText: '#ffffff',
        secondaryButtonBg: '#0b1014',
        secondaryButtonText: '#ffffff',
        secondaryButtonHoverBg: '#0b1014',
        secondaryButtonHoverText: '#ffffff',
        activeTabBg: '#ffffff33',
        activeTabText: '#ffffff',
      })
    }
  }

  const applyUISettings = (uiSettings: UISettings) => {
    const root = document.documentElement
    const body = document.body

    // Apply font family
    if (uiSettings.fontFamily) {
      const fontName = uiSettings.fontFamily.toLowerCase().replace(/\s+/g, '-')
      const fontFamilyValue = `'${uiSettings.fontFamily}', system-ui, sans-serif`
      
      root.style.setProperty('--font-family', uiSettings.fontFamily)
      root.style.setProperty('--font-family-fallback', fontFamilyValue)
      
      // Load Google Font if needed (font will be applied after loading)
      if (['inter', 'roboto', 'open-sans', 'lato', 'montserrat', 'poppins', 'raleway', 'source-sans-pro', 'nunito', 'work-sans'].includes(fontName)) {
        loadGoogleFont(fontName, uiSettings.fontFamily, fontFamilyValue)
      } else {
        // For system fonts, apply immediately
        body.style.fontFamily = fontFamilyValue
        setFontLoaded(true)
      }
    } else {
      setFontLoaded(true)
    }

    // Apply theme colors
    root.style.setProperty('--theme-color', uiSettings.themeColor)
    root.style.setProperty('--theme-alt-color', uiSettings.themeAltColor)
    root.style.setProperty('--theme-light-color', uiSettings.themeLightColor)
    
    // Apply button and tab colors
    root.style.setProperty('--primary-button-bg', uiSettings.primaryButtonBg)
    root.style.setProperty('--primary-button-text', uiSettings.primaryButtonText)
    root.style.setProperty('--primary-button-hover-bg', uiSettings.primaryButtonHoverBg)
    root.style.setProperty('--primary-button-hover-text', uiSettings.primaryButtonHoverText)
    
    root.style.setProperty('--secondary-button-bg', uiSettings.secondaryButtonBg)
    root.style.setProperty('--secondary-button-text', uiSettings.secondaryButtonText)
    root.style.setProperty('--secondary-button-hover-bg', uiSettings.secondaryButtonHoverBg)
    root.style.setProperty('--secondary-button-hover-text', uiSettings.secondaryButtonHoverText)
    
    root.style.setProperty('--active-tab-bg', uiSettings.activeTabBg)
    root.style.setProperty('--active-tab-text', uiSettings.activeTabText)
  }

  const loadGoogleFont = async (fontName: string, fontFamily: string, fontFamilyValue: string) => {
    const body = document.body
    
    // Check if font is already loaded
    const existingLink = document.querySelector(`link[href*="${fontName}"]`)
    if (existingLink) {
      body.style.fontFamily = fontFamilyValue
      setFontLoaded(true)
      return
    }

    // Map font names to Google Fonts format
    const fontMap: Record<string, string> = {
      'inter': 'Inter',
      'roboto': 'Roboto',
      'open-sans': 'Open+Sans',
      'lato': 'Lato',
      'montserrat': 'Montserrat',
      'poppins': 'Poppins',
      'raleway': 'Raleway',
      'source-sans-pro': 'Source+Sans+Pro',
      'nunito': 'Nunito',
      'work-sans': 'Work+Sans',
    }

    const googleFontName = fontMap[fontName] || fontName.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('+')
    const fontUrl = `https://fonts.googleapis.com/css2?family=${googleFontName}:wght@400;500;600;700&display=block`

    // Add preload link for faster loading
    const preloadLink = document.createElement('link')
    preloadLink.rel = 'preload'
    preloadLink.as = 'style'
    preloadLink.href = fontUrl
    document.head.appendChild(preloadLink)

    // Add the stylesheet
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = fontUrl
    document.head.appendChild(link)

    // Wait for font to be ready using Font Loading API
    try {
      await document.fonts.ready
      // Check if the specific font is loaded
      if (document.fonts.check(`16px "${fontFamily}"`)) {
        body.style.fontFamily = fontFamilyValue
        setFontLoaded(true)
      } else {
        // Fallback: wait a bit and try again
        setTimeout(() => {
          body.style.fontFamily = fontFamilyValue
          setFontLoaded(true)
        }, 100)
      }
    } catch {
      // Fallback for browsers that don't support Font Loading API
      link.onload = () => {
        body.style.fontFamily = fontFamilyValue
        setFontLoaded(true)
      }
    }
  }

  // Show loading screen until font and settings are ready
  if (!isReady) {
    const displayProgress = Math.min(Math.round(loadingProgress), 100)
    
    return (
      <div 
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#ffffff',
          zIndex: 9999,
        }}
      >
        {/* Progress bar */}
        <div 
          style={{ 
            width: '200px', 
            height: '4px', 
            backgroundColor: '#e5e7eb',
            borderRadius: '2px',
            overflow: 'hidden',
          }}
        >
          <div 
            style={{ 
              width: `${displayProgress}%`, 
              height: '100%', 
              backgroundColor: '#111827',
              borderRadius: '2px',
              transition: 'width 0.1s ease-out',
            }}
          />
        </div>
      </div>
    )
  }

  return <>{children}</>
}
