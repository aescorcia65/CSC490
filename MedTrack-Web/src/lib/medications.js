import { supabase } from "../supabase";

export async function addMedication({ name, dosage, freq, time, color, userId }) {
  if (!userId) return;
  try {
    await supabase.from("user_medications").insert({
      user_id: userId,
      medication_name: name,
      dosage,
      freq,
      reminder_time: time,
      color,
      active: true,
    });
  } catch (e) {
    console.error("Supabase addMedication error:", e);
    throw e;
  }
}

export async function deleteMedication(medicationId) {
  if (!medicationId) return;
  try {
    await supabase.from("user_medications").delete().eq("id", medicationId);
  } catch (e) {
    console.error("Supabase deleteMedication error:", e);
  }
}

export async function loadMedications(userId) {
  if (!userId) return [];
  try {
    const { data, error } = await supabase
      .from("user_medications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((d) => ({
      id: d.id,
      firestoreId: d.id,
      name: d.medication_name,
      dosage: d.dosage || "",
      freq: d.freq || "Once daily",
      time: d.reminder_time || "08:00",
      color: d.color || "blue",
      taken: false,
      active: d.active ?? true,
    }));
  } catch (e) {
    console.error("Supabase loadMedications error:", e);
    return [];
  }
}
