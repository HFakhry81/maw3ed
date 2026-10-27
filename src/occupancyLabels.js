/**
 * Shared Arabic/English labels for occupancy_mode + composition.
 * Capacity engine is Phase 4; these labels do not claim vertical product readiness.
 */

const OCCUPANCY_LABELS = {
  ar: {
    exclusive: "حصري (مقدم/مورد واحد)",
    rental: "تأجير مورد",
    session_capacity: "جلسة بسعة مقاعد"
  },
  en: {
    exclusive: "Exclusive (one provider/resource)",
    rental: "Resource rental",
    session_capacity: "Session capacity"
  }
};

const COMPOSITION_LABELS = {
  ar: {
    single: "خدمة واحدة",
    bundle: "حزمة بنود"
  },
  en: {
    single: "Single service",
    bundle: "Bundle items"
  }
};

function localeBucket(locale) {
  return String(locale || "ar").toLowerCase().startsWith("ar") ? "ar" : "en";
}

export function normalizeOccupancyMode(mode) {
  const value = String(mode || "exclusive").trim().toLowerCase();
  if (value === "rental" || value === "session_capacity") return value;
  return "exclusive";
}

export function occupancyModeLabel(mode, locale = "ar") {
  const key = normalizeOccupancyMode(mode);
  return OCCUPANCY_LABELS[localeBucket(locale)][key] || key;
}

export function compositionLabel(composition, locale = "ar") {
  const key = String(composition || "single").trim().toLowerCase() === "bundle" ? "bundle" : "single";
  return COMPOSITION_LABELS[localeBucket(locale)][key] || key;
}

export function occupancyShortBadge(mode) {
  const key = normalizeOccupancyMode(mode);
  if (key === "rental") return "تأجير";
  if (key === "session_capacity") return "سعة";
  return "حصري";
}
