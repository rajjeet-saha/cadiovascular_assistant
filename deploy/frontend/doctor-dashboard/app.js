/**
 * Doctor Dashboard application — Cardiovascular Care Assistant
 * ------------------------------------------------------------
 * Talks ONLY to the backend through services/api.js (never to Firestore directly).
 * Near-real-time behavior via polling (contract has no WebSockets — by design).
 *
 * Academic prototype — synthetic demonstration data only.
 */

/* global getPatient, getHealthReadings, getAlerts, acknowledgeAlert,
          getMedications, getAppointments, PATIENT_ID, getPatientId, setPatientId, getConnectionLabel,
          esc, formatTime, formatDateTime, timeAgo, activityLabel, vitalStatus,
          alertDisplayInfo, alertValueSummary,
          drawLineChart, drawEcg, prepareCanvas, AI */

const POLL_MS = 4000;      // vitals + alerts polling (spec: 3–5 s)
const SLOW_POLL_MS = 60000; // medications + appointments

let thresholds = { heartRateMin: 50, heartRateMax: 100, spo2Min: 94 }; // defaults; replaced by patient record
let readings = [];        // newest-first (backend contract)
let alerts = [];          // newest-first (backend contract)
let historyRange = 30;    // 30 | 60 | 0 (= all)
let lastVitalsOk = false;
let lastAlertsOk = false;
const ackInFlight = new Set();

function $(id) {
  return document.getElementById(id);
}

function show(id, on) {
  $(id).classList.toggle("hidden", !on);
}

/* ============================================================
   Connection indicator
   ============================================================ */

function updateConn() {
  const dot = $("conn-dot");
  const text = $("conn-text");
  const via = (typeof getConnectionLabel === "function" && getConnectionLabel() === "backup")
    ? " · backup" : "";
  if (lastVitalsOk && lastAlertsOk) {
    dot.className = "dot dot-green";
    text.textContent = "Backend Connected" + via;
  } else if (!lastVitalsOk || !lastAlertsOk) {
    dot.className = "dot dot-red";
    text.textContent = "Waking backend (Render free tier) — auto-retrying…";
  }
}

/* ============================================================
   Patient header
   ============================================================ */

