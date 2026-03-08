import { supabase } from './supabaseClient.js'

export async function getNotifications(userId) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function markNotificationRead(notificationId) {
  const { data, error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function createNotification({ userId, type, title, body, relatedId }) {
  const { data, error } = await supabase
    .from('notifications')
    .insert({ user_id: userId, type, title, body: body || null, related_id: relatedId || null })
    .select()
    .single()
  if (error) throw error
  return data
}
