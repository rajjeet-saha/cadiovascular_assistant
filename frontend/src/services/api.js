/**
 * Centralized API service layer — Cardiovascular Care Assistant
 * -------------------------------------------------------------
 * EVERY backend call in the frontend goes through this module.
 * Field names and endpoints follow API_CONTRACT.md exactly:
 *   patientId, heartRate, spo2, ecg, activity, battery,
 *   alertId, type, parameter, value, threshold, status,
 *   acknowledged, message, createdAt, medicineName, dosage,
 *   instructions, doctorName, hospitalId, doctorId
 *
 * Do NOT rename fields here. The contract is the source of truth.
 *
 * FAILOVER: if the primary backend is unreachable (or returns 502/503/504)
 * and a BACKUP_BASE_URL is configured, requests automatically retry against
 * the backup and stick to whichever responds. See getConnectionLabel().
 *
 * Academic prototype — synthetic demonstration data only.
 */

// Primary backend (production)
const BASE_URL =
  new URLSearchParams(window.location.search).get("backend") ||
  "https://cardiovascular-care-backend.onrender.com";

// Backup backend (second Render service sharing the same Firestore).
// Deployed backup service — if the primary is asleep/dead, requests
// automatically retry here and the header shows "Backend Connected · backup".
// Also overridable at demo time with ?backup=<url> — no redeploy needed.
const BACKUP_BASE_URL =
  new URLSearchParams(window.location.search).get("backup") ||
  "https://cadiovascular-assistant-1.onrender.com";

// Currently active base (sticks to whichever backend answers)
let activeBase = BASE_URL;

const PATIENT_ID = "P001"; // development/demo patient

function otherBases() {
  const list = [];
  if (BASE_URL !== activeBase) list.push(BASE_URL);
  if (BACKUP_BASE_URL && BACKUP_BASE_URL !== activeBase) list.push(BACKUP_BASE_URL);
  return list;
}

/** Which backend is being used: "primary" | "backup" | "custom". */
function getConnectionLabel() {
  if (BACKUP_BASE_URL && activeBase === BACKUP_BASE_URL) return "backup";
  if (activeBase === BASE_URL) return "primary";
  return "custom";
}

/** Single attempt against one base. Never throws. */
async function attempt(method, path, body, base) {
  try {
    const options = { method, headers: {} };
    if (body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }

    const res = await fetch(base + path, options);
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null; // non-JSON response (e.g., proxy error page)
    }

    return {
      ok: res.ok,
      status: res.status,
      data,
      networkFail: [502, 503, 504].includes(res.status) // gateway down → try backup
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      networkFail: true,
      error: "Backend unavailable (" + (err && err.message ? err.message : "network error") + ")"
    };
  }
}

/**
 * Low-level request helper with automatic failover.
 * Never throws for HTTP error statuses — returns a normal result object
 * so the UI can render "Backend unavailable"/error states without crashing.
 */
async function request(method, path, body) {
  const first = await attempt(method, path, body, activeBase);
  if (!first.networkFail) return first;

  // Primary failed at network level → try the other configured bases.
  for (const base of otherBases()) {
    const alt = await attempt(method, path, body, base);
    if (!alt.networkFail) {
      activeBase = base; // stick to the backend that answers
      return alt;
    }
  }
  return first; // all attempts failed
}

// ============================================================
// Patient API
// ============================================================

/** GET /patients/{patientId} */
async function getPatient(patientId = PATIENT_ID) {
  return request("GET", "/patients/" + encodeURIComponent(patientId));
}

/** POST /patients (used only to seed demo data if needed) */
async function createPatient(patient) {
  return request("POST", "/patients", patient);
}

// ============================================================
// Health Readings API
// ============================================================

/**
 * GET /health-readings/{patientId}
 * Returns readings newest-first (per contract).
 */
async function getHealthReadings(patientId = PATIENT_ID) {
  return request("GET", "/health-readings/" + encodeURIComponent(patientId));
}

/**
 * POST /health-readings
 * Body must use contract field names exactly:
 * { patientId, heartRate, spo2, battery, activity, ecg }
 * No timestamp — the backend generates it.
 */
async function postHealthReading(reading) {
  return request("POST", "/health-readings", {
    patientId: reading.patientId || PATIENT_ID,
    heartRate: reading.heartRate,
    spo2: reading.spo2,
    battery: reading.battery,
    activity: reading.activity,
    ecg: reading.ecg
  });
}

// ============================================================
// Alert API
// ============================================================

/** GET /alerts/{patientId} */
async function getAlerts(patientId = PATIENT_ID) {
  return request("GET", "/alerts/" + encodeURIComponent(patientId));
}

/** POST /alerts/{alertId}/acknowledge — no request body required. */
async function acknowledgeAlert(alertId) {
  return request("POST", "/alerts/" + encodeURIComponent(alertId) + "/acknowledge");
}

// ============================================================
// SOS API
// ============================================================

/** POST /sos — creates a SOS-type alert. Location is optional. */
async function sendSOS(data) {
  return request("POST", "/sos", {
    patientId: data.patientId || PATIENT_ID,
    message: data.message || "Emergency assistance required",
    location: data.location || null
  });
}

// ============================================================
// Medication API
// ============================================================

/** GET /medications/{patientId} */
async function getMedications(patientId = PATIENT_ID) {
  return request("GET", "/medications/" + encodeURIComponent(patientId));
}

/** POST /medications (demo seeding) */
async function createMedication(med) {
  return request("POST", "/medications", med);
}

// ============================================================
// Appointment API
// ============================================================

/** GET /appointments/{patientId} */
async function getAppointments(patientId = PATIENT_ID) {
  return request("GET", "/appointments/" + encodeURIComponent(patientId));
}

/** POST /appointments (demo seeding) */
async function createAppointment(appt) {
  return request("POST", "/appointments", appt);
}

// ============================================================
// Health / connection check
// ============================================================

async function checkConnection() {
  return request("GET", "/");
}

/** Base URL currently in use (for status displays). */
function getActiveBaseUrl() {
  return activeBase;
}

// CommonJS export so tests / scripts can require this file too
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    BASE_URL,
    BACKUP_BASE_URL,
    PATIENT_ID,
    getPatient,
    createPatient,
    getHealthReadings,
    postHealthReading,
    getAlerts,
    acknowledgeAlert,
    sendSOS,
    getMedications,
    createMedication,
    getAppointments,
    createAppointment,
    checkConnection,
    getConnectionLabel,
    getActiveBaseUrl
  };
}