async function loadPatient() {
  const res = await getPatient(PATIENT_ID);
  const el = $("patient-header");

  if (res.ok && res.data && res.data.success && res.data.data) {
    const p = res.data.data;
    if (p.thresholds && typeof p.thresholds === "object") {
      thresholds = Object.assign({}, thresholds, p.thresholds);
    }
    const initials = String(p.name || "?")
      .split(/\s+/)
      .map(w => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

    el.innerHTML =
      '<div class="ph-grid">' +
        '<div class="ph-avatar">' + esc(initials) + "</div>" +
        "<div>" +
          '<div class="ph-name">' + esc(p.name || "Unknown patient") + "</div>" +
          '<div class="ph-sub">Synthetic demonstration patient · Cardiovascular monitoring</div>' +
        "</div>" +
        '<div class="ph-chips">' +
          '<span class="chip">Patient ID: <b>' + esc(p.patientId) + "</b></span>" +
          '<span class="chip">Hospital: <b>' + esc(p.hospitalId || "—") + "</b></span>" +
          '<span class="chip">Doctor: <b>' + esc(p.doctorId || "—") + "</b></span>" +
          (p.age !== null && p.age !== undefined ? '<span class="chip">Age: <b>' + esc(p.age) + "</b></span>" : "") +
          '<span class="chip">Thresholds: <b>HR ' + esc(thresholds.heartRateMin) + "–" + esc(thresholds.heartRateMax) +
            " · SpO2 ≥ " + esc(thresholds.spo2Min) + "</b></span>" +
        "</div>" +
      "</div>";
  } else {
    const why = res.error ? "Backend unavailable" : "Patient not found";
    el.innerHTML = '<div class="ph-error">' + esc(why) + " — failed to load patient data</div>";
  }
}

/* ============================================================
   Vitals + ECG
   ============================================================ */

function setVital(kind, value, meta) {
  // Count-up animation when the displayed number changes (AI.countUp from ai-motion.js)
  const valEl = $("vital-" + kind + "-value");
  if (AI && AI.countUp && String(value) !== valEl.textContent && !isNaN(Number(value))) {
    AI.countUp(valEl, value);
  } else {
    valEl.textContent = value;
  }
  $("vital-" + kind + "-meta").textContent = meta;
  $("vital-" + kind).classList.remove("ok", "warn", "critical");
}

function renderVitals() {
  if (!readings.length) return;
  const n = readings[0]; // newest

  // Feed the live heart rate into the motion layer: the heartbeat
  // animations across the page beat at the patient's actual BPM.
  const hrNum = Number(n.heartRate);
  if (!isNaN(hrNum) && hrNum >= 30 && hrNum <= 220) {
    document.documentElement.style.setProperty("--bpm", hrNum);
    $("vital-hr").classList.add("throbbing");
  } else {
    $("vital-hr").classList.remove("throbbing");
  }

  const hrStatus = vitalStatus("hr", n.heartRate, thresholds);
  setVital("hr", n.heartRate === null || n.heartRate === undefined ? "—" : n.heartRate,
    "Updated " + timeAgo(n.timestamp));
  $("vital-hr").classList.add(hrStatus);

  const spStatus = vitalStatus("spo2", n.spo2, thresholds);
  setVital("spo2", n.spo2 === null || n.spo2 === undefined ? "—" : n.spo2,
    "Updated " + timeAgo(n.timestamp));
  $("vital-spo2").classList.add(spStatus);

  setVital("activity", activityLabel(n.activity), "0 Resting · 1 Walking · 2 Running");
  $("vital-activity").classList.add("ok");

  const bStatus = vitalStatus("battery", n.battery, thresholds);
  setVital("battery", n.battery === null || n.battery === undefined ? "—" : n.battery,
    "Wearable battery");
  $("vital-battery").classList.add(bStatus);
}

function renderVitalsError(res) {
  if (res && res.error) {
    ["hr", "spo2", "activity", "battery"].forEach(k =>
      $("vital-" + k + "-meta").textContent = "Backend unavailable"
    );
  }
}

/** Flatten ECG samples from recent readings (contract: number or array). */
function ecgSamplesFromReadings(maxReadings) {
  const out = [];
  for (const r of readings.slice(0, maxReadings)) {
    if (Array.isArray(r.ecg)) out.push.apply(out, r.ecg);
    else if (typeof r.ecg === "number") out.push(r.ecg);
  }
  return out.reverse(); // oldest -> newest
}

let ecgRollOffset = 0;

function renderEcg() {
  const samples = ecgSamplesFromReadings(60);
  if (samples.length) {
    $("ecg-updated").textContent = "Last updated: " + formatDateTime(readings[0].timestamp);
  }
  return samples;
}

/** Rolling sweep so the trace feels like a live monitor. */
function startEcgLoop() {
  const canvas = $("ecg-canvas");
  function frame() {
    let samples = renderEcg();
    if (samples.length > 2) {
      if (samples.length < 200) {
        // repeat the pattern so the roll looks continuous
        const copies = Math.ceil(200 / samples.length);
        const doubled = [];
        for (let c = 0; c < copies; c++) doubled.push.apply(doubled, samples);
        samples = doubled;
      }
      ecgRollOffset = (ecgRollOffset + 1) % samples.length;
      drawEcg(canvas, samples.slice(ecgRollOffset).concat(samples.slice(0, ecgRollOffset)));
    } else {
      drawEcg(canvas, samples);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ============================================================
   History charts
   ============================================================ */

function oldestFirst(key) {
  return readings
    .slice(0, historyRange === 0 ? readings.length : historyRange)
    .map(r => Number(r[key]))
    .filter(v => !isNaN(v))
    .reverse();
}

function renderHistory() {
  $("history-count").textContent = readings.length + " readings";

  drawLineChart($("chart-hr"), oldestFirst("heartRate"), {
    color: "#2563eb",
    showBounds: [thresholds.heartRateMin, thresholds.heartRateMax]
  });

  drawLineChart($("chart-spo2"), oldestFirst("spo2"), {
    color: "#0891b2",
    min: 85,
    max: 100,
    showBounds: [thresholds.spo2Min, 100]
  });

  drawLineChart($("chart-battery"), oldestFirst("battery"), {
    color: "#7c3aed",
    min: 0,
    max: 100
  });

  drawActivityChart($("chart-activity"));
}

/** Activity timeline: colored steps per reading (0 resting / 1 walking / 2 running). */
function drawActivityChart(canvas) {
  const entries = readings
    .slice(0, historyRange === 0 ? readings.length : historyRange)
    .map(r => ({ a: Number(r.activity), t: r.timestamp }))
    .filter(e => !isNaN(e.a))
    .reverse();

  const cssWidth = canvas.clientWidth || 300;
  const cssHeight = canvas.clientHeight || 150;
  const ctx = prepareCanvas(canvas, cssWidth, cssHeight);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const colors = ["#94a3b8", "#f59e0b", "#dc2626"];
  const labels = ["Resting", "Walking", "Running"];

  if (!entries.length) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No data yet", cssWidth / 2, cssHeight / 2);
    return;
  }

  const n = entries.length;
  const gap = 2;
  const bw = Math.max(2, (cssWidth - gap * (n - 1)) / n);
  const maxH = cssHeight - 26;

  entries.forEach((e, i) => {
    const h = maxH * ((e.a + 1) / 3);
    ctx.fillStyle = colors[e.a] || colors[0];
    ctx.fillRect(i * (bw + gap), cssHeight - 20 - h, bw, h);
  });

  // legend
  ctx.font = "10px system-ui, sans-serif";
  ctx.textAlign = "left";
  let lx = 2;
  labels.forEach((lab, idx) => {
    ctx.fillStyle = colors[idx];
    ctx.fillRect(lx, cssHeight - 12, 8, 8);
    ctx.fillStyle = "#64748b";
    ctx.fillText(lab, lx + 11, cssHeight - 4);
    lx += ctx.measureText(lab).width + 26;
  });
}

/* ============================================================
   Alerts
   ============================================================ */

function alertItemHtml(a) {
  const info = alertDisplayInfo(a);
  const badge = a.status === "active"
    ? '<span class="alert-badge ' + (a.type === "SOS" ? "sos" : "active") + '">ACTIVE</span>'
    : '<span class="alert-badge ' + esc(a.status) + '">' + esc(String(a.status).toUpperCase()) + "</span>";

  return (
    '<div class="alert-item ' + esc(info.tone) + '">' +
      '<div class="alert-top">' +
        '<span class="alert-type">' + esc(info.icon) + " " + esc(info.label) + "</span>" +
        badge +
      "</div>" +
      '<div class="alert-detail">' + esc(alertValueSummary(a)) + "</div>" +
      '<div class="alert-detail muted">' + esc(a.message || "") + "</div>" +
      '<div class="alert-time">' + formatDateTime(a.createdAt) + " · " + esc(a.alertId) + "</div>" +
      (a.status === "active" && a.acknowledged === false
        ? '<button class="btn btn-ack" data-alert-id="' + esc(a.alertId) + '">ACKNOWLEDGE</button>' +
          '<div class="error-inline ack-error hidden"></div>'
        : "") +
    "</div>"
  );
}

function renderAlerts() {
  const active = alerts.filter(a => a.status === "active");
  const ack = alerts.filter(a => a.status === "acknowledged");
  const resolved = alerts.filter(a => a.status === "resolved");

  $("alerts-count").textContent =
    active.length + " active · " + ack.length + " acknowledged · " + resolved.length + " resolved";

  show("alerts-loading", false);
  show("alerts-empty", alerts.length === 0);

  const list = $("alerts-list");
  const sosList = $("sos-list");

  // Replay entrance animations only when the alert state actually changed,
  // so the 4 s polling doesn't make the panel visibly flicker.
  const sig = JSON.stringify(alerts.slice(0, 25).map(a => [a.alertId, a.status]));
  const changed = sig !== renderAlerts.lastSig;
  renderAlerts.lastSig = sig;
  list.classList.toggle("no-anim", !changed);
  sosList.classList.toggle("no-anim", !changed);

  list.innerHTML = alerts.slice(0, 25).map(alertItemHtml).join("");

  // ----- dedicated SOS events panel -----
  const sosAll = alerts.filter(a => a.type === "SOS");
  show("sos-loading", false);
  show("sos-empty", sosAll.length === 0);
  $("sos-list").innerHTML = sosAll
    .slice(0, 8)
    .map(alertItemHtml)
    .join("");

  // ----- prominent emergency strip -----
  const strip = $("alert-strip");
  const sosActive = active.find(a => a.type === "SOS");
  if (sosActive) {
    strip.className = "alert-strip sos-strip sos-radar";
    strip.innerHTML =
      "<span>🚨 SOS EMERGENCY</span>" +
      '<span class="strip-detail">' + esc(sosActive.message || "Emergency assistance required") +
      (sosActive.location ? " · " + esc(sosActive.location) : "") + "</span>";
    show("alert-strip", true);
  } else if (active.length) {
    strip.className = "alert-strip";
    const first = active[0];
    const info = alertDisplayInfo(first);
    strip.innerHTML =
      "<span>⚠ " + active.length + " ACTIVE ALERT" + (active.length > 1 ? "S" : "") +
      " — " + esc(info.label) + "</span>" +
      '<span class="strip-detail">' + esc(alertValueSummary(first)) + "</span>";
    show("alert-strip", true);
  } else {
    show("alert-strip", false);
  }
}

function renderAlertsError(res) {
  lastAlertsOk = !!(res && res.ok);
  if (!lastAlertsOk) {
    show("alerts-loading", false);
    $("alerts-list").innerHTML =
      '<div class="error-box">' +
        esc(res && res.error ? res.error : "Failed to load alerts") +
        " — will retry automatically</div>";
  }
}

async function refreshAlerts() {
  const res = await getAlerts(PATIENT_ID);
  if (res.ok && res.data && res.data.success && Array.isArray(res.data.data)) {
    alerts = res.data.data;
    lastAlertsOk = true;
    renderAlerts();
  } else {
    renderAlertsError(res);
  }
  updateConn();
}

/** Event delegation for ACKNOWLEDGE buttons. */
async function onAckClick(alertId, btn) {
  if (ackInFlight.has(alertId)) return;
  ackInFlight.add(alertId);
  btn.disabled = true;
  btn.textContent = "Acknowledging…";

  const res = await acknowledgeAlert(alertId);
  if (res.ok && res.data && res.data.success) {
    await refreshAlerts();
  } else {
    btn.disabled = false;
    btn.textContent = "ACKNOWLEDGE";
    const err = btn.parentElement.querySelector(".ack-error");
    if (err) {
      err.textContent = res.error
        ? "Backend unavailable — please retry"
        : "Failed to acknowledge (HTTP " + res.status + ")";
      err.classList.remove("hidden");
    }
  }
  ackInFlight.delete(alertId);
}

/* ============================================================
   Medications + Appointments
   ============================================================ */

async function loadMeds() {
  const res = await getMedications(PATIENT_ID);
  show("meds-loading", false);
  const list = $("meds-list");
  if (res.ok && res.data && res.data.success && Array.isArray(res.data.data)) {
    const meds = res.data.data;
    show("meds-empty", meds.length === 0);
    list.innerHTML = meds
      .map(m =>
        '<div class="med-item">' +
          '<div class="med-name">💊 ' + esc(m.medicineName) + "</div>" +
          (m.dosage ? '<div class="med-row">Dosage: ' + esc(m.dosage) + "</div>" : "") +
          (m.time ? '<div class="med-row">Time: <b>' + esc(m.time) + "</b></div>" : "") +
          (m.instructions ? '<div class="med-row muted">' + esc(m.instructions) + "</div>" : "") +
        "</div>"
      )
      .join("");
  } else {
    show("meds-empty", false);
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
    list.innerHTML = appts
      .map(a =>
        '<div class="appt-item">' +
          '<div class="appt-doctor">🩺 ' + esc(a.doctorName) + "</div>" +
          '<div class="appt-when">' + esc(a.date || "—") + " · " + esc(a.time || "—") + "</div>" +
          (a.purpose ? '<div class="appt-purpose">' + esc(a.purpose) + "</div>" : "") +
        "</div>"
      )
      .join("");
  } else {
    show("appts-empty", false);
    list.innerHTML = '<div class="error-box">Failed to load appointments</div>';
  }
}

/* ============================================================
   Polling orchestration
   ============================================================ */

async function refreshVitals() {
  const [rRes, aRes] = await Promise.all([
    getHealthReadings(PATIENT_ID),
    getAlerts(PATIENT_ID)
  ]);

  if (rRes.ok && rRes.data && rRes.data.success && Array.isArray(rRes.data.data)) {
    readings = rRes.data.data;
    lastVitalsOk = true;
    renderVitals();
    renderHistory();
  } else {
    lastVitalsOk = false;
    renderVitalsError(rRes);
  }

  if (aRes.ok && aRes.data && aRes.data.success && Array.isArray(aRes.data.data)) {
    alerts = aRes.data.data;
    lastAlertsOk = true;
    renderAlerts();
  } else {
    renderAlertsError(aRes);
  }

  updateConn();
}

function bindUi() {
  /* patient switcher: persists via setPatientId, reloads so every poll
     targets the new patient immediately (also deep-linkable ?patient=P004) */
  const sel = $("patient-select");
  if (sel) {
    sel.value = PATIENT_ID;
    if (sel.value !== PATIENT_ID) {
      const opt = document.createElement("option");
      opt.value = PATIENT_ID; opt.textContent = PATIENT_ID + " · current";
      sel.appendChild(opt); sel.value = PATIENT_ID;
    }
    sel.addEventListener("change", () => {
      if (setPatientId(sel.value)) {
        const u = new URL(window.location.href);
        u.searchParams.set("patient", sel.value);
        window.location.href = u.href; // full reload → fresh polls + charts
      }
    });
  }

  document.querySelectorAll(".range-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".range-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      historyRange = Number(btn.dataset.range) || 0;
      renderHistory();
    });
  });

  $("alerts-list").addEventListener("click", ev => {
    const btn = ev.target.closest("button[data-alert-id]");
    if (btn) onAckClick(btn.dataset.alertId, btn);
  });
}

function init() {
  bindUi();
  startEcgLoop();
  loadPatient();
  loadMeds();
  loadAppts();
  refreshVitals();
  setInterval(refreshVitals, POLL_MS);
  setInterval(() => { loadMeds(); loadAppts(); }, SLOW_POLL_MS);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
