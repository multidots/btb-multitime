'use client'

import { useState, useEffect, useCallback } from 'react'

interface UseDataFetcherOptions {
  refetchOnMount?: boolean
}

export function useDataFetcher<T>(
  fetcher: () => Promise<T>,
  options: UseDataFetcherOptions = {}
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { refetchOnMount = true } = options

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const result = await fetcher()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }, [fetcher])

  useEffect(() => {
    if (refetchOnMount) {
      fetchData()
    }
  }, [fetchData, refetchOnMount])

  const refetch = useCallback(() => {
    fetchData()
  }, [fetchData])

  return {
    data,
    loading,
    error,
    refetch
  }
}
