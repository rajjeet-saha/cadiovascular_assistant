#!/usr/bin/env node
/**
 * Cardiovascular Care Assistant — Wearable Simulator
 * ---------------------------------------------------
 * Software stand-in for the physical wristband (ESP32 + MAX30102 + AD8232 + MPU6050).
 *
 * FUTURE : ESP32 -> BLE -> Mobile App -> POST /health-readings -> Backend
 * DEMO   : this simulator -> POST /health-readings -> Backend
 *
 * Same payload, same API contract (API_CONTRACT.md). No field is renamed here.
 *
 * Academic prototype — synthetic demonstration data only.
 * Not a medical device. Not clinically validated. Not diagnostic.
 */

const http = require("http");
const https = require("https");
const readline = require("readline");

// ============================================================
// Configuration (environment overridable)
// ============================================================

let BASE_URL =
  process.env.API_BASE_URL || "https://cardiovascular-care-backend.onrender.com";

let PATIENT_ID = process.env.DEMO_PATIENT_ID || "P001";

// Machine-readable output mode: node simulator.js --json
const MACHINE = process.argv.includes("--json");

// ============================================================
// Tiny HTTP layer (zero dependencies)
// ============================================================

const agent = new https.Agent({ keepAlive: true, maxSockets: 4 });

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(BASE_URL + path);
    } catch (e) {
      reject(new Error("Invalid BASE_URL: " + BASE_URL));
      return;
    }

    const transport = url.protocol === "http:" ? http : https;
    const payload = body === undefined ? null : JSON.stringify(body);

    const req = transport.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "http:" ? 80 : 443),
        path: url.pathname + url.search,
        method,
        agent,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": payload ? Buffer.byteLength(payload) : 0
        }
      },
      res => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", chunk => (data += chunk));
        res.on("end", () => {
          let parsed = null;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch (e) {
            parsed = null;
          }
          resolve({ status: res.statusCode, body: parsed, raw: data });
        });
      }
    );

    req.setTimeout(30000, () => req.destroy(new Error("Request timed out")));
    req.on("error", reject);
    req.end(payload);
  });
}

// ============================================================
// Console helpers
// ============================================================

const LINE = "=".repeat(58);

function log(...args) {
  if (!MACHINE) console.log(...args);
}
function logRaw(...args) {
  console.log(...args); // always printed (even in --json mode)
}

function banner() {
  log("");
  log(LINE);
  log("     CARDIOVASCULAR CARE ASSISTANT SIMULATOR");
  log(LINE);
  log("  Patient   : " + PATIENT_ID);
  log("  Backend   : " + BASE_URL);
  log("  Mode      : Synthetic wearable data (academic demo)");
  log("  Notice    : Not a medical device. Not for clinical use.");
  log(LINE);
}

function printPayload(payload) {
  log("  Sending reading...");
  log("  Payload:");
  log(
    payload
      .split("\n")
      .map(l => "    " + l)
      .join("\n")
  );
}

function printReadingResponse(resp) {
  const body = resp.body || {};
  log("  Backend response: HTTP " + resp.status);
  if (resp.status >= 200 && resp.status < 300 && body.success) {
    log("  Reading stored: " + (body.readingId || "(no id)"));
    const alerts = Array.isArray(body.alertsCreated) ? body.alertsCreated : [];
    if (alerts.length === 0) {
      log("  Result: SUCCESS. No abnormal alert generated.");
    } else {
      log("  Result: SUCCESS. Backend generated " + alerts.length + " alert(s):");
      alerts.forEach(a => {
        log(
          "    - " +
            a.type +
            " (value " +
            a.value +
            " vs threshold " +
            a.threshold +
            ", alertId " +
            a.alertId +
            ")"
        );
      });
    }
  } else {
    log("  Result: FAILED. " + JSON.stringify(body));
  }
  log(LINE);
}

function printSosResponse(resp) {
  const body = resp.body || {};
  log("  Backend response: HTTP " + resp.status);
  if (resp.status >= 200 && resp.status < 300 && body.success) {
    log("  Result: SUCCESS. SOS alert created: " + body.alertId);
  } else {
    log("  Result: FAILED. " + JSON.stringify(body));
  }
  log(LINE);
}

// ============================================================
// Synthetic signal generation
// ============================================================

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

const ACTIVITY_LABELS = ["Resting", "Walking", "Running"];

/** Virtual device state (like registers on the real wearable). */
const device = {
  hr: 78,
  spo2: 98,
  battery: 85,
  activity: 0, // 0 = Resting, 1 = Walking, 2 = Running
  sends: 0
};

