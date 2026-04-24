import { supabase } from "../supabase";

const SELECT_COLS =
  "id,first_name,last_name,email,role,dob,blood_type,allergies,medical_conditions";

export async function searchPatientsForProvider(rawTerm) {
  const term = String(rawTerm || "").trim();
  if (term.length < 2) {
    return { rows: [], error: null };
  }

  const { data: rpcRows, error: rpcErr } = await supabase.rpc("search_patients_for_provider", {
    p_term: term,
  });

  if (rpcErr) {
    const msg = (rpcErr.message || "").toLowerCase();
    const missingRpc =
      rpcErr.code === "PGRST202" ||
      msg.includes("could not find") ||
      msg.includes("does not exist") ||
      msg.includes("404");
    if (!missingRpc) {
      return { rows: [], error: rpcErr };
    }
  } else if (Array.isArray(rpcRows)) {
    return { rows: rpcRows, error: null };
  }

  const likeInner = `%${term.replace(/"/g, '""').replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
  const orStr = `email.ilike."${likeInner}",first_name.ilike."${likeInner}",last_name.ilike."${likeInner}"`;
  const { data: rows, error } = await supabase
    .from("profiles")
    .select(SELECT_COLS)
    .eq("role", "patient")
    .or(orStr);

  return { rows: rows || [], error };
}

export function pickPatientRow(rows, term) {
  const t = String(term || "").trim().toLowerCase();
  if (!rows?.length) return null;
  if (rows.length === 1) return rows[0];
  const exact = rows.find((r) => (r.email || "").toLowerCase() === t);
  return exact || rows[0];
}
