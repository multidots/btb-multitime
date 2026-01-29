import React from 'react'

export default function SubTabButton( { setActiveSubTab, activeSubTab, tab } : { setActiveSubTab: (tab: 'clients' | 'projects' | 'tasks' | 'team') => void, activeSubTab: 'clients' | 'projects' | 'tasks' | 'team', tab: 'clients' | 'projects' | 'tasks' | 'team' } ) {
	return (
		<button
			onClick={() => setActiveSubTab(tab)}
			className={`px-4 py-2 text-sm font-medium capitalize ${
				activeSubTab === tab
					? 'border-b-2 theme-color theme-color-border active-sub-tab'
					: 'text-gray-500 hover:theme-color'
			}`}
		>
			{tab}
		</button>
	)
}