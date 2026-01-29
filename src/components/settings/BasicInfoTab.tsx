'use client'

import { useState, useEffect } from 'react'
import { FiUpload, FiTrash2 } from 'react-icons/fi'
import { useSession } from 'next-auth/react'
import { urlFor } from '@/lib/sanity'
import toast from 'react-hot-toast'

interface BasicInfoTabProps {
  user: {
    id: string
    email: string
    firstName: string
    lastName: string
    role: 'admin' | 'manager' | 'user'
    rate?: number
    timezone?: string
    avatar?: any
  }
  onUpdate?: (data: any) => Promise<void> | void;
  userId?: string; // Add userId to distinguish between editing self or other user
}

export default function BasicInfoTab({ user, onUpdate, userId }: BasicInfoTabProps) {
  const { data: session, update } = useSession()
  const [profileData, setProfileData] = useState({
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    email: user.email || '',
    rate: user.rate?.toString() || '',
    timezone: user.timezone || 'America/New_York',
    role: user.role || 'user',
  })

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)

  // Check if logged-in user is admin (can see/edit rate)
  const canEditRate = session?.user?.role === 'admin'
  
  // Check if admin is editing another user (can edit email)
  const isAdminEditingOther = !!(session?.user?.role === 'admin' && userId && userId !== session?.user?.id)
  
  // Email validation - matches Sanity's built-in email validation (requires valid TLD with min 2 chars)
  const validateEmail = (email: string): boolean => {
    // Requires: local-part@domain.tld where TLD is at least 2 alphabetic characters
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/
    return emailRegex.test(email)
  }

  // Update profileData when user prop changes (after session update)
  useEffect(() => {
    setProfileData({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      email: user.email || '',
      rate: user.rate?.toString() || '',
      timezone: user.timezone || 'America/New_York',
      role: user.role || 'user',
    })
    setEmailError(null)
  }, [user.firstName, user.lastName, user.email, user.rate, user.timezone, user.role])

  const timezones = [
    { value: 'Pacific/Midway', label: '(GMT-11:00) Midway Island' },
    { value: 'Pacific/Honolulu', label: '(GMT-10:00) Hawaii' },
    { value: 'America/Anchorage', label: '(GMT-09:00) Alaska' },
    { value: 'America/Los_Angeles', label: '(GMT-08:00) Los Angeles' },
    { value: 'America/Denver', label: '(GMT-07:00) Denver' },
    { value: 'America/Phoenix', label: '(GMT-07:00) Phoenix' },
    { value: 'America/Chicago', label: '(GMT-06:00) Chicago' },
    { value: 'America/New_York', label: '(GMT-05:00) New York' },
    { value: 'America/Indianapolis', label: '(GMT-05:00) Indianapolis' },
    { value: 'America/Halifax', label: '(GMT-04:00) Halifax' },
    { value: 'America/Caracas', label: '(GMT-04:00) Caracas' },
    { value: 'America/Sao_Paulo', label: '(GMT-03:00) Sao Paulo' },
    { value: 'Atlantic/South_Georgia', label: '(GMT-02:00) South Georgia' },
    { value: 'Atlantic/Azores', label: '(GMT-01:00) Azores' },
    { value: 'Europe/London', label: '(GMT+00:00) London' },
    { value: 'Europe/Paris', label: '(GMT+01:00) Paris' },
    { value: 'Europe/Berlin', label: '(GMT+01:00) Berlin' },
    { value: 'Europe/Helsinki', label: '(GMT+02:00) Helsinki' },
    { value: 'Africa/Cairo', label: '(GMT+02:00) Cairo' },
    { value: 'Europe/Moscow', label: '(GMT+03:00) Moscow' },
    { value: 'Asia/Dubai', label: '(GMT+04:00) Dubai' },
    { value: 'Asia/Karachi', label: '(GMT+05:00) Karachi' },
    { value: 'Asia/Kolkata', label: '(GMT+05:30) New Delhi' },
    { value: 'Asia/Kathmandu', label: '(GMT+05:45) Kathmandu' },
    { value: 'Asia/Dhaka', label: '(GMT+06:00) Dhaka' },
    { value: 'Asia/Yangon', label: '(GMT+06:30) Yangon' },
    { value: 'Asia/Bangkok', label: '(GMT+07:00) Bangkok' },
    { value: 'Asia/Singapore', label: '(GMT+08:00) Singapore' },
    { value: 'Asia/Hong_Kong', label: '(GMT+08:00) Hong Kong' },
    { value: 'Asia/Tokyo', label: '(GMT+09:00) Tokyo' },
    { value: 'Asia/Seoul', label: '(GMT+09:00) Seoul' },
    { value: 'Australia/Darwin', label: '(GMT+09:30) Darwin' },
    { value: 'Australia/Sydney', label: '(GMT+10:00) Sydney' },
    { value: 'Pacific/Noumea', label: '(GMT+11:00) Noumea' },
    { value: 'Pacific/Auckland', label: '(GMT+12:00) Auckland' },
  ]

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setProfileData(prev => ({
      ...prev,
      [name]: value
    }))
    
    // Validate email on change
    if (name === 'email') {
      if (!value.trim()) {
        setEmailError('Email is required')
      } else if (!validateEmail(value)) {
        setEmailError('Please enter a valid email address')
      } else {
        setEmailError(null)
      }
    }
  }


  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file')
        return
      }

      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        alert('File size must be less than 2MB')
        return
      }

      setSelectedFile(file)

      const reader = new FileReader()
      reader.onload = (e) => {
        setAvatarPreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleRemoveAvatar = async () => {
    const endpoint = userId ? `/api/team/members/${userId}/avatar` : '/api/user/avatar';
    try {
      const response = await fetch(endpoint, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to remove avatar')
      }

      const result = await response.json()

      // If not editing another user, update the session
      if (!userId) {
        await update({
          avatar: null,
        })
      }

      setAvatarPreview(null)
      setSelectedFile(null)
      
      // Update local user state if editing another user
      if (userId && onUpdate) {
        onUpdate({ avatar: null })
      }
      
      toast.success('Avatar removed successfully!')
    } catch (error) {
      console.error('Error removing avatar:', error)
      toast.error('Error removing avatar. Please try again.')
    }
  }

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate email before submit if admin is editing another user
    if (isAdminEditingOther) {
      if (!profileData.email.trim()) {
        setEmailError('Email is required')
        return
      }
      if (!validateEmail(profileData.email)) {
        setEmailError('Please enter a valid email address')
        return
      }
    }
    
    setIsLoading(true)

    try {
      // Handle avatar upload first if there's a selected file
      let avatarData = null;
      if (selectedFile) {
        const formData = new FormData();
        formData.append('avatar', selectedFile);
        const endpoint = userId ? `/api/team/members/${userId}/avatar` : '/api/user/avatar';

        const avatarResponse = await fetch(endpoint, {
          method: 'POST',
          body: formData,
        });

        if (!avatarResponse.ok) {
          throw new Error('Failed to upload avatar');
        }

        const avatarResult = await avatarResponse.json();
        avatarData = avatarResult.avatar;
        
        // If editing another user and avatar was uploaded, update local state
        if (userId && onUpdate) {
          onUpdate({ avatar: avatarData });
        }
      }

      // Prepare the rest of the profile data
      const updateData: any = {
        firstName: profileData.firstName,
        lastName: profileData.lastName,
        rate: canEditRate && profileData.rate ? parseFloat(profileData.rate) : undefined,
        timezone: profileData.timezone,
      };

      // Only include role if user is admin (managers can't change roles)
      if (session?.user?.role === 'admin') {
        updateData.role = profileData.role;
      }

      // Include email if admin is editing another user and email has changed
      if (isAdminEditingOther && profileData.email.toLowerCase().trim() !== user.email.toLowerCase()) {
        updateData.email = profileData.email.toLowerCase().trim();
      }

      // If onUpdate is provided, call it with the profile data (parent handles API call and toasts)
      if (onUpdate) {
        // Include avatar data if it was uploaded (for updating local state)
        if (avatarData) {
          updateData.avatar = avatarData;
        }
        await onUpdate(updateData);
        // Parent component handles success/error toasts
      } else {
        // Otherwise, update the profile directly
        const profileResponse = await fetch('/api/user/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateData),
        });

        if (!profileResponse.ok) {
          throw new Error('Failed to update profile');
        }

        const profileResult = await profileResponse.json();

        // Update the session with all the new user data
        if (!userId) {
          await update({
            firstName: profileResult.user.firstName,
            lastName: profileResult.user.lastName,
            rate: profileResult.user.rate,
            timezone: profileResult.user.timezone,
            avatar: avatarData,
          });
        }
        
        toast.success('Profile updated successfully!');
      }

      // Reset avatar state
      setSelectedFile(null);
      setAvatarPreview(null);

    } catch (error) {
      console.error('Error updating profile:', error)
      // Only show error if not using onUpdate (parent handles errors for onUpdate)
      if (!onUpdate) {
        toast.error('Error updating profile. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Basic Information</h3>
        <p className="mt-1 text-sm text-gray-500">
          Update your personal information and preferences
        </p>
      </div>

      <form onSubmit={handleProfileSubmit} className="p-6 space-y-6 ">
        
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Profile Photo
            </label>
            <div className="flex items-center space-x-4">
              <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden uppercase">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Avatar preview"
                    className="w-full h-full object-cover object-top"
                  />
                ) : user.avatar ? (
                  <img
                    src={urlFor(user.avatar).fit('crop').url()}
                    alt="Current avatar"
                    className="w-full h-full object-cover object-top"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center text-white font-semibold text-lg">
                    {user.firstName?.[0]}{user.lastName?.[0]}
                  </div>
                )}
              </div>
              <div className="flex space-x-2">
                <label className="cursor-pointer bg-white py-2 px-3 border border-gray-300 rounded-md shadow-sm text-sm leading-4 font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500">
                  <FiUpload className="w-4 h-4 inline mr-1" />
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </label>
                {(avatarPreview || user.avatar) && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    className="bg-red-50 py-2 px-3 border border-red-300 rounded-md shadow-sm text-sm leading-4 font-medium text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                  >
                    <FiTrash2 className="w-4 h-4 inline mr-1" />
                    Remove
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              JPG, PNG or GIF. Max size 2MB.
            </p>
          </div>

        {/* Name Fields */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
              First Name
            </label>
            <input
              type="text"
              name="firstName"
              id="firstName"
              value={profileData.firstName}
              onChange={handleProfileChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-transparent"
              required
            />
          </div>

          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
              Last Name
            </label>
            <input
              type="text"
              name="lastName"
              id="lastName"
              value={profileData.lastName}
              onChange={handleProfileChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-transparent"
              required
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {/* Work Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Work Email
            </label>
            <input
              type="email"
              name="email"
              id="email"
              value={isAdminEditingOther ? profileData.email : user.email || ''}
              onChange={handleProfileChange}
              className={`mt-1 block w-full rounded-md shadow-sm ${
                isAdminEditingOther 
                  ? emailError 
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
                    : 'border-gray-300 focus:border-black focus:ring-transparent'
                  : 'border-gray-300 bg-gray-50 cursor-not-allowed'
              }`}
              disabled={!isAdminEditingOther}
              required={isAdminEditingOther}
            />
            {emailError && isAdminEditingOther ? (
              <p className="mt-1 text-xs text-red-500">{emailError}</p>
            ) : (
            <p className="mt-1 text-xs text-gray-500">
                {isAdminEditingOther 
                  ? "User's primary work email address" 
                  : 'Your primary work email address (cannot be changed)'}
              </p>
            )}
            {/* Warning when email is being changed */}
            {isAdminEditingOther && profileData.email && profileData.email.toLowerCase().trim() !== user.email.toLowerCase() && !emailError && (
              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-xs text-yellow-800">
                  <strong>Note:</strong> Changing this email will require the user to sign in with a Google account that uses the new email address.
                </p>
              </div>
            )}
          </div>

          {/* Rate Field (Admin only) */}
          <div>
            <label htmlFor="rate" className="block text-sm font-medium text-gray-700">
              Hourly Rate ($)
            </label>
            <input
              type="number"
              name="rate"
              id="rate"
              value={profileData.rate}
              onChange={handleProfileChange}
              min="0"
              step="0.01"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-transparent"
              placeholder="0.00"
              disabled={!canEditRate}
            />
            <p className="mt-1 text-xs text-gray-500">
              Your hourly billing rate (editable to admins only)
            </p>
          </div>

          {/* Timezone */}
          <div>
            <label htmlFor="timezone" className="block text-sm font-medium text-gray-700">
              Timezone
            </label>
            <select
              name="timezone"
              id="timezone"
              value={profileData.timezone}
              onChange={handleProfileChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-transparent"
            >
              {timezones.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Used for time tracking and report generation
            </p>
          </div>
        </div>

        {/* Submit Button and Role Display */}
        <div className="flex justify-between items-center pt-4 border-t border-gray-200">
          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary px-4 py-2 text-sm font-semibold rounded-md hover:bg-blue-700"
          >
            {isLoading ? 'Updating...' : 'Update Profile'}
          </button>
        </div>

      </form>
    </div>
  )
}
