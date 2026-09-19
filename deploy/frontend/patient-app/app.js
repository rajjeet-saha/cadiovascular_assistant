/**
 * Patient App — Cardiovascular Care Assistant
 * Bridge role in the real system: wearable -> BLE -> THIS APP -> backend.
 * Demo: wearable simulator posts readings; this app reads + displays and can
 * acknowledge alerts / trigger SOS — all through services/api.js only.
 *
 * Academic prototype — synthetic demonstration data only.
 */

/* global getPatient, getHealthReadings, getAlerts, acknowledgeAlert, sendSOS,
          getMedications, getAppointments, PATIENT_ID, setPatientId,
          esc, formatDateTime, timeAgo, activityLabel, vitalStatus,
          alertDisplayInfo, alertValueSummary, drawEcg, AI */

const POLL_MS = 4000;
const SLOW_POLL_MS = 60000;

let thresholds = { heartRateMin: 50, heartRateMax: 100, spo2Min: 94 };
let readings = [];
let alerts = [];
let lastVitalsOk = false;
let lastAlertsOk = false;
const ackInFlight = new Set();
let sosSending = false;

function $(id) { return document.getElementById(id); }
function show(id, on) { $(id).classList.toggle("hidden", !on); }

function updateConn() {
  const dot = $("conn-dot"), text = $("conn-text");
  if (lastVitalsOk && lastAlertsOk) {
    dot.className = "dot dot-green";
    text.textContent = "Connected";
  } else {
    dot.className = "dot dot-red";
    text.textContent = "Waking backend…";
  }
}

/* ---------------- Patient hero ---------------- */

async function loadPatient() {
  const res = await getPatient(PATIENT_ID);
  const el = $("pat-hero");
  if (res.ok && res.data && res.data.success && res.data.data) {
    const p = res.data.data;
    if (p.thresholds) thresholds = Object.assign({}, thresholds, p.thresholds);
    el.innerHTML =
      '<div class="ph-grid">' +
        '<div class="ph-avatar">' + esc(String(p.name || "?")[0]) + "</div>" +
        "<div>" +
          '<div class="ph-name">' + esc(p.name || "Patient") + "</div>" +
          '<div class="ph-sub" id="last-updated">Waiting for wearable…</div>' +
        "</div>" +
        '<div class="ph-chips">' +
          '<span class="chip">ID: <b>' + esc(p.patientId) + "</b></span>" +
          (p.age !== null && p.age !== undefined ? '<span class="chip">Age <b>' + esc(p.age) + "</b></span>" : "") +
        "</div>" +
      "</div>";
  } else {
    el.innerHTML = '<div class="ph-error">' + (res.error ? "Backend unavailable" : "Patient not found") + "</div>";
  }
}

/* ---------------- Vitals + ECG ---------------- */

function setVital(kind, value, meta, status) {
  const valEl = $("vital-" + kind + "-value");
  if (AI && AI.countUp && String(value) !== valEl.textContent && !isNaN(Number(value))) {
    AI.countUp(valEl, value);
  } else {
    valEl.textContent = value;
  }
  $("vital-" + kind + "-meta").textContent = meta;
  const el = $("vital-" + kind);
  el.classList.remove("ok", "warn", "critical");
  el.classList.add(status || "ok");
}

function renderVitals() {
  if (!readings.length) return;
  const n = readings[0];

  // Live BPM drives every heartbeat animation on the page.
  const hrNum = Number(n.heartRate);
  if (!isNaN(hrNum) && hrNum >= 30 && hrNum <= 220) {
    document.documentElement.style.setProperty("--bpm", hrNum);
    $("vital-hr").classList.add("throbbing");
  } else {
    $("vital-hr").classList.remove("throbbing");
  }

  const lu = $("last-updated");
  if (lu) lu.textContent = "Last updated " + timeAgo(n.timestamp) + " · Wearable simulated";

  setVital("hr", n.heartRate ?? "—", "Updated " + timeAgo(n.timestamp), vitalStatus("hr", n.heartRate, thresholds));
  setVital("spo2", n.spo2 ?? "—", "Updated " + timeAgo(n.timestamp), vitalStatus("spo2", n.spo2, thresholds));
  setVital("activity", activityLabel(n.activity), "From wearable motion", "ok");
  setVital("battery", n.battery ?? "—", "Wearable battery", vitalStatus("battery", n.battery, thresholds));

  if (Array.isArray(n.ecg) || typeof n.ecg === "number") {
    $("ecg-updated").textContent = formatDateTime(n.timestamp);
  }
}

