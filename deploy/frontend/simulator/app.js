/**
 * Web Wearable Simulator — demo orchestration page
 * Same role as simulator/simulator.js (CLI) but clickable for the live demo.
 * Sends contract-exact payloads via services/api.js.
 *
 * Academic prototype — synthetic demonstration data only.
 */

/* global postHealthReading, sendSOS, checkConnection, getConnectionLabel,
          PATIENT_ID, setPatientId, esc, formatTime, activityLabel */

const device = { hr: 78, spo2: 98, battery: 85, sends: 0, activity: 0 };
let contTimer = null;

function $(id) { return document.getElementById(id); }

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

/** Synthetic ECG-like sample (baseline 512) — visualization only. */
function ecgSample(bpm) {
  const t = Date.now() / 1000;
  const phase = (t % (60 / bpm)) / (60 / bpm);
  const base = 512;
  if (phase < 0.08) return base + Math.round(85 * Math.sin((phase / 0.08) * Math.PI));
  if (phase < 0.12) return base - Math.round(35 * Math.sin(((phase - 0.08) / 0.04) * Math.PI));
  if (phase < 0.20) return base + Math.round(20 * Math.sin(((phase - 0.12) / 0.08) * Math.PI));
  if (phase < 0.32) return base - Math.round(30 * Math.sin(((phase - 0.20) / 0.12) * Math.PI));
  return base + randInt(-4, 4);
}

function buildPayload(mode) {
  device.sends++;
  if (device.sends % 8 === 0) device.battery = Math.max(1, device.battery - 1);

  if (mode === "normal") {
    device.hr = clamp(device.hr + randInt(-3, 3), 62, 92);
    device.spo2 = clamp(device.spo2 + randInt(-1, 1), 96, 99);
    device.activity = device.sends % 7 === 0 ? 1 : 0;
  } else if (mode === "high") {
    device.hr = randInt(115, 128); device.spo2 = clamp(device.spo2, 96, 99); device.activity = 0;
  } else if (mode === "lowhr") {
    device.hr = randInt(38, 46); device.spo2 = clamp(device.spo2, 96, 99); device.activity = 0;
  } else if (mode === "lowspo2") {
    device.hr = clamp(device.hr + randInt(-2, 4), 70, 90);
    device.spo2 = randInt(88, 91); device.activity = 0;
  }

  return {
    patientId: PATIENT_ID, // selected patient (P001–P004), contract field name unchanged
    heartRate: device.hr,
    spo2: device.spo2,
    battery: device.battery,
    activity: device.activity,
    ecg: ecgSample(device.hr)
  };
}

function updateDeviceState() {
  $("st-hr").textContent = device.hr;
  $("st-spo2").textContent = device.spo2;
  $("st-battery").textContent = device.battery;
  $("st-sends").textContent = device.sends;
}

function showPayload(p) {
  $("payload").textContent = JSON.stringify(p, null, 2);
}

function addLog(entry) {
  const log = $("log");
  const empty = log.querySelector(".empty-state");
  if (empty) empty.remove();
  const cls = entry.kind === "alert" ? "alert" : entry.kind === "sos" ? "sos" : "ok";
  const div = document.createElement("div");
  div.className = "log-entry " + cls;
  div.innerHTML =
    '<div class="t">' + esc(entry.time) + " · HTTP " + esc(entry.status) + "</div>" +
    "<div>" + entry.html + "</div>";
  log.prepend(div);
  while (log.children.length > 30) log.removeChild(log.lastChild);
}

async function runScenario(mode) {
  const payload = buildPayload(mode);
  updateDeviceState();
  showPayload(payload);
  try {
    const res = await postHealthReading(payload);
    const body = res.data || {};
    const alerts = Array.isArray(body.alertsCreated) ? body.alertsCreated : [];
    if (res.ok && body.success) {
      if (alerts.length) {
        alerts.forEach(a => addLog({
          kind: "alert", status: res.status, time: formatTime(new Date().toISOString()),
          html: "<b>⚠ " + esc(a.type) + "</b> — " + esc(a.value) + " vs threshold " + esc(a.threshold) + " · alertId " + esc(a.alertId)
        }));
      } else {
        addLog({ kind: "ok", status: res.status, time: formatTime(new Date().toISOString()),
          html: "Reading stored · HR <b>" + payload.heartRate + "</b> BPM · SpO2 <b>" + payload.spo2 +
                "%</b> · " + activityLabel(payload.activity) + " · battery " + payload.battery + "% · no alert" });
      }
    } else {
      addLog({ kind: "alert", status: res.status, time: formatTime(new Date().toISOString()),
        html: "<b>FAILED</b> — " + esc(JSON.stringify(body) || "backend unavailable") });
    }
  } catch (e) {
    addLog({ kind: "alert", status: "—", time: formatTime(new Date().toISOString()),
      html: "<b>Network error</b> — " + esc(e.message) });
  }
}

async function runSos() {
  try {
    const res = await sendSOS({ patientId: PATIENT_ID, message: "Emergency assistance required", location: "Demo Location" });
    const ok = res.ok && res.data && res.data.success;
    addLog({ kind: "sos", status: res.status, time: formatTime(new Date().toISOString()),
      html: ok ? "<b>🚨 SOS SENT</b> · alertId " + esc(res.data.alertId)
               : "<b>SOS FAILED</b> — " + esc(JSON.stringify(res.data) || "backend unavailable") });
  } catch (e) {
    addLog({ kind: "sos", status: "—", time: formatTime(new Date().toISOString()),
      html: "<b>Network error</b> — " + esc(e.message) });
  }
}

function toggleContinuous() {
  const btn = $("cont-btn");
  if (contTimer) {
    clearInterval(contTimer);
    contTimer = null;
    btn.classList.remove("cont-active");
    btn.innerHTML = "6 · Continuous Monitoring<small>Realistic reading every 4 s — click to start/stop</small>";
    return;
  }
  btn.classList.add("cont-active");
  btn.innerHTML = "6 · Continuous Monitoring<small>RUNNING — click to stop</small>";
  runScenario("normal");
  contTimer = setInterval(() => runScenario("normal"), 4000);
}

async function checkBackend() {
  const res = await checkConnection();
  const dot = $("conn-dot"), text = $("conn-text");
  if (res.ok && res.data && res.data.success) {
    dot.className = "dot dot-green";
    text.textContent = typeof getConnectionLabel === "function" && getConnectionLabel() === "backup"
      ? "Backend Connected · backup"
      : "Backend Connected";
  } else {
    dot.className = "dot dot-red";
    text.textContent = "Backend unavailable";
  }
}

function init() {
  /* patient switcher — transmissions go to the selected patient */
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

  document.querySelectorAll(".scn-btn[data-scenario]").forEach(btn =>
    btn.addEventListener("click", () => runScenario(btn.dataset.scenario))
  );
  $("sos-btn").addEventListener("click", runSos);
  $("cont-btn").addEventListener("click", toggleContinuous);
  $("clear-log").addEventListener("click", () => {
    $("log").innerHTML = '<div class="empty-state">No transmissions yet</div>';
  });
  checkBackend();
  showPayload(JSON.stringify(buildPayload("normal"), null, 2));
  device.sends = 0;
  updateDeviceState();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
