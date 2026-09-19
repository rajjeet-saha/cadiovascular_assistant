/**
 * Shared UI helpers — Cardiovascular Care Assistant
 * Escaping, formatting, and display mapping used by both frontends.
 */

/** Escape untrusted strings before inserting into HTML. */
function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** ISO timestamp -> locale time, or "—" if missing/invalid. */
function formatTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** ISO timestamp -> locale date+time, or "—". */
function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/** "x s ago" / "x min ago" relative label. */
function timeAgo(iso) {
  if (!iso) return "never";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "never";
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return s + " s ago";
  const m = Math.floor(s / 60);
  if (m < 60) return m + " min ago";
  const h = Math.floor(m / 60);
  return h + " h ago";
}

/** Contract activity mapping: 0 = Resting, 1 = Walking, 2 = Running. */
function activityLabel(activity) {
  if (activity === 0 || activity === "0" || activity === "Resting") return "Resting";
  if (activity === 1 || activity === "1" || activity === "Walking") return "Walking";
  if (activity === 2 || activity === "2" || activity === "Running") return "Running";
  return "Unknown";
}

/**
 * Vitals status per PROTOTYPE thresholds (demo rules, not medical advice).
 * Mirrors the backend rule-based alerting — the frontend never invents alerts,
 * this only drives card colors for values already evaluated by the backend.
 */
function vitalStatus(kind, value, thresholds) {
  const t = thresholds || {};
  const hrMin = typeof t.heartRateMin === "number" ? t.heartRateMin : 50;
  const hrMax = typeof t.heartRateMax === "number" ? t.heartRateMax : 100;
  const spo2Min = typeof t.spo2Min === "number" ? t.spo2Min : 94;

  const n = Number(value);
  if (value === null || value === undefined || isNaN(n)) return "unknown";

  if (kind === "hr") {
    if (n > hrMax || n < hrMin) return "critical";
    if (n > hrMax - 10 || n < hrMin + 10) return "warn";
    return "ok";
  }
  if (kind === "spo2") {
    if (n < spo2Min) return "critical";
    if (n < spo2Min + 2) return "warn";
    return "ok";
  }
  if (kind === "battery") {
    if (n <= 15) return "critical";
    if (n <= 30) return "warn";
    return "ok";
  }
  return "ok";
}

/**
 * Display mapping for alert objects (contract field names:
 * alertId, type, parameter, value, threshold, status, acknowledged, message, createdAt).
 */
function alertDisplayInfo(alert) {
  const type = alert.type || "";
  const map = {
    ABNORMAL_HEART_RATE_HIGH: { label: "High Heart Rate", icon: "❤", tone: "critical" },
    ABNORMAL_HEART_RATE_LOW: { label: "Low Heart Rate", icon: "❤", tone: "critical" },
    LOW_SPO2: { label: "Low SpO2", icon: "◍", tone: "critical" },
    SOS: { label: "SOS Emergency", icon: "✳", tone: "sos" }
  };
  const base = map[type] || { label: type || "Alert", icon: "⚠", tone: "critical" };
  let tone = base.tone;
  if (alert.status === "acknowledged") tone = "acknowledged";
  if (alert.status === "resolved") tone = "resolved";
  return { label: base.label, icon: base.icon, tone };
}

/** Short value summary for an alert row, e.g. "120 BPM (limit 100)". */
function alertValueSummary(alert) {
  if (alert.type === "SOS") {
    return alert.location ? String(alert.location) : "Emergency button pressed";
  }
  if (alert.value === null || alert.value === undefined) return "—";
  let s = String(alert.value);
  if (alert.parameter === "heartRate") s += " BPM";
  if (alert.parameter === "spo2") s += "%";
  if (alert.threshold !== null && alert.threshold !== undefined) {
    s += " · threshold " + alert.threshold;
  }
  return s;
}