function ecgSamples() {
  const out = [];
  for (const r of readings.slice(0, 40)) {
    if (Array.isArray(r.ecg)) out.push.apply(out, r.ecg);
    else if (typeof r.ecg === "number") out.push(r.ecg);
  }
  return out.reverse();
}

let rollOffset = 0;
function startEcgLoop() {
  const canvas = $("ecg-canvas");
  function frame() {
    let s = ecgSamples();
    if (s.length > 2) {
      if (s.length < 160) {
        const copies = Math.ceil(160 / s.length);
        const d = [];
        for (let c = 0; c < copies; c++) d.push.apply(d, s);
        s = d;
      }
      rollOffset = (rollOffset + 1) % s.length;
      drawEcg(canvas, s.slice(rollOffset).concat(s.slice(0, rollOffset)));
    } else {
      drawEcg(canvas, s);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ---------------- Alerts ---------------- */

function alertItemHtml(a) {
  const info = alertDisplayInfo(a);
  const badge = a.status === "active"
    ? '<span class="alert-badge ' + (a.type === "SOS" ? "sos" : "active") + '">ACTIVE</span>'
    : '<span class="alert-badge ' + esc(a.status) + '">' + esc(String(a.status).toUpperCase()) + "</span>";
  return (
    '<div class="alert-item ' + esc(info.tone) + '">' +
      '<div class="alert-top"><span class="alert-type">' + esc(info.icon) + " " + esc(info.label) + "</span>" + badge + "</div>" +
      '<div class="alert-detail">' + esc(alertValueSummary(a)) + "</div>" +
      '<div class="alert-time">' + formatDateTime(a.createdAt) + "</div>" +
      (a.status === "active" && a.acknowledged === false
        ? '<button class="btn btn-ack" data-alert-id="' + esc(a.alertId) + '">ACKNOWLEDGE</button><div class="error-inline ack-error hidden"></div>'
        : "") +
    "</div>"
  );
}

function renderAlerts() {
  const active = alerts.filter(a => a.status === "active");
  $("alerts-count").textContent = active.length + " active / " + alerts.length + " total";
  show("alerts-loading", false);
  show("alerts-empty", alerts.length === 0);
  $("alerts-list").innerHTML = alerts.slice(0, 15).map(alertItemHtml).join("");

  const strip = $("alert-strip");
  const sos = active.find(a => a.type === "SOS");
  if (sos) {
    strip.className = "alert-strip sos-strip sos-radar";
    strip.innerHTML = "<span>🚨 SOS SENT — help requested</span>";
    show("alert-strip", true);
  } else if (active.length) {
    strip.className = "alert-strip";
    strip.innerHTML = "<span>⚠ " + active.length + " active alert(s)</span>";
    show("alert-strip", true);
  } else {
    show("alert-strip", false);
  }
}

async function refreshAlerts() {
  const res = await getAlerts(PATIENT_ID);
  if (res.ok && res.data && res.data.success && Array.isArray(res.data.data)) {
    alerts = res.data.data;
    lastAlertsOk = true;
    renderAlerts();
  } else {
    lastAlertsOk = false;
    show("alerts-loading", false);
    $("alerts-list").innerHTML = '<div class="error-box">Failed to load alerts — retrying…</div>';
  }
  updateConn();
}

/* ---------------- SOS ---------------- */

async function onSos() {
  if (sosSending) return;
  sosSending = true;
  const btn = $("sos-btn");
  btn.disabled = true;
  btn.textContent = "SENDING SOS…";
  const res = await sendSOS({
    patientId: PATIENT_ID,
    message: "Emergency assistance required",
    location: "Patient mobile app"
  });
  btn.textContent = res.ok && res.data && res.data.success
    ? "SOS SENT ✓"
    : "SOS FAILED — TAP TO RETRY";
  await refreshAlerts();
  setTimeout(() => { btn.textContent = "SOS — EMERGENCY"; btn.disabled = false; }, 2500);
  sosSending = false;
}

/* ---------------- Meds + appointments ---------------- */

async function loadMeds() {
  const res = await getMedications(PATIENT_ID);
  show("meds-loading", false);
  const list = $("meds-list");
  if (res.ok && res.data && res.data.success && Array.isArray(res.data.data)) {
    const meds = res.data.data;
    show("meds-empty", meds.length === 0);
    list.innerHTML = meds.map(m =>
      '<div class="med-item"><div class="med-name">💊 ' + esc(m.medicineName) + "</div>" +
      (m.dosage ? '<div class="med-row">Dosage: ' + esc(m.dosage) + "</div>" : "") +
      (m.time ? '<div class="med-row">Time: <b>' + esc(m.time) + "</b></div>" : "") +
      (m.instructions ? '<div class="med-row muted">' + esc(m.instructions) + "</div>" : "") + "</div>"
    ).join("");
  } else {
    list.innerHTML = '<div class="error-box">Failed to load medications</div>';
  }
}

async function loadAppts() {
  const res = await getAppointments(PATIENT_ID);
  show("appts-loading", false);
  const list = $("appts-list");
  if (res.ok && res.data && res.data.success && Array.isArray(res.data.data)) {
    const appts = res.data.data;
    show("appts-empty", appts.length === 0);
    list.innerHTML = appts.map(a =>
      '<div class="appt-item"><div class="appt-doctor">🩺 ' + esc(a.doctorName) + "</div>" +
      '<div class="appt-when">' + esc(a.date || "—") + " · " + esc(a.time || "—") + "</div>" +
      (a.purpose ? '<div class="appt-purpose">' + esc(a.purpose) + "</div>" : "") + "</div>"
    ).join("");
  } else {
    list.innerHTML = '<div class="error-box">Failed to load appointments</div>';
  }
}

/* ---------------- Orchestration ---------------- */

async function refreshVitals() {
  const r = await getHealthReadings(PATIENT_ID);
  if (r.ok && r.data && r.data.success && Array.isArray(r.data.data)) {
    readings = r.data.data;
    lastVitalsOk = true;
    renderVitals();
  } else {
    lastVitalsOk = false;
    ["hr", "spo2"].forEach(k => { $("vital-" + k + "-meta").textContent = "Backend unavailable"; });
  }
  await refreshAlerts();
}

function init() {
  /* patient switcher (shared with dashboard + simulator via localStorage) */
  const sel = $("patient-select");
  if (sel) {
    sel.value = PATIENT_ID;
    if (sel.value !== PATIENT_ID) {
      const opt = document.createElement("option");
      opt.value = PATIENT_ID; opt.textContent = PATIENT_ID;
      sel.appendChild(opt); sel.value = PATIENT_ID;
    }
    sel.addEventListener("change", () => {
      if (setPatientId(sel.value)) {
        const u = new URL(window.location.href);
        u.searchParams.set("patient", sel.value);
        window.location.href = u.href;
      }
    });
  }

  $("sos-btn").addEventListener("click", onSos);
  $("alerts-list").addEventListener("click", ev => {
    const btn = ev.target.closest("button[data-alert-id]");
    if (!btn || ackInFlight.has(btn.dataset.alertId)) return;
    ackInFlight.add(btn.dataset.alertId);
    btn.disabled = true;
    btn.textContent = "Acknowledging…";
    acknowledgeAlert(btn.dataset.alertId).then(async res => {
      if (res.ok && res.data && res.data.success) await refreshAlerts();
      else { btn.disabled = false; btn.textContent = "ACKNOWLEDGE"; }
      ackInFlight.delete(btn.dataset.alertId);
    });
  });

  startEcgLoop();
  loadPatient();
  loadMeds();
  loadAppts();
  refreshVitals();
  setInterval(refreshVitals, POLL_MS);
  setInterval(() => { loadMeds(); loadAppts(); }, SLOW_POLL_MS);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
