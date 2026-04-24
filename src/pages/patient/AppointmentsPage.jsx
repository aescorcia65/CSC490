import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Ban,
  Calendar,
  CalendarCheck,
  Check,
  ChevronDown,
  Clock,
  Info,
  Loader2,
  MapPin,
  MessageSquare,
  Plus,
  Stethoscope,
} from "lucide-react";
import { supabase } from "../../supabase";
import { useIsMobile } from "../../hooks/useIsMobile";

const PRIMARY = "var(--pl)";
const SURFACE = "var(--s1)";
const TEXT = "var(--t1)";
const TEXT_MUTED = "var(--t3)";
const BORDER = "var(--b1)";
const SHADOW = "var(--shadow-card)";
const SHADOW_LG = "var(--shadow-card-hover)";

const TAB = { UPCOMING: "upcoming", PAST: "past", CANCELLED: "cancelled", REQUESTS: "requests" };

function parseRescheduleRequest(raw) {
  if (!raw) return null;
  if (typeof raw === "object" && raw.date && raw.time) return { date: raw.date, time: raw.time };
  if (typeof raw === "string") {
    try {
      const j = JSON.parse(raw);
      if (j?.date && j?.time) return { date: j.date, time: j.time };
    } catch {
      return null;
    }
  }
  return null;
}

function parseBookingAvailability(raw) {
  if (!raw || typeof raw !== "object") return { timezone: "America/New_York", slots: {} };
  const slots = raw.slots || raw.slotsByDate || {};
  return {
    timezone: typeof raw.timezone === "string" && raw.timezone ? raw.timezone : "America/New_York",
    slots: typeof slots === "object" && slots !== null ? slots : {},
  };
}

function normTime(t) {
  const s = String(t || "").trim();
  if (!s) return "";
  if (s.length === 5 && s[2] === ":") return `${s}:00`;
  return s.length >= 8 ? s.slice(0, 8) : s;
}

function slotAllowed(slotsMap, dateStr, timeVal) {
  const arr = slotsMap[dateStr];
  if (!Array.isArray(arr)) return false;
  const want = normTime(timeVal);
  return arr.some((t) => normTime(t) === want);
}

