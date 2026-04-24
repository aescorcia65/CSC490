/** Doctor rows from patient profile (matches Settings → Care team). */
export function careTeamDoctorEntries(profile) {
  if (!profile) return [];
  const ct = profile.care_team;
  if (Array.isArray(ct) && ct.length > 0) {
    const out = [];
    for (const e of ct) {
      if (!e?.doctor_id) continue;
      out.push({
        doctorId: e.doctor_id,
        label: typeof e.label === "string" && e.label.trim() ? e.label.trim() : "Doctor",
      });
    }
    return out;
  }
  if (profile.primary_doctor_id) {
    return [{ doctorId: profile.primary_doctor_id, label: "Primary care" }];
  }
  return [];
}

/** All doctor ids on the patient's care team (for notifications, etc.). */
export function careTeamDoctorIdSet(profile) {
  const ids = new Set();
  for (const { doctorId } of careTeamDoctorEntries(profile)) {
    ids.add(doctorId);
  }
  return ids;
}
