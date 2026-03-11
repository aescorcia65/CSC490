import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { loadMedications } from "../lib/medications";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const [userRole, setUserRole] = useState("client");
  const [onboardingComplete, setOnboardingComplete] = useState(true);
  const [profileData, setProfileData] = useState(null);
  const [meds, setMeds] = useState([]);
  const [medsLoaded, setMedsLoaded] = useState(false);
  const [displayName, setDisplayNameState] = useState(() => localStorage.getItem("medtrack_name") || "");

  const setDisplayName = useCallback((n) => {
    setDisplayNameState(n);
    if (n != null) localStorage.setItem("medtrack_name", n);
  }, []);

  const loadSession = useCallback(async (u) => {
    if (!u) {
      setUser(null);
      setMeds([]);
      setMedsLoaded(false);
      setOnboardingComplete(true);
      setProfileData(null);
      return;
    }
    setUser(u);
    const name = u.user_metadata?.full_name || u.email?.split("@")[0];
    if (name && !localStorage.getItem("medtrack_name")) {
      setDisplayNameState(name);
      localStorage.setItem("medtrack_name", name);
    }
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, first_name, last_name, age, sex, onboarding_completed")
        .eq("id", u.id)
        .single();
      setProfileData(profile ?? null);
      if (profile?.onboarding_completed === true) {
        setOnboardingComplete(true);
      } else {
        setOnboardingComplete(false);
      }
      if (profile?.role) {
        setUserRole(profile.role === "patient" ? "client" : profile.role);
      }
      if (profile?.first_name && !localStorage.getItem("medtrack_name")) {
        setDisplayNameState(profile.first_name);
        localStorage.setItem("medtrack_name", profile.first_name);
      }
    } catch (e) {
      console.warn("Could not load profile:", e);
    }
    const loaded = await loadMedications(u.id);
    setMeds(loaded ?? []);
    setMedsLoaded(true);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => loadSession(session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      loadSession(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, [loadSession]);

  const value = {
    user,
    userRole,
    onboardingComplete,
    setOnboardingComplete,
    profileData,
    setProfileData,
    meds,
    setMeds,
    medsLoaded,
    displayName,
    setDisplayName,
    loadSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