/**
 * Synthetic ECG-like sample (prototype visualization only — NOT diagnostic).
 * Simple P-QRS-T shaped waveform on a 10-bit ADC-style baseline of 512.
 */
function ecgSample(timeSec, bpm) {
  const period = 60 / bpm;
  const phase = (timeSec % period) / period;
  const base = 512;
  if (phase < 0.08) return base + Math.round(85 * Math.sin((phase / 0.08) * Math.PI));
  if (phase < 0.12) return base - Math.round(35 * Math.sin(((phase - 0.08) / 0.04) * Math.PI));
  if (phase < 0.20) return base + Math.round(20 * Math.sin(((phase - 0.12) / 0.08) * Math.PI));
  if (phase < 0.32) return base - Math.round(30 * Math.sin(((phase - 0.20) / 0.12) * Math.PI));
  return base + randInt(-4, 4);
}

function buildReading(mode) {
  device.sends++;
  if (device.sends % 8 === 0) device.battery = Math.max(1, device.battery - 1);

  if (mode === "normal") {
    device.hr = clamp(device.hr + randInt(-3, 3), 62, 92);
    device.spo2 = clamp(device.spo2 + randInt(-1, 1), 96, 99);
    if (device.sends % 7 === 0) device.activity = 1; // occasionally "walking"
    else device.activity = 0;
  } else if (mode === "high-hr") {
    device.hr = randInt(115, 128);
    device.spo2 = clamp(device.spo2, 96, 99);
    device.activity = 0;
  } else if (mode === "low-hr") {
    device.hr = randInt(38, 46);
    device.spo2 = clamp(device.spo2, 96, 99);
    device.activity = 0;
  } else if (mode === "low-spo2") {
    device.hr = clamp(device.hr + randInt(-2, 4), 70, 90);
    device.spo2 = randInt(88, 91);
    device.activity = 0;
  }

  return {
    patientId: PATIENT_ID,
    heartRate: device.hr,
    spo2: device.spo2,
    battery: device.battery,
    activity: device.activity,
    ecg: ecgSample(Date.now() / 1000, device.hr)
  };
}

// ============================================================
// Actions
// ============================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** POST /health-readings with a contract-exact payload. */
async function sendReading(payload) {
  if (MACHINE) {
    logRaw(JSON.stringify({ event: "reading_sent", payload }));
  } else {
    printPayload(JSON.stringify(payload, null, 2));
  }
  try {
    const resp = await request("POST", "/health-readings", payload);
    if (MACHINE) {
      logRaw(JSON.stringify({ event: "reading_response", status: resp.status, body: resp.body }));
    } else {
      printReadingResponse(resp);
    }
    return resp;
  } catch (err) {
    const msg = "Backend unreachable: " + err.message;
    if (MACHINE) logRaw(JSON.stringify({ event: "error", error: msg }));
    else log("  ERROR: " + msg + "\n" + LINE);
    return null;
  }
}

/** POST /sos with a contract-exact payload. */
async function sendSOS() {
  const payload = {
    patientId: PATIENT_ID,
    message: "Emergency assistance required",
    location: "Demo Location"
  };
  if (MACHINE) {
    logRaw(JSON.stringify({ event: "sos_sent", payload }));
  } else {
    log("  Sending SOS...");
    log("  Payload:");
    log(
      JSON.stringify(payload, null, 2)
        .split("\n")
        .map(l => "    " + l)
        .join("\n")
    );
  }
  try {
    const resp = await request("POST", "/sos", payload);
    if (MACHINE) {
      logRaw(JSON.stringify({ event: "sos_response", status: resp.status, body: resp.body }));
    } else {
      printSosResponse(resp);
    }
    return resp;
  } catch (err) {
    const msg = "Backend unreachable: " + err.message;
    if (MACHINE) logRaw(JSON.stringify({ event: "error", error: msg }));
    else log("  ERROR: " + msg + "\n" + LINE);
    return null;
  }
}

// ============================================================
// Scenario runners (single-shot)
// ============================================================

async function runScenario(mode) {
  const payload = buildReading(mode);
  await sendReading(payload);
}

// ============================================================
// Continuous monitoring mode
// ============================================================

let stopContinuous = false;
let inContinuous = false;

