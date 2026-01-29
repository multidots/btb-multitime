import React from 'react'

const ProjectClient = ( { formData, handleInputChange, clients }: { formData: any, handleInputChange: any, clients: any[] } ) => {
  return (
    <div>
        <label htmlFor="clientId" className="block text-sm font-medium text-gray-700">
            Client *
        </label>
        <select
            name="clientId"
            id="clientId"
            value={formData.clientId}
            onChange={handleInputChange}
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-transparent"
        >
            <option value="">Select a client</option>
            {clients.map((client: any) => (
            <option key={client._id} value={client._id}>{client.name}</option>
            ))}
        </select>
    </div>
  )
}

export default ProjectClient