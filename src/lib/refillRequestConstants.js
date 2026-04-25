
export const DEFAULT_REFILL_SAFETY_TEXT =
  "Verify patient profile, days supply, and insurance before releasing refills.";

export const REFILL_STATUS = {
  PENDING: "pending",
  PENDING_REVIEW: "pending_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  IN_PROGRESS: "in_progress",
  READY_PICKUP: "ready_pickup",
  COMPLETED: "completed",
};

export const REFILL_STATUS_LABEL = {
  pending: "Pending",
  pending_review: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  in_progress: "In progress",
  ready_pickup: "Ready for pickup",
  completed: "Completed",
};

export function refillStatusChipStyle(status) {
  switch (status) {
    case "pending":
      return { bg: "rgba(120,113,108,.12)", border: "rgba(120,113,108,.25)", color: "#57534e" };
    case "pending_review":
      return { bg: "rgba(202,138,4,.12)", border: "rgba(202,138,4,.35)", color: "#a16207" };
    case "approved":
      return { bg: "rgba(37,99,235,.1)", border: "rgba(37,99,235,.28)", color: "#1d4ed8" };
    case "rejected":
      return { bg: "rgba(220,38,38,.1)", border: "rgba(220,38,38,.28)", color: "#b91c1c" };
    case "in_progress":
      return { bg: "rgba(124,58,237,.1)", border: "rgba(124,58,237,.28)", color: "#6d28d9" };
    case "ready_pickup":
      return { bg: "rgba(22,163,74,.12)", border: "rgba(22,163,74,.3)", color: "#15803d" };
    case "completed":
      return { bg: "rgba(75,85,99,.1)", border: "rgba(75,85,99,.22)", color: "#4b5563" };
    default:
      return { bg: "var(--s2)", border: "var(--b0)", color: "var(--t3)" };
  }
}

export function patientRefillNotificationCopy(status, medicationName) {
  const med = medicationName?.trim() || "Your medication";
  switch (status) {
    case "pending_review":
      return { title: "Refill on hold", body: `${med}: your pharmacy is reviewing this request.` };
    case "approved":
      return { title: "Refill approved", body: `${med}: your pharmacy approved the refill and will process it.` };
    case "rejected":
      return { title: "Refill not approved", body: `${med}: contact your pharmacy or prescriber for next steps.` };
    case "in_progress":
      return { title: "Refill in progress", body: `${med}: your pharmacy is working on your refill.` };
    case "ready_pickup":
      return { title: "Refill ready", body: `${med}: your order is ready for pickup.` };
    case "completed":
      return { title: "Refill completed", body: `${med}: this refill has been completed.` };
    default:
      return { title: "Refill update", body: `${med}: your refill status was updated.` };
  }
}
