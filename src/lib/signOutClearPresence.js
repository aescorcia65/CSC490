import { supabase } from "../supabase";

/**
 * Mark user offline in user_presence (so others see Offline), then sign out.
 * Plain supabase.auth.signOut() leaves is_online true until the tab closes.
 */
export async function signOutClearPresence(userId) {
  if (userId) {
    await supabase.from("user_presence").upsert(
      { user_id: userId, is_online: false, last_seen: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  }
  await supabase.auth.signOut();
}
