import React from 'react'

export default function MainTabButton( { setActiveMainTab, activeMainTab, tab} : { setActiveMainTab: (tab: 'time' | 'detailed' | 'saved') => void, activeMainTab: 'time' | 'detailed' | 'saved', tab: 'time' | 'detailed' | 'saved' } ) {
	return (
		<button
              onClick={() => setActiveMainTab(tab)}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm capitalize ${
                activeMainTab === tab
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab}
		</button>
	)
}