import { useEffect } from "react";
import { supabase } from "../supabase";
import {
  loadMessageNotifSettings,
  playMessageNotificationSound,
  shouldPlayNotificationCategory,
  notificationRowSoundCategory,
} from "../lib/messageNotificationSettings";
import { loadPatientMessagingSoundSettings, playPatientInboundChimeDeduped } from "../lib/patientMessagingSounds";

/**
 * In-app sounds for inbound patient_messages and notifications (while app is open).
 * Message chimes require a prior tap/keypress on the app (see PatientDashboard audio unlock).
 */
export function usePatientInboundSounds(userId) {
  useEffect(() => {
    if (!userId) return;

    const ch1 = supabase
      .channel(`pt-inbound-pm-snd-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "patient_messages" },
        async ({ new: row }) => {
          if (!row?.sender_id || row.recipient_id !== userId || row.sender_id === userId) return;
          const st = loadPatientMessagingSoundSettings();
          if (!st.enabled) return;
          await playPatientInboundChimeDeduped(row.id, st.preset, st.volume);
        }
      )
      .subscribe();

    const ch2 = supabase
      .channel(`pt-inbound-notif-snd-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        ({ new: row }) => {
          if (!row || row.user_id !== userId) return;
          const st = loadMessageNotifSettings();
          const cat = notificationRowSoundCategory(row);
          if (!shouldPlayNotificationCategory(st, cat)) return;
          playMessageNotificationSound(st.soundId, st.volume);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
  }, [userId]);
}
