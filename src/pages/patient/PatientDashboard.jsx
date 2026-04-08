import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HeartPulse, Calendar, BarChart3, SlidersHorizontal, Moon, Sun, LogOut, Menu, X, Stethoscope, MessageSquare } from "lucide-react";
import { supabase } from "../../supabase";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../hooks/useTheme";
import { useIsMobile } from "../../hooks/useIsMobile";
import { deleteMedication } from "../../lib/medications";
import Dashboard from "./Dashboard";
import SchedulePage from "./SchedulePage";
import AnalyticsPage from "./AnalyticsPage";
import SettingsPage from "./SettingsPage";
import MedModal from "../../components/modals/MedModal";
import FeedbackModal from "../../components/modals/FeedbackModal";
import NicknameModal from "../../components/modals/NicknameModal";
import AIDrawer from "../../components/ai/AIDrawer";

export default function PatientDashboard() {
  const { user, meds, setMeds, medsLoaded, displayName, setDisplayName } = useAuth();
  const [light, setLight] = useTheme();
  const [page, setPage] = useState("dashboard");
  const [addOpen, setAddOpen] = useState(false);
  const [editMed, setEditMed] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showNickname, setShowNickname] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [mobMenu, setMobMenu] = useState(false);
  const isMob = useIsMobile();
  const saveName = (n) => { setDisplayName(n); };
  const saveMed = useCallback((m) => { setMeds(ms => ms.find(x => x.id === m.id) ? ms.map(x => x.id === m.id ? m : x) : [m, ...ms]); }, []);
  const deleteMed = useCallback(async (id) => { const med = meds.find(m => m.id === id); setMeds(ms => ms.filter(m => m.id !== id)); if (med?.firestoreId) await deleteMedication(med.firestoreId); }, [meds]);
  const userName = displayName || user?.displayName || user?.email?.split("@")[0] || "";
  const t1 = "var(--t1)", t2 = "var(--t2)", t3 = "var(--t3)", b0 = "var(--b0)", b1 = "var(--b1)";
  const tabs = [["dashboard", HeartPulse, "Dashboard"], ["schedule", Calendar, "Schedule"], ["analytics", BarChart3, "Analytics"], ["settings", SlidersHorizontal, "Settings"]];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>
      {!light && (
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
          <div style={{ position: "absolute", width: 600, height: 600, left: "-15%", top: "-20%", borderRadius: "50%", filter: "blur(80px)", animation: "orbDrift 14s ease-in-out infinite", background: "radial-gradient(circle,rgba(37,99,235,.055) 0%,transparent 70%)" }} />
          <div style={{ position: "absolute", width: 500, height: 500, left: "65%", top: "50%", borderRadius: "50%", filter: "blur(80px)", animation: "orbDrift 14s ease-in-out infinite", animationDelay: "7s", background: "radial-gradient(circle,rgba(6,182,212,.04) 0%,transparent 70%)" }} />
        </div>
      )}
      {!isMob && (
        <aside className="sidebar" style={{ zIndex: 10, overflowY: "auto" }}>
          <div style={{ padding: "20px 14px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--pd)", border: "1px solid rgba(37,99,235,.25)", display: "flex", alignItems: "center", justifyContent: "center" }}><HeartPulse size={16} color="var(--p)" /></div>
              <div>
                <p style={{ fontSize: 15, fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontWeight: 700, letterSpacing: "-.2px" }}>
                  <span style={{ color: t1 }}>Med</span><span style={{ color: "var(--p)" }}>Track</span>
                </p>
                <p className="gt" style={{ fontSize: 9 }}>PERSONAL</p>
              </div>
            </div>
          </div>
          <div style={{ height: 1, background: b0, margin: "0 12px 10px" }} />
          <nav style={{ flex: 1, padding: "0 7px", display: "flex", flexDirection: "column", gap: 1 }}>
            {tabs.map(([id, I, l]) => (<div key={id} className={`nl ${page === id ? "on" : ""}`} onClick={() => setPage(id)}><I size={15} />{l}</div>))}
            <div className="nl" style={{ color: "var(--p)" }} onClick={() => setShowAI(true)}><Stethoscope size={15} color="var(--p)" /> Health Advisor</div>
            <div className="nl" style={{ color: "var(--gr)" }} onClick={() => setShowFeedback(true)}><MessageSquare size={15} color="var(--gr)" /> Feedback</div>
          </nav>
          <div style={{ padding: "6px 7px 22px", display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7, color: t3, fontSize: 12 }}>{light ? <Sun size={13} color="var(--am)" /> : <Moon size={13} />} {light ? "Light" : "Dark"}</span>
              <div className={`sw ${!light ? "on" : ""}`} onClick={() => setLight(!light)} />
            </div>
            <button onClick={() => supabase.auth.signOut()} style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", borderRadius: 10, border: "none", background: "transparent", cursor: "pointer", color: "var(--ro)", fontFamily: "inherit", fontSize: 12, fontWeight: 500, width: "100%", transition: "background .15s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,.07)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <LogOut size={13} /> Sign Out
            </button>
          </div>
        </aside>
      )}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative", zIndex: 1 }}>
        <header className="tb">
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            {isMob && (
              <button onClick={() => setMobMenu(true)} style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${b1}`, background: "var(--s1)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3 }}><Menu size={16} /></button>
            )}
            <HeartPulse size={17} color="var(--p)" style={{ filter: "drop-shadow(0 0 5px var(--p))", flexShrink: 0 }} />
            <span style={{ fontSize: 17, fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontWeight: 700, letterSpacing: "-.3px" }}>
              <span style={{ color: t1 }}>Med</span><span style={{ color: "var(--p)" }}>Track</span>
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setShowFeedback(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 13px", borderRadius: 99, border: `1px solid ${b1}`, background: "var(--s1)", cursor: "pointer", fontSize: 12, fontWeight: 500, color: t2 }}>
              <MessageSquare size={13} color="var(--gr)" />{!isMob && " Feedback"}
            </button>
            <button onClick={() => setLight(!light)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 13px", borderRadius: 99, border: `1px solid ${b1}`, background: "var(--s1)", cursor: "pointer", fontSize: 12, fontWeight: 500, color: t2 }}>
              {light ? <Moon size={13} color="var(--p)" /> : <Sun size={13} color="var(--am)" />}{!isMob && (light ? " Dark" : " Light")}
            </button>
          </div>
        </header>
        <AnimatePresence mode="wait">
          <motion.div key={page} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: .18 }} style={{ flex: 1, display: "flex", flexDirection: "column", paddingBottom: isMob ? "calc(66px + env(safe-area-inset-bottom, 0px))" : 0 }}>
            {page === "dashboard" && <Dashboard user={user} meds={meds} setMeds={setMeds} onAdd={() => setAddOpen(true)} onEdit={m => setEditMed(m)} onDelete={deleteMed} onChat={() => setShowAI(true)} displayName={userName} onEditName={() => setShowNickname(true)} />}
            {page === "schedule" && <SchedulePage meds={meds} setMeds={setMeds} onEdit={m => setEditMed(m)} onDelete={deleteMed} userId={user?.id} />}
            {page === "analytics" && <AnalyticsPage meds={meds} userId={user?.id} />}
            {page === "settings" && <SettingsPage light={light} setLight={setLight} user={user} displayName={userName} onEditName={() => setShowNickname(true)} meds={meds} onFeedback={() => setShowFeedback(true)} />}
          </motion.div>
        </AnimatePresence>
        {isMob && (
          <nav className="btabs">
            {tabs.map(([id, I, l]) => (
              <button key={id} className={`bt ${page === id ? "on" : ""}`} onClick={() => setPage(id)}><I size={19} />{l}</button>
            ))}
          </nav>
        )}
      </div>

      <AnimatePresence>
        {mobMenu && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobMenu(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 60, backdropFilter: "blur(6px)" }} />
            <motion.div initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", damping: 28, stiffness: 250 }} style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: 244, paddingTop: "var(--safe-top)", paddingBottom: "var(--safe-bottom)", zIndex: 70, display: "flex", flexDirection: "column", background: "var(--bg2)", borderRight: `1px solid ${b1}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 14px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <HeartPulse size={16} color="var(--p)" />
                  <span style={{ fontSize: 16, fontFamily: "'Playfair Display',Georgia,serif", fontStyle: "italic", fontWeight: 700 }}><span style={{ color: t1 }}>Med</span><span style={{ color: "var(--p)" }}>Track</span></span>
                </div>
                <button onClick={() => setMobMenu(false)} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${b1}`, background: "var(--s2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t3 }}><X size={13} /></button>
              </div>
              <div style={{ height: 1, background: b0, margin: "0 12px 9px" }} />
              <nav style={{ flex: 1, padding: "0 7px", display: "flex", flexDirection: "column", gap: 1 }}>
                {tabs.map(([id, I, l]) => (<div key={id} className={`nl ${page === id ? "on" : ""}`} onClick={() => { setPage(id); setMobMenu(false); }}><I size={15} />{l}</div>))}
                <div className="nl" style={{ color: "var(--p)" }} onClick={() => { setShowAI(true); setMobMenu(false); }}><Stethoscope size={15} color="var(--p)" /> Health Advisor</div>
                <div className="nl" style={{ color: "var(--gr)" }} onClick={() => { setShowFeedback(true); setMobMenu(false); }}><MessageSquare size={15} color="var(--gr)" /> Feedback</div>
              </nav>
              <div style={{ padding: "6px 7px 26px", display: "flex", flexDirection: "column", gap: 7 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px" }}>
                  <span style={{ color: t3, fontSize: 12 }}>Dark mode</span>
                  <div className={`sw ${!light ? "on" : ""}`} onClick={() => setLight(!light)} />
                </div>
                <button onClick={() => supabase.auth.signOut()} style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 12px", borderRadius: 11, border: "1px solid rgba(239,68,68,.18)", background: "rgba(239,68,68,.07)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 500, color: "var(--ro)" }}>
                  <LogOut size={13} /> Sign Out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>{addOpen && <MedModal onClose={() => setAddOpen(false)} onSave={saveMed} userId={user?.id} />}</AnimatePresence>
      <AnimatePresence>{editMed && <MedModal existing={editMed} onClose={() => setEditMed(null)} onSave={saveMed} userId={user?.id} />}</AnimatePresence>
      <AnimatePresence>{showNickname && <NicknameModal currentName={userName} onSave={saveName} onClose={() => setShowNickname(false)} userId={user?.id} />}</AnimatePresence>
      <AnimatePresence>{showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} userEmail={user?.email} />}</AnimatePresence>
      {!isMob && (
        <motion.button whileHover={{ scale: 1.06, y: -2 }} whileTap={{ scale: .93 }} onClick={() => setShowAI(true)} style={{ position: "fixed", bottom: "calc(26px + env(safe-area-inset-bottom, 0px))", right: "calc(26px + env(safe-area-inset-right, 0px))", width: 52, height: 52, borderRadius: 15, border: "none", background: "linear-gradient(135deg,#2563eb,#1d4ed8)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 40, boxShadow: "0 6px 24px rgba(37,99,235,.38)" }}>
          <Stethoscope size={22} color="#fff" />
        </motion.button>
      )}
      <AnimatePresence>
        {showAI && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAI(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 90, backdropFilter: "blur(5px)" }} />
            <AIDrawer onClose={() => setShowAI(false)} userName={userName} meds={meds} userId={user?.id} />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
