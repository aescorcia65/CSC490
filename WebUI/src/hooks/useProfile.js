import { useState, useEffect, useCallback } from 'react'
import { getProfile, upsertProfile } from '../lib/profile.js'

export function useProfile(userId) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(!!userId)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      const data = await getProfile(userId)
      setProfile(data)
    } catch (e) {
      setError(e)
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setLoading(false)
      return
    }
    refetch()
  }, [userId, refetch])

  const saveProfile = useCallback(
    async (updates) => {
      if (!userId) throw new Error('Not authenticated')
      setError(null)
      const data = await upsertProfile(userId, updates)
      setProfile(data)
      return data
    },
    [userId]
  )

  return { profile, loading, error, refetch, saveProfile }
}
