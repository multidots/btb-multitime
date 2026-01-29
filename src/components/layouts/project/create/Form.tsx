import React from 'react'

const ProjectName = ( { formData, handleInputChange }: { formData: any, handleInputChange: any } ) => {
    return (
        <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Project Name *
            </label>
            <input
                type="text"
                name="name"
                id="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-transparent"
                placeholder="Enter project name"
            />
        </div>
    )
}

const ProjectCode = ( { formData, handleInputChange }: { formData: any, handleInputChange: any } ) => {
    return (
        <div>
            <label htmlFor="code" className="block text-sm font-medium text-gray-700">
                Project Code
            </label>
            <input
                type="text"
                name="code"
                id="code"
                value={formData.code}
                onChange={handleInputChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-transparent"
                placeholder="e.g., PROJ-001"
            />
        </div>
    )
}

const BillableType = ( { formData, handleInputChange }: { formData: any, handleInputChange: any } ) => {
    return (
      <div>
          <label htmlFor="billableType" className="block text-sm font-medium text-gray-700">
              Billable Type
          </label>
          <select
              name="billableType"
              id="billableType"
              value={formData.billableType}
              onChange={handleInputChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-transparent"
          >
              <option value="billable">Billable</option>
              <option value="non_billable">Non-Billable</option>
          </select>
      </div>
    )
}

const ProjectDate = ( { formData, handleInputChange }: { formData: any, handleInputChange: any } ) => {
    return (
      <>
          {/* Start Date */}
          <div>
              <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">
                  Start Date
              </label>
              <input
                  type="date"
                  name="startDate"
                  id="startDate"
                  value={formData.startDate}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-transparent"
              />
          </div>
  
          {/* End Date */}
          <div>
              <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">
                  End Date
              </label>
              <input
                  type="date"
                  name="endDate"
                  id="endDate"
                  value={formData.endDate}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-transparent"
              />
  
          </div>
      </>
    )
}

const ProjectPermission = ( { formData, handleInputChange }: { formData: any, handleInputChange: any } ) => {
	return (
		<div className="py-8">
			<label className="block text-lg font-bold text-gray-700 mb-5">
				Project Permissions
			</label>
			<div className="space-y-3">
				<div className="flex items-center">
					<input
						type="radio"
						id="permission-admin"
						name="permission"
						value="admin"
						checked={formData.permission === 'admin'}
						onChange={handleInputChange}
						className="h-4 w-4 theme-color focus:ring-transparent border-gray-300"
					/>
					<label htmlFor="permission-admin" className="ml-3 block text-sm font-medium text-gray-700">
						<div className="flex items-center">
							<svg className="w-5 h-5 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
							</svg>
							Admin & Project Managers
						</div>
						<p className="text-xs text-gray-500 mt-1">Show project report to administrators and people who manage this project</p>
					</label>
				</div>
				
				<div className="flex items-center">
					<input
						type="radio"
						id="permission-everyone"
						name="permission"
						value="everyone"
						checked={formData.permission === 'everyone'}
						onChange={handleInputChange}
						className="h-4 w-4 theme-color focus:ring-transparent border-gray-300"
					/>
					<label htmlFor="permission-everyone" className="ml-3 block text-sm font-medium text-gray-700">
						<div className="flex items-center">
							<svg className="w-5 h-5 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
							</svg>
							Everyone on Project
						</div>
						<p className="text-xs text-gray-500 mt-1">Show project report to everyone on this project</p>
					</label>
				</div>
			</div>
		</div>
	)
}

const ProjectStatus = ( { formData, handleInputChange }: { formData: any, handleInputChange: any } ) => {
    return (
      <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700">
              Status
          </label>
          <select
              name="status"
              id="status"
              value={formData.status}
              onChange={handleInputChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-transparent"
          >
              <option value="planning">Planning</option>
              <option value="active">Active</option>
              <option value="on_hold">On Hold</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
          </select>
      </div>
    )
}

const ProjectDescription = ( { formData, handleInputChange }: { formData: any, handleInputChange: any } ) => {
    return (
        <div className="py-8">
            <label htmlFor="description" className="block text-lg font-bold text-gray-700 mb-5">
            Description
            </label>
            <textarea
            name="description"
            id="description"
            value={formData.description}
            onChange={handleInputChange}
            rows={4}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-transparent"
            placeholder="Enter project description"
            />
        </div>
    )
}

const ProjectType = ( { formData, handleInputChange }: { formData: any, handleInputChange: any } ) => {
  return (
    <div className="flex items-center">
        <input
        type="checkbox"
        name="isActive"
        id="isActive"
        checked={formData.isActive}
        onChange={handleInputChange}
        className="h-4 w-4 theme-color focus:ring-transparent border-gray-300 rounded"
        />
        <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">
        Active Project
        </label>
    </div>
  )
}
  

export { ProjectName, ProjectCode, BillableType, ProjectDate, ProjectPermission, ProjectStatus, ProjectDescription, ProjectType }