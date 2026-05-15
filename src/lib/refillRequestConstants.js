
export const DEFAULT_REFILL_SAFETY_TEXT =
  "Verify patient profile, days supply, and insurance before releasing refills.";

export const REFILL_STATUS = {
  PENDING: "pending",
  PENDING_REVIEW: "pending_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  IN_PROGRESS: "in_progress",
  READY_PICKUP: "ready_pickup",
  SHIPPED: "shipped",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVERED: "delivered",
  COMPLETED: "completed",
};

export const REFILL_STATUS_LABEL = {
  pending: "Pending",
  pending_review: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  in_progress: "In progress",
  ready_pickup: "Ready for pickup",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  completed: "Completed",
};

export const DELIVERY_METHOD = {
  PICKUP: "pickup",
  DELIVERY: "delivery",
};

export const DELIVERY_METHOD_LABEL = {
  pickup: "Pharmacy pickup",
  delivery: "Home delivery",
};

export const DELIVERY_STATUS = {
  PREPARING: "preparing",
  SHIPPED: "shipped",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVERED: "delivered",
};

export const DELIVERY_STATUS_LABEL = {
  preparing: "Preparing shipment",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
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
    case "shipped":
      return { bg: "rgba(14,116,144,.1)", border: "rgba(14,116,144,.28)", color: "#0e7490" };
    case "out_for_delivery":
      return { bg: "rgba(245,158,11,.12)", border: "rgba(245,158,11,.3)", color: "#b45309" };
    case "delivered":
      return { bg: "rgba(16,185,129,.12)", border: "rgba(16,185,129,.3)", color: "#059669" };
    case "completed":
      return { bg: "rgba(75,85,99,.1)", border: "rgba(75,85,99,.22)", color: "#4b5563" };
    default:
      return { bg: "var(--s2)", border: "var(--b0)", color: "var(--t3)" };
  }
}

export function deliveryStatusChipStyle(status) {
  switch (status) {
    case "preparing":
      return { bg: "rgba(124,58,237,.1)", border: "rgba(124,58,237,.28)", color: "#6d28d9" };
    case "shipped":
      return { bg: "rgba(14,116,144,.1)", border: "rgba(14,116,144,.28)", color: "#0e7490" };
    case "out_for_delivery":
      return { bg: "rgba(245,158,11,.12)", border: "rgba(245,158,11,.3)", color: "#b45309" };
    case "delivered":
      return { bg: "rgba(16,185,129,.12)", border: "rgba(16,185,129,.3)", color: "#059669" };
    default:
      return { bg: "var(--s2)", border: "var(--b0)", color: "var(--t3)" };
  }
}

export function patientRefillNotificationCopy(status, medicationName, deliveryMethod) {
  const med = medicationName?.trim() || "Your medication";
  const isDelivery = deliveryMethod === "delivery";
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
      return { title: "Refill ready", body: isDelivery ? `${med}: your order is being prepared for delivery.` : `${med}: your order is ready for pickup.` };
    case "shipped":
      return { title: "Refill shipped", body: `${med}: your order has been shipped and is on its way.` };
    case "out_for_delivery":
      return { title: "Out for delivery", body: `${med}: your order is out for delivery and will arrive soon.` };
    case "delivered":
      return { title: "Refill delivered", body: `${med}: your order has been delivered.` };
    case "completed":
      return { title: "Refill completed", body: `${med}: this refill has been completed.` };
    default:
      return { title: "Refill update", body: `${med}: your refill status was updated.` };
  }
}
