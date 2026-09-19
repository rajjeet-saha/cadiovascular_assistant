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
 * Academic prototype — synthetic demonstration data only.
 */

// Base URL: production backend by default, ?backend= for local testing
const BASE_URL =
  new URLSearchParams(window.location.search).get("backend") ||
  "https://cardiovascular-care-backend.onrender.com";

const PATIENT_ID = "P001"; // development/demo patient

/**
 * Low-level request helper.
 * Never throws for HTTP error statuses — returns a normal result object
 * so the UI can render "Backend unavailable"/error states without crashing.
 */
async function request(method, path, body) {
  try {
    const options = { method, headers: {} };
    if (body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }

    const res = await fetch(BASE_URL + path, options);
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null; // non-JSON response (e.g., proxy error page)
    }

    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: "Backend unavailable (" + (err && err.message ? err.message : "network error") + ")"
    };
  }
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

// CommonJS export so tests / scripts can require this file too
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    BASE_URL,
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
    checkConnection
  };
}
