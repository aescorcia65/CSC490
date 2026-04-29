/**
 * Clears persisted sidebar/tab state for each role portal (patient, doctor, pharmacist).
 * Call only when redirecting from an auth entry route after a successful login — not on session restore / refresh.
 * Full reload on /dashboard does not mount login/home wrappers, so this does not run on refresh.
 */
export function clearStoredPortalLandingPage(userId) {
  if (!userId) return;
  try {
    localStorage.removeItem(`mt_patient_last_page_${userId}`);
    localStorage.removeItem(`mt_doctor_last_page_${userId}`);
    localStorage.removeItem(`mt_pharmacist_last_page_${userId}`);
  } catch {
    /* ignore */
  }
}
