import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Ban,
  Calendar,
  CalendarCheck,
  Check,
  Clock,
  Info,
  Loader2,
  MapPin,
  MessageSquare,
  Plus,
  Stethoscope,
  Video,
} from "lucide-react";
import { supabase } from "../../supabase";
import { useAuth } from "../../contexts/AuthContext";
import { useIsMobile } from "../../hooks/useIsMobile";
import { formatProfileFullName } from "../../lib/profileName";
import { isVirtualCheckInWindowOpen } from "../../lib/virtualCheckIn";
import { careTeamDoctorEntries } from "../../lib/careTeam";
import { buildVideoCallUrlFromRoom, buildVideoRoomId, getAppointmentVideoWindow, isVideoStyleVisitType } from "../../lib/videoCall";
import { buildPatientRescheduleRequestPayload, hasActiveRescheduleRequest, normalizeRescheduleRequest } from "../../lib/rescheduleRequest";
import VirtualPreVisitModal from "../../components/appointments/VirtualPreVisitModal";
import VideoCallPanel from "../../components/video/VideoCallPanel";
import { isVirtualVisitCheckInComplete, patientEnterVirtualWaitingRoom } from "../../lib/virtualVisitCheckIn";
import { getEffectiveVirtualVisitStatus, VS } from "../../lib/virtualVisitStatus";

/** Stable placeholder so `patientProfile ?? {}` doesn’t allocate a new object every render (would retrigger modal hydration). */
const FALLBACK_VISIT_PROFILE = Object.freeze({});

const PRIMARY = "var(--pl)";
const SURFACE = "var(--s1)";
const TEXT = "var(--t1)";
const TEXT_MUTED = "var(--t3)";
const BORDER = "var(--b1)";
const SHADOW = "var(--shadow-card)";
const SHADOW_LG = "var(--shadow-card-hover)";

const TAB = { UPCOMING: "upcoming", VIRTUAL: "virtual", IN_PERSON: "in_person", PAST: "past", CANCELLED: "cancelled", REQUESTS: "requests" };

/** @deprecated use normalizeRescheduleRequest — kept for a few call sites expecting { date, time } */
function parseRescheduleRequest(raw) {
  const n = normalizeRescheduleRequest(raw);
  if (!n) return null;
  if (n.phase === "doctor_counter" && n.doctor) return { date: n.doctor.date, time: n.doctor.time, _counter: true, _patient: n.patient };
  return { date: n.patient.date, time: n.patient.time };
}

function parseBookingAvailability(raw) {
  if (!raw || typeof raw !== "object") return { timezone: "America/New_York", slots: {} };
  const slots = raw.slots || raw.slotsByDate || {};
  const cleanSlots = Object.entries(slots || {}).reduce((acc, [date, times]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return acc;
    if (!Array.isArray(times)) return acc;
    const normalized = [...new Set(times.map((t) => normTime(t)).filter(Boolean))].sort();
    if (normalized.length) acc[date] = normalized;
    return acc;
  }, {});
  return {
    timezone: typeof raw.timezone === "string" && raw.timezone ? raw.timezone : "America/New_York",
    slots: cleanSlots,
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

function slotTaken(doctorTakenSlots, doctorId, dateStr, timeVal) {
  if (!doctorId || !dateStr) return false;
  const byDoctor = doctorTakenSlots?.[doctorId];
  if (!byDoctor) return false;
  const byDate = byDoctor[dateStr];
  if (!byDate) return false;
  const want = normTime(timeVal);
  return !!byDate[want];
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

function localDateKey(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function AppointmentsPage({ userId, onNavigateTab }) {
  const isMob = useIsMobile();
  const { setDisplayName } = useAuth();
  const shellBg = "var(--bg)";

  const [allAppts, setAllAppts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [doctorProfiles, setDoctorProfiles] = useState({});
  const [bookingSchemaMissing, setBookingSchemaMissing] = useState(false);
  const [primaryDoctorId, setPrimaryDoctorId] = useState(null);
  const [careTeamDoctorIds, setCareTeamDoctorIds] = useState([]);
  const [linkedDoctorIds, setLinkedDoctorIds] = useState([]);
  const [doctorTakenSlots, setDoctorTakenSlots] = useState({});
  const [doctorProfilesRefreshTick, setDoctorProfilesRefreshTick] = useState(0);
  const [bookingDoctorId, setBookingDoctorId] = useState(null);
  const [tab, setTab] = useState(TAB.UPCOMING);

  const [rescheduleForId, setRescheduleForId] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [rescheduleBusy, setRescheduleBusy] = useState(false);

  const [bookOpen, setBookOpen] = useState(false);
  const [bookSelected, setBookSelected] = useState(null);
  const [bookVisitMode, setBookVisitMode] = useState("in_person");
  const [bookBusy, setBookBusy] = useState(false);
  const [bookErr, setBookErr] = useState("");
  const [bookNotice, setBookNotice] = useState("");
  /** Toast shown when the doctor books/updates an appointment on the patient's behalf. */
  const [apptToast, setApptToast] = useState(null);
  const [videoActionBusyId, setVideoActionBusyId] = useState(null);
  const [activeCallApptId, setActiveCallApptId] = useState(null);
  const [activeCallDoctorId, setActiveCallDoctorId] = useState(null);
  /** Bumps every 1s so visit-window UI (check-in, join) stays in sync with real time. */
  const [, setVideoUiTick] = useState(0);

  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => localDateKey());
  const [expandedRequestId, setExpandedRequestId] = useState(null);
  const autoExpandRescheduleRef = useRef(false);
  /** Set to true after the initial appointments load — prevents the realtime INSERT handler
   *  from firing a toast for rows that arrive during the first fetch. */
  const initialLoadDoneRef = useRef(false);
  /** Tracks appointment IDs the patient just booked themselves, so the realtime echo
   *  does not double-show a toast for their own booking. */
  const selfBookedIdsRef = useRef(new Set());
  /** Debounced full refetch so realtime + doctor-created rows always match Supabase (partial payloads). */
  const appointmentsRefreshTimerRef = useRef(null);

  const [patientProfile, setPatientProfile] = useState(null);
  const [preVisitModalOpen, setPreVisitModalOpen] = useState(false);
  const [preVisitModalReadOnly, setPreVisitModalReadOnly] = useState(false);
  const [preVisitModalAppt, setPreVisitModalAppt] = useState(null);
  const [videoVisitRequests, setVideoVisitRequests] = useState([]);
  const [visitReqDoctorId, setVisitReqDoctorId] = useState(null);
  const [visitReqDate, setVisitReqDate] = useState(() => localDateKey());
  const [visitReqTime, setVisitReqTime] = useState("09:00");
  const [visitReqReason, setVisitReqReason] = useState("");
  const [visitReqBusy, setVisitReqBusy] = useState(false);
  const [visitReqErr, setVisitReqErr] = useState("");

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("appointments")
      .select("id,patient_id,doctor_id,date,time,type,notes,status,reschedule_request,virtual_visit_status")
      .eq("patient_id", userId)
      .order("date", { ascending: true });
    setAllAppts(data || []);
  }, [userId]);

  useEffect(() => {
    autoExpandRescheduleRef.current = false;
  }, [userId]);

  useEffect(() => {
    const t = setInterval(() => setVideoUiTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const performVirtualCheckIn = useCallback(
    async (appt, videoWindow, videoRoomId, _waitingKey) => {
      if (!userId) throw new Error("You must be signed in to check in.");
      if (!appt?.doctor_id) throw new Error("This appointment is missing a doctor. Refresh and try again.");
      if (!videoWindow) throw new Error("This is not a video visit or the time is invalid.");
      if (!videoRoomId) throw new Error("Could not start check-in. Refresh the page and try again.");
      const st = String(appt.status || "");
      if (st === "cancelled" || st === "completed") {
        throw new Error("This appointment cannot be checked in.");
      }
      if (String(appt.date || "").slice(0, 10) < localDateKey()) {
        throw new Error("Past appointments cannot be checked in.");
      }
      if (!isVideoStyleVisitType(appt)) {
        throw new Error("Only video / virtual visits use online check-in.");
      }
      if (!isVirtualCheckInWindowOpen(appt, Date.now())) {
        throw new Error("Check-in is only available during your visit window.");
      }
      setVideoActionBusyId(appt.id);
      try {
        const { error } = await patientEnterVirtualWaitingRoom({ userId, appt, videoWindow });
        if (error) {
          const msg = error.message || (typeof error === "string" ? error : "Could not complete check-in.");
          throw new Error(msg);
        }
        setAllAppts((prev) =>
          prev.map((a) => (a.id === appt.id ? { ...a, virtual_visit_status: VS.WAITING_FOR_DOCTOR } : a)),
        );
      } finally {
        setVideoActionBusyId(null);
      }
    },
    [userId],
  );

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    const reloadLinkedDoctors = () => {
      supabase
        .from("doctor_patients")
        .select("doctor_id")
        .eq("patient_id", userId)
        .then(({ data }) => {
          const ids = [...new Set((data || []).map((r) => r.doctor_id).filter(Boolean))];
          setLinkedDoctorIds(ids);
          setBookingDoctorId((prev) => prev || ids[0] || null);
        });
    };
    supabase
      .from("profiles")
      .select("primary_doctor_id,care_team,first_name,last_name,pre_visit_intake,allergies,medical_conditions")
      .eq("id", userId)
      .single()
      .then(({ data: prof }) => {
        const nextPrimary = prof?.primary_doctor_id || null;
        setPrimaryDoctorId(nextPrimary);
        const teamIds = careTeamDoctorEntries(prof).map((e) => e.doctorId).filter(Boolean);
        setCareTeamDoctorIds([...new Set(teamIds)]);
        setBookingDoctorId(nextPrimary);
        setPatientProfile(prof || null);
      });
    reloadLinkedDoctors();
    initialLoadDoneRef.current = false;
    refresh().finally(() => {
      setLoading(false);
      // Allow a short grace window before treating incoming INSERTs as doctor-booked toasts.
      setTimeout(() => { initialLoadDoneRef.current = true; }, 600);
    });

    const scheduleAppointmentsFetch = () => {
      if (appointmentsRefreshTimerRef.current != null) {
        window.clearTimeout(appointmentsRefreshTimerRef.current);
      }
      appointmentsRefreshTimerRef.current = window.setTimeout(() => {
        appointmentsRefreshTimerRef.current = null;
        void refresh();
      }, 160);
    };

    const ch = supabase
      .channel(`appts-full-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `patient_id=eq.${userId}` }, (payload) => {
        if (payload.eventType === "INSERT" && payload.new) {
          const row = payload.new;
          setAllAppts((prev) => {
            if (prev.some((a) => a.id === row.id)) return prev;
            return [...prev, row].sort((a, b) => `${a.date}T${normTime(a.time)}`.localeCompare(`${b.date}T${normTime(b.time)}`));
          });
          // Show a toast only when: initial load is done AND the patient didn't book this themselves.
          if (initialLoadDoneRef.current && !selfBookedIdsRef.current.has(row.id)) {
            const dateStr = row.date ? new Date(row.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
            const timeStr = row.time ? format12hFromTime(row.time) : "";
            const label = [dateStr, timeStr].filter(Boolean).join(" at ");
            setApptToast(label ? `New appointment scheduled: ${label}` : "Your doctor has scheduled a new appointment for you.");
          }
          scheduleAppointmentsFetch();
          return;
        }
        if (payload.eventType === "UPDATE" && payload.new?.id) {
          const row = payload.new;
          setAllAppts((prev) => {
            const exists = prev.some((a) => a.id === row.id);
            const next = exists ? prev.map((a) => (a.id === row.id ? { ...a, ...row } : a)) : [...prev, row];
            return next.sort((a, b) => `${a.date}T${normTime(a.time)}`.localeCompare(`${b.date}T${normTime(b.time)}`));
          });
          scheduleAppointmentsFetch();
          return;
        }
        if (payload.eventType === "DELETE" && payload.old?.id) {
          setAllAppts((prev) => prev.filter((a) => a.id !== payload.old.id));
          scheduleAppointmentsFetch();
          return;
        }
        scheduleAppointmentsFetch();
      })
      .subscribe();
    const vch = supabase
      .channel(`appts-vvisit-req-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "video_visit_requests", filter: `patient_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === "INSERT" && payload.new) {
            const row = payload.new;
            setVideoVisitRequests((prev) => {
              if (prev.some((r) => r.id === row.id)) return prev;
              return [row, ...prev].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
            });
            return;
          }
          if (payload.eventType === "UPDATE" && payload.new) {
            const row = payload.new;
            setVideoVisitRequests((prev) => {
              const ix = prev.findIndex((r) => r.id === row.id);
              const merged = ix >= 0 ? prev.map((r) => (r.id === row.id ? { ...r, ...row } : r)) : [row, ...prev];
              return merged.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
            });
            return;
          }
          if (payload.eventType === "DELETE" && payload.old?.id) {
            setVideoVisitRequests((prev) => prev.filter((r) => r.id !== payload.old.id));
            return;
          }
          supabase
            .from("video_visit_requests")
            .select("*")
            .eq("patient_id", userId)
            .order("created_at", { ascending: false })
            .then(({ data }) => setVideoVisitRequests(data || []));
        },
      )
      .subscribe();
    const dpCh = supabase
      .channel(`appts-doc-links-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "doctor_patients", filter: `patient_id=eq.${userId}` }, () => {
        reloadLinkedDoctors();
        setDoctorProfilesRefreshTick((n) => n + 1);
      })
      .subscribe();
    return () => {
      if (appointmentsRefreshTimerRef.current != null) window.clearTimeout(appointmentsRefreshTimerRef.current);
      appointmentsRefreshTimerRef.current = null;
      supabase.removeChannel(ch);
      supabase.removeChannel(vch);
      supabase.removeChannel(dpCh);
    };
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId) {
      setVideoVisitRequests([]);
      return;
    }
    let cancelled = false;
    supabase
      .from("video_visit_requests")
      .select("*")
      .eq("patient_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setVideoVisitRequests(data || []);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  /** Keep intake/allergies/conditions fresh after doctor deletes form or any profile update — works across realtime, refresh, re-login */
  useEffect(() => {
    if (!userId) return undefined;
    const cols = "primary_doctor_id,care_team,first_name,last_name,pre_visit_intake,allergies,medical_conditions";
    const ch = supabase
      .channel(`mt-patient-profile-intake-${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
        async () => {
          const { data } = await supabase.from("profiles").select(cols).eq("id", userId).single();
          if (data) {
            setPatientProfile(data);
            setPrimaryDoctorId(data?.primary_doctor_id || null);
            const teamIds = careTeamDoctorEntries(data).map((e) => e.doctorId).filter(Boolean);
            setCareTeamDoctorIds([...new Set(teamIds)]);
            setDoctorProfilesRefreshTick((n) => n + 1);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [userId]);

  useEffect(() => {
    if (primaryDoctorId) setVisitReqDoctorId((prev) => prev || primaryDoctorId);
  }, [primaryDoctorId]);

  useEffect(() => {
    setVisitReqDoctorId((prev) => {
      if (prev) return prev;
      return [...new Set([primaryDoctorId, ...linkedDoctorIds, bookingDoctorId].filter(Boolean))][0] || null;
    });
  }, [primaryDoctorId, linkedDoctorIds, bookingDoctorId]);

  const trackedDoctorIds = useMemo(
    () =>
      [
        ...new Set(
          [
            ...(allAppts || []).map((a) => a.doctor_id),
            primaryDoctorId,
            ...linkedDoctorIds,
            ...careTeamDoctorIds,
            bookingDoctorId,
          ].filter(Boolean),
        ),
      ],
    [allAppts, primaryDoctorId, linkedDoctorIds, careTeamDoctorIds, bookingDoctorId],
  );

  useEffect(() => {
    const uniq = trackedDoctorIds;
    (async () => {
      let rpcDoctors = [];
      const rpcRes = await supabase.rpc("get_patient_booking_doctors", { p_patient_id: userId });
      if (!rpcRes.error) {
        rpcDoctors = rpcRes.data || [];
      }
      const loadProfiles = async (idList) => {
        if (!idList.length) return [];
        const withAvail = await supabase
          .from("profiles")
          .select("id,first_name,last_name,specialty,clinic_name,booking_availability")
          .in("id", idList);
        if (withAvail.error) {
          const missingAvail = String(withAvail.error.message || "").toLowerCase().includes("booking_availability");
          if (missingAvail) {
            setBookingSchemaMissing(true);
            const fallback = await supabase
              .from("profiles")
              .select("id,first_name,last_name,specialty,clinic_name")
              .in("id", idList);
            return fallback.data || [];
          }
          setBookingSchemaMissing(false);
          return [];
        }
        setBookingSchemaMissing(false);
        return withAvail.data || [];
      };

      let data = await loadProfiles(uniq);
      if (rpcDoctors.length) {
        const byId = {};
        [...rpcDoctors, ...data].forEach((d) => {
          const prev = byId[d.id] || {};
          byId[d.id] = {
            ...prev,
            ...d,
            // Always trust direct profiles query for booking availability (rpc responses can lag).
            booking_availability:
              Object.prototype.hasOwnProperty.call(d || {}, "booking_availability")
                ? d.booking_availability
                : prev.booking_availability,
          };
        });
        data = Object.values(byId);
      }

      const m = {};
      (data || []).forEach((d) => {
        m[d.id] = d;
      });
      setDoctorProfiles(m);
      const idsLoaded = Object.keys(m);
      if (idsLoaded.length) {
        setBookingDoctorId((prev) => (prev && m[prev] ? prev : (primaryDoctorId && m[primaryDoctorId] ? primaryDoctorId : idsLoaded[0])));
      }
    })();
  }, [trackedDoctorIds, primaryDoctorId, userId, doctorProfilesRefreshTick]);

  useEffect(() => {
    if (!userId || !trackedDoctorIds.length) {
      setDoctorTakenSlots({});
      return;
    }
    let cancelled = false;
    const today = localDateKey();
    const refreshTaken = async () => {
      const { data } = await supabase
        .from("appointments")
        .select("doctor_id,date,time,status")
        .in("doctor_id", trackedDoctorIds)
        .in("status", ["scheduled", "rescheduled"])
        .gte("date", today);
      if (cancelled) return;
      const next = {};
      (data || []).forEach((row) => {
        if (!row?.doctor_id || !row?.date || !row?.time) return;
        const dId = row.doctor_id;
        const d = row.date;
        const t = normTime(row.time);
        if (!next[dId]) next[dId] = {};
        if (!next[dId][d]) next[dId][d] = {};
        next[dId][d][t] = true;
      });
      setDoctorTakenSlots(next);
    };
    void refreshTaken();
    const chProfiles = supabase
      .channel(`pt-booking-profiles-${userId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (payload) => {
        const id = payload?.new?.id;
        if (!id || !trackedDoctorIds.includes(id)) return;
        setDoctorProfilesRefreshTick((n) => n + 1);
      })
      .subscribe();
    const chAppts = supabase
      .channel(`pt-booking-doctor-appts-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, (payload) => {
        const row = payload?.new ?? payload?.old;
        if (!row?.doctor_id || !trackedDoctorIds.includes(row.doctor_id)) return;
        void refreshTaken();
      })
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(chProfiles);
      void supabase.removeChannel(chAppts);
    };
  }, [trackedDoctorIds, userId]);

  useEffect(() => {
    if (!userId) return;
    const poll = setInterval(() => {
      setDoctorProfilesRefreshTick((n) => n + 1);
    }, 10000);
    return () => clearInterval(poll);
  }, [userId]);

  const todayStr = useMemo(() => localDateKey(), []);
  const isSlotBookable = useCallback(
    (doctorId, slotsMap, dateStr, timeVal) =>
      slotAllowed(slotsMap, dateStr, timeVal) && !slotTaken(doctorTakenSlots, doctorId, dateStr, timeVal),
    [doctorTakenSlots],
  );

  const { upcomingConfirmed, virtualList, inPersonList, pastList, cancelledList, requestList, counts } = useMemo(() => {
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
      if (a.status === "scheduled" && a.date < todayStr) {
        pastList.push(a);
        continue;
      }
      if (a.status === "rescheduled" && a.date < todayStr) {
        pastList.push(a);
        continue;
      }
      if (hasActiveRescheduleRequest(a) && a.date >= todayStr) {
        requestList.push(a);
      }
      if (a.status === "scheduled" || a.status === "rescheduled") {
        if (a.date >= todayStr) upcomingConfirmed.push(a);
      }
    }

    upcomingConfirmed.sort((x, y) => apptSortKey(x).localeCompare(apptSortKey(y)));
    pastList.sort((x, y) => apptSortKey(y).localeCompare(apptSortKey(x)));
    cancelledList.sort((x, y) => apptSortKey(y).localeCompare(apptSortKey(x)));
    requestList.sort((x, y) => apptSortKey(x).localeCompare(apptSortKey(y)));

    const virtualList = upcomingConfirmed.filter((a) => isVideoStyleVisitType(a));
    const inPersonList = upcomingConfirmed.filter((a) => !isVideoStyleVisitType(a));

    const pendingVisitReq = videoVisitRequests.filter((r) => String(r?.status || "") === "pending").length;

    return {
      upcomingConfirmed,
      virtualList,
      inPersonList,
      pastList,
      cancelledList,
      requestList,
      counts: {
        upcoming: upcomingConfirmed.length,
        virtual: virtualList.length,
        inPerson: inPersonList.length,
        pending: requestList.length + pendingVisitReq,
        cancelled: cancelledList.length,
      },
    };
  }, [allAppts, todayStr, videoVisitRequests]);

  const primaryAppt = upcomingConfirmed[0] || null;
  const primaryDoc = primaryAppt ? doctorProfiles[primaryAppt.doctor_id] : null;
  const primaryBooking = primaryDoc ? parseBookingAvailability(primaryDoc.booking_availability) : { timezone: "America/New_York", slots: {} };

  const linkedDoctors = useMemo(() => {
    return Object.values(doctorProfiles)
      .map((doc) => {
        const booking = parseBookingAvailability(doc.booking_availability);
        const slotCount = Object.entries(booking.slots || {}).reduce((sum, [dateKey, arr]) => {
          if (dateKey < todayStr) return sum;
          return sum + (Array.isArray(arr) ? arr.length : 0);
        }, 0);
        return { ...doc, slotCount };
      });
  }, [doctorProfiles, todayStr]);
  const doctorsWithSlots = useMemo(() => linkedDoctors.filter((doc) => doc.slotCount > 0), [linkedDoctors]);
  const slotsPreviewByDoctor = useMemo(() => {
    return linkedDoctors
      .map((doc) => {
        const booking = parseBookingAvailability(doc.booking_availability);
        const preview = [];
        Object.keys(booking.slots || {})
          .filter((dateKey) => dateKey >= todayStr)
          .sort()
          .forEach((dateKey) => {
            const times = Array.isArray(booking.slots[dateKey]) ? booking.slots[dateKey] : [];
            times.forEach((tm) => preview.push({ date: dateKey, time: normTime(tm) }));
          });
        return { doctor: doc, slots: preview.slice(0, 8), slotCount: doc.slotCount || 0 };
      });
  }, [linkedDoctors, todayStr]);

  useEffect(() => {
    if (!bookOpen) return;
    const hasCurrent = bookingDoctorId && doctorsWithSlots.some((d) => d.id === bookingDoctorId);
    if (hasCurrent) return;
    const preferred = primaryDoctorId && doctorsWithSlots.some((d) => d.id === primaryDoctorId) ? primaryDoctorId : null;
    setBookingDoctorId(preferred || doctorsWithSlots[0]?.id || primaryDoctorId || null);
  }, [bookOpen, doctorsWithSlots, bookingDoctorId, primaryDoctorId]);

  const bookDoc = bookingDoctorId ? doctorProfiles[bookingDoctorId] : null;
  const bookBooking = bookDoc ? parseBookingAvailability(bookDoc.booking_availability) : { timezone: "America/New_York", slots: {} };

  const rescheduleAppt = rescheduleForId ? allAppts.find((a) => a.id === rescheduleForId) : null;
  const rescheduleDoc = rescheduleAppt ? doctorProfiles[rescheduleAppt.doctor_id] : null;
  const rescheduleBooking = rescheduleDoc ? parseBookingAvailability(rescheduleDoc.booking_availability) : { timezone: "America/New_York", slots: {} };

  const activeBooking = rescheduleAppt ? rescheduleBooking : primaryBooking;
  const activeDoctor = rescheduleAppt ? rescheduleDoc : primaryDoc;

  const slotDateKeys = useMemo(() => {
    const keys = Object.keys(activeBooking.slots || {}).filter((d) => d >= todayStr && Array.isArray(activeBooking.slots[d]) && activeBooking.slots[d].length > 0);
    keys.sort();
    return keys;
  }, [activeBooking.slots, todayStr]);

  const bookSlotDateKeys = useMemo(() => {
    const keys = Object.keys(bookBooking.slots || {}).filter((d) => d >= todayStr && Array.isArray(bookBooking.slots[d]) && bookBooking.slots[d].length > 0);
    keys.sort();
    return keys;
  }, [bookBooking.slots, todayStr]);

  useEffect(() => {
    if (!rescheduleForId) return;
    const first = slotDateKeys[0];
    setSelectedSlot(first ? { date: first, time: normTime(activeBooking.slots[first][0]) } : null);
  }, [rescheduleForId, slotDateKeys, activeBooking.slots]);

  useEffect(() => {
    if (!bookOpen) return;
    const selectedDate = bookSelected?.date;
    const selectedTimes = selectedDate ? bookBooking.slots[selectedDate] : null;
    if (selectedDate && Array.isArray(selectedTimes) && selectedTimes.length > 0) {
      const safeTime = normTime(bookSelected?.time);
      const fallback = normTime(selectedTimes[0]);
      const nextTime = selectedTimes.map(normTime).includes(safeTime) ? safeTime : fallback;
      setBookSelected((prev) => (prev?.date === selectedDate && prev?.time === nextTime ? prev : { date: selectedDate, time: nextTime }));
      return;
    }
    const first = bookSlotDateKeys[0];
    setBookSelected(first ? { date: first, time: normTime(bookBooking.slots[first][0]) } : null);
  }, [bookOpen, bookSlotDateKeys, bookBooking.slots, bookSelected]);

  const calendarMarkers = useMemo(() => {
    const m = { confirmed: new Set(), pending: new Set() };
    for (const a of allAppts) {
      if (a.status === "cancelled") continue;
      if (hasActiveRescheduleRequest(a) && a.date) {
        m.pending.add(a.date);
        continue;
      }
      if (a.status === "scheduled" || a.status === "completed") m.confirmed.add(a.date);
    }
    return m;
  }, [allAppts]);

  const selectedDateAppointments = useMemo(() => {
    const rows = allAppts.filter((a) => a.date === selectedCalendarDate);
    rows.sort((a, b) => apptSortKey(a).localeCompare(apptSortKey(b)));
    return rows;
  }, [allAppts, selectedCalendarDate]);

  useEffect(() => {
    if (!bookNotice) return;
    const t = setTimeout(() => setBookNotice(""), 8000);
    return () => clearTimeout(t);
  }, [bookNotice]);

  useEffect(() => {
    if (!apptToast) return;
    const t = setTimeout(() => setApptToast(null), 8000);
    return () => clearTimeout(t);
  }, [apptToast]);

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

  async function submitRescheduleRequest() {
    if (!rescheduleAppt || !selectedSlot?.date || !selectedSlot?.time || rescheduleBusy) return;
    if (rescheduleAppt.date < todayStr) {
      return;
    }
    if (rescheduleAppt.date === todayStr) {
      const nowMs = Date.now();
      const t = normTime(rescheduleAppt.time);
      const apptStartMs = Date.parse(`${rescheduleAppt.date}T${t}`);
      if (!Number.isNaN(apptStartMs) && apptStartMs < nowMs) {
        return;
      }
    }
    if (!isSlotBookable(rescheduleAppt.doctor_id, activeBooking.slots, selectedSlot.date, selectedSlot.time)) return;
    setRescheduleBusy(true);
    const reqTime = selectedSlot.time.length === 5 ? `${selectedSlot.time}:00` : selectedSlot.time;
    const payload = buildPatientRescheduleRequestPayload({ date: selectedSlot.date, time: reqTime });
    await supabase
      .from("appointments")
      .update({
        status: "scheduled",
        reschedule_request: payload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rescheduleAppt.id);
    await supabase
      .from("notifications")
      .insert({
        user_id: rescheduleAppt.doctor_id,
        type: "general",
        title: "Reschedule request",
        body: `A patient requested to move an appointment to ${new Date(`${selectedSlot.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${format12hFromTime(reqTime)}.`,
        related_id: rescheduleAppt.id,
      });
    setRescheduleBusy(false);
    setRescheduleForId(null);
    setSelectedSlot(null);
    setTab(TAB.REQUESTS);
    setExpandedRequestId(rescheduleAppt.id);
    await refresh();
  }

  async function cancelPendingRescheduleRequest(appt) {
    if (!appt?.id) return;
    setRescheduleBusy(true);
    await supabase
      .from("appointments")
      .update({ reschedule_request: null, status: "scheduled", updated_at: new Date().toISOString() })
      .eq("id", appt.id);
    setRescheduleBusy(false);
    await refresh();
  }

  async function acceptDoctorCounterAppt(appt) {
    const n = normalizeRescheduleRequest(appt.reschedule_request);
    if (n?.phase !== "doctor_counter" || !n.doctor) return;
    setRescheduleBusy(true);
    await supabase
      .from("appointments")
      .update({
        date: n.doctor.date,
        time: n.doctor.time,
        status: "scheduled",
        reschedule_request: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", appt.id);
    await supabase
      .from("notifications")
      .insert({
        user_id: appt.doctor_id,
        type: "general",
        title: "Reschedule accepted",
        body: "The patient accepted your suggested appointment time.",
        related_id: appt.id,
      });
    setRescheduleBusy(false);
    await refresh();
  }

  async function declineDoctorCounterAppt(appt) {
    const n = normalizeRescheduleRequest(appt.reschedule_request);
    if (n?.phase !== "doctor_counter" || !n.patient) return;
    setRescheduleBusy(true);
    const back = buildPatientRescheduleRequestPayload({ date: n.patient.date, time: n.patient.time });
    await supabase
      .from("appointments")
      .update({ reschedule_request: back, status: "scheduled", updated_at: new Date().toISOString() })
      .eq("id", appt.id);
    await supabase
      .from("notifications")
      .insert({
        user_id: appt.doctor_id,
        type: "general",
        title: "Suggested time declined",
        body: "The patient declined the suggested time. Your previous proposal was removed; the patient's reschedule request is still pending.",
        related_id: appt.id,
      });
    setRescheduleBusy(false);
    await refresh();
  }

  async function cancelAppointment(appt) {
    const patch = { status: "cancelled", updated_at: new Date().toISOString() };
    if (isVideoStyleVisitType(appt)) patch.virtual_visit_status = VS.CANCELLED;
    await supabase.from("appointments").update(patch).eq("id", appt.id);
    const cancelLabel = new Date(`${appt.date}T${normTime(appt.time) || "00:00:00"}`).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const cancelNotifRes = await supabase.from("notifications").insert({
      user_id: appt.doctor_id,
      type: "general",
      title: "Appointment cancelled",
      body: `A patient cancelled an appointment scheduled for ${cancelLabel}.`,
      related_id: appt.id,
    });
    if (cancelNotifRes.error) {
      await supabase.from("patient_messages").insert({
        sender_id: userId,
        recipient_id: appt.doctor_id,
        body: `Appointment cancelled: ${appt.type || "Visit"} on ${cancelLabel}.`,
      });
    }
    setAllAppts((prev) => prev.map((a) => (a.id === appt.id ? { ...a, ...patch } : a)));
    await refresh();
    if (rescheduleForId === appt.id) {
      setRescheduleForId(null);
      setSelectedSlot(null);
    }
  }

  async function bookAppointment() {
    if (!userId || !bookingDoctorId || bookBusy) return;
    if (!bookSelected?.date || !bookSelected?.time) {
      setBookErr("Select an available time.");
      return;
    }
    if (!isSlotBookable(bookingDoctorId, bookBooking.slots, bookSelected.date, bookSelected.time)) {
      setBookErr("That time is not offered by your doctor.");
      return;
    }
    setBookBusy(true);
    setBookErr("");
    setBookNotice("");
    const visitType = bookVisitMode === "virtual" ? "Virtual Visit" : "In-person Visit";
    const bookingTime = bookSelected.time.length === 5 ? `${bookSelected.time}:00` : bookSelected.time;
    const insertRow = {
      patient_id: userId,
      doctor_id: bookingDoctorId,
      date: bookSelected.date,
      time: bookingTime,
      type: visitType,
      notes: null,
      status: "scheduled",
      ...(visitType === "Virtual Visit" ? { virtual_visit_status: VS.PENDING } : {}),
    };
    const { data: createdAppt, error } = await supabase.from("appointments").insert(insertRow).select("id,patient_id,doctor_id,date,time,type,notes,status,reschedule_request,virtual_visit_status").single();
    setBookBusy(false);
    if (error) {
      setBookErr(error.message || "Could not book. Check your care team in Settings.");
      return;
    }
    const apptLabel = new Date(`${bookSelected.date}T${bookingTime}`).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const notifRes = await supabase.from("notifications").insert({
      user_id: bookingDoctorId,
      type: "general",
      title: "New appointment booked",
      body: `A patient booked a ${visitType.toLowerCase()} for ${apptLabel}.`,
    });
    if (notifRes.error) {
      await supabase.from("patient_messages").insert({
        sender_id: userId,
        recipient_id: bookingDoctorId,
        body: `Appointment booked: ${visitType} on ${apptLabel}.`,
      });
    }
    setBookOpen(false);
    setTab(TAB.UPCOMING);
    setCalendarMonth(new Date(`${bookSelected.date}T12:00:00`));
    setSelectedCalendarDate(bookSelected.date);
    setBookSelected(null);
    setBookVisitMode("in_person");
    if (createdAppt) {
      // Mark this ID so the realtime echo doesn't re-show a "doctor booked" toast.
      selfBookedIdsRef.current.add(createdAppt.id);
      setTimeout(() => selfBookedIdsRef.current.delete(createdAppt.id), 10000);
      setAllAppts((prev) => (prev.some((a) => a.id === createdAppt.id) ? prev : [...prev, createdAppt]));
    }
    setBookNotice(`Successfully booked for ${apptLabel}.`);
  }

  async function submitVideoVisitRequest() {
    if (!userId || visitReqBusy) return;
    const docId =
      visitReqDoctorId ||
      doctorIdsForVisitRequest[0] ||
      primaryDoctorId ||
      bookingDoctorId;
    const reason = visitReqReason.trim();
    setVisitReqErr("");
    if (!docId) {
      setVisitReqErr("Add a doctor in Settings under Care team first.");
      return;
    }
    if (!visitReqDate || !String(visitReqTime || "").trim()) {
      setVisitReqErr("Choose both a preferred date and time.");
      return;
    }
    if (reason.length < 3) {
      setVisitReqErr("Briefly explain why you need to see the doctor.");
      return;
    }
    setVisitReqBusy(true);
    const timeSql = visitReqTime.length === 5 ? `${visitReqTime}:00` : visitReqTime;
    const { data, error } = await supabase
      .from("video_visit_requests")
      .insert({
        patient_id: userId,
        doctor_id: docId,
        requested_date: visitReqDate,
        requested_time: timeSql,
        reason,
        status: "pending",
      })
      .select("*")
      .single();
    setVisitReqBusy(false);
    if (error) {
      setVisitReqErr(error.message || "Could not send request. If this persists, run the urgent visit migration in Supabase.");
      return;
    }
    if (data) setVideoVisitRequests((prev) => [data, ...prev.filter((r) => r.id !== data.id)]);
    setVisitReqReason("");
    setBookNotice("Your request was sent to your doctor.");
    const ptName = formatProfileFullName(patientProfile) || "A patient";
    const dateLabel = new Date(`${visitReqDate}T12:00:00`).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const timeLabel = format12hFromTime(timeSql);
    await supabase
      .from("notifications")
      .insert({
        user_id: docId,
        type: "general",
        title: "New patient visit request",
        body: `${ptName} requested a virtual visit on ${dateLabel} at ${timeLabel}. Reason: ${reason.slice(0, 220)}${reason.length > 220 ? "…" : ""}`,
      });
  }

  const doctorIdsForVisitRequest = useMemo(
    () =>
      [...new Set([...(allAppts || []).map((a) => a.doctor_id), primaryDoctorId, ...linkedDoctorIds, ...careTeamDoctorIds, bookingDoctorId].filter(Boolean))],
    [allAppts, primaryDoctorId, linkedDoctorIds, careTeamDoctorIds, bookingDoctorId],
  );

  const font = "'Inter', 'DM Sans', system-ui, -apple-system, sans-serif";

  const selectTab = (t) => {
    setTab(t);
    if (t !== TAB.UPCOMING) {
      setRescheduleForId(null);
      setSelectedSlot(null);
    }
  };

  const tabRow = (
    <div style={{ display: "flex", alignItems: "center", gap: 0, borderBottom: `1px solid ${BORDER}`, marginBottom: 20, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      {[
        { id: TAB.UPCOMING, label: "Upcoming" },
        { id: TAB.VIRTUAL, label: "Virtual" },
        { id: TAB.IN_PERSON, label: "In-person" },
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
              padding: isMob ? "11px 14px" : "12px 18px",
              margin: 0,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontFamily: font,
              fontSize: isMob ? 13 : 14,
              fontWeight: on ? 600 : 500,
              color: on ? PRIMARY : TEXT_MUTED,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              whiteSpace: "nowrap",
              flexShrink: 0,
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
    const doctorId = panelOpts.doctorId || null;
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
                const unavailable = !isSlotBookable(doctorId, booking.slots, activeDate, nt);
                return (
                  <button
                    key={`${activeDate}-${nt}`}
                    type="button"
                    onClick={() => {
                      if (unavailable) return;
                      setSel({ date: activeDate, time: nt });
                    }}
                    disabled={unavailable}
                    style={{
                      position: "relative",
                      padding: "12px 10px",
                      borderRadius: 10,
                      border: on ? `2px solid ${PRIMARY}` : `1px solid ${unavailable ? "var(--b0)" : BORDER}`,
                      background: unavailable ? "var(--s2)" : SURFACE,
                      fontFamily: font,
                      fontSize: 13,
                      fontWeight: 600,
                      color: unavailable ? TEXT_MUTED : TEXT,
                      cursor: unavailable ? "not-allowed" : "pointer",
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
                disabled={busy || !sel?.date || !sel?.time || !isSlotBookable(doctorId, booking.slots, sel.date, sel.time)}
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
                  opacity: busy || !sel?.date || !sel?.time || !isSlotBookable(doctorId, booking.slots, sel?.date, sel?.time) ? 0.45 : 1,
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
    const now = Date.now();
    const videoWindow = getAppointmentVideoWindow(appt);
    const portalCutoff = videoWindow ? videoWindow.portalEndMs ?? videoWindow.windowEndMs : 0;
    const videoRoomId = videoWindow ? buildVideoRoomId(userId, appt.doctor_id) : "";
    const videoUrl = videoRoomId ? buildVideoCallUrlFromRoom(videoRoomId) : "";
    const waitingKey = videoWindow ? `${appt.id}:${videoWindow.windowStartMs}` : "";
    const evs = getEffectiveVirtualVisitStatus(appt);
    const isCallStarted = evs === VS.CALL_STARTED;  // WebRTC: doctor opened call
    const isCallEnded = evs === VS.CALL_ENDED;       // WebRTC: call finished
    const isInWaitingRoom = evs === VS.WAITING_FOR_DOCTOR || evs === VS.VIDEO_STARTED;
    const isDoctorVideoStartedDb = evs === VS.VIDEO_STARTED;
    const isStarted = isDoctorVideoStartedDb;
    const isCheckedIn = isInWaitingRoom;
    const videoState = !videoWindow
      ? "none"
      : now < videoWindow.windowStartMs
        ? "too_early"
        : now > portalCutoff
          ? "expired"
          : isStarted
            ? "doctor_started"
            : "waiting";
    const waitingForDoctorLocked = videoState === "waiting" && isCheckedIn && !isStarted;
    const needsPreVisitComplete = !!(videoWindow && !isVirtualVisitCheckInComplete(patientProfile));
    const showPrimaryVideoBtn =
      !!videoWindow && videoState !== "doctor_started" && !waitingForDoctorLocked;
    /** Pre-visit form only needs an appointment window + doctor — not Jitsi URL — so button stays clickable while profile loads. */
    const virtualBtnDisabled =
      !showPrimaryVideoBtn ||
      (!needsPreVisitComplete && !videoUrl) ||
      videoActionBusyId === appt.id ||
      videoState === "expired" ||
      (!needsPreVisitComplete && videoState === "too_early");

    let virtualPrimaryLabel = "Video unavailable";
    if (videoWindow) {
      if (needsPreVisitComplete) {
        virtualPrimaryLabel =
          videoState === "too_early"
            ? "Complete check-in (opens soon)"
            : "Complete check-in";
      } else if (videoState === "too_early") {
        virtualPrimaryLabel = `Opens ${new Date(videoWindow.windowStartMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
      } else if (videoState === "expired") {
        virtualPrimaryLabel = "Visit ended";
      } else {
        virtualPrimaryLabel = "Check in for visit.";
      }
    }

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
    const handleVirtualVisitClick = async () => {
      if (!videoWindow || !appt?.doctor_id || !userId) {
        if (typeof window !== "undefined") window.alert("Video visit is not available. Check that you have a video appointment with a care provider.");
        return;
      }
      if (!isVirtualVisitCheckInComplete(patientProfile)) {
        setPreVisitModalReadOnly(false);
        setPreVisitModalAppt(appt);
        setPreVisitModalOpen(true);
        return;
      }
      if (!videoUrl) {
        if (typeof window !== "undefined") window.alert("Video link could not be prepared. Refresh the page and try again.");
        return;
      }
      if (videoState === "too_early" || videoState === "expired" || waitingForDoctorLocked || videoState === "doctor_started") return;

      if (!isCheckedIn) {
        try {
          await performVirtualCheckIn(appt, videoWindow, videoRoomId, waitingKey);
        } catch (e) {
          const msg = e?.message || e?.error_description || "Check-in failed. Please try again.";
          if (typeof window !== "undefined") window.alert(msg);
        }
      }
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
                  <span style={{ color: PRIMARY, fontWeight: 600 }}>{appt.notes || "Check up"}</span>
                </p>
                {videoWindow ? (
                  <div style={{ marginTop: 6, borderRadius: 10, border: `1px solid ${BORDER}`, background: videoState === "doctor_started" ? "rgba(16,185,129,.08)" : "var(--s1)", padding: "8px 10px" }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, fontFamily: font, color: TEXT }}>Virtual waiting room</p>
                    <p style={{ margin: "4px 0 0", fontSize: 11.5, fontFamily: font, color: TEXT_MUTED }}>
                      {videoState === "too_early"
                        ? `Opens at ${new Date(videoWindow.windowStartMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
                        : videoState === "expired"
                          ? "The reconnect period for this video visit has ended."
                          : videoState === "doctor_started"
                            ? "Open Messages with your doctor to join video — appointments do not open the video room."
                            : isCheckedIn
                              ? "Checked in. Waiting for doctor to start the video."
                              : "When your visit window opens, use Check in for visit to enter the waiting room (complete a short form the first time)."}
                    </p>
                  </div>
                ) : null}
                {videoWindow && isVirtualVisitCheckInComplete(patientProfile) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPreVisitModalReadOnly(true);
                      setPreVisitModalAppt(appt);
                      setPreVisitModalOpen(true);
                    }}
                    style={{
                      marginTop: 8,
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: `1px solid ${PRIMARY}`,
                      background: "transparent",
                      color: PRIMARY,
                      fontFamily: font,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    View saved check-in
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: isMob ? "row" : "column", gap: 10, flexShrink: 0, width: isMob ? "100%" : 132, justifyContent: "flex-start" }}>
            {/* WebRTC Join Call button — shown when doctor has opened the call */}
            {isCallStarted ? (
              <button
                type="button"
                onClick={() => { setActiveCallApptId(appt.id); setActiveCallDoctorId(appt.doctor_id); }}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: "#059669",
                  color: "#fff",
                  fontFamily: font,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  boxShadow: "0 0 0 3px rgba(5,150,105,.25)",
                }}
              >
                <Video size={14} /> Join Call
              </button>
            ) : isCallEnded ? (
              <div style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: `1px solid ${BORDER}`, background: "var(--s2)", fontFamily: font, fontSize: 13, fontWeight: 600, color: "var(--b1, #94a3b8)", textAlign: "center" }}>
                Call ended
              </div>
            ) : videoWindow && showPrimaryVideoBtn ? (
              <button
                type="button"
                onClick={handleVirtualVisitClick}
                disabled={virtualBtnDisabled}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: `2px solid ${PRIMARY}`,
                  background: !virtualBtnDisabled ? PRIMARY : SURFACE,
                  color: !virtualBtnDisabled ? "#fff" : PRIMARY,
                  fontFamily: font,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: !virtualBtnDisabled ? "pointer" : "not-allowed",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  opacity: videoActionBusyId === appt.id ? 0.7 : 1,
                }}
              >
                <Video size={14} /> {videoActionBusyId === appt.id ? "Working..." : virtualPrimaryLabel}
              </button>
            ) : videoWindow ? (
              <div
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: `1px solid ${BORDER}`,
                  background: "var(--s1)",
                  fontFamily: font,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: TEXT,
                  textAlign: "center",
                  lineHeight: 1.4,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <span>{waitingForDoctorLocked ? "Checked in. Waiting for doctor to start the video." : "Your doctor has joined. Join video chat."}</span>
              </div>
            ) : null}
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

        {rescheduleForId === appt.id
          ? renderReschedulePanel(activeBooking, selectedSlot, setSelectedSlot, submitRescheduleRequest, rescheduleBusy, "Send request", {
              doctorId: appt.doctor_id,
            })
          : null}
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
            const n = normalizeRescheduleRequest(appt.reschedule_request);
            const isCounter = n?.phase === "doctor_counter" && n?.doctor;
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
                    <span style={{ padding: "3px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700, background: "rgba(245, 158, 11, 0.15)", color: "#b45309", border: "1px solid rgba(245, 158, 11, 0.35)", fontFamily: font }}>{isCounter ? "Response needed" : "Pending approval"}</span>
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: TEXT_MUTED, fontFamily: font }}>
                    Dr. {dname} — current: {new Date(`${appt.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })} at {format12hFromTime(appt.time)}
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: TEXT_MUTED, fontFamily: font, display: "flex", alignItems: "center", gap: 4 }}>
                    <MapPin size={12} /> {rClinic}
                  </p>
                  {appt.notes ? (
                    <p style={{ margin: "6px 0 0", fontSize: 12, color: PRIMARY, fontWeight: 600, fontFamily: font }}>
                      Reason: {appt.notes}
                    </p>
                  ) : null}
                  {n?.patient && !isCounter ? (
                    <p style={{ margin: "6px 0 0", fontSize: 12, color: TEXT_MUTED, fontFamily: font }}>
                      You requested: {new Date(`${n.patient.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })} at {format12hFromTime(n.patient.time)}
                    </p>
                  ) : null}
                  {isCounter && n.patient && n.doctor ? (
                    <>
                      <p style={{ margin: "6px 0 0", fontSize: 12, color: TEXT_MUTED, fontFamily: font }}>
                        Your request: {new Date(`${n.patient.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })} at {format12hFromTime(n.patient.time)}
                      </p>
                      <p style={{ margin: "4px 0 0", fontSize: 12, color: TEXT, fontWeight: 600, fontFamily: font }}>
                        Suggested: {new Date(`${n.doctor.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })} at {format12hFromTime(n.doctor.time)}
                      </p>
                    </>
                  ) : null}
                  {expanded ? <p style={{ margin: "10px 0 0", fontSize: 12, color: TEXT_MUTED, fontFamily: font, lineHeight: 1.5 }}>{appt.notes || "Your care team will confirm or suggest another time."}</p> : null}
                  {isCounter ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                      <button
                        type="button"
                        disabled={rescheduleBusy}
                        onClick={() => void acceptDoctorCounterAppt(appt)}
                        style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: PRIMARY, color: "#fff", fontFamily: font, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={rescheduleBusy}
                        onClick={() => void declineDoctorCounterAppt(appt)}
                        style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${BORDER}`, background: SURFACE, color: TEXT, fontFamily: font, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                      >
                        Decline
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={rescheduleBusy}
                      onClick={() => void cancelPendingRescheduleRequest(appt)}
                      style={{ marginTop: 10, padding: "8px 14px", borderRadius: 10, border: `1px solid ${BORDER}`, background: SURFACE, color: TEXT_MUTED, fontFamily: font, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                    >
                      Cancel request
                    </button>
                  )}
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

  function handleCalendarDateClick(dateStr) {
    setSelectedCalendarDate(dateStr);
    const requestHit = requestList.find((a) => a.date === dateStr);
    if (requestHit) {
      setTab(TAB.REQUESTS);
      setExpandedRequestId(requestHit.id);
      return;
    }
    const confirmedHit = allAppts.find(
      (a) => a.date === dateStr && (a.status === "scheduled" || a.status === "rescheduled" || a.status === "completed"),
    );
    if (confirmedHit) {
      setTab(confirmedHit.date < todayStr ? TAB.PAST : TAB.UPCOMING);
      setExpandedRequestId(null);
      return;
    }
    const cancelledHit = allAppts.find((a) => a.date === dateStr && a.status === "cancelled");
    if (cancelledHit) {
      setTab(TAB.CANCELLED);
      setExpandedRequestId(null);
      return;
    }
    setTab(TAB.UPCOMING);
    setExpandedRequestId(null);
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
            const isSelected = selectedCalendarDate === ds;
            const isPrimary = primaryAppt && primaryAppt.date === ds;
            const todayFill = isToday;
            const apptRing = (isPrimary || isSelected) && !todayFill;
            return (
              <button
                key={ds}
                type="button"
                onClick={() => handleCalendarDateClick(ds)}
                style={{
                  aspectRatio: "1",
                  maxHeight: 36,
                  borderRadius: "50%",
                  border: todayFill ? "none" : apptRing ? `2px solid ${PRIMARY}` : "1px solid transparent",
                  background: todayFill ? PRIMARY : apptRing ? "var(--pd)" : "transparent",
                  fontSize: 12,
                  fontWeight: isPrimary || isToday || isSelected ? 700 : 600,
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

  function selectedDateCard() {
    const label = new Date(`${selectedCalendarDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    return (
      <div style={{ background: SURFACE, borderRadius: 12, border: `1px solid ${BORDER}`, boxShadow: SHADOW, padding: 16, marginTop: 12 }}>
        <p style={{ margin: "0 0 2px", fontSize: 12, fontWeight: 700, color: TEXT_MUTED, fontFamily: font, letterSpacing: "0.04em", textTransform: "uppercase" }}>Selected date</p>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEXT, fontFamily: font }}>{label}</p>
        {selectedDateAppointments.length === 0 ? (
          <p style={{ margin: "10px 0 0", fontSize: 13, color: TEXT_MUTED, fontFamily: font }}>No appointments on this date.</p>
        ) : (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {selectedDateAppointments.map((a) => {
              const doc = doctorProfiles[a.doctor_id];
              const statusColor = a.status === "cancelled" ? "#ef4444" : hasActiveRescheduleRequest(a) ? "#d97706" : "#10b981";
              const statusLabel = a.status === "cancelled" ? "cancelled" : hasActiveRescheduleRequest(a) ? "pending approval" : a.status;
              return (
                <div key={a.id} style={{ border: `1px solid ${BORDER}`, borderRadius: 10, background: "var(--s2)", padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: TEXT, fontFamily: font }}>{a.type || "Visit"}</p>
                    <span style={{ fontSize: 10, fontWeight: 700, color: statusColor, textTransform: "capitalize", fontFamily: font }}>{statusLabel}</span>
                  </div>
                  <p style={{ margin: "5px 0 0", fontSize: 12, color: TEXT_MUTED, fontFamily: font }}>
                    {format12hFromTime(a.time)} · Dr. {doctorDisplayName(doc)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function summaryCard() {
    const rows = [
      { label: "Upcoming", n: counts.upcoming, Icon: CalendarCheck, iconColor: "#10b981", iconBg: "rgba(16, 185, 129, 0.12)", tab: TAB.UPCOMING },
      { label: "Pending", n: counts.pending, Icon: Clock, iconColor: "#f59e0b", iconBg: "rgba(245, 158, 11, 0.14)", tab: TAB.REQUESTS },
      { label: "Cancelled", n: counts.cancelled, Icon: Ban, iconColor: "#ef4444", iconBg: "rgba(239, 68, 68, 0.1)", tab: TAB.CANCELLED },
    ];
    return (
      <div style={{ background: SURFACE, borderRadius: 12, border: `1px solid ${BORDER}`, boxShadow: SHADOW, padding: 18, marginTop: 16 }}>
        <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: TEXT, fontFamily: font }}>Appointment summary</p>
        {rows.map((row, i) => {
          const Ic = row.Icon;
          const active = tab === row.tab;
          return (
            <button
              key={row.label}
              type="button"
              onClick={() => selectTab(row.tab)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 0",
                borderTop: i === 0 ? "none" : `1px solid ${BORDER}`,
                borderLeft: "none",
                borderRight: "none",
                borderBottom: "none",
                background: "transparent",
                cursor: "pointer",
                borderRadius: 0,
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 13, color: active ? TEXT : TEXT_MUTED, fontFamily: font, fontWeight: active ? 700 : 500 }}>
                <span style={{ width: 32, height: 32, borderRadius: 10, background: active ? "var(--pd)" : row.iconBg, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <Ic size={16} strokeWidth={2} color={active ? PRIMARY : row.iconColor} />
                </span>
                {row.label}
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, color: active ? PRIMARY : TEXT, fontFamily: font }}>{row.n}</span>
            </button>
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

  function renderUpcomingExtras() {
    if (upcomingConfirmed.length <= 1) return null;
    return (
      <div style={{ background: SURFACE, borderRadius: 14, border: `1px solid ${BORDER}`, boxShadow: SHADOW, padding: 16, marginTop: 14 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700, color: TEXT, fontFamily: font }}>More upcoming appointments</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {upcomingConfirmed.slice(1).map((a) => {
            const doc = doctorProfiles[a.doctor_id];
            return (
              <div key={a.id} style={{ padding: 12, borderRadius: 10, border: `1px solid ${BORDER}`, background: "var(--s2)" }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEXT, fontFamily: font }}>{a.type || "Visit"}</p>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: TEXT_MUTED, fontFamily: font }}>
                  {new Date(`${a.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {format12hFromTime(a.time)} · Dr. {doctorDisplayName(doc)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderAvailableSlotsSection() {
    return (
      <div style={{ background: SURFACE, borderRadius: 14, border: `1px solid ${BORDER}`, boxShadow: SHADOW, padding: isMob ? 14 : 16, marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT, fontFamily: font }}>Available booking slots</h3>
          <span style={{ color: TEXT_MUTED, fontSize: 12, fontFamily: font }}>
            {slotsPreviewByDoctor.reduce((n, row) => n + row.slots.length, 0)} slots shown
          </span>
        </div>
        {bookingSchemaMissing ? (
          <p style={{ margin: 0, color: "#dc2626", fontSize: 13, fontFamily: font }}>Booking slots are not available yet because the database migration is not applied.</p>
        ) : slotsPreviewByDoctor.length === 0 ? (
          <p style={{ margin: 0, color: TEXT_MUTED, fontSize: 13, fontFamily: font }}>No linked doctors found yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {slotsPreviewByDoctor.map((row) => (
              <div key={row.doctor.id} style={{ border: `1px solid ${BORDER}`, borderRadius: 12, background: "var(--s2)", padding: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <p style={{ margin: 0, color: TEXT, fontSize: 13, fontWeight: 700, fontFamily: font }}>Dr. {doctorDisplayName(row.doctor)}</p>
                  {row.slotCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setBookingDoctorId(row.doctor.id);
                        setBookOpen(true);
                        setBookErr("");
                      }}
                      style={{ padding: "6px 10px", borderRadius: 9, border: "none", background: PRIMARY, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font }}
                    >
                      Book
                    </button>
                  ) : (
                    <span style={{ color: TEXT_MUTED, fontSize: 11, fontWeight: 600, fontFamily: font }}>No slots yet</span>
                  )}
                </div>
                {row.slots.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {row.slots.map((s) => (
                      <span key={`${row.doctor.id}-${s.date}-${s.time}`} style={{ padding: "4px 8px", borderRadius: 99, border: `1px solid ${BORDER}`, background: SURFACE, color: TEXT_MUTED, fontSize: 11, fontFamily: font }}>
                        {new Date(`${s.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {format12hFromTime(s.time)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, color: TEXT_MUTED, fontSize: 12, fontFamily: font }}>No published availability yet for this doctor.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const rightCol = (
    <div style={{ width: isMob ? "100%" : "min(340px,32vw)", flexShrink: 0 }}>
      {miniCalendar()}
      {selectedDateCard()}
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
        {bookNotice ? (
          <div style={{ marginBottom: 12, borderRadius: 10, padding: "10px 12px", background: "rgba(16,185,129,.12)", border: "1px solid rgba(16,185,129,.35)", color: "#065f46", fontSize: 13, fontWeight: 600, fontFamily: font }}>
            {bookNotice}
          </div>
        ) : null}
        {apptToast ? (
          <div style={{ marginBottom: 12, borderRadius: 10, padding: "10px 14px", background: "rgba(37,99,235,.1)", border: "1px solid rgba(37,99,235,.3)", color: "var(--pl)", fontSize: 13, fontWeight: 600, fontFamily: font, display: "flex", alignItems: "center", gap: 8 }}>
            <Calendar size={15} style={{ flexShrink: 0 }} />
            {apptToast}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: isMob ? 0 : 28, alignItems: "flex-start", flexDirection: isMob ? "column" : "row" }}>
          <main style={{ flex: 1, minWidth: 0 }}>
            {tabRow}
            {infoBanner}
            {!loading ? renderAvailableSlotsSection() : null}

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
                      <>
                        {appointmentMainCard(primaryAppt)}
                        {renderUpcomingExtras()}
                      </>
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

                {tab === TAB.VIRTUAL && listCard("Virtual appointments", virtualList, "No upcoming virtual appointments.")}
                {tab === TAB.IN_PERSON && listCard("In-person appointments", inPersonList, "No upcoming in-person appointments.")}
                {tab === TAB.PAST && listCard("Past appointments", pastList, "No past appointments yet.")}
                {tab === TAB.CANCELLED && listCard("Cancelled appointments", cancelledList, "No cancelled appointments.")}
                {tab === TAB.REQUESTS && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                    <div style={{ background: SURFACE, borderRadius: 16, border: `1px solid ${BORDER}`, boxShadow: SHADOW, padding: isMob ? 16 : 20, fontFamily: font }}>
                      <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: TEXT }}>Need to see a doctor?</h3>
                      <p style={{ margin: "0 0 16px", fontSize: 13, color: TEXT_MUTED, lineHeight: 1.55 }}>
                        Submit the date and time you need. Your doctor will approve or deny; if approved, your schedule updates and you receive a confirmation.
                      </p>
                      {doctorIdsForVisitRequest.length ? (
                        <div style={{ display: "grid", gap: 12 }}>
                          {doctorIdsForVisitRequest.length >= 1 ? (
                            <div>
                              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: TEXT_MUTED, marginBottom: 6 }}>Doctor</label>
                              <select
                                value={visitReqDoctorId || doctorIdsForVisitRequest[0] || ""}
                                onChange={(e) => setVisitReqDoctorId(e.target.value)}
                                style={{ width: "100%", borderRadius: 10, border: `1px solid ${BORDER}`, padding: "10px 12px", fontFamily: font, fontSize: 13 }}
                              >
                                {doctorIdsForVisitRequest.map((id) => (
                                  <option key={id} value={id}>
                                    Dr. {doctorDisplayName(doctorProfiles[id])}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : null}
                          <div style={{ display: "grid", gridTemplateColumns: isMob ? "1fr" : "1fr 1fr", gap: 12 }}>
                            <div>
                              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: TEXT_MUTED, marginBottom: 6 }}>Preferred date</label>
                              <input
                                type="date"
                                value={visitReqDate}
                                min={localDateKey()}
                                onChange={(e) => setVisitReqDate(e.target.value)}
                                style={{ width: "100%", borderRadius: 10, border: `1px solid ${BORDER}`, padding: "10px 12px", fontFamily: font }}
                              />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: TEXT_MUTED, marginBottom: 6 }}>Preferred time</label>
                              <input
                                type="time"
                                value={visitReqTime}
                                onChange={(e) => setVisitReqTime(e.target.value)}
                                style={{ width: "100%", borderRadius: 10, border: `1px solid ${BORDER}`, padding: "10px 12px", fontFamily: font }}
                              />
                            </div>
                          </div>
                          <div>
                            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: TEXT_MUTED, marginBottom: 6 }}>Why do you need a visit?</label>
                            <textarea
                              value={visitReqReason}
                              onChange={(e) => setVisitReqReason(e.target.value)}
                              rows={3}
                              placeholder="Brief description"
                              style={{ width: "100%", borderRadius: 10, border: `1px solid ${BORDER}`, padding: "10px 12px", fontFamily: font, fontSize: 13, resize: "vertical" }}
                            />
                          </div>
                          {visitReqErr ? <p style={{ margin: 0, fontSize: 13, color: "#dc2626" }}>{visitReqErr}</p> : null}
                          <button
                            type="button"
                            disabled={visitReqBusy}
                            onClick={() => void submitVideoVisitRequest()}
                            style={{
                              padding: "10px 16px",
                              borderRadius: 10,
                              border: "none",
                              background: PRIMARY,
                              color: "#fff",
                              fontFamily: font,
                              fontWeight: 700,
                              cursor: visitReqBusy ? "wait" : "pointer",
                            }}
                          >
                            {visitReqBusy ? "Sending…" : "Send request"}
                          </button>
                        </div>
                      ) : (
                        <p style={{ margin: 0, fontSize: 13, color: TEXT_MUTED }}>Link a doctor in Settings first.</p>
                      )}
                    </div>
                    {videoVisitRequests.length ? (
                      <div>
                        <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700, color: TEXT, fontFamily: font }}>Urgent visit requests</h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {videoVisitRequests.map((r) => (
                            <div
                              key={r.id}
                              style={{
                                background: SURFACE,
                                borderRadius: 12,
                                border: `1px solid ${BORDER}`,
                                padding: "12px 14px",
                                fontFamily: font,
                              }}
                            >
                              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: TEXT }}>
                                {new Date(`${r.requested_date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · {format12hFromTime(r.requested_time)}{" "}
                                <span
                                  style={{
                                    marginLeft: 8,
                                    fontSize: 11,
                                    padding: "2px 8px",
                                    borderRadius: 99,
                                    fontWeight: 700,
                                    background:
                                      r.status === "approved" ? "rgba(16,185,129,.15)" : r.status === "denied" ? "rgba(220,38,38,.12)" : "rgba(245,158,11,.15)",
                                    color:
                                      r.status === "approved" ? "#047857" : r.status === "denied" ? "#dc2626" : "#b45309",
                                  }}
                                >
                                  {r.status === "pending" ? "Pending" : r.status === "approved" ? "Approved" : "Denied"}
                                </span>
                              </p>
                              <p style={{ margin: "6px 0 0", fontSize: 12, color: TEXT_MUTED }}>{r.reason}</p>
                              {r.doctor_suggested_date && r.doctor_suggested_time ? (
                                <p style={{ margin: "8px 0 0", fontSize: 12.5, color: PRIMARY, fontWeight: 600 }}>
                                  Doctor suggested:{" "}
                                  {new Date(`${r.doctor_suggested_date}T12:00:00`).toLocaleDateString(undefined, {
                                    weekday: "short",
                                    month: "short",
                                    day: "numeric",
                                  })}{" "}
                                  at {format12hFromTime(r.doctor_suggested_time)}
                                </p>
                              ) : null}
                              {r.status === "denied" && r.denial_note ? (
                                <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#991b1b", fontWeight: 600 }}>
                                  From clinic: {r.denial_note}
                                </p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {renderRequestedSection()}
                    {requestList.length === 0 && videoVisitRequests.filter((x) => x.status === "pending").length === 0 ? (
                      <p style={{ margin: 0, fontFamily: font, fontSize: 13, color: TEXT_MUTED }}>No pending reschedule approvals.</p>
                    ) : null}
                  </div>
                )}
              </>
            )}
          </main>
          {rightCol}
        </div>
      </div>
      {bookNotice ? (
        <div style={{ position: "fixed", top: "calc(12px + env(safe-area-inset-top,0px))", right: 12, zIndex: 200, borderRadius: 10, padding: "10px 12px", background: "rgba(16,185,129,.94)", color: "#fff", fontSize: 13, fontWeight: 700, boxShadow: "0 8px 20px rgba(6,95,70,.28)", maxWidth: isMob ? "92vw" : 420 }}>
          {bookNotice}
        </div>
      ) : null}
      {apptToast ? (
        <div style={{ position: "fixed", top: "calc(56px + env(safe-area-inset-top,0px))", right: 12, zIndex: 200, borderRadius: 10, padding: "10px 14px", background: "rgba(37,99,235,.94)", color: "#fff", fontSize: 13, fontWeight: 700, boxShadow: "0 8px 20px rgba(37,99,235,.28)", maxWidth: isMob ? "92vw" : 420, display: "flex", alignItems: "center", gap: 8 }}>
          <Calendar size={14} style={{ flexShrink: 0 }} />
          {apptToast}
        </div>
      ) : null}

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
              {!primaryDoctorId && !bookingDoctorId ? (
                <p style={{ color: TEXT_MUTED, fontSize: 14, fontFamily: font, lineHeight: 1.55 }}>Add a primary doctor under Settings → Care team before booking.</p>
              ) : (
                <>
                  <p style={{ margin: "0 0 18px", fontSize: 13, color: TEXT_MUTED, fontFamily: font }}>Choose from the times your doctor has made available.</p>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: TEXT_MUTED, marginBottom: 6, fontFamily: font }}>Visit type</label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {[
                        { id: "in_person", label: "In person" },
                        { id: "virtual", label: "Virtual" },
                      ].map((opt) => {
                        const on = bookVisitMode === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setBookVisitMode(opt.id)}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: on ? `2px solid ${PRIMARY}` : `1px solid ${BORDER}`,
                              background: on ? "var(--pd)" : SURFACE,
                              color: on ? PRIMARY : TEXT,
                              fontFamily: font,
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {doctorsWithSlots.length > 1 ? (
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: TEXT_MUTED, marginBottom: 6, fontFamily: font }}>Doctor</label>
                      <select
                        value={bookingDoctorId || ""}
                        onChange={(e) => setBookingDoctorId(e.target.value || null)}
                        style={{ width: "100%", borderRadius: 10, border: `1px solid ${BORDER}`, background: SURFACE, color: TEXT, fontFamily: font, fontSize: 13, padding: "8px 10px" }}
                      >
                        {doctorsWithSlots.map((d) => (
                          <option key={d.id} value={d.id}>
                            Dr. {doctorDisplayName(d)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {bookingSchemaMissing ? (
                    <p style={{ margin: 0, fontSize: 14, color: "#dc2626", fontFamily: font }}>Booking slots are not available yet because the database migration is not applied. Run migration 009 and refresh.</p>
                  ) : bookSlotDateKeys.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 14, color: TEXT_MUTED, fontFamily: font }}>No published slots yet. Ask your care team to share availability.</p>
                  ) : (
                    renderReschedulePanel(bookBooking, bookSelected, setBookSelected, bookAppointment, bookBusy, "Confirm booking", {
                      flatTop: true,
                      title: "Choose an available time",
                      subtitle: "Pick from the slots your doctor published. Custom times are not available.",
                      doctorId: bookingDoctorId,
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

      <VirtualPreVisitModal
        open={preVisitModalOpen && !!userId}
        onClose={() => {
          setPreVisitModalOpen(false);
          setPreVisitModalAppt(null);
          setPreVisitModalReadOnly(false);
        }}
        userId={userId}
        initialProfile={patientProfile ?? FALLBACK_VISIT_PROFILE}
        readOnly={preVisitModalReadOnly}
        apptSummary={
          preVisitModalAppt
            ? `${new Date(`${preVisitModalAppt.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · ${format12hFromTime(preVisitModalAppt.time)} · ${preVisitModalAppt.type || "Virtual Visit"}`
            : ""
        }
        onSaved={
          preVisitModalReadOnly
            ? undefined
            : async (updated, meta) => {
                if (!isVirtualVisitCheckInComplete(updated)) {
                  throw new Error("Please answer every required field before continuing.");
                }
                setPatientProfile(updated);
                const dn = formatProfileFullName(updated);
                if (dn) setDisplayName(dn);
                const a = preVisitModalAppt;
                if (!a || !userId) {
                  throw new Error("Session lost. Please refresh the page and try again.");
                }
                const vw = getAppointmentVideoWindow(a);
                if (!vw) {
                  throw new Error(
                    "This visit is not a video visit or the time is invalid. You can close this form and try check-in from your appointment when your visit window is open.",
                  );
                }
                await supabase
                  .from("appointments")
                  .update({
                    virtual_visit_status: VS.CHECKED_IN,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", a.id);
                setAllAppts((prev) =>
                  prev.map((row) => (row.id === a.id ? { ...row, virtual_visit_status: VS.CHECKED_IN } : row)),
                );
                if (meta?.hadRefillPending) {
                  await supabase.from("notifications").insert({
                    user_id: a.doctor_id,
                    type: "general",
                    title: "Check-in updated",
                    body: "Your patient submitted an updated check-in form.",
                    related_id: a.id,
                  });
                }
              }
        }
      />
      {/* WebRTC video call overlay */}
      {activeCallApptId && (
        <VideoCallPanel
          appointmentId={activeCallApptId}
          userId={userId}
          peerId={activeCallDoctorId}
          role="patient"
          onEnd={() => {
            setActiveCallApptId(null);
            setActiveCallDoctorId(null);
            // Update local appointment state so the button shows "Call ended"
            setAllAppts((prev) =>
              prev.map((a) => a.id === activeCallApptId ? { ...a, virtual_visit_status: "call_ended" } : a)
            );
          }}
        />
      )}
    </div>
  );
}
