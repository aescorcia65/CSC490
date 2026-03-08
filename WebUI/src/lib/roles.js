export const ROLES = { patient: 'patient', doctor: 'doctor', pharmacist: 'pharmacist' }

export const ROLE_LABELS = {
  patient: 'Patient',
  doctor: 'Doctor',
  pharmacist: 'Pharmacist',
}

export function getDashboardPath(role) {
  switch (role) {
    case ROLES.doctor:
      return '/doctor'
    case ROLES.pharmacist:
      return '/pharmacist'
    default:
      return '/dashboard'
  }
}