async function continuousMonitoring(intervalSec) {
  const interval = clamp(Number(intervalSec) || 4, 2, 30);
  stopContinuous = false;
  inContinuous = true;

  log("");
  log("  CONTINUOUS MONITORING started");
  log("  Sending one realistic reading every " + interval + "s (values vary like a real device).");
  log("  Press Ctrl+C to stop continuous mode and return to the menu.");
  log(LINE);

  let cycle = 0;
  while (!stopContinuous) {
    const payload = buildReading("normal");
    await sendReading(payload);
    cycle++;
    await sleep(interval * 1000);
  }

  inContinuous = false;
  log("");
  log("  Continuous monitoring stopped after " + cycle + " reading(s).");
  log(LINE);
}

// ============================================================
// Interactive menu
// ============================================================

function printMenu() {
  log("");
  log("  1. Normal Reading");
  log("  2. High Heart Rate");
  log("  3. Low SpO2");
  log("  4. Low Heart Rate");
  log("  5. SOS");
  log("  6. Continuous Monitoring");
  log("  7. Exit");
}

async function main() {
  const args = process.argv.slice(2);

  // ---- Non-interactive flags (for scripted demos) ----
  const flagArg = name => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : null;
  };
  const urlFlag = flagArg("--base-url");
  if (urlFlag) {
    BASE_URL = urlFlag; // used by request() at call time
  }
  const patientFlag = flagArg("--patient");
  if (patientFlag) PATIENT_ID = patientFlag;

  const scenarioMap = {
    normal: "normal",
    "1": "normal",
    high: "high-hr",
    "high-hr": "high-hr",
    "2": "high-hr",
    lowspo2: "low-spo2",
    "low-spo2": "low-spo2",
    "3": "low-spo2",
    lowhr: "low-hr",
    "low-hr": "low-hr",
    "4": "low-hr",
    sos: "sos",
    "5": "sos"
  };

  const scenarioIdx = args.findIndex(a => a === "--scenario" || a === "-s");
  if (scenarioIdx >= 0 && scenarioMap[args[scenarioIdx + 1]]) {
    const mode = scenarioMap[args[scenarioIdx + 1]];
    if (mode === "sos") {
      banner();
      await sendSOS();
    } else {
      banner();
      await runScenario(mode);
    }
    return;
  }

  const contIdx = args.findIndex(a => a === "--continuous" || a === "-c");
  if (contIdx >= 0) {
    const interval = Number(args[contIdx + 1]) || 4;
    banner();
    await continuousMonitoring(interval);
    return;
  }

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Cardiovascular Care Assistant — Wearable Simulator

Usage:
  node simulator.js                     Interactive menu
  node simulator.js --scenario normal   One-shot: normal | high | lowspo2 | lowhr | sos
  node simulator.js --continuous [sec]  Continuous monitoring (default 4s interval)
  node simulator.js --json              Machine-readable output (for scripts)
  node simulator.js --patient P002      Override demo patient id
  node simulator.js --base-url <url>    Override backend base URL

Environment:
  API_BASE_URL      Backend base URL
  DEMO_PATIENT_ID   Default patient id (P001)
`);
    return;
  }

  // ---- Interactive mode ----
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const ask = q =>
    new Promise(resolve => rl.question(q, resolve));

  rl.on("SIGINT", () => {
    if (inContinuous) {
      stopContinuous = true; // graceful stop, back to menu
    } else {
      log("\n  Exiting simulator. Goodbye!");
      rl.close();
      process.exit(0);
    }
  });

  banner();

  // Backend reachability check (like the mobile app checking its connection)
  try {
    const health = await request("GET", "/");
    log(
      health && health.status === 200
        ? "  Backend check: CONNECTED (HTTP 200)"
        : "  Backend check: unexpected status HTTP " + (health && health.status)
    );
  } catch (e) {
    log("  Backend check: UNREACHABLE (" + e.message + ")");
    log("  The simulator will still try to send when you pick a scenario.");
  }

  let running = true;
  while (running) {
    printMenu();
    const choice = (await ask("\n  Select scenario: ")).trim();

    switch (choice) {
      case "1":
        await runScenario("normal");
        break;
      case "2":
        await runScenario("high-hr");
        break;
      case "3":
        await runScenario("low-spo2");
        break;
      case "4":
        await runScenario("low-hr");
        break;
      case "5":
        await sendSOS();
        break;
      case "6": {
        const secStr = (
          await ask("  Interval in seconds [4]: ")
        ).trim();
        await continuousMonitoring(Number(secStr) || 4);
        break;
      }
      case "7":
        log("  Exiting simulator. Goodbye!");
        running = false;
        break;
      default:
        log("  Invalid choice. Please enter 1-7.");
    }
  }

  rl.close();
}

main().catch(err => {
  console.error("Fatal simulator error:", err);
  process.exit(1);
});
