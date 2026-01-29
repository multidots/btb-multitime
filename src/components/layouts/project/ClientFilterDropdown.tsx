import React from 'react'
import { Client } from '@/types'

const ClientFilterDropdown = ( {
    selectedClientName, 
    clientSearchTerm, 
    setClientSearchTerm, 
    handleClientSelect, 
    filteredClientsForSearch, 
    isClientDropdownOpen, 
    setIsClientDropdownOpen
} : {
    selectedClientName: string, 
    clientSearchTerm: string, 
    setClientSearchTerm: (value: string) => void, 
    handleClientSelect: (clientId: string) => void, 
    filteredClientsForSearch: Client[], 
    isClientDropdownOpen: boolean, 
    setIsClientDropdownOpen: (value: boolean) => void
} ) => {
	
	return (
		<div>
			<label htmlFor="client" className="block text-sm font-medium text-gray-700">Client</label>
                                
			{/* Custom Client Dropdown with Search */}
			<div className="relative mt-1 client-dropdown">
			<button
				type="button"
				onClick={() => setIsClientDropdownOpen(!isClientDropdownOpen)}
				className="relative w-full bg-white border border-gray-300 rounded-md shadow-sm pl-3 pr-10 py-2 text-left cursor-default focus:outline-none focus:ring-1 focus:ring-transparent focus:border-black"
			>
				<span className="block truncate">{selectedClientName}</span>
				<span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
					<svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
						<path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
					</svg>
				</span>
			</button>

			{isClientDropdownOpen && (
				<div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none">
				{/* Search Input at the top */}
				<div className="px-3 py-2 border-b border-gray-200 sticky top-0 bg-white z-20">
					<input
					type="text"
					placeholder="Search clients..."
					value={clientSearchTerm}
					onChange={(e) => setClientSearchTerm(e.target.value)}
					className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-transparent focus:border-black"
					onClick={(e) => e.stopPropagation()}
					autoFocus
					/>
				</div>

				{/* All Clients Option */}
				<div
					className="cursor-pointer select-none relative py-2 pl-3 pr-9"
					onClick={() => handleClientSelect('')}
				>
					<span className="font-medium text-gray-900">All Clients ({filteredClientsForSearch.length})</span>
				</div>

				{/* Client List */}
				{filteredClientsForSearch.map((client: any) => (
					<div
					key={client._id}
					className="cursor-pointer select-none relative py-2 pl-6 pr-9 hover:bg-black hover:text-white"
					onClick={() => handleClientSelect(client._id)}
					>
					<span className="block truncate capitalize">{client.name}</span>
					</div>
				))}

				{/* No results */}
				{filteredClientsForSearch.length === 0 && (
					<div className="px-3 py-2 text-sm text-gray-500 text-center">
					No clients found
					</div>
				)}
				</div>
			)}
			</div>
		</div>
	)
}

export default ClientFilterDropdown