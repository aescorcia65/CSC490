import { supabase } from './supabaseClient.js'

/**
 * Fetch the current user's profile. Requires auth.
 */
export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Create or update the current user's profile. Requires auth.
 */
export async function upsertProfile(userId, profile) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      { id: userId, ...profile, updated_at: new Date().toISOString() },
      { onConflict: 'id' }
    )
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Look up profile by email (e.g. for doctors to find patient). Requires auth.
 */
export async function getProfileByEmail(email) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email, role')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()
  if (error) throw error
  return data
}
