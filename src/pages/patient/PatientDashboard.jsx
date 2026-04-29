import { useState, useCallback, useEffect, Component, useTransition, useRef, Suspense, lazy } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HeartPulse, Calendar, BarChart3, SlidersHorizontal, Moon, Sun, LogOut, X, Stethoscope, MessageSquare, LayoutGrid, Pill, Bell, FileHeart, MoreHorizontal, ChevronRight, Loader2 } from "lucide-react";
import { supabase } from "../../supabase";
import { signOutClearPresence } from "../../lib/signOutClearPresence";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../hooks/useTheme";
import { useIsMobile } from "../../hooks/useIsMobile";
import { usePresenceOnlineMap } from "../../hooks/usePresenceOnlineMap";
import { usePatientInboundSounds } from "../../hooks/usePatientInboundSounds";
import { ensurePatientMessagingAudioUnlocked } from "../../lib/patientMessagingSounds";
import { ensureMessageNotifAudioUnlocked } from "../../lib/messageNotificationSettings";
import { deleteMedication } from "../../lib/medications";
import Dashboard from "./Dashboard";

const MedicationsPage = lazy(() => import("./MedicationsPage"));
const AppointmentsPage = lazy(() => import("./AppointmentsPage"));
const PatientMessagesPage = lazy(() => import("./PatientMessagesPage"));
const AnalyticsPage = lazy(() => import("./AnalyticsPage"));
const HealthRecordsPage = lazy(() => import("./HealthRecordsPage"));
const NotificationsPage = lazy(() => import("./NotificationsPage"));
const SettingsPage = lazy(() => import("./SettingsPage"));
const CareHubPage = lazy(() => import("./CareHubPage"));

const MedModal = lazy(() => import("../../components/modals/MedModal"));
const FeedbackModal = lazy(() => import("../../components/modals/FeedbackModal"));
const NicknameModal = lazy(() => import("../../components/modals/NicknameModal"));
const AIDrawer = lazy(() => import("../../components/ai/AIDrawer"));

