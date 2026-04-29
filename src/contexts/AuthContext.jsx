import { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "../supabase";
import { loadMedications } from "../lib/medications";
import { loadTodaysTakenSlots, loadMedicationDoseLogRows, medicationIdMatchKey } from "../lib/adherence";
import { formatProfileFullName } from "../lib/profileName";

const AuthContext = createContext({});
export const useAuth = () => useContext(AuthContext);
const OAUTH_SIGNUP_KEY = "mt_oauth_signup";

function cacheRead(uid, key) {
  try { return localStorage.getItem(`mt_${key}_${uid}`); } catch { return null; }
}
function cacheWrite(uid, key, val) {
  try { localStorage.setItem(`mt_${key}_${uid}`, String(val)); } catch {}
}

function readPendingOAuthSignup() {
  try {
    const raw = localStorage.getItem(OAUTH_SIGNUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearPendingOAuthSignup() {
  try { localStorage.removeItem(OAUTH_SIGNUP_KEY); } catch {}
}

export function AuthProvider({ children }) {
  const [user, setUser]                     = useState(undefined);
  const [userRole, setUserRole]             = useState(null);
  const [onboardingComplete, setOnboarding] = useState(null);
  const [profileLoaded, setProfileLoaded]   = useState(false);
  const [displayName, setDisplayNameState]  = useState("");
  const [meds, setMeds]                     = useState([]);
  const [medsLoaded, setMedsLoaded]         = useState(false);
  const [doseLogs, setDoseLogs]             = useState([]);
  const profileFetchedFor                   = useRef(null);

  useEffect(() => {
    if (user === null) setDisplayNameState("");
  }, [user]);

  const setDisplayName = (name) => {
    setDisplayNameState(name);
    if (user?.id) {
      if (name) cacheWrite(user.id, "display_name", name);
      else try { localStorage.removeItem(`mt_display_name_${user.id}`); } catch {}
    }
  };

  async function fetchProfile(uid, attempt = 0) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("role, onboarding_complete, first_name, last_name")
        .eq("id", uid)
        .single();

      if (error || !data) {
        if (attempt < 6) {
          await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
          return fetchProfile(uid, attempt + 1);
        }
        const cachedRole = cacheRead(uid, "role") || "client";
        const cachedOnboarding = cacheRead(uid, "onboarding");
        setUserRole(cachedRole);
        setOnboarding(cachedOnboarding === "false" ? false : true);
        setProfileLoaded(true);
        return;
      }

      const role = data.role || "client";
      const done = data.onboarding_complete === true;
      setUserRole(role);
      setOnboarding(done);
      setProfileLoaded(true);
      cacheWrite(uid, "role", role);
      cacheWrite(uid, "onboarding", done);

      const fullName = formatProfileFullName(data).trim() || (cacheRead(uid, "display_name") || "").trim() || "";
      if (fullName) {
        cacheWrite(uid, "display_name", fullName);
        setDisplayNameState(fullName);
      } else if (data.first_name === null && data.last_name === null) {
        const cached = cacheRead(uid, "display_name");
        if (cached) setDisplayNameState(cached);
      }
    } catch (e) {
      if (attempt < 6) {
        await new Promise(r => setTimeout(r, 400));
        return fetchProfile(uid, attempt + 1);
      }
      const cachedOnboarding = cacheRead(uid, "onboarding");
      setUserRole(cacheRead(uid, "role") || "client");
      setOnboarding(cachedOnboarding === "false" ? false : true);
      setProfileLoaded(true);
    }
  }

  const loadUserMeds = useCallback(async (uid) => {
    if (!uid) return;
    try {
      // Only meds + today's slots block first paint — dose history (~2000 rows) loads after idle
      const [medsList, takenDetail] = await Promise.all([
        loadMedications(uid),
        loadTodaysTakenSlots(uid),
      ]);
      const merged = (medsList || []).map((m) => {
        const d = takenDetail.get(medicationIdMatchKey(m.id));
        const loggedAllDay = d?.all ?? false;
        const loggedSlotTimes = d && !d.all ? [...(d.slots ?? new Set())] : [];
        const taken = loggedAllDay || loggedSlotTimes.length > 0;
        return { ...m, loggedAllDay, loggedSlotTimes, taken };
      });
      setMeds(merged);
      const rqIdle = typeof requestIdleCallback === "function" ? requestIdleCallback : (fn) => setTimeout(fn, 1);
      rqIdle(() => {
        void loadMedicationDoseLogRows(uid, { lookbackDays: 120 })
          .then((rows) => setDoseLogs(rows || []))
          .catch(() => {});
      }, { timeout: 2500 });
    } catch (e) {
      console.error("loadUserMeds:", e);
      // Do not clear meds — otherwise a transient fetch error resets doses UI to 0.
    } finally {
      setMedsLoaded(true);
    }
  }, []);

  async function applyPendingOAuthSignup(uid) {
    const pending = readPendingOAuthSignup();
    if (!pending) return;
    if (Date.now() - Number(pending.ts || 0) > 10 * 60 * 1000) {
      clearPendingOAuthSignup();
      return;
    }

    const allowed = new Set(["patient", "doctor", "pharmacist"]);
    const desiredRole = allowed.has(pending.role) ? pending.role : null;
    const desiredFirstName = typeof pending.firstName === "string" ? pending.firstName.trim() : "";

    try {
      const { data: profile, error: fetchError } = await supabase
        .from("profiles")
        .select("role, first_name, onboarding_complete")
        .eq("id", uid)
        .single();
      if (fetchError || !profile) return;

      const updates = {};
      if (!profile.onboarding_complete) {
        if (desiredRole && desiredRole !== "patient" && profile.role === "patient") {
          updates.role = desiredRole;
        }
        if (desiredFirstName && !profile.first_name) {
          updates.first_name = desiredFirstName;
        }
      }

      if (Object.keys(updates).length) {
        updates.updated_at = new Date().toISOString();
        const { error: updateError } = await supabase.from("profiles").update(updates).eq("id", uid);
        if (updateError) return;
      }
      clearPendingOAuthSignup();
    } catch {}
  }

  function applyUser(u) {
    setUser(u);
    if (u) {
      const cachedRole       = cacheRead(u.id, "role");
      const cachedOnboarding = cacheRead(u.id, "onboarding");
      if (cachedRole) setUserRole(cachedRole);
      if (cachedOnboarding !== null) setOnboarding(cachedOnboarding === "true");
      if (profileFetchedFor.current !== u.id) {
        profileFetchedFor.current = u.id;
        void (async () => {
          await applyPendingOAuthSignup(u.id);
          await Promise.all([fetchProfile(u.id), loadUserMeds(u.id)]);
        })();
      }
    } else {
      profileFetchedFor.current = null;
      setUserRole(null);
      setOnboarding(null);
      setProfileLoaded(false);
      setMeds([]);
      setDoseLogs([]);
      setMedsLoaded(false);
      setDisplayNameState("");
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      applyUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => applyUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`auth-profile-${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` }, (payload) => {
        const next = payload.new;
        if (!next) return;
        const name = formatProfileFullName(next).trim();
        if (name) {
          cacheWrite(user.id, "display_name", name);
          setDisplayNameState(name);
        }
        if (next.role === "patient") void loadUserMeds(user.id);
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user?.id, loadUserMeds]);

  useEffect(() => {
    if (!user?.id || (userRole != null && userRole !== "patient")) return;
    const onVis = () => {
      if (document.visibilityState === "visible") void loadUserMeds(user.id);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [user?.id, userRole, loadUserMeds]);

  return (
    <AuthContext.Provider value={{
      user,
      userRole,
      onboardingComplete,
      profileLoaded,
      setOnboardingComplete: (val) => {
        setOnboarding(val);
        setProfileLoaded(true);
        if (user?.id) cacheWrite(user.id, "onboarding", val);
      },
      displayName,
      setDisplayName,
      meds,
      setMeds,
      medsLoaded,
      doseLogs,
      setDoseLogs,
      loadUserMeds: user?.id ? () => loadUserMeds(user.id) : async () => {},
    }}>
      {children}
    </AuthContext.Provider>
  );
}