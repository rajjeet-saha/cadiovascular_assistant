# Architecture — Cardiovascular Care Assistant

Academic prototype. Synthetic data only. Not a medical device.

## System layers

```
┌────────────────────────────────────────────────────────────┐
│  SENSE (future hardware)                                   │
│  MAX30102 (HR, SpO2) · AD8232 (ECG) · MPU6050 (activity)   │
│  ESP32 DevKit V1 · OLED · buzzer · vibration · SOS button  │
│  Li-Po + TP4056                                            │
└──────────────┬─────────────────────────────────────────────┘
               │ BLE (custom GATT payload)
               ▼
┌────────────────────────────────────────────────────────────┐
│  BRIDGE — Patient Mobile App                               │
│  • receives wearable payload over BLE                      │
│  • patient visualization (vitals, ECG, alerts)             │
│  • SOS button, alert acknowledgement                       │
│  • medication + appointment display                        │
│  • converts to API contract (HTTPS / JSON)                 │
└──────────────┬─────────────────────────────────────────────┘
               │ POST /health-readings · POST /sos
               ▼
┌────────────────────────────────────────────────────────────┐
│  BACKEND — Express + Firebase Firestore (EXISTING)         │
│  server.js · deployed: cardiovascular-care-backend         │
│  .onrender.com                                             │
│  • stores readings, patients, meds, appointments           │
│  • RULE-BASED ALERT ENGINE (the only place that decides    │
│    abnormality, using configured patient thresholds)       │
│  • alert creation + acknowledgement                        │
└──────────────┬─────────────────────────────────────────────┘
               │ GET endpoints (JSON)
               ▼
┌────────────────────────────────────────────────────────────┐
│  DOCTOR DASHBOARD                                          │
│  vitals cards · synthetic ECG · history charts             │
│  alert panel + acknowledge · SOS panel                     │
│  medications · appointments · 4 s polling                  │
│  (never talks to Firestore directly)                       │
└────────────────────────────────────────────────────────────┘
```

## Demo substitution

The physical wristband is under hardware development. For the software demo the
left-most block is replaced by a simulator with **the identical output payload**:

```
DEMO:    Wearable Simulator (CLI node simulator/simulator.js | web frontend/simulator/)
              │  same JSON contract
              ▼
         POST /health-readings  /  POST /sos
```

Consequence: the backend, alert pipeline, dashboard, and patient app are
hardware-independent. Replacing the simulator with ESP32 firmware later requires no
change anywhere else in the system — only the mobile app's BLE receiver feeds the
same data into the same API calls.

## Data contract invariants

- Field names are fixed by `API_CONTRACT.md` (see README §8). No client renames them.
- Reading timestamps are backend-generated.
- `GET /health-readings/{patientId}` returns newest-first; clients reverse for plotting.
- Alert types/status values are enumerated and fixed.
- All UI→backend traffic goes through `frontend/src/services/api.js`.

## Real-time strategy

The contract defines REST only — no WebSockets are invented. Near-real-time is
achieved by polling every 4 s (spec range 3–5 s):

```
Simulator POST ──► backend creates alert ──► dashboard polls ──► alert appears
```

## Alert pipeline

1. Simulator/mobile posts a reading with contract fields.
2. Backend merges patient thresholds (defaults 50/100/94 — prototype values).
3. Backend creates `ABNORMAL_HEART_RATE_HIGH` / `ABNORMAL_HEART_RATE_LOW` /
   `LOW_SPO2` alerts as rules match; `POST /sos` creates `SOS` alerts.
4. Response `alertsCreated[]` lists what was generated.
5. Dashboard (and patient app) poll `GET /alerts/P001` and render status
   `active | acknowledged | resolved`; acknowledge buttons call
   `POST /alerts/{alertId}/acknowledge` and refresh.

## Failure handling

- Every fetch resolves to `{ok, status, data, error}` — never throws.
- UI shows "Backend unavailable — retrying…" and keeps polling; empty lists show
  "No alerts / No medications / No appointments" (not errors).
- Render free tier can cold-start (~30–60 s); the connection indicator reflects it.

## Future intelligence layer (NOT implemented — direction only)

A future engine could fuse activity context, patient baseline, signal quality,
persistence of abnormal readings, and recovery into escalation states
(NORMAL → EARLY WARNING → PATIENT CHECK → ESCALATION → RECOVERY). Today's
implemented mechanism is strictly the backend's rule-based alerts.