function format12hFromTime(timeVal) {
  const hms = normTime(timeVal);
  const [hh, mm] = hms.split(":").map(Number);
  if (Number.isNaN(hh)) return String(timeVal);
  const d = new Date(2000, 0, 1, hh, mm || 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function doctorDisplayName(doc) {
  if (!doc) return "Doctor";
  const n = [doc.first_name, doc.last_name].filter(Boolean).join(" ").trim();
  return n || "Doctor";
}

function initialsFromName(name) {
  const w = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "DR";
  if (w.length === 1) return w[0].slice(0, 2).toUpperCase();
  return (w[0][0] + w[w.length - 1][0]).toUpperCase();
}

function apptSortKey(a) {
  return `${a.date}T${normTime(a.time)}`;
}

export default function AppointmentsPage({ userId, onNavigateTab }) {
  const isMob = useIsMobile();
  const shellBg = "var(--bg)";

  const [allAppts, setAllAppts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [doctorProfiles, setDoctorProfiles] = useState({});
  const [primaryDoctorId, setPrimaryDoctorId] = useState(null);
  const [tab, setTab] = useState(TAB.UPCOMING);

  const [rescheduleForId, setRescheduleForId] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [rescheduleBusy, setRescheduleBusy] = useState(false);

  const [bookOpen, setBookOpen] = useState(false);
  const [bookSelected, setBookSelected] = useState(null);
  const [bookBusy, setBookBusy] = useState(false);
  const [bookErr, setBookErr] = useState("");

  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [expandedRequestId, setExpandedRequestId] = useState(null);
  const autoExpandRescheduleRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("appointments")
      .select("id,patient_id,doctor_id,date,time,type,notes,status,reschedule_request")
      .eq("patient_id", userId)
      .order("date", { ascending: true });
    setAllAppts(data || []);
  }, [userId]);

  useEffect(() => {
    autoExpandRescheduleRef.current = false;
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    supabase
      .from("profiles")
      .select("primary_doctor_id")
      .eq("id", userId)
      .single()
      .then(({ data: prof }) => setPrimaryDoctorId(prof?.primary_doctor_id || null));
    refresh().finally(() => setLoading(false));

    const ch = supabase
      .channel(`appts-full-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `patient_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, refresh]);

  useEffect(() => {
    const ids = [...new Set(allAppts.map((a) => a.doctor_id).filter(Boolean))];
    if (primaryDoctorId) ids.push(primaryDoctorId);
    const uniq = [...new Set(ids)];
    if (!uniq.length) {
      setDoctorProfiles({});
      return;
    }
    supabase
      .from("profiles")
      .select("id,first_name,last_name,specialty,clinic_name,booking_availability")
      .in("id", uniq)
      .then(({ data }) => {
        const m = {};
        (data || []).forEach((d) => {
          m[d.id] = d;
        });
        setDoctorProfiles(m);
      });
  }, [allAppts, primaryDoctorId]);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const { upcomingConfirmed, pastList, cancelledList, requestList, counts } = useMemo(() => {
    const upcomingConfirmed = [];
    const pastList = [];
    const cancelledList = [];
    const requestList = [];

    for (const a of allAppts) {
      if (a.status === "cancelled") {
        cancelledList.push(a);
        continue;
      }
      if (a.status === "completed") {
        pastList.push(a);
        continue;
      }
      if (a.status === "rescheduled" && parseRescheduleRequest(a.reschedule_request)) {
        requestList.push(a);
        continue;
      }
      if (a.status === "scheduled") {
        if (a.date < todayStr) pastList.push(a);
        else upcomingConfirmed.push(a);
      }
    }

    upcomingConfirmed.sort((x, y) => apptSortKey(x).localeCompare(apptSortKey(y)));
    pastList.sort((x, y) => apptSortKey(y).localeCompare(apptSortKey(x)));
    cancelledList.sort((x, y) => apptSortKey(y).localeCompare(apptSortKey(x)));
    requestList.sort((x, y) => apptSortKey(x).localeCompare(apptSortKey(y)));

    return {
      upcomingConfirmed,
      pastList,
      cancelledList,
      requestList,
      counts: {
        upcoming: upcomingConfirmed.length,
        pending: requestList.length,
        cancelled: cancelledList.length,
      },
    };
  }, [allAppts, todayStr]);

  const primaryAppt = upcomingConfirmed[0] || null;
  const primaryDoc = primaryAppt ? doctorProfiles[primaryAppt.doctor_id] : null;
  const primaryBooking = primaryDoc ? parseBookingAvailability(primaryDoc.booking_availability) : { timezone: "America/New_York", slots: {} };

  const bookDoc = primaryDoctorId ? doctorProfiles[primaryDoctorId] : null;
  const bookBooking = bookDoc ? parseBookingAvailability(bookDoc.booking_availability) : { timezone: "America/New_York", slots: {} };

  const rescheduleAppt = rescheduleForId ? allAppts.find((a) => a.id === rescheduleForId) : null;
  const rescheduleDoc = rescheduleAppt ? doctorProfiles[rescheduleAppt.doctor_id] : null;
  const rescheduleBooking = rescheduleDoc ? parseBookingAvailability(rescheduleDoc.booking_availability) : { timezone: "America/New_York", slots: {} };

  const activeBooking = rescheduleAppt ? rescheduleBooking : primaryBooking;
  const activeDoctor = rescheduleAppt ? rescheduleDoc : primaryDoc;

  const slotDateKeys = useMemo(() => {
    const keys = Object.keys(activeBooking.slots || {}).filter((d) => Array.isArray(activeBooking.slots[d]) && activeBooking.slots[d].length > 0);
    keys.sort();
    return keys;
  }, [activeBooking.slots]);

  const bookSlotDateKeys = useMemo(() => {
    const keys = Object.keys(bookBooking.slots || {}).filter((d) => Array.isArray(bookBooking.slots[d]) && bookBooking.slots[d].length > 0);
    keys.sort();
    return keys;
  }, [bookBooking.slots]);

  useEffect(() => {
    if (!rescheduleForId) return;
    const first = slotDateKeys[0];
    setSelectedSlot(first ? { date: first, time: normTime(activeBooking.slots[first][0]) } : null);
  }, [rescheduleForId, slotDateKeys, activeBooking.slots]);

  useEffect(() => {
    if (!bookOpen) return;
    const first = bookSlotDateKeys[0];
    setBookSelected(first ? { date: first, time: normTime(bookBooking.slots[first][0]) } : null);
  }, [bookOpen, bookSlotDateKeys, bookBooking.slots]);

  const calendarMarkers = useMemo(() => {
    const m = { confirmed: new Set(), pending: new Set() };
    for (const a of allAppts) {
      if (a.status === "cancelled") continue;
      if (a.status === "rescheduled" && parseRescheduleRequest(a.reschedule_request)) {
        m.pending.add(a.date);
        continue;
      }
      if (a.status === "scheduled" || a.status === "completed") m.confirmed.add(a.date);
    }
    return m;
  }, [allAppts]);

  useEffect(() => {
    if (loading || autoExpandRescheduleRef.current || tab !== TAB.UPCOMING) return;
    const first = upcomingConfirmed[0];
    if (!first) return;
    const doc = doctorProfiles[first.doctor_id];
    if (!doc) return;
    const b = parseBookingAvailability(doc.booking_availability);
    const has = Object.keys(b.slots).some((k) => Array.isArray(b.slots[k]) && b.slots[k].length > 0);
    if (has) {
      setRescheduleForId(first.id);
      autoExpandRescheduleRef.current = true;
    }
  }, [loading, tab, upcomingConfirmed, doctorProfiles]);

  async function confirmReschedule() {
    if (!rescheduleAppt || !selectedSlot?.date || !selectedSlot?.time || rescheduleBusy) return;
    if (!slotAllowed(activeBooking.slots, selectedSlot.date, selectedSlot.time)) return;
    setRescheduleBusy(true);
    await supabase
      .from("appointments")
      .update({
        date: selectedSlot.date,
        time: selectedSlot.time.length === 5 ? `${selectedSlot.time}:00` : selectedSlot.time,
        status: "scheduled",
        reschedule_request: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rescheduleAppt.id);
    setRescheduleBusy(false);
    setRescheduleForId(null);
    setSelectedSlot(null);
    await refresh();
  }

  async function cancelAppointment(appt) {
    await supabase.from("appointments").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", appt.id);
    await refresh();
    if (rescheduleForId === appt.id) {
      setRescheduleForId(null);
      setSelectedSlot(null);
    }
  }

  async function bookAppointment() {
    if (!userId || !primaryDoctorId || bookBusy) return;
    if (!bookSelected?.date || !bookSelected?.time) {
      setBookErr("Select an available time.");
      return;
    }
    if (!slotAllowed(bookBooking.slots, bookSelected.date, bookSelected.time)) {
      setBookErr("That time is not offered by your doctor.");
      return;
    }
    setBookBusy(true);
    setBookErr("");
    const { error } = await supabase.from("appointments").insert({
      patient_id: userId,
      doctor_id: primaryDoctorId,
      date: bookSelected.date,
      time: bookSelected.time.length === 5 ? `${bookSelected.time}:00` : bookSelected.time,
      type: "Follow-up",
      notes: null,
      status: "scheduled",
    });
    setBookBusy(false);
    if (error) {
      setBookErr(error.message || "Could not book. Check your care team in Settings.");
      return;
    }
    setBookOpen(false);
    setBookSelected(null);
    await refresh();
  }

  const font = "'Inter', 'DM Sans', system-ui, -apple-system, sans-serif";

  const selectTab = (t) => {
    setTab(t);
    if (t !== TAB.UPCOMING) {
      setRescheduleForId(null);
      setSelectedSlot(null);
    }
  };

  const tabRow = (
    <div style={{ display: "flex", alignItems: "center", gap: 0, borderBottom: `1px solid ${BORDER}`, marginBottom: 20 }}>
      {[
        { id: TAB.UPCOMING, label: "Upcoming" },
        { id: TAB.PAST, label: "Past" },
        { id: TAB.CANCELLED, label: "Cancelled" },
        { id: TAB.REQUESTS, label: "Requests", badge: counts.pending },
      ].map((t) => {
        const on = tab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => selectTab(t.id)}
            style={{
              position: "relative",
              padding: "12px 18px",
              margin: 0,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontFamily: font,
              fontSize: 14,
              fontWeight: on ? 600 : 500,
              color: on ? PRIMARY : TEXT_MUTED,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {t.label}
            {t.badge != null && t.badge > 0 ? (
              <span style={{ minWidth: 20, height: 20, borderRadius: 99, background: PRIMARY, color: "#fff", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 6px" }}>{t.badge > 9 ? "9+" : t.badge}</span>
            ) : null}
            {on ? <span style={{ position: "absolute", left: 0, right: 0, bottom: -1, height: 2, background: PRIMARY, borderRadius: 2 }} /> : null}
          </button>
        );
      })}
    </div>
  );

  const infoBanner = (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "14px 16px",
        borderRadius: 12,
        background: "rgba(37, 99, 235, 0.08)",
        border: "1px solid rgba(37, 99, 235, 0.14)",
        marginBottom: 22,
      }}
    >
      <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(37, 99, 235, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Info size={15} color={PRIMARY} strokeWidth={2.5} />
      </div>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: TEXT, lineHeight: 1.5, fontFamily: font }}>
        Reschedule or cancel appointments only using the times available below that your doctor has provided.
      </p>
    </div>
  );

  function renderReschedulePanel(booking, sel, setSel, onConfirm, busy, confirmLabel, panelOpts = {}) {
    const title = panelOpts.title || "Reschedule your appointment";
    const subtitle = panelOpts.subtitle || "Select one of your doctor's available times. You cannot pick a time outside this list.";
    const flatTop = panelOpts.flatTop === true;
    const keys = Object.keys(booking.slots || {}).filter((d) => Array.isArray(booking.slots[d]) && booking.slots[d].length > 0);
    keys.sort();
    const activeDate = sel?.date && keys.includes(sel.date) ? sel.date : keys[0];
    const times = activeDate ? booking.slots[activeDate] || [] : [];

    return (
      <div style={flatTop ? { marginTop: 0, paddingTop: 0 } : { marginTop: 20, paddingTop: 20, borderTop: `1px solid ${BORDER}` }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: TEXT, fontFamily: font, letterSpacing: "-0.02em" }}>{title}</h3>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: TEXT_MUTED, fontFamily: font, maxWidth: 520 }}>{subtitle}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: TEXT_MUTED, fontFamily: font }}>
            <span style={{ fontWeight: 500 }}>Time zone:</span>
            <span style={{ fontWeight: 600, color: TEXT }}>{booking.timezone}</span>
            <ChevronDown size={14} style={{ opacity: 0.5 }} aria-hidden />
          </div>
        </div>

        {keys.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: TEXT_MUTED, fontFamily: font }}>Your doctor has not published available times yet. Check back later or message your care team.</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {keys.map((d) => {
                const dt = new Date(`${d}T12:00:00`);
                const label = dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                const on = activeDate === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSel({ date: d, time: normTime(booking.slots[d][0]) })}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 10,
                      border: on ? `2px solid ${PRIMARY}` : `1px solid ${BORDER}`,
                      background: on ? PRIMARY : SURFACE,
                      color: on ? "#fff" : TEXT,
                      fontFamily: font,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      boxShadow: on ? "0 4px 14px rgba(37,99,235,.25)" : "none",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMob ? "repeat(3, 1fr)" : "repeat(5, 1fr)", gap: 10 }}>
              {times.map((t) => {
                const nt = normTime(t);
                const on = sel?.date === activeDate && normTime(sel?.time) === nt;
                return (
                  <button
                    key={`${activeDate}-${nt}`}
                    type="button"
                    onClick={() => setSel({ date: activeDate, time: nt })}
                    style={{
                      position: "relative",
                      padding: "12px 10px",
                      borderRadius: 10,
                      border: on ? `2px solid ${PRIMARY}` : `1px solid ${BORDER}`,
                      background: SURFACE,
                      fontFamily: font,
                      fontSize: 13,
                      fontWeight: 600,
                      color: TEXT,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    {format12hFromTime(nt)}
                    {on ? <Check size={16} color={PRIMARY} strokeWidth={3} /> : null}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginTop: 20, flexWrap: "wrap" }}>
              <p style={{ margin: 0, fontSize: 13, color: TEXT_MUTED, fontFamily: font }}>
                {sel?.date && sel?.time ? (
                  <>
                    <span style={{ fontWeight: 600, color: TEXT }}>Selected time:</span>{" "}
                    {new Date(`${sel.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {format12hFromTime(sel.time)}
                  </>
                ) : (
                  "Select a time to continue."
                )}
              </p>
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy || !sel?.date || !sel?.time || !slotAllowed(booking.slots, sel.date, sel.time)}
                style={{
                  padding: "12px 22px",
                  borderRadius: 10,
                  border: "none",
                  background: PRIMARY,
                  color: "#fff",
                  fontFamily: font,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: busy || !sel?.date || !sel?.time ? "not-allowed" : "pointer",
                  opacity: busy || !sel?.date || !sel?.time || !slotAllowed(booking.slots, sel?.date, sel?.time) ? 0.45 : 1,
                  boxShadow: "0 4px 14px rgba(37,99,235,.3)",
                }}
              >
                {busy ? <Loader2 size={16} style={{ animation: "spin360 .7s linear infinite" }} /> : confirmLabel}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  function appointmentMainCard(appt) {
    if (!appt) return null;
    const doc = doctorProfiles[appt.doctor_id];
    const dname = doctorDisplayName(doc);
    const spec = doc?.specialty ? doc.specialty : "General Physician";
    const clinic = doc?.clinic_name || "Main Street Clinic";
    const apptD = new Date(`${appt.date}T12:00:00`);
    const monthShort = apptD.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
    const dow = apptD.toLocaleDateString("en-US", { weekday: "short" });
    const dayNum = apptD.getDate();

    const openReschedule = () => {
      setTab(TAB.UPCOMING);
      setRescheduleForId(appt.id);
      setSelectedSlot(null);
    };

    return (
      <div style={{ background: SURFACE, borderRadius: 12, border: `1px solid ${BORDER}`, boxShadow: SHADOW_LG, padding: isMob ? 16 : 22, marginBottom: 24 }}>
        <div style={{ display: "flex", gap: isMob ? 14 : 20, alignItems: "stretch", flexWrap: isMob ? "wrap" : "nowrap" }}>
          <div
            style={{
              width: isMob ? 72 : 76,
              flexShrink: 0,
              borderRadius: 12,
              background: "rgba(37, 99, 235, 0.09)",
              border: "1px solid rgba(37, 99, 235, 0.12)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "12px 8px",
            }}
          >
            <p style={{ margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", color: PRIMARY, fontFamily: font }}>{monthShort}</p>
            <p style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 800, color: TEXT, lineHeight: 1, fontFamily: font }}>{dayNum}</p>
            <p style={{ margin: "6px 0 0", fontSize: 12, fontWeight: 600, color: TEXT_MUTED, fontFamily: font }}>{dow}</p>
          </div>

          <div style={{ display: "flex", gap: 14, flex: 1, minWidth: 0, alignItems: "flex-start" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "linear-gradient(145deg, #93c5fd, #2563eb)",
                border: "2px solid #fff",
                boxShadow: "0 2px 8px rgba(37,99,235,.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 16,
                fontWeight: 700,
                flexShrink: 0,
                fontFamily: font,
              }}
            >
              {initialsFromName(dname)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: TEXT, fontFamily: font, letterSpacing: "-0.02em" }}>{appt.type || "Visit"}</h3>
                <span
                  style={{
                    padding: "4px 10px",
                    borderRadius: 99,
                    fontSize: 11,
                    fontWeight: 700,
                    background: "rgba(16, 185, 129, 0.12)",
                    color: "#047857",
                    border: "1px solid rgba(16, 185, 129, 0.28)",
                    fontFamily: font,
                  }}
                >
                  Confirmed
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <p style={{ margin: 0, fontSize: 13, color: TEXT_MUTED, fontFamily: font, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Clock size={14} strokeWidth={2} />
                  <span style={{ color: TEXT, fontWeight: 600 }}>
                    {format12hFromTime(appt.time)} <span style={{ color: TEXT_MUTED, fontWeight: 500 }}>·</span> Dr. {dname}
                  </span>
                </p>
                <p style={{ margin: 0, fontSize: 13, color: TEXT_MUTED, fontFamily: font, display: "flex", alignItems: "flex-start", gap: 8, lineHeight: 1.45 }}>
                  <Stethoscope size={14} strokeWidth={2} style={{ marginTop: 2, flexShrink: 0 }} />
                  <span>
                    <span style={{ color: TEXT, fontWeight: 600 }}>{spec}</span>
                    <span style={{ color: TEXT_MUTED }}> · </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <MapPin size={12} /> {clinic}
                    </span>
                  </span>
                </p>
                <p style={{ margin: 0, fontSize: 13, fontFamily: font, lineHeight: 1.45 }}>
                  <span style={{ color: TEXT_MUTED, fontWeight: 500 }}>Reason: </span>
                  <span style={{ color: PRIMARY, fontWeight: 600 }}>{appt.notes || "Routine check-up"}</span>
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: isMob ? "row" : "column", gap: 10, flexShrink: 0, width: isMob ? "100%" : 132, justifyContent: "flex-start" }}>
            <button
              type="button"
              onClick={openReschedule}
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: 10,
                border: `2px solid ${PRIMARY}`,
                background: SURFACE,
                color: PRIMARY,
                fontFamily: font,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reschedule
            </button>
            <button
              type="button"
              onClick={() => cancelAppointment(appt)}
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: 10,
                border: "2px solid rgba(239, 68, 68, 0.5)",
                background: SURFACE,
                color: "#dc2626",
                fontFamily: font,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>

        {rescheduleForId === appt.id ? renderReschedulePanel(activeBooking, selectedSlot, setSelectedSlot, confirmReschedule, rescheduleBusy, "Confirm reschedule", {}) : null}
      </div>
    );
  }

  function renderRequestedSection() {
    if (!requestList.length) return null;
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT, fontFamily: font }}>Requested appointments</h3>
          <span style={{ minWidth: 24, height: 24, borderRadius: 99, background: PRIMARY, color: "#fff", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{requestList.length > 9 ? "9+" : requestList.length}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {requestList.map((appt) => {
            const doc = doctorProfiles[appt.doctor_id];
            const dname = doctorDisplayName(doc);
            const rClinic = doc?.clinic_name || "Main Street Clinic";
            const req = parseRescheduleRequest(appt.reschedule_request);
            const apptD = new Date(`${appt.date}T12:00:00`);
            const monthShort = apptD.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
            const dow = apptD.toLocaleDateString("en-US", { weekday: "short" });
            const expanded = expandedRequestId === appt.id;
            return (
              <div key={appt.id} style={{ background: SURFACE, borderRadius: 14, border: `1px solid ${BORDER}`, boxShadow: SHADOW, padding: 16, display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div
                  style={{
                    width: 64,
                    flexShrink: 0,
                    borderRadius: 10,
                    background: "rgba(245, 158, 11, 0.1)",
                    border: "1px solid rgba(245, 158, 11, 0.2)",
                    textAlign: "center",
                    padding: "10px 6px",
                  }}
                >
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", color: "#d97706", fontFamily: font }}>{monthShort}</p>
                  <p style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 800, color: TEXT, fontFamily: font }}>{apptD.getDate()}</p>
                  <p style={{ margin: "4px 0 0", fontSize: 11, fontWeight: 600, color: TEXT_MUTED, fontFamily: font }}>{dow}</p>
                </div>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(145deg, #fcd34d, #f59e0b)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13, fontFamily: font }}>
                  {initialsFromName(dname)}
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: TEXT, fontFamily: font }}>{appt.type}</span>
                    <span style={{ padding: "3px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700, background: "rgba(245, 158, 11, 0.15)", color: "#b45309", border: "1px solid rgba(245, 158, 11, 0.35)", fontFamily: font }}>Pending</span>
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: TEXT_MUTED, fontFamily: font }}>
                    Dr. {dname} · {format12hFromTime(appt.time)}
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: TEXT_MUTED, fontFamily: font, display: "flex", alignItems: "center", gap: 4 }}>
                    <MapPin size={12} /> {rClinic}
                  </p>
                  {appt.notes ? (
                    <p style={{ margin: "6px 0 0", fontSize: 12, color: PRIMARY, fontWeight: 600, fontFamily: font }}>
                      Reason: {appt.notes}
                    </p>
                  ) : null}
                  {req ? (
                    <p style={{ margin: "6px 0 0", fontSize: 12, color: TEXT_MUTED, fontFamily: font }}>
                      Requested new time: {new Date(`${req.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })} at {format12hFromTime(req.time)}
                    </p>
                  ) : null}
                  {expanded ? <p style={{ margin: "10px 0 0", fontSize: 12, color: TEXT_MUTED, fontFamily: font, lineHeight: 1.5 }}>{appt.notes || "Your care team will confirm or suggest another time."}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedRequestId(expanded ? null : appt.id)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 10,
                    border: `1px solid ${BORDER}`,
                    background: SURFACE,
                    fontFamily: font,
                    fontSize: 13,
                    fontWeight: 600,
                    color: PRIMARY,
                    cursor: "pointer",
                    alignSelf: "center",
                  }}
                >
                  {expanded ? "Hide details" : "View details"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function miniCalendar() {
    const y = calendarMonth.getFullYear();
    const mo = calendarMonth.getMonth();
    const first = new Date(y, mo, 1);
    const startPad = first.getDay();
    const daysInMo = new Date(y, mo + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMo; d++) cells.push(d);
    const label = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });

    return (
      <div style={{ background: SURFACE, borderRadius: 12, border: `1px solid ${BORDER}`, boxShadow: SHADOW, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <button type="button" aria-label="Previous month" onClick={() => setCalendarMonth(new Date(y, mo - 1, 1))} style={{ border: "none", background: "var(--pd)", width: 32, height: 32, borderRadius: 8, cursor: "pointer", color: PRIMARY, fontSize: 16, fontWeight: 700 }}>
            ‹
          </button>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEXT, fontFamily: font }}>{label}</p>
          <button type="button" aria-label="Next month" onClick={() => setCalendarMonth(new Date(y, mo + 1, 1))} style={{ border: "none", background: "var(--pd)", width: 32, height: 32, borderRadius: 8, cursor: "pointer", color: PRIMARY, fontSize: 16, fontWeight: 700 }}>
            ›
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, textAlign: "center", fontSize: 11, fontWeight: 600, color: TEXT_MUTED, marginBottom: 6, fontFamily: font }}>
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {cells.map((d, idx) => {
            if (d == null) return <span key={`e-${idx}`} />;
            const ds = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const isToday = ds === todayStr;
            const hasC = calendarMarkers.confirmed.has(ds);
            const hasP = calendarMarkers.pending.has(ds);
            const isPrimary = primaryAppt && primaryAppt.date === ds;
            const todayFill = isToday;
            const apptRing = isPrimary && !todayFill;
            return (
              <button
                key={ds}
                type="button"
                onClick={() => setCalendarMonth(new Date(y, mo, d))}
                style={{
                  aspectRatio: "1",
                  maxHeight: 36,
                  borderRadius: "50%",
                  border: todayFill ? "none" : apptRing ? `2px solid ${PRIMARY}` : "1px solid transparent",
                  background: todayFill ? PRIMARY : apptRing ? "var(--pd)" : "transparent",
                  fontSize: 12,
                  fontWeight: isPrimary || isToday ? 700 : 600,
                  color: todayFill ? "#fff" : TEXT,
                  cursor: "pointer",
                  fontFamily: font,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  padding: 0,
                }}
              >
                {d}
                {!todayFill ? (
                  <span style={{ display: "flex", gap: 2, height: 4 }}>
                    {hasC ? <span style={{ width: 4, height: 4, borderRadius: 99, background: "#10b981" }} /> : null}
                    {hasP ? <span style={{ width: 4, height: 4, borderRadius: 99, background: "#f59e0b" }} /> : null}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 14, justifyContent: "center", fontSize: 11, fontFamily: font, color: TEXT_MUTED }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: "#10b981" }} /> Confirmed
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: "#f59e0b" }} /> Pending
          </span>
        </div>
      </div>
    );
  }

  function summaryCard() {
    const rows = [
      { label: "Upcoming", n: counts.upcoming, Icon: CalendarCheck, iconColor: "#10b981", iconBg: "rgba(16, 185, 129, 0.12)" },
      { label: "Pending", n: counts.pending, Icon: Clock, iconColor: "#f59e0b", iconBg: "rgba(245, 158, 11, 0.14)" },
      { label: "Cancelled", n: counts.cancelled, Icon: Ban, iconColor: "#ef4444", iconBg: "rgba(239, 68, 68, 0.1)" },
    ];
    return (
      <div style={{ background: SURFACE, borderRadius: 12, border: `1px solid ${BORDER}`, boxShadow: SHADOW, padding: 18, marginTop: 16 }}>
        <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: TEXT, fontFamily: font }}>Appointment summary</p>
        {rows.map((row, i) => {
          const Ic = row.Icon;
          return (
            <div key={row.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderTop: i === 0 ? "none" : `1px solid ${BORDER}` }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 13, color: TEXT_MUTED, fontFamily: font }}>
                <span style={{ width: 32, height: 32, borderRadius: 10, background: row.iconBg, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <Ic size={16} strokeWidth={2} color={row.iconColor} />
                </span>
                {row.label}
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, color: TEXT, fontFamily: font }}>{row.n}</span>
            </div>
          );
        })}
      </div>
    );
  }

  function needHelpCard() {
    return (
      <div style={{ background: SURFACE, borderRadius: 12, border: `1px solid ${BORDER}`, boxShadow: SHADOW, padding: 18, marginTop: 16 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: TEXT, lineHeight: 1.5, fontFamily: font }}>Need help?</p>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: TEXT_MUTED, lineHeight: 1.5, fontFamily: font }}>Contact your care team or book a new appointment.</p>
        <button
          type="button"
          onClick={() => onNavigateTab?.("messages")}
          style={{
            marginTop: 14,
            width: "100%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "11px 14px",
            borderRadius: 10,
            border: `2px solid ${PRIMARY}`,
            background: SURFACE,
            color: PRIMARY,
            fontFamily: font,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <MessageSquare size={16} strokeWidth={2} /> Message care team
        </button>
      </div>
    );
  }

  function listCard(title, rows, empty) {
    return (
      <div style={{ background: SURFACE, borderRadius: 16, border: `1px solid ${BORDER}`, boxShadow: SHADOW_LG, padding: 22 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 17, fontWeight: 700, color: TEXT, fontFamily: font }}>{title}</h3>
        {!rows.length ? (
          <p style={{ margin: 0, fontSize: 14, color: TEXT_MUTED, fontFamily: font }}>{empty}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {rows.map((a) => {
              const doc = doctorProfiles[a.doctor_id];
              return (
                <div key={a.id} style={{ padding: 14, borderRadius: 12, border: `1px solid ${BORDER}`, background: "var(--s2)" }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEXT, fontFamily: font }}>{a.type}</p>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: TEXT_MUTED, fontFamily: font }}>
                    {a.date} · {format12hFromTime(a.time)} · Dr. {doctorDisplayName(doc)}
                  </p>
                  {a.status === "cancelled" ? (
                    <span style={{ display: "inline-block", marginTop: 8, fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>Cancelled</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const rightCol = (
    <div style={{ width: isMob ? "100%" : 320, flexShrink: 0 }}>
      {miniCalendar()}
      {summaryCard()}
      {needHelpCard()}
    </div>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", touchAction: "pan-y", background: shellBg, fontFamily: font }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: isMob ? "16px 14px 72px" : "28px 32px 40px" }}>
        <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: isMob ? 28 : 32, fontWeight: 800, color: TEXT, letterSpacing: "-0.03em", fontFamily: font }}>Appointments</h1>
            <p style={{ margin: "8px 0 0", fontSize: 15, color: TEXT_MUTED, fontFamily: font }}>Book visits and manage your schedule.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setBookOpen(true);
              setBookErr("");
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 20px",
              borderRadius: 10,
              border: "none",
              background: PRIMARY,
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: font,
              boxShadow: "0 4px 16px rgba(37,99,235,.35)",
            }}
          >
            <Plus size={18} strokeWidth={2.5} /> Book appointment
          </button>
        </header>

        <div style={{ display: "flex", gap: isMob ? 0 : 28, alignItems: "flex-start", flexDirection: isMob ? "column" : "row" }}>
          <main style={{ flex: 1, minWidth: 0 }}>
            {tabRow}
            {infoBanner}

            {loading ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: TEXT_MUTED, padding: 24 }}>
                <Loader2 size={18} style={{ animation: "spin360 .7s linear infinite" }} />
                <span style={{ fontFamily: font }}>Loading your schedule…</span>
              </div>
            ) : (
              <>
                {tab === TAB.UPCOMING && (
                  <>
                    {primaryAppt ? (
                      appointmentMainCard(primaryAppt)
                    ) : (
                      <div style={{ background: SURFACE, borderRadius: 16, border: `1px solid ${BORDER}`, boxShadow: SHADOW, padding: 40, textAlign: "center" }}>
                        <Calendar size={36} color={TEXT_MUTED} style={{ opacity: 0.35, margin: "0 auto 12px" }} />
                        <p style={{ margin: 0, fontSize: 15, color: TEXT_MUTED, fontFamily: font }}>No upcoming appointments.</p>
                        <button
                          type="button"
                          onClick={() => setBookOpen(true)}
                          style={{ marginTop: 16, padding: "10px 18px", borderRadius: 10, border: "none", background: PRIMARY, color: "#fff", fontWeight: 600, cursor: "pointer", fontFamily: font }}
                        >
                          Book appointment
                        </button>
                      </div>
                    )}
                    {renderRequestedSection()}
                  </>
                )}

                {tab === TAB.PAST && listCard("Past appointments", pastList, "No past appointments yet.")}
                {tab === TAB.CANCELLED && listCard("Cancelled appointments", cancelledList, "No cancelled appointments.")}
                {tab === TAB.REQUESTS && (
                  <div>
                    {requestList.length === 0 ? (
                      <div style={{ background: SURFACE, borderRadius: 16, border: `1px solid ${BORDER}`, padding: 32, fontFamily: font, color: TEXT_MUTED }}>You have no pending scheduling requests.</div>
                    ) : (
                      renderRequestedSection()
                    )}
                  </div>
                )}
              </>
            )}
          </main>
          {rightCol}
        </div>
      </div>

      <AnimatePresence>
        {bookOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setBookOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              style={{ background: SURFACE, borderRadius: 18, padding: 24, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", border: `1px solid ${BORDER}`, boxShadow: "var(--shadow-modal)" }}
            >
              <h3 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 700, color: TEXT, fontFamily: font }}>Book appointment</h3>
              {!primaryDoctorId ? (
                <p style={{ color: TEXT_MUTED, fontSize: 14, fontFamily: font, lineHeight: 1.55 }}>Add a primary doctor under Settings → Care team before booking.</p>
              ) : (
                <>
                  <p style={{ margin: "0 0 18px", fontSize: 13, color: TEXT_MUTED, fontFamily: font }}>Choose from the times your doctor has made available.</p>
                  {bookSlotDateKeys.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 14, color: TEXT_MUTED, fontFamily: font }}>No published slots yet. Ask your care team to share availability.</p>
                  ) : (
                    renderReschedulePanel(bookBooking, bookSelected, setBookSelected, bookAppointment, bookBusy, "Confirm booking", {
                      flatTop: true,
                      title: "Choose an available time",
                      subtitle: "Pick from the slots your doctor published. Custom times are not available.",
                    })
                  )}
                  {bookErr ? <p style={{ color: "#dc2626", fontSize: 13, marginTop: 12, fontFamily: font }}>{bookErr}</p> : null}
                </>
              )}
              <button
                type="button"
                onClick={() => setBookOpen(false)}
                style={{ marginTop: 20, padding: "10px 16px", borderRadius: 10, border: `1px solid ${BORDER}`, background: "transparent", fontFamily: font, fontWeight: 600, color: TEXT_MUTED, cursor: "pointer", width: "100%" }}
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
