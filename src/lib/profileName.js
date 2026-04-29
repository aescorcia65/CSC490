/**
 * Single source for display name from a profiles row (or similar object).
 * Use everywhere instead of ad-hoc string building so re-fetches stay consistent.
 */
export function formatProfileFullName(profile) {
  if (!profile || typeof profile !== "object") return "";
  const first = profile.first_name ?? profile.firstName;
  const last = profile.last_name ?? profile.lastName;
  return [first, last]
    .filter((x) => x != null && String(x).trim() !== "")
    .map((x) => String(x).trim())
    .join(" ");
}
