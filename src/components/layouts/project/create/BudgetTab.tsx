import React, { useState, useEffect, useRef } from 'react'
import { formatSimpleTime } from '@/lib/time'

const BudgetTab = ({ formData, setFormData, handleInputChange }: { formData: any, setFormData: any, handleInputChange: any }) => {
    const [timeAndMaterialsSelected, setTimeAndMaterialsSelected] = useState(false);
    const [timeAndMaterialsBudgetType, setTimeAndMaterialsBudgetType] = useState('no-budget');
    const [timeAndMaterialsBudgetValue, setTimeAndMaterialsBudgetValue] = useState('');
    const [fixedFeeSelected, setFixedFeeSelected] = useState(false);
    const [fixedFeeBudgetType, setFixedFeeBudgetType] = useState('no-budget');
    const [fixedFeeBudgetValue, setFixedFeeBudgetValue] = useState('');
    const previousProjectTypeRef = useRef<string | null>(null);
    const isInitialMount = useRef(true);
    const formDataInitializedRef = useRef(false);

    // Normalize H:MM format or decimal format - convert decimal to H:MM and normalize minutes >= 60 to hours
    const normalizeTimeInput = (input: string): string | null => {
        if (!input || input.trim() === '') return null

        // Check for decimal format (e.g., "2.2")
        const decimalMatch = input.match(/^(\d*\.?\d+)$/)
        if (decimalMatch) {
            const decimalValue = parseFloat(decimalMatch[1])
            if (isNaN(decimalValue) || decimalValue < 0 || decimalValue > 24) {
                return null // Invalid range
            }

            // Convert decimal to H:MM
            const hours = Math.floor(decimalValue)
            const minutes = Math.round((decimalValue - hours) * 60)

            // Return normalized format
            return `${hours}:${minutes.toString().padStart(2, '0')}`
        }

        // Check for H:MM format
        const timeMatch = input.match(/^(\d+):(\d+)$/)
        if (timeMatch) {
            let hours = parseInt(timeMatch[1], 10)
            let minutes = parseInt(timeMatch[2], 10)

            // Convert excess minutes to hours
            if (minutes >= 60) {
                const additionalHours = Math.floor(minutes / 60)
                hours += additionalHours
                minutes = minutes % 60
            }

            // Return normalized format
            return `${hours}:${minutes.toString().padStart(2, '0')}`
        }

        return null
    }

    // Convert H:MM format to decimal hours
    const parseTimeInput = (input: string): number | null => {
        if (!input || input.trim() === '') return null
        
        // First normalize the input (handle minutes >= 60)
        const normalized = normalizeTimeInput(input)
        if (!normalized) return null
        
        // Parse the normalized input
        const timeMatch = normalized.match(/^(\d+):(\d{2})$/)
        if (timeMatch) {
            const hours = parseInt(timeMatch[1], 10)
            const minutes = parseInt(timeMatch[2], 10)
            return hours + (minutes / 60)
        }
        
        return null
    }

    /**
     * Initialize state from formData on mount (for editing projects)
     * Set the budget values from the formData on mount
     */
    useEffect(() => {
        if (!formDataInitializedRef.current && formData.totalProjectHours) {
            const isTimeAndMaterials = formData.projectType === 'timeAndMaterials';
            const isFixedFee = formData.projectType === 'fixedFee';
            
            // Convert decimal hours to H:MM format for display
            const hoursInDecimal = typeof formData.totalProjectHours === 'string' 
                ? parseFloat(formData.totalProjectHours) 
                : formData.totalProjectHours;
            const hoursDisplay = hoursInDecimal ? formatSimpleTime(hoursInDecimal) : '';
            
            if (isTimeAndMaterials) {
                setTimeAndMaterialsBudgetValue(hoursDisplay);
            }
            if (isFixedFee) {
                setFixedFeeBudgetValue(hoursDisplay);
            }
            
            formDataInitializedRef.current = true;
        }
    }, [formData.totalProjectHours, formData.projectType]);

    // Update state when project type or budget type changes
    /**
     * Update state when project type or budget type changes
     * Set the budget type from the formData when project type or budget type changes
     */
    useEffect(() => {
        const isTimeAndMaterials = formData.projectType === 'timeAndMaterials';
        const isFixedFee = formData.projectType === 'fixedFee';
        const currentProjectType = formData.projectType;
        
        setTimeAndMaterialsSelected(isTimeAndMaterials);
        setFixedFeeSelected(isFixedFee);

        // Update budget types
        if (isTimeAndMaterials) {
            setTimeAndMaterialsBudgetType(formData.budgetType || 'no-budget');
        }
        if (isFixedFee) {
            setFixedFeeBudgetType(formData.budgetType || 'no-budget');
        }

        // Update ref
        previousProjectTypeRef.current = currentProjectType;
        if (isInitialMount.current) {
            isInitialMount.current = false;
        }
    }, [formData.projectType, formData.budgetType]);

    // Sync active project type's budget value to formData (convert H:MM to decimal)
    useEffect(() => {
        if (formData.projectType === 'timeAndMaterials') {
            const decimalHours = parseTimeInput(timeAndMaterialsBudgetValue);
            setFormData((prev: any) => ({ ...prev, totalProjectHours: decimalHours !== null ? decimalHours.toString() : '' }));
        } else if (formData.projectType === 'fixedFee') {
            const decimalHours = parseTimeInput(fixedFeeBudgetValue);
            setFormData((prev: any) => ({ ...prev, totalProjectHours: decimalHours !== null ? decimalHours.toString() : '' }));
        }
    }, [timeAndMaterialsBudgetValue, fixedFeeBudgetValue, formData.projectType]);

    // Custom handlers for Time & Materials budget value
    const handleTimeAndMaterialsBudgetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setTimeAndMaterialsBudgetValue(value);
        // formData will be updated by the useEffect that syncs active project type
    };

    const handleTimeAndMaterialsBudgetBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        const input = e.target.value;
        if (input && input.trim() !== '') {
            const normalized = normalizeTimeInput(input);
            if (normalized) {
                setTimeAndMaterialsBudgetValue(normalized);
            } else {
                // Invalid format, clear or show error
                setTimeAndMaterialsBudgetValue('');
            }
        }
    };

    // Custom handlers for Fixed Fee budget value
    const handleFixedFeeBudgetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setFixedFeeBudgetValue(value);
        // formData will be updated by the useEffect that syncs active project type
    };

    const handleFixedFeeBudgetBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        const input = e.target.value;
        if (input && input.trim() !== '') {
            const normalized = normalizeTimeInput(input);
            if (normalized) {
                setFixedFeeBudgetValue(normalized);
            } else {
                // Invalid format, clear or show error
                setFixedFeeBudgetValue('');
            }
        }
    };

    return (
        <div className="py-8">
            {/* Project Type Tabs */}
            <div>
                <label className="block text-lg font-bold text-gray-700 mb-5">
                Project Type
                </label>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {/* Time & Materials Tab */}
                <div 
                    className={`border rounded-lg p-2 cursor-pointer transition-all ${
                    formData.projectType === 'timeAndMaterials' 
                        ? 'theme-light-color-bg theme-color-border' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setFormData((prev: any) => ({ ...prev, projectType: 'timeAndMaterials' }))}
                >
                    <div className="text-center">
                    <div className={`text-lg font-semibold mb-1`}>
                        Time & Materials
                    </div>
                    <div className="text-sm text-gray-600">
                        Bill by the hour, with billable rates
                    </div>
                    </div>
                </div>

                {/* Fixed Fee Tab */}
                <div 
                    className={`border rounded-lg p-2 cursor-pointer transition-all ${
                    formData.projectType === 'fixedFee' 
                        ? 'theme-light-color-bg theme-color-border' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setFormData((prev: any) => ({ ...prev, projectType: 'fixedFee' }))}

                >
                    <div className="text-center">
                    <div className={`text-lg font-semibold mb-1`}>
                        Fixed Fee
                    </div>
                    <div className="text-sm text-gray-600">
                        Bill a set price, regardless of time tracked
                    </div>
                    </div>
                </div>

                {/* Non-Billable Tab */}
                <div 
                    className={`border hidden rounded-lg p-2 opacity-50 cursor-not-allowed transition-all ${
                    formData.projectType === 'nonBillable' 
                        ? 'theme-light-color-bg theme-color-border' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    // onClick={() => setFormData((prev: any) => ({ ...prev, projectType: 'nonBillable' }))}
                >
                    <div className="text-center">
                    <div className={`text-lg font-semibold mb-1`}>
                        Non-Billable
                    </div>
                    <div className="text-sm text-gray-600">
                        Not billed to a client
                    </div>
                    </div>
                </div>
                </div>
            </div>

            {/* Budget Section for Time & Materials */}
            {formData.projectType === 'timeAndMaterials' && (
                <div className="border bg-[#fff8f1] border-[#ffc4a2] rounded-lg p-4 mt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Budget - Time & Materials</h3>
                <p className="text-sm text-gray-600 mb-4">Set a budget to track project progress for Time & Materials projects.</p>
                
                <div className="space-y-4">
                    {/* Budget Type Selection */}
                    <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Budget Type
                    </label>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div 
                        className={`border rounded-lg p-3 cursor-pointer transition-all ${
                            formData.budgetType === 'no-budget' 
                            ? 'theme-color-border theme-light-color-bg' 
                            : 'border-black hover:theme-color-border'
                        }`}
                        onClick={() => setFormData((prev: any) => ({ ...prev, budgetType: 'no-budget' }))}
                        >
                        <div className="text-center">
                            <div className="font-medium text-gray-900">No Budget</div>
                        </div>
                        </div>
                        <div 
                        className={`border rounded-lg p-3 cursor-pointer transition-all ${
                            formData.budgetType === 'total-project-hours' 
                            ? 'theme-color-border theme-light-color-bg' 
                            : 'border-black hover:theme-color-border'
                        }`}
                        onClick={() => setFormData((prev: any) => ({ ...prev, budgetType: 'total-project-hours' }))}
                        >
                        <div className="text-center">
                            <div className="font-medium text-gray-900">Total Project Hours</div>
                        </div>
                        </div>
                    </div>
                    </div>

                    {/* Total Project Hours - Only show when "Total Project Hours" is selected */}
                    {formData.budgetType === 'total-project-hours' && (
                    <div>
                        <label htmlFor="totalProjectHours" className="block text-sm font-medium text-gray-700">
                        Total Project Hours (decimal or H:MM format)
                        </label>
                        <input
                        type="text"
                        name="totalProjectHours"
                        id="totalProjectHours"
                        value={timeAndMaterialsBudgetValue || ''}
                        onChange={handleTimeAndMaterialsBudgetChange}
                        onBlur={handleTimeAndMaterialsBudgetBlur}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-transparent"
                        placeholder="e.g., 8.5 or 8:30"
                        />
                        <p className="mt-1 text-sm text-gray-500">Enter time in decimal (e.g., 8.5 for 8 hours 30 minutes) or H:MM format (e.g., 8:30)</p>
                    </div>
                    )}
                </div>
                </div>
            )}

            {/* Budget Section for Fixed Fee */}
            {formData.projectType === 'fixedFee' && (
                <div className="border rounded-lg p-4 bg-[#fcf2ed] theme-color-border mt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Budget - Fixed Fee</h3>
                <p className="text-sm text-gray-600 mb-4">Set a budget to track project progress for Fixed Fee projects.</p>
                
                <div className="space-y-4">
                    {/* Budget Type Selection */}
                    <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Budget Type
                    </label>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div 
                        className={`border rounded-lg p-3 cursor-pointer transition-all ${
                            formData.budgetType === 'no-budget' 
                            ? 'theme-color-border theme-light-color-bg' 
                            : 'border-black hover:theme-color-border'
                        }`}
                        onClick={() => setFormData((prev: any) => ({ ...prev, budgetType: 'no-budget' }))}
                        >
                        <div className="text-center">
                            <div className="font-medium text-gray-900">No Budget</div>
                        </div>
                        </div>
                        <div 
                        className={`border rounded-lg p-3 cursor-pointer transition-all ${
                            formData.budgetType === 'total-project-hours' 
                            ? 'theme-color-border theme-light-color-bg' 
                            : 'border-black hover:theme-color-border'
                        }`}
                        onClick={() => setFormData((prev: any) => ({ ...prev, budgetType: 'total-project-hours' }))}
                        >
                        <div className="text-center">
                            <div className="font-medium text-gray-900">Total Project Hours</div>
                        </div>
                        </div>
                    </div>
                    </div>

                    {/* Total Project Hours - Only show when "Total Project Hours" is selected */}
                    {formData.budgetType === 'total-project-hours' && (
                    <div>
                        <label htmlFor="totalProjectHours" className="block text-sm font-medium text-gray-700">
                        Total Project Hours (decimal or H:MM format)
                        </label>
                        <input
                        type="text"
                        name="totalProjectHours"
                        id="totalProjectHours"
                        value={fixedFeeBudgetValue || ''}
                        onChange={handleFixedFeeBudgetChange}
                        onBlur={handleFixedFeeBudgetBlur}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-transparent"
                        placeholder="e.g., 8.5 or 8:30"
                        />
                        <p className="mt-1 text-sm text-gray-500">Enter time in decimal (e.g., 8.5 for 8 hours 30 minutes) or H:MM format (e.g., 8:30)</p>
                    </div>
                    )}
                </div>
                </div>
            )}
        </div>
    )
}

export default BudgetTab;