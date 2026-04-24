import { useEffect, useState, useCallback, useMemo } from "react";
import { ClipboardList, Loader2, AlertTriangle, CheckCircle2, XCircle, PauseCircle, Package } from "lucide-react";
import { supabase } from "../../supabase";
import {
  REFILL_STATUS,
  REFILL_STATUS_LABEL,
  refillStatusChipStyle,
  patientRefillNotificationCopy,
  DEFAULT_REFILL_SAFETY_TEXT,
} from "../../lib/refillRequestConstants";

function StatusChip({ status }) {
  const s = refillStatusChipStyle(status);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 11,
        fontWeight: 700,
        padding: "3px 9px",
        borderRadius: 999,
        background: s.bg,
        border: `1px solid ${s.border}`,
        color: s.color,
      }}
    >
      {REFILL_STATUS_LABEL[status] || status}
    </span>
  );
}

export default function RefillRequestsPage({ userId, patientNames, setPatientNames, isMob, PhAC, t1, t3, b1 }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selId, setSelId] = useState(null);
  const [detailNote, setDetailNote] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [saveNoteBusy, setSaveNoteBusy] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase.from("refill_requests").select("*").order("request_date", { ascending: false }).limit(120);
    if (error) {
      console.error("refill_requests:", error.message);
      setRows([]);
      setLoading(false);
      return;
    }
    const list = data || [];
    setRows(list);
    const ids = [...new Set(list.map((r) => r.patient_id))];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id,first_name,last_name").in("id", ids);
      if (profs?.length) {
        setPatientNames((prev) => {
          const next = { ...prev };
          profs.forEach((p) => {
            next[p.id] = [p.first_name, p.last_name].filter(Boolean).join(" ") || "Patient";
          });
          return next;
        });
      }
    }
    setLoading(false);
  }, [userId, setPatientNames]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`pha-refills-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "refill_requests" }, () => {
        void load();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, load]);

  const sel = useMemo(() => rows.find((r) => r.id === selId) || null, [rows, selId]);

  useEffect(() => {
    if (sel) setDetailNote(sel.pharmacist_note || "");
    else setDetailNote("");
  }, [sel?.id, sel?.pharmacist_note]);

  const refillTooSoon = useMemo(() => {
    if (sel?.refill_too_soon === true) return true;
    if (sel?.refill_too_soon === false) return false;
    if (!sel?.last_refill_date) return false;
    const t = new Date(sel.last_refill_date).getTime();
    if (Number.isNaN(t)) return false;
    return Date.now() - t < 21 * 86400000;
  }, [sel?.last_refill_date, sel?.refill_too_soon]);

  async function pushPatientStatusNotification(updated) {
    if (!updated?.patient_id || !updated.status) return;
    const copy = patientRefillNotificationCopy(updated.status, updated.medication_name);
    let body = copy.body;
    const n = updated.pharmacist_note?.trim();
    if (n) body += ` Note from pharmacy: ${n}`;
    await supabase.from("notifications").insert({
      user_id: updated.patient_id,
      type: "general",
      title: copy.title,
      body,
      related_id: updated.prescription_id,
    });
  }

  async function updateRequest(patch) {
    if (!sel || actionBusy) return;
    setActionBusy(true);
    try {
      const note = detailNote.trim() || null;
      const full = { ...patch, pharmacist_note: patch.pharmacist_note !== undefined ? patch.pharmacist_note : note };
      const { data: updated, error } = await supabase.from("refill_requests").update(full).eq("id", sel.id).select("*").single();
      if (error) throw error;
      setRows((prev) => prev.map((r) => (r.id === sel.id ? updated : r)));
      if (patch.status) await pushPatientStatusNotification(updated);
    } catch (e) {
      console.error(e);
    } finally {
      setActionBusy(false);
    }
  }

  async function saveNoteOnly() {
    if (!sel || saveNoteBusy) return;
    setSaveNoteBusy(true);
    try {
      const note = detailNote.trim() || null;
      const { data: updated, error } = await supabase.from("refill_requests").update({ pharmacist_note: note }).eq("id", sel.id).select("*").single();
      if (error) throw error;
      setRows((prev) => prev.map((r) => (r.id === sel.id ? updated : r)));
      if (note) {
        await supabase.from("notifications").insert({
          user_id: sel.patient_id,
          type: "general",
          title: "Pharmacy note",
          body: `Refill (${sel.medication_name || "prescription"}): ${note}`,
          related_id: sel.prescription_id,
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaveNoteBusy(false);
    }
  }

  const triageOpen = sel && ["pending", "pending_review"].includes(sel.status);
  const fulfillmentOpen = sel && ["approved", "in_progress", "ready_pickup"].includes(sel.status);

  const btnBase = {
    padding: "9px 14px",
    borderRadius: 10,
    fontSize: 12,
    fontWeight: 700,
    fontFamily: "inherit",
    cursor: "pointer",
    border: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: "var(--bg)" }}>
      <div style={{ padding: isMob ? "14px 14px 10px" : "22px 22px 14px", borderBottom: `1px solid ${b1}`, flexShrink: 0 }}>
        <h2 style={{ color: t1, fontFamily: "'Playfair Display',serif", fontStyle: "italic", fontWeight: 600, fontSize: isMob ? 20 : 22, margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <ClipboardList size={22} color={PhAC} /> Refill requests
        </h2>
        <p style={{ color: t3, fontSize: 13, margin: "6px 0 0", lineHeight: 1.5 }}>Review patient requests, run a quick safety check, and update status.</p>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: isMob ? "column" : "row", minHeight: 0, overflow: "hidden" }}>
        <div
          style={{
            width: isMob ? "100%" : 320,
            flexShrink: 0,
            borderRight: isMob ? "none" : `1px solid ${b1}`,
            borderBottom: isMob ? `1px solid ${b1}` : "none",
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            background: "var(--s1)",
          }}
        >
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40, color: t3, gap: 10 }}>
              <Loader2 size={18} className="auth-spin" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 28, textAlign: "center", color: t3, fontSize: 13 }}>No refill requests yet.</div>
          ) : (
            <div style={{ padding: isMob ? 10 : 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {rows.map((r) => {
                const active = r.id === selId;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelId(r.id)}
                    style={{
                      textAlign: "left",
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: `1px solid ${active ? "rgba(124,58,237,.4)" : "var(--b0)"}`,
                      background: active ? "var(--pha-pd)" : "var(--s2)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      width: "100%",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                      <span style={{ color: t1, fontSize: 13, fontWeight: 700 }}>{patientNames[r.patient_id] || "Patient"}</span>
                      <StatusChip status={r.status} />
                    </div>
                    <p style={{ color: t1, fontSize: 12, fontWeight: 600, margin: 0 }}>{r.medication_name || "Medication"}</p>
                    <p style={{ color: t3, fontSize: 11, margin: "4px 0 0" }}>{r.dosage || "—"}</p>
                    <p style={{ color: t3, fontSize: 10, margin: "6px 0 0" }}>Requested {new Date(r.request_date).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: isMob ? "14px" : "22px", minWidth: 0 }}>
          {!sel ? (
            <div className="card" style={{ padding: 32, textAlign: "center", border: `1px solid ${b1}` }}>
              <Package size={28} color={t3} style={{ opacity: 0.35, marginBottom: 10 }} />
              <p style={{ color: t3, fontSize: 14, margin: 0 }}>Select a request to view details and take action.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 560 }}>
              <div className="card" style={{ padding: isMob ? 16 : 18, border: `1px solid ${b1}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <p style={{ color: t3, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", margin: "0 0 6px" }}>Patient</p>
                    <p style={{ color: t1, fontSize: 17, fontWeight: 700, margin: 0 }}>{patientNames[sel.patient_id] || "Patient"}</p>
                  </div>
                  <StatusChip status={sel.status} />
                </div>
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid var(--b0)` }}>
                  <p style={{ color: t3, fontSize: 11, fontWeight: 600, margin: "0 0 4px" }}>Medication</p>
                  <p style={{ color: t1, fontSize: 15, fontWeight: 600, margin: 0 }}>{sel.medication_name || "—"}</p>
                  <p style={{ color: t3, fontSize: 13, margin: "8px 0 0" }}>Dosage: {sel.dosage || "—"}</p>
                  <p style={{ color: t3, fontSize: 13, margin: "6px 0 0" }}>
                    Last refill: {sel.last_refill_date ? new Date(sel.last_refill_date).toLocaleDateString() : "—"}
                  </p>
                  <p style={{ color: t3, fontSize: 13, margin: "6px 0 0" }}>
                    Requested: {new Date(sel.request_date).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
              </div>

              <div className="card" style={{ padding: isMob ? 16 : 18, border: `1px solid ${b1}`, background: "var(--s2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <AlertTriangle size={16} color="#ca8a04" />
                  <h3 style={{ color: t1, fontSize: 13, fontWeight: 700, margin: 0 }}>Safety check</h3>
                </div>
                <p style={{ color: t1, fontSize: 13, margin: "0 0 8px" }}>
                  <strong>Refill too soon?</strong>{" "}
                  <span style={{ color: refillTooSoon ? "#b45309" : "#15803d", fontWeight: 700 }}>{refillTooSoon ? "Yes — review" : "No"}</span>
                </p>
                <p style={{ color: t3, fontSize: 12, lineHeight: 1.55, margin: 0 }}>{sel.safety_warning || DEFAULT_REFILL_SAFETY_TEXT}</p>
              </div>

              <div className="card" style={{ padding: isMob ? 16 : 18, border: `1px solid ${b1}` }}>
                <label style={{ color: t1, fontSize: 12, fontWeight: 700, display: "block", marginBottom: 8 }}>Note to patient</label>
                <textarea
                  value={detailNote}
                  onChange={(e) => setDetailNote(e.target.value)}
                  placeholder="e.g. Ready tomorrow at 3pm"
                  rows={3}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    borderRadius: 10,
                    border: `1px solid ${b1}`,
                    padding: "10px 12px",
                    fontSize: 13,
                    fontFamily: "inherit",
                    background: "var(--s2)",
                    color: "var(--t1)",
                    resize: "vertical",
                    minHeight: 72,
                  }}
                />
                <button
                  type="button"
                  disabled={saveNoteBusy}
                  onClick={() => void saveNoteOnly()}
                  style={{ ...btnBase, marginTop: 10, background: "var(--s2)", color: t1, border: `1px solid ${b1}` }}
                >
                  {saveNoteBusy ? <Loader2 size={14} className="auth-spin" /> : null}
                  Save note
                </button>
              </div>

              {triageOpen && (
                <div className="card" style={{ padding: isMob ? 16 : 18, border: `1px solid ${b1}` }}>
                  <p style={{ color: t1, fontSize: 12, fontWeight: 700, margin: "0 0 12px" }}>Triage</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void updateRequest({ status: REFILL_STATUS.APPROVED })}
                      style={{ ...btnBase, background: "rgba(37,99,235,.15)", color: "#1d4ed8" }}
                    >
                      <CheckCircle2 size={15} /> Approve
                    </button>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void updateRequest({ status: REFILL_STATUS.REJECTED })}
                      style={{ ...btnBase, background: "rgba(220,38,38,.12)", color: "#b91c1c" }}
                    >
                      <XCircle size={15} /> Reject
                    </button>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void updateRequest({ status: REFILL_STATUS.PENDING_REVIEW })}
                      style={{ ...btnBase, background: "rgba(202,138,4,.14)", color: "#a16207" }}
                    >
                      <PauseCircle size={15} /> Hold
                    </button>
                  </div>
                </div>
              )}

              {fulfillmentOpen && (
                <div className="card" style={{ padding: isMob ? 16 : 18, border: `1px solid ${b1}` }}>
                  <p style={{ color: t1, fontSize: 12, fontWeight: 700, margin: "0 0 12px" }}>Fulfillment</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {sel.status === REFILL_STATUS.APPROVED && (
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => void updateRequest({ status: REFILL_STATUS.IN_PROGRESS })}
                        style={{ ...btnBase, background: "rgba(124,58,237,.14)", color: "#6d28d9" }}
                      >
                        In progress
                      </button>
                    )}
                    {sel.status === REFILL_STATUS.IN_PROGRESS && (
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => void updateRequest({ status: REFILL_STATUS.READY_PICKUP })}
                        style={{ ...btnBase, background: "rgba(22,163,74,.15)", color: "#15803d" }}
                      >
                        Ready for pickup
                      </button>
                    )}
                    {sel.status === REFILL_STATUS.READY_PICKUP && (
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => void updateRequest({ status: REFILL_STATUS.COMPLETED })}
                        style={{ ...btnBase, background: "rgba(75,85,99,.14)", color: "#374151" }}
                      >
                        Mark completed
                      </button>
                    )}
                  </div>
                </div>
              )}

              {actionBusy && (
                <p style={{ color: t3, fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <Loader2 size={14} className="auth-spin" /> Updating…
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
