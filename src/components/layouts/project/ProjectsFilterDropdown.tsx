import React from 'react'

const ProjectsFilterDropdown = ( {selectedProjectName, projectSearchTerm, setProjectSearchTerm, handleProjectSelect, filteredProjectsForSearch, isProjectDropdownOpen, setIsProjectDropdownOpen} : {selectedProjectName: string, projectSearchTerm: string, setProjectSearchTerm: (value: string) => void, handleProjectSelect: (projectId: string) => void, filteredProjectsForSearch: any[], isProjectDropdownOpen: boolean, setIsProjectDropdownOpen: (value: boolean) => void} ) => {
	
	return (
		<div>
			<label htmlFor="project" className="block text-sm font-medium text-gray-700">Project</label>
                                
			{/* Custom Project Dropdown with Search */}
			<div className="relative mt-1 project-dropdown">
			<button
				type="button"
				onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
				className="relative w-full bg-white border border-gray-300 rounded-md shadow-sm pl-3 pr-10 py-2 text-left cursor-default focus:outline-none focus:ring-1 focus:ring-transparent focus:border-black"
			>
				<span className="block truncate">{selectedProjectName}</span>
				<span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
					<svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
						<path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
					</svg>
				</span>
			</button>

			{isProjectDropdownOpen && (
				<div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none">
				{/* Search Input at the top */}
				<div className="px-3 py-2 border-b border-gray-200 sticky top-0 bg-white z-20">
					<input
					type="text"
					placeholder="Search projects..."
					value={projectSearchTerm}
					onChange={(e) => setProjectSearchTerm(e.target.value)}
					className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-transparent focus:border-black"
					onClick={(e) => e.stopPropagation()}
					autoFocus
					/>
				</div>

				{/* All Projects Option */}
				<div
					className="cursor-pointer select-none relative py-2 pl-3 pr-9"
					onClick={() => handleProjectSelect('')}
				>
					<span className="font-medium text-gray-900">All Projects ({filteredProjectsForSearch.length})</span>
				</div>

				{/* Active Projects */}
				{filteredProjectsForSearch.filter((project: any) => project.status === 'active').length > 0 && (
					<>
					<div className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-100 border-t border-gray-200">
						Active Projects ({filteredProjectsForSearch.filter((project: any) => project.status === 'active').length})
					</div>
					{filteredProjectsForSearch.filter((project: any) => project.status === 'active').map((project: any) => (
						<div
						key={project._id}
						className="cursor-pointer select-none relative py-2 pl-6 pr-9 hover:bg-black hover:text-white"
						onClick={() => handleProjectSelect(project._id)}
						>
						<span className="block truncate capitalize">{project.name}</span>
						</div>
					))}
					</>
				)}

				{/* Planning Projects */}
				{filteredProjectsForSearch.filter((project: any) => project.status === 'planning').length > 0 && (
					<>
					<div className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-100 border-t border-gray-200">
						Planning Projects ({filteredProjectsForSearch.filter((project: any) => project.status === 'planning').length})
					</div>
					{filteredProjectsForSearch.filter((project: any) => project.status === 'planning').map((project: any) => (
						<div
						key={project._id}
						className="cursor-pointer select-none relative py-2 pl-6 pr-9 hover:bg-black hover:text-white"
						onClick={() => handleProjectSelect(project._id)}
						>
						<span className="block truncate capitalize hover:text-white">{project.name}</span>
						</div>
					))}
					</>
				)}

				{/* On Hold Projects */}
				{filteredProjectsForSearch.filter((project: any) => project.status === 'on_hold').length > 0 && (
					<>
					<div className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-100 border-t border-gray-200">
						On Hold Projects ({filteredProjectsForSearch.filter((project: any) => project.status === 'on_hold').length})
					</div>
					{filteredProjectsForSearch.filter((project: any) => project.status === 'on_hold').map((project: any) => (
						<div
						key={project._id}
						className="cursor-pointer select-none relative py-2 pl-6 pr-9 hover:bg-black hover:text-white"
						onClick={() => handleProjectSelect(project._id)}
						>
						<span className="block truncate capitalize hover:text-white">{project.name}</span>
						</div>
					))}
					</>
				)}

				{/* Completed Projects */}
				{filteredProjectsForSearch.filter((project: any) => project.status === 'completed').length > 0 && (
					<>
					<div className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-100 border-t border-gray-200">
						Completed Projects ({filteredProjectsForSearch.filter((project: any) => project.status === 'completed').length})
					</div>
					{filteredProjectsForSearch.filter((project: any) => project.status === 'completed').map((project: any) => (
						<div
						key={project._id}
						className="cursor-pointer select-none relative py-2 pl-6 pr-9 hover:bg-black hover:text-white"
						onClick={() => handleProjectSelect(project._id)}
						>
						<span className="block truncate capitalize hover:text-white">{project.name}</span>
						</div>
					))}
					</>
				)}

				{/* Cancelled Projects */}
				{filteredProjectsForSearch.filter((project: any) => project.status === 'cancelled').length > 0 && (
					<>
					<div className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-100 border-t border-gray-200">
						Cancelled Projects ({filteredProjectsForSearch.filter((project: any) => project.status === 'cancelled').length})
					</div>
					{filteredProjectsForSearch.filter((project: any) => project.status === 'cancelled').map((project: any) => (
						<div
						key={project._id}
						className="cursor-pointer select-none relative py-2 pl-6 pr-9 hover:bg-black hover:text-white"
						onClick={() => handleProjectSelect(project._id)}
						>
						<span className="block truncate capitalize hover:text-white">{project.name}</span>
						</div>
					))}
					</>
				)}

				{/* No results */}
				{filteredProjectsForSearch.length === 0 && (
					<div className="px-3 py-2 text-sm text-gray-500 text-center">
					No projects found
					</div>
				)}
				</div>
			)}
			</div>
		</div>
	)
}

export default ProjectsFilterDropdown