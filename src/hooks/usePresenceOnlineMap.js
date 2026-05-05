import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import {
  PRESENCE_MAX_AGE_MS,
  PRESENCE_STALE_REFRESH_MS,
  presenceRowsToOnlineMap,
  subscribeSelfPresenceHeartbeat,
} from "../lib/presenceLogic";

/** Shared online map keyed by peer user id — only true when last_seen / is_online look fresh enough. */
export function usePresenceOnlineMap(userId) {
  const [onlineUsers, setOnlineUsers] = useState({});
  const rowsRef = useRef({});

  useEffect(() => {
    rowsRef.current = {};
    setOnlineUsers({});

    if (!userId) return undefined;

    function mergeRow(row) {
      if (!row?.user_id) return;
      rowsRef.current = { ...rowsRef.current, [row.user_id]: row };
      setOnlineUsers(presenceRowsToOnlineMap(Object.values(rowsRef.current), Date.now(), PRESENCE_MAX_AGE_MS));
    }

    (async () => {
      await supabase.from("user_presence").upsert(
        {
          user_id: userId,
          is_online: true,
          last_seen: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      mergeRow({
        user_id: userId,
        is_online: true,
        last_seen: new Date().toISOString(),
      });

      const { data } = await supabase.from("user_presence").select("user_id,is_online,last_seen");
      rowsRef.current = {};
      (data || []).forEach((r) => {
        rowsRef.current[r.user_id] = r;
      });
      setOnlineUsers(presenceRowsToOnlineMap(Object.values(rowsRef.current)));
    })().catch(() => {});

    // Unique channel name per user so multiple portal instances don't share a subscription slot.
    const ch = supabase
      .channel(`presence-all-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "user_presence" }, (payload) => {
        if (!payload.new) return;
        mergeRow(payload.new);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "user_presence" }, (payload) => {
        if (!payload.new) return;
        mergeRow(payload.new);
      })
      .subscribe();

    const staleIv = window.setInterval(() => {
      setOnlineUsers(presenceRowsToOnlineMap(Object.values(rowsRef.current), Date.now(), PRESENCE_MAX_AGE_MS));
    }, PRESENCE_STALE_REFRESH_MS);

    const hbCleanup = subscribeSelfPresenceHeartbeat(supabase, userId);

    return () => {
      window.clearInterval(staleIv);
      hbCleanup?.();
      void supabase.removeChannel(ch).catch(() => {});
      rowsRef.current = {};
      setOnlineUsers({});
    };
  }, [userId]);

  return onlineUsers;
}
