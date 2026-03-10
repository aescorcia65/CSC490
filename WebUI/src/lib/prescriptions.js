import { supabase } from './supabaseClient.js'

export async function getPrescriptionsForPatient(patientId) {
  const { data, error } = await supabase
    .from('prescriptions')
    .select('*, prescription_medications(*)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getPrescriptionsForDoctor(doctorId) {
  const { data, error } = await supabase
    .from('prescriptions')
    .select('*, prescription_medications(*)')
    .eq('doctor_id', doctorId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getPrescriptionsForPharmacist(pharmacistId) {
  const { data, error } = await supabase
    .from('prescriptions')
    .select('*, prescription_medications(*)')
    .or(`pharmacist_id.eq.${pharmacistId},and(pharmacist_id.is.null,status.eq.pending_pharmacist)`)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createPrescription(doctorId, { patientId, medications, notes }) {
  const { data: rx, error: rxError } = await supabase
    .from('prescriptions')
    .insert({
      patient_id: patientId,
      doctor_id: doctorId,
      status: 'pending_pharmacist',
      notes: notes || null,
    })
    .select()
    .single()
  if (rxError) throw rxError
  if (medications?.length) {
    const rows = medications.map((m) => ({
      prescription_id: rx.id,
      medication_name: m.medication_name,
      dosage: m.dosage || null,
      frequency: m.frequency || null,
      instructions: m.instructions || null,
      refill_reminder_days: m.refill_reminder_days ?? null,
    }))
    const { error: medError } = await supabase.from('prescription_medications').insert(rows)
    if (medError) throw medError
  }
  return rx
}

export async function updatePrescriptionStatus(prescriptionId, status, pharmacistId = null) {
  const payload = { status, updated_at: new Date().toISOString() }
  if (pharmacistId != null) payload.pharmacist_id = pharmacistId
  const { data, error } = await supabase
    .from('prescriptions')
    .update(payload)
    .eq('id', prescriptionId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function claimPrescription(prescriptionId, pharmacistId) {
  return updatePrescriptionStatus(prescriptionId, 'pending_fill', pharmacistId)
}

export async function markPrescriptionReady(prescriptionId) {
  const { data, error } = await supabase
    .from('prescriptions')
    .update({ status: 'ready', updated_at: new Date().toISOString() })
    .eq('id', prescriptionId)
    .select()
    .single()
  if (error) throw error
  return data
}
