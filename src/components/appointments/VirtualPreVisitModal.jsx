import { useState, useEffect, useMemo } from "react";
import { X, Loader2, Download } from "lucide-react";
import { supabase } from "../../supabase";
import { downloadVirtualVisitCheckInPdf, isDoctorRefillNewerThanIntake, isVirtualVisitCheckInComplete } from "../../lib/virtualVisitCheckIn";

const font = "'Inter',system-ui,sans-serif";

function parseLinesOrComma(s) {
  return String(s || "")
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function mergeUnique(...lists) {
  return [...new Set(lists.flat().filter(Boolean))];
}

/**
 * Pre-visit intake before virtual waiting room. Persists to profiles.pre_visit_intake.
 * @param {{ open: boolean, onClose: () => void, userId: string, initialProfile: object, apptSummary?: string, readOnly?: boolean, onSaved?: (profile: object, meta?: { hadRefillPending?: boolean }) => void | Promise<void> }}
 */
export default function VirtualPreVisitModal({
  open,
  onClose,
  userId,
  initialProfile,
  apptSummary,
  readOnly: readOnlyProp = false,
  onSaved,
}) {
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [insuranceInfo, setInsuranceInfo] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [gender, setGender] = useState("");
  const [pregnancy, setPregnancy] = useState("prefer_not");
  const [allergiesText, setAllergiesText] = useState("");
  const [conditionsText, setConditionsText] = useState("");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [editOverride, setEditOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  /** When server profile/intake/al lists change while dialog is relevant, reset fields (fixes doctor delete → no stale intake). */
  const hydrateKey = useMemo(() => {
    const p = initialProfile;
    let al = "";
    let mc = "";
    try {
      al = JSON.stringify(p?.allergies ?? []);
      mc = JSON.stringify(p?.medical_conditions ?? []);
    } catch {
      /* ignore */
    }
    const intakeDone = !!(p?.pre_visit_intake && String(p.pre_visit_intake.completed_at || "").trim());
    return [open ? "o" : "x", userId || "", intakeDone ? String(p.pre_visit_intake.completed_at) : "", al, mc, p?.first_name || "", p?.last_name || ""].join("\u001e");
  }, [open, userId, initialProfile]);

  const complete = initialProfile && isVirtualVisitCheckInComplete(initialProfile);
  const readOnly = readOnlyProp || (complete && !editOverride);

  useEffect(() => {
    if (!open) return;
    const p = initialProfile || {};
    const intake = p.pre_visit_intake || {};
    const intakeDone = !!(intake.completed_at && String(intake.completed_at).trim());

    setFirstName(p.first_name || "");
    setMiddleName(intakeDone ? intake.middle_name || "" : "");
    setLastName(p.last_name || "");
    if (intakeDone) {
      setDateOfBirth(intake.date_of_birth_iso || intake.date_of_birth || "");
      setInsuranceInfo(intake.insurance_info || "");
      setHomeAddress(intake.home_address || "");
      setGender(intake.gender || "");
      setPregnancy(intake.pregnancy_status || "prefer_not");
      setAllergiesText((p.allergies || []).join("\n"));
      setConditionsText((p.medical_conditions || []).join("\n"));
      setChiefComplaint(intake.chief_complaint || "");
    } else {
      setDateOfBirth("");
      setInsuranceInfo("");
      setHomeAddress("");
      setGender("");
      setPregnancy("prefer_not");
      setAllergiesText("");
      setConditionsText("");
      setChiefComplaint("");
    }
    setEditOverride(false);
    setErr("");
  }, [open, hydrateKey]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!userId || readOnly) return;
    const fn = firstName.trim();
    const ln = lastName.trim();
    const dob = dateOfBirth.trim();
    const addr = homeAddress.trim();
    const ins = insuranceInfo.trim();
    const cc = chiefComplaint.trim();
    const conditionArr = mergeUnique(parseLinesOrComma(conditionsText), []);

    if (!fn || !ln) {
      setErr("First name and last name are required.");
      return;
    }
    if (!dob) {
      setErr("Date of birth is required.");
      return;
    }
    if (addr.length < 4) {
      setErr("Please enter a full street address.");
      return;
    }
    if (ins.length < 2) {
      setErr("Insurance information is required.");
      return;
    }
    if (!conditionArr.length) {
      setErr("List at least one health condition (or write “None known”).");
      return;
    }
    if (cc.length < 3) {
      setErr("Please describe your reason for seeing the doctor today.");
      return;
    }

    setBusy(true);
    setErr("");
    const hadRefillPending = isDoctorRefillNewerThanIntake(initialProfile);
    const allergyArr = mergeUnique(parseLinesOrComma(allergiesText), []);
    const intake = {
      ...(initialProfile?.pre_visit_intake || {}),
      doctor_refill_requested_at: null,
      completed_at: new Date().toISOString(),
      middle_name: middleName.trim() || null,
      insurance_info: ins || null,
      home_address: addr || null,
      gender: gender.trim() || null,
      pregnancy_status: pregnancy,
      date_of_birth_iso: dob,
      chief_complaint: cc,
      requested_visit_date_iso: null,
      requested_visit_date: null,
      requested_visit_time: null,
    };

    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: fn,
        last_name: ln,
        allergies: allergyArr,
        medical_conditions: conditionArr,
        pre_visit_intake: intake,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    setBusy(false);
    if (error) {
      setErr(error.message || "Could not save. If this persists, ensure pre_visit_intake is enabled on profiles.");
      return;
    }

    const nextProfile = {
      ...initialProfile,
      first_name: fn,
      last_name: ln,
      allergies: allergyArr,
      medical_conditions: conditionArr,
      pre_visit_intake: intake,
    };

    if (onSaved) {
      try {
        await onSaved(nextProfile, { hadRefillPending });
      } catch (er) {
        setErr(er?.message || "Could not continue. Try again.");
        return;
      }
    }
    onClose();
  }

  function handleDownload() {
    if (!initialProfile?.pre_visit_intake?.completed_at) return;
    const merged = {
      ...initialProfile,
      first_name: firstName.trim() || initialProfile.first_name,
      last_name: lastName.trim() || initialProfile.last_name,
      pre_visit_intake: {
        ...(initialProfile.pre_visit_intake || {}),
        middle_name: middleName,
        insurance_info: insuranceInfo,
        home_address: homeAddress,
        date_of_birth_iso: dateOfBirth,
        chief_complaint: chiefComplaint,
      },
      allergies: mergeUnique(parseLinesOrComma(allergiesText), []),
      medical_conditions: mergeUnique(parseLinesOrComma(conditionsText), []),
    };
    downloadVirtualVisitCheckInPdf(merged, "virtual-visit-check-in");
  }

  const inp = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid var(--b1)",
    background: readOnly ? "var(--s2)" : "var(--s1)",
    color: "var(--t1)",
    fontFamily: font,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  };
  const lbl = { display: "block", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: "var(--t3)", marginBottom: 6, fontFamily: font };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="previsit-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        background: "rgba(15,23,42,.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={() => !busy && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--s1)",
          borderRadius: 16,
          border: "1px solid var(--b1)",
          maxWidth: 520,
          width: "100%",
          maxHeight: "92vh",
          overflowY: "auto",
          boxShadow: "0 20px 50px rgba(15,23,42,.2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "18px 20px 0", borderBottom: "1px solid var(--b0)" }}>
          <div>
            <h2 id="previsit-title" style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--t1)", fontFamily: font }}>
              Virtual visit check-in
            </h2>
            {apptSummary ? (
              <p style={{ margin: "8px 0 14px", fontSize: 13, color: "var(--t3)", fontFamily: font }}>{apptSummary}</p>
            ) : (
              <p style={{ margin: "8px 0 14px", fontSize: 13, color: "var(--t3)", fontFamily: font }}>
                Complete this once. Your answers are saved to your chart and sync to your doctor.
              </p>
            )}
          </div>
          <button type="button" aria-label="Close" disabled={busy} onClick={onClose} style={{ border: "none", background: "transparent", cursor: busy ? "default" : "pointer", padding: 4, color: "var(--t3)" }}>
            <X size={22} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "16px 20px 22px" }}>
          {complete && (
            <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 10, background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.28)" }}>
              <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: "#047857", fontFamily: font }}>Check-in on file</p>
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--t3)", fontFamily: font, lineHeight: 1.45 }}>You can download a PDF copy or update your answers below.</p>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>First name *</label>
              <input style={inp} value={firstName} onChange={(e) => setFirstName(e.target.value)} required disabled={readOnly} autoComplete="given-name" />
            </div>
            <div>
              <label style={lbl}>Middle name</label>
              <input style={inp} value={middleName} onChange={(e) => setMiddleName(e.target.value)} disabled={readOnly} autoComplete="additional-name" />
            </div>
            <div>
              <label style={lbl}>Last name *</label>
              <input style={inp} value={lastName} onChange={(e) => setLastName(e.target.value)} required disabled={readOnly} autoComplete="family-name" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Date of birth *</label>
              <input style={{ ...inp, cursor: readOnly ? "default" : "text" }} type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} disabled={readOnly} required />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Home address *</label>
              <textarea style={{ ...inp, minHeight: 64, resize: "vertical" }} value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} placeholder="Street, city, state, ZIP" disabled={readOnly} autoComplete="street-address" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Insurance information *</label>
              <textarea style={{ ...inp, minHeight: 72, resize: "vertical" }} value={insuranceInfo} onChange={(e) => setInsuranceInfo(e.target.value)} placeholder="Carrier, member ID, group" disabled={readOnly} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Health conditions *</label>
              <textarea style={{ ...inp, minHeight: 72, resize: "vertical" }} value={conditionsText} onChange={(e) => setConditionsText(e.target.value)} placeholder="One per line or comma-separated" disabled={readOnly} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Reason for seeing the doctor today *</label>
              <textarea style={{ ...inp, minHeight: 72, resize: "vertical" }} value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)} placeholder="Brief description of symptoms or concerns" disabled={readOnly} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Gender</label>
              <input style={inp} value={gender} onChange={(e) => setGender(e.target.value)} placeholder="How you identify" disabled={readOnly} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Pregnant?</label>
              <select style={{ ...inp, cursor: readOnly ? "default" : "pointer" }} value={pregnancy} onChange={(e) => setPregnancy(e.target.value)} disabled={readOnly}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
                <option value="prefer_not">Prefer not to say</option>
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Allergies</label>
              <textarea style={{ ...inp, minHeight: 72, resize: "vertical" }} value={allergiesText} onChange={(e) => setAllergiesText(e.target.value)} placeholder="One per line or comma-separated" disabled={readOnly} />
            </div>
          </div>

          {err ? <p style={{ margin: "14px 0 0", fontSize: 13, color: "#dc2626", fontFamily: font }}>{err}</p> : null}

          <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end", flexWrap: "wrap" }}>
            {complete ? (
              <button
                type="button"
                disabled={busy}
                onClick={handleDownload}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--b1)",
                  background: "var(--s2)",
                  color: "var(--t1)",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: font,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Download size={16} /> Download PDF
              </button>
            ) : null}
            {complete && readOnly && !readOnlyProp ? (
              <button type="button" disabled={busy} onClick={() => setEditOverride(true)} style={{ padding: "10px 18px", borderRadius: 10, border: "1px solid var(--pl)", background: "rgba(37,99,235,.08)", color: "var(--pl)", fontWeight: 700, cursor: "pointer", fontFamily: font }}>
                Update answers
              </button>
            ) : null}
            <button type="button" disabled={busy} onClick={onClose} style={{ padding: "10px 18px", borderRadius: 10, border: "1px solid var(--b1)", background: "var(--s2)", color: "var(--t1)", fontWeight: 600, cursor: "pointer", fontFamily: font }}>
              {readOnly && complete ? "Close" : "Cancel"}
            </button>
            {!readOnly ? (
              <button
                type="submit"
                disabled={busy}
                style={{
                  padding: "10px 20px",
                  borderRadius: 10,
                  border: "none",
                  background: "var(--pl)",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: busy ? "wait" : "pointer",
                  fontFamily: font,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {busy ? <Loader2 size={16} style={{ animation: "spin360 .7s linear infinite" }} /> : null}
                Save check-in
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}