function PatientTabSuspenseFallback() {
  return (
    <div style={{ flex: 1, minHeight: "40vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Loader2 aria-hidden style={{ animation: "spin360 .65s linear infinite", color: "var(--p)", width: 28, height: 28 }} />
    </div>
  );
}
const PATIENT_MAIN_NAV = [
  { id: "dashboard", label: "Dashboard", Icon: HeartPulse, page: "dashboard" },
  { id: "medications", label: "Medications", Icon: Pill, page: "medications" },
  { id: "appointments", label: "Appointments", Icon: Calendar, page: "appointments" },
  { id: "messages", label: "Messages", Icon: MessageSquare, page: "messages" },
  { id: "analytics", label: "Analytics", Icon: BarChart3, page: "analytics" },
  { id: "health-records", label: "Health Records", Icon: FileHeart, page: "health-records" },
  { id: "notifications", label: "Notifications", Icon: Bell, page: "notifications" },
  { id: "settings", label: "Settings", Icon: SlidersHorizontal, page: "settings" },
];

const CARE_HUB_SIDEBAR_ITEM = { id: "care-hub", label: "Care Hub", Icon: LayoutGrid, page: "care-hub" };
const PATIENT_PAGE_STORAGE_KEY = "mt_patient_last_page";
const PATIENT_ALLOWED_PAGES = new Set([
  "dashboard",
  "medications",
  "appointments",
  "messages",
  "analytics",
  "health-records",
  "notifications",
  "settings",
  "care-hub",
]);

const MOBILE_TABS = [
  { id: "dashboard", page: "dashboard", I: HeartPulse, l: "Home" },
  { id: "medications", page: "medications", I: Pill, l: "Meds" },
  { id: "appointments", page: "appointments", I: Calendar, l: "Visits" },
  { id: "messages", page: "messages", I: MessageSquare, l: "Chat" },
  { id: "settings", page: "settings", I: SlidersHorizontal, l: "Settings" },
];

class PatientMainErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }

  static getDerivedStateFromError(err) {
    return { err };
  }

  componentDidCatch(err, info) {
    console.error("PatientMainErrorBoundary:", err, info?.componentStack);
  }

  render() {
    if (this.state.err) {
      return (
        <div
          style={{
            flex: 1,
            minHeight: 160,
            padding: 28,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            gap: 14,
            background: "var(--bg)",
          }}
        >
          <p style={{ margin: 0, color: "var(--t1)", fontWeight: 700, fontSize: 16 }}>This page couldn&apos;t be displayed</p>
          <p style={{ margin: 0, color: "var(--t3)", fontSize: 13, lineHeight: 1.55, maxWidth: 380 }}>
            Something went wrong while loading this section. Try again or pick another tab from the menu.
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => this.setState({ err: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function PatientDashboard() {
  const { user, meds, setMeds, displayName, setDisplayName } = useAuth();
  const [light, setLight] = useTheme();
  const [page, setPage] = useState("dashboard");
  const [activeNavId, setActiveNavId] = useState("dashboard");
  const [settingsExpand, setSettingsExpand] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editMed, setEditMed] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showNickname, setShowNickname] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [mobMenu, setMobMenu] = useState(false);
  const [focusMedicationId, setFocusMedicationId] = useState(null);
  const [messagesPeer, setMessagesPeer] = useState(null);
  const [headerAlertCount, setHeaderAlertCount] = useState(0);
  const [isNavPending, startNavTransition] = useTransition();
  const pageRestoreDoneRef = useRef(false);
  const isMob = useIsMobile();
  const saveName = (n) => { setDisplayName(n); };
  const saveMed = useCallback((m) => { setMeds((ms) => (ms.find((x) => x.id === m.id) ? ms.map((x) => (x.id === m.id ? m : x)) : [m, ...ms])); }, [setMeds]);
  const deleteMed = useCallback(async (id) => { const med = meds.find((m) => m.id === id); setMeds((ms) => ms.filter((m) => m.id !== id)); if (med?.firestoreId) await deleteMedication(med.firestoreId); }, [meds, setMeds]);
  const userName = displayName || user?.displayName || user?.email?.split("@")[0] || "";
  const t1 = "var(--t1)", t2 = "var(--t2)", t3 = "var(--t3)", b0 = "var(--b0)", b1 = "var(--b1)";
  const onlinePeers = usePresenceOnlineMap(user?.id);

  usePatientInboundSounds(user?.id);

  useEffect(() => {
    const unlock = () => {
      void ensurePatientMessagingAudioUnlocked();
      void ensureMessageNotifAudioUnlocked();
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("touchstart", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const key = `mt_theme_user_${user.id}`;
    const saved = localStorage.getItem(key);
    if (saved === "light" || saved === "dark") {
      const wantsLight = saved === "light";
      if (wantsLight !== light) setLight(wantsLight);
      return;
    }
    localStorage.setItem(key, light ? "light" : "dark");
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    localStorage.setItem(`mt_theme_user_${user.id}`, light ? "light" : "dark");
  }, [user?.id, light]);

  const refreshHeaderAlerts = useCallback(() => {
    if (!user?.id) return;
    Promise.all([
      supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null),
      supabase.from("patient_messages").select("id", { count: "exact", head: true }).eq("recipient_id", user.id).is("read_at", null),
    ]).then(([a, b]) => setHeaderAlertCount((a.count || 0) + (b.count || 0)));
  }, [user?.id]);

  useEffect(() => {
    refreshHeaderAlerts();
    if (!user?.id) return;
    const c1 = supabase.channel(`hdr-n-${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, refreshHeaderAlerts).subscribe();
    const c2 = supabase.channel(`hdr-m-${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "patient_messages", filter: `recipient_id=eq.${user.id}` }, refreshHeaderAlerts).subscribe();
    return () => { supabase.removeChannel(c1); supabase.removeChannel(c2); };
  }, [user?.id, refreshHeaderAlerts]);

  useEffect(() => {
    if (!user?.id) return;
    if (pageRestoreDoneRef.current) return;
    const saved = localStorage.getItem(`${PATIENT_PAGE_STORAGE_KEY}_${user.id}`);
    if (saved && PATIENT_ALLOWED_PAGES.has(saved)) {
      setPage(saved);
      setActiveNavId(saved);
    }
    pageRestoreDoneRef.current = true;
  }, [user?.id, pageRestoreDoneRef]);

  useEffect(() => {
    if (!user?.id || !pageRestoreDoneRef.current || !PATIENT_ALLOWED_PAGES.has(page)) return;
    localStorage.setItem(`${PATIENT_PAGE_STORAGE_KEY}_${user.id}`, page);
  }, [page, user?.id, pageRestoreDoneRef]);

  const goToPage = useCallback((navId, pageId, opts = {}) => {
    startNavTransition(() => {
      setPage(pageId);
      setActiveNavId(navId);
      setSettingsExpand(opts.settingsExpand ?? null);
      if (pageId === "medications") setFocusMedicationId(opts.medicationId || null);
      else setFocusMedicationId(null);
      if (pageId === "messages") setMessagesPeer(opts.messagesPeer ?? null);
      else setMessagesPeer(null);
      setMobMenu(false);
    });
  }, []);

  const selectNavItem = useCallback((item) => {
    goToPage(item.id, item.page, { settingsExpand: item.settingsExpand, medicationId: null });
  }, [goToPage]);

  const handleDashboardNavigate = useCallback((tab, medicationId) => {
    if (tab === "medications") goToPage("medications", "medications", { medicationId: medicationId || null });
    else if (tab === "appointments") goToPage("appointments", "appointments");
    else if (tab === "messages") goToPage("messages", "messages");
    else if (tab === "analytics") goToPage("analytics", "analytics");
    else if (tab === "notifications") goToPage("notifications", "notifications");
    else if (tab === "care-hub") goToPage("care-hub", "care-hub");
    else if (tab === "settings") goToPage("settings", "settings");
  }, [goToPage]);

  const handleNotificationNavigate = useCallback((payload) => {
    const p = payload?.page || "dashboard";
    if (p === "medications") goToPage("medications", "medications", { medicationId: payload?.medicationId || null });
    else if (p === "appointments") goToPage("appointments", "appointments");
    else if (p === "messages") goToPage("messages", "messages", { messagesPeer: payload?.messagesPeer || null });
    else if (p === "settings") goToPage("settings", "settings", { settingsExpand: payload?.settingsExpand || null });
    else goToPage(p, p);
  }, [goToPage]);

  const selectMobileTab = useCallback((t) => {
    goToPage(t.id, t.page);
  }, [goToPage]);

  return (
    <div style={{ display: "flex", height: "100dvh", overflow: "hidden", background: "var(--bg)" }}>
      {!light && (
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
          <div style={{ position: "absolute", width: 600, height: 600, left: "-15%", top: "-20%", borderRadius: "50%", filter: "blur(80px)", animation: "orbDrift 14s ease-in-out infinite", background: "radial-gradient(circle,rgba(37,99,235,.055) 0%,transparent 70%)" }} />
          <div style={{ position: "absolute", width: 500, height: 500, left: "65%", top: "50%", borderRadius: "50%", filter: "blur(80px)", animation: "orbDrift 14s ease-in-out infinite", animationDelay: "7s", background: "radial-gradient(circle,rgba(6,182,212,.04) 0%,transparent 70%)" }} />
        </div>
      )}
      {!isMob && (
        <aside className="sidebar patient-sidebar">
          <div className="patient-sidebar-brand">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: "var(--pd)", border: "1px solid rgba(37,99,235,.2)", display: "flex", alignItems: "center", justifyContent: "center" }}><HeartPulse size={16} color="var(--p)" /></div>
              <div>
                <p style={{ fontSize: 15, fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontWeight: 700, letterSpacing: "-.2px", margin: 0 }}>
                  <span style={{ color: t1 }}>Med</span><span style={{ color: "var(--p)" }}>Track</span>
                </p>
                <p className="gt" style={{ fontSize: 9, margin: "2px 0 0" }}>PERSONAL</p>
              </div>
            </div>
          </div>
          <div className="patient-sidebar-scroll">
            <nav className="patient-sidebar-nav" aria-label="Main">
              <p className="patient-sidebar-section-label">Menu</p>
              {PATIENT_MAIN_NAV.map((item) => {
                const Icon = item.Icon;
                const on = activeNavId === item.id;
                return (
                  <button key={item.id} type="button" className={`patient-nav-link ${on ? "on" : ""}`} onClick={() => selectNavItem(item)}>
                    <span className="patient-nav-icon" aria-hidden><Icon size={18} strokeWidth={on ? 2.2 : 2} /></span>
                    <span className="patient-nav-label">{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="patient-sidebar-divider" />
            <nav className="patient-sidebar-nav" aria-label="Care Hub">
              {(() => {
                const item = CARE_HUB_SIDEBAR_ITEM;
                const Icon = item.Icon;
                const on = activeNavId === item.id && page === item.page;
                return (
                  <button key={item.id} type="button" className={`patient-nav-link ${on ? "on" : ""}`} onClick={() => selectNavItem(item)}>
                    <span className="patient-nav-icon" aria-hidden><Icon size={18} strokeWidth={on ? 2.2 : 2} /></span>
                    <span className="patient-nav-label">{item.label}</span>
                  </button>
                );
              })()}
            </nav>
          </div>
          <div className="patient-sidebar-footer">
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 10px 12px", borderRadius: 12, background: "var(--s2)", border: `1px solid ${b0}`, marginBottom: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--pd)", border: "1px solid rgba(37,99,235,.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "var(--p)", flexShrink: 0 }}>
                {(() => {
                  const w = userName.trim().split(/\s+/).filter(Boolean);
                  if (!w.length) return "?";
                  if (w.length === 1) return w[0].slice(0, 2).toUpperCase();
                  return (w[0][0] + w[w.length - 1][0]).toUpperCase();
                })()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: t1, letterSpacing: "-0.02em" }}>{userName || "Patient"}</p>
                <button type="button" onClick={() => goToPage("settings", "settings")} style={{ margin: "4px 0 0", padding: 0, border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 600, color: "var(--p)", display: "inline-flex", alignItems: "center", gap: 2 }}>
                  View profile <ChevronRight size={12} strokeWidth={2.5} />
                </button>
              </div>
              <button type="button" onClick={() => goToPage("settings", "settings")} style={{ width: 32, height: 32, borderRadius: 10, border: `1px solid ${b0}`, background: "var(--s1)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3, flexShrink: 0 }} aria-label="Account menu">
                <MoreHorizontal size={16} />
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px 10px", borderRadius: 12, background: "var(--s1)", border: `1px solid ${b0}`, marginBottom: 8 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, color: t3, fontSize: 12, fontWeight: 500 }}>{light ? <Sun size={14} color="var(--am)" /> : <Moon size={14} />}{light ? "Light" : "Dark"}</span>
              <div className={`sw ${!light ? "on" : ""}`} onClick={() => setLight(!light)} role="switch" aria-checked={!light} />
            </div>
            <button type="button" onClick={() => void signOutClearPresence(user?.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 11, border: "1px solid rgba(239,68,68,.16)", background: "rgba(239,68,68,.05)", cursor: "pointer", color: "var(--ro)", fontFamily: "inherit", fontSize: 12, fontWeight: 600, width: "100%", transition: "background .15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,.09)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,.05)"; }}>
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        </aside>
      )}
      <div className={page === "appointments" ? "patient-main-wrap patient-main-wrap--appointments" : "patient-main-wrap"} style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, position: "relative" }}>
        <header className="tb">
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <button type="button" aria-label="Open portal menu" onClick={() => setMobMenu(true)} style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${b1}`, background: "var(--s1)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3 }}><MoreHorizontal size={16} /></button>
            <HeartPulse size={17} color="var(--p)" style={{ filter: "drop-shadow(0 0 5px var(--p))", flexShrink: 0 }} />
            <span style={{ fontSize: 17, fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontWeight: 700, letterSpacing: "-.3px" }}>
              <span style={{ color: t1 }}>Med</span><span style={{ color: "var(--p)" }}>Track</span>
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" onClick={() => { refreshHeaderAlerts(); goToPage("notifications", "notifications"); }} style={{ position: "relative", display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 99, border: `1px solid ${b1}`, background: "var(--s1)", cursor: "pointer", fontSize: 12, fontWeight: 500, color: t2 }}>
              <Bell size={14} color="var(--p)" />
              {!isMob && "Alerts"}
              {headerAlertCount > 0 && (
                <span style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 99, background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{headerAlertCount > 9 ? "9+" : headerAlertCount}</span>
              )}
            </button>
            <button type="button" onClick={() => goToPage("messages", "messages")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 13px", borderRadius: 99, border: `1px solid ${b1}`, background: "var(--s1)", cursor: "pointer", fontSize: 12, fontWeight: 500, color: t2 }}>
              <MessageSquare size={13} color="var(--gr)" />{!isMob && " Messages"}
            </button>
            <button type="button" onClick={() => setLight(!light)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 13px", borderRadius: 99, border: `1px solid ${b1}`, background: "var(--s1)", cursor: "pointer", fontSize: 12, fontWeight: 500, color: t2 }}>
              {light ? <Moon size={13} color="var(--p)" /> : <Sun size={13} color="var(--am)" />}{!isMob && (light ? " Dark" : " Light")}
            </button>
          </div>
        </header>
        <div
          key={page}
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
            overflowX: "hidden",
            WebkitOverflowScrolling: "touch",
            paddingBottom: isMob ? "calc(58px + env(safe-area-inset-bottom, 0px))" : 0,
            position: "relative",
          }}
        >
          {isNavPending && (
            <div
              role="status"
              aria-live="polite"
              aria-busy="true"
              style={{
                position: "absolute",
                top: 12,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 6,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                borderRadius: 10,
                background: "var(--s1)",
                border: `1px solid ${b1}`,
                color: t2,
                fontSize: 12,
                fontWeight: 500,
                boxShadow: "0 6px 20px rgba(0,0,0,.08)",
                pointerEvents: "none",
              }}
            >
              <Loader2 size={14} color="var(--p)" style={{ animation: "spin360 .7s linear infinite" }} />
              Loading…
            </div>
          )}
          <PatientMainErrorBoundary>
            {page === "dashboard" && (
              <Dashboard user={user} meds={meds} setMeds={setMeds} onAdd={() => setAddOpen(true)} displayName={userName} onEditName={() => setShowNickname(true)} onNavigateTab={handleDashboardNavigate} />
            )}
            {page !== "dashboard" && (
              <Suspense fallback={<PatientTabSuspenseFallback />}>
                {page === "medications" && (
                  <MedicationsPage meds={meds} setMeds={setMeds} onEdit={(m) => setEditMed(m)} onDelete={deleteMed} userId={user?.id} focusMedicationId={focusMedicationId} onConsumedFocus={() => setFocusMedicationId(null)} />
                )}
                {page === "appointments" && <AppointmentsPage userId={user?.id} onNavigateTab={handleDashboardNavigate} />}
                {page === "messages" && (
                  <PatientMessagesPage
                    userId={user?.id}
                    senderDisplayName={userName}
                    initialPeer={messagesPeer}
                    onOpenCareTeamSettings={() => goToPage("settings", "settings", { settingsExpand: "primarycare" })}
                    onlineUsers={onlinePeers}
                  />
                )}
                {page === "analytics" && <AnalyticsPage meds={meds} userId={user?.id} onNavigateTab={handleDashboardNavigate} />}
                {page === "health-records" && <HealthRecordsPage userId={user?.id} />}
                {page === "notifications" && <NotificationsPage userId={user?.id} meds={meds} onNavigate={handleNotificationNavigate} />}
                {page === "settings" && <SettingsPage light={light} setLight={setLight} user={user} displayName={userName} onEditName={() => setShowNickname(true)} meds={meds} onFeedback={() => setShowFeedback(true)} expandSectionKey={settingsExpand} />}
                {page === "care-hub" && (
                  <CareHubPage
                    userId={user?.id}
                    onCareAdvisor={() => setShowAI(true)}
                    onFeedback={() => setShowFeedback(true)}
                    onHelpSupport={() => goToPage("settings", "settings")}
                    onManageCareTeam={() => goToPage("settings", "settings", { settingsExpand: "primarycare" })}
                  />
                )}
                {![
                  "medications",
                  "appointments",
                  "messages",
                  "analytics",
                  "health-records",
                  "notifications",
                  "settings",
                  "care-hub",
                ].includes(page) && (
                  <div style={{ flex: 1, padding: 28, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center" }}>
                    <p style={{ margin: 0, color: "var(--t1)", fontWeight: 700 }}>Page not available</p>
                    <p style={{ margin: 0, color: "var(--t3)", fontSize: 13 }}>The menu selection didn&apos;t match a screen. Return home and try again.</p>
                    <button type="button" className="btn" onClick={() => goToPage("dashboard", "dashboard")}>
                      Go to Dashboard
                    </button>
                  </div>
                )}
              </Suspense>
            )}
          </PatientMainErrorBoundary>
        </div>
        {isMob && (
          <nav className="btabs" style={{ gridTemplateColumns: `repeat(${MOBILE_TABS.length}, 1fr)` }}>
            {MOBILE_TABS.map((t) => (
              <button key={t.id} type="button" className={`bt ${page === t.page ? "on" : ""}`} onClick={() => selectMobileTab(t)}><t.I size={17} />{t.l}</button>
            ))}
          </nav>
        )}
      </div>

      <AnimatePresence>
        {mobMenu && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobMenu(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 60, backdropFilter: "blur(6px)" }} />
            <motion.div initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", damping: 28, stiffness: 250 }} className="patient-sidebar patient-mob-drawer" style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: 280, maxWidth: "min(280px, 92vw)", paddingTop: "var(--safe-top)", paddingBottom: "var(--safe-bottom)", zIndex: 70, background: "var(--s1)", borderRight: `1px solid ${b1}` }}>
              <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 14px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <HeartPulse size={17} color="var(--p)" />
                  <span style={{ fontSize: 16, fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontWeight: 700 }}><span style={{ color: t1 }}>Med</span><span style={{ color: "var(--p)" }}>Track</span></span>
                </div>
                <button type="button" onClick={() => setMobMenu(false)} style={{ width: 32, height: 32, borderRadius: 10, border: `1px solid ${b1}`, background: "var(--s2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3 }}><X size={14} /></button>
              </div>
              <div style={{ height: 1, background: b0, margin: "0 12px 0", flexShrink: 0 }} />
              <div className="patient-sidebar-scroll">
                <nav className="patient-sidebar-nav" aria-label="Main menu">
                  <p className="patient-sidebar-section-label">Menu</p>
                  {PATIENT_MAIN_NAV.map((item) => {
                    const Icon = item.Icon;
                    const on = activeNavId === item.id;
                    return (
                      <button key={item.id} type="button" className={`patient-nav-link ${on ? "on" : ""}`} onClick={() => selectNavItem(item)}>
                        <span className="patient-nav-icon" aria-hidden><Icon size={18} strokeWidth={on ? 2.2 : 2} /></span>
                        <span className="patient-nav-label">{item.label}</span>
                      </button>
                    );
                  })}
                </nav>
                <div className="patient-sidebar-divider" />
                <nav className="patient-sidebar-nav" aria-label="Care Hub">
                  {(() => {
                    const item = CARE_HUB_SIDEBAR_ITEM;
                    const Icon = item.Icon;
                    const on = activeNavId === item.id && page === item.page;
                    return (
                      <button key={item.id} type="button" className={`patient-nav-link ${on ? "on" : ""}`} onClick={() => { selectNavItem(item); setMobMenu(false); }}>
                        <span className="patient-nav-icon" aria-hidden><Icon size={18} strokeWidth={on ? 2.2 : 2} /></span>
                        <span className="patient-nav-label">{item.label}</span>
                      </button>
                    );
                  })()}
                </nav>
              </div>
              <div className="patient-sidebar-footer">
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 10px 12px", borderRadius: 12, background: "var(--s2)", border: `1px solid ${b0}`, marginBottom: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--pd)", border: "1px solid rgba(37,99,235,.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "var(--p)", flexShrink: 0 }}>
                    {(() => {
                      const w = userName.trim().split(/\s+/).filter(Boolean);
                      if (!w.length) return "?";
                      if (w.length === 1) return w[0].slice(0, 2).toUpperCase();
                      return (w[0][0] + w[w.length - 1][0]).toUpperCase();
                    })()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: t1, letterSpacing: "-0.02em" }}>{userName || "Patient"}</p>
                    <button type="button" onClick={() => { goToPage("settings", "settings"); setMobMenu(false); }} style={{ margin: "4px 0 0", padding: 0, border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 600, color: "var(--p)", display: "inline-flex", alignItems: "center", gap: 2 }}>
                      View profile <ChevronRight size={12} strokeWidth={2.5} />
                    </button>
                  </div>
                  <button type="button" onClick={() => { goToPage("settings", "settings"); setMobMenu(false); }} style={{ width: 32, height: 32, borderRadius: 10, border: `1px solid ${b0}`, background: "var(--s1)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3, flexShrink: 0 }} aria-label="Account menu">
                    <MoreHorizontal size={16} />
                  </button>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 12, background: "var(--s1)", border: `1px solid ${b0}`, marginBottom: 10 }}>
                  <span style={{ color: t3, fontSize: 12, fontWeight: 500 }}>Dark mode</span>
                  <div className={`sw ${!light ? "on" : ""}`} onClick={() => setLight(!light)} role="switch" aria-checked={!light} />
                </div>
                <button type="button" onClick={() => void signOutClearPresence(user?.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 12px", borderRadius: 11, border: "1px solid rgba(239,68,68,.2)", background: "rgba(239,68,68,.07)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: "var(--ro)", width: "100%" }}>
                  <LogOut size={14} /> Sign Out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {addOpen && (
          <Suspense fallback={null}>
            <MedModal onClose={() => setAddOpen(false)} onSave={saveMed} userId={user?.id} />
          </Suspense>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {editMed && (
          <Suspense fallback={null}>
            <MedModal existing={editMed} onClose={() => setEditMed(null)} onSave={saveMed} userId={user?.id} />
          </Suspense>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showNickname && (
          <Suspense fallback={null}>
            <NicknameModal currentName={userName} onSave={saveName} onClose={() => setShowNickname(false)} userId={user?.id} />
          </Suspense>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showFeedback && (
          <Suspense fallback={null}>
            <FeedbackModal onClose={() => setShowFeedback(false)} userEmail={user?.email} />
          </Suspense>
        )}
      </AnimatePresence>
      {!isMob && (
        <motion.button type="button" aria-label="Care advisor" whileHover={{ scale: 1.06, y: -2 }} whileTap={{ scale: 0.93 }} onClick={() => setShowAI(true)} style={{ position: "fixed", bottom: "calc(26px + env(safe-area-inset-bottom, 0px))", right: "calc(26px + env(safe-area-inset-right, 0px))", width: 56, height: 56, borderRadius: "50%", border: "none", background: "linear-gradient(135deg,#3b82f6,#2563eb)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 40, boxShadow: "0 8px 28px rgba(59,130,246,.45)" }}>
          <Stethoscope size={24} color="#fff" strokeWidth={2.2} />
        </motion.button>
      )}
      <AnimatePresence>
        {showAI && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAI(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 90, backdropFilter: "blur(5px)" }} />
            <Suspense fallback={null}>
              <AIDrawer onClose={() => setShowAI(false)} userName={userName} meds={meds} userId={user?.id} />
            </Suspense>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
