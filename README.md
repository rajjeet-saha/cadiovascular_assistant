# Cardiovascular Care Assistant

**Smart wearable-based cardiovascular monitoring ecosystem — academic prototype.**

> ⚠️ **Academic prototype.** This system is intended for monitoring, visualization,
> reminders, and rule-based alert demonstration only. It is **not a medical
> diagnostic system**, not clinically validated, and not a medical device.
> All demonstration data is **synthetic** (demo patient `P001`).
> Thresholds are prototype configuration values, not medical advice.

---

## 1. Project overview

A patient wears a smart wristband that continuously collects heart rate, SpO2, ECG,
activity, and battery status, plus an SOS button. The wearable reaches the cloud
through the patient's mobile phone, and the care team monitors everything on a
hospital dashboard in near-real time.

## 2. Problem statement

Cardiovascular patients may require continuous monitoring and timely response, but
common setups rely on intermittent measurements, medication schedules that are easy
to miss, and slow communication between patient and healthcare provider.

## 3. Proposed solution

Wearable + Mobile app + Cloud backend + Doctor dashboard:

- continuous vitals collection (HR, SpO2, ECG, activity, battery)
- rule-based abnormal-vitals alerts evaluated by the backend
- emergency SOS flow
- medication and appointment information for both sides
- historical trends and near-real-time dashboard updates

## 4. Architecture

```
PATIENT
   ↓
SMART WRISTBAND (ESP32 + MAX30102 + AD8232 + MPU6050)
   ↓ BLE
PATIENT MOBILE APP
   ↓ HTTPS / JSON
EXPRESS BACKEND  →  FIREBASE FIRESTORE
   ↓ HTTPS / JSON
DOCTOR DASHBOARD
```

**Emergency flow:** SOS button → wearable/mobile → `POST /sos` → backend →
SOS alert → doctor dashboard.

**Demo substitution (hardware under development):** the wearable layer is replaced by
a software simulator that produces the same payload the mobile app is expected to
receive from the ESP32:

```
FUTURE:  ESP32 + sensors → BLE → Mobile App → Backend
DEMO:    Wearable Simulator (CLI or web) → Backend
```

Only the left-most block changes — backend, contract, dashboard, and patient app are
unchanged. This is the modular-architecture point to emphasize to reviewers.

## 5. Repository layout

```
cardiovascular-care-assistant/
├── API_CONTRACT.md            # source of truth for the team (do not rename fields)
├── backend/                   # EXISTING backend (Express + Firestore) — do not duplicate
│   ├── server.js              #   API implementation (deployed on Render)
│   └── package.json           #   backend dependencies
├── serve.js                   # zero-dependency static server for the frontend demo
├── index.html                 # launcher hub page
├── simulator/
│   ├── simulator.js           # CLI wearable simulator (zero deps, Node ≥ 16)
│   ├── package.json
│   └── README.md
├── frontend/
│   ├── styles.css             # shared healthcare-dashboard styling
│   ├── src/services/
│   │   ├── api.js             # centralized API service layer (all backend calls)
│   │   ├── helpers.js         # escaping, formatting, prototype threshold status
│   │   └── charts.js          # dependency-free canvas charts (line + ECG)
│   ├── doctor-dashboard/      # Person 6 deliverable
│   ├── patient-app/           # Person 3/4 deliverable (mobile-style UI)
│   └── simulator/             # web wearable simulator (demo orchestration)
└── docs/
    ├── architecture.md
    └── demo.md
```

## 6. Hardware (planned wearable)

| Component | Purpose |
|---|---|
| ESP32 DevKit V1 | sensor processing, BLE communication |
| MAX30102 | heart rate, SpO2 |
| AD8232 + electrodes | ECG |
| MPU6050 | activity/movement |
| 0.96" I2C OLED | local wearable display |
| Vibration motor / buzzer | silent / audible alert |
| Push button | SOS |
| Li-Po + TP4056 + switch | power |

The mobile app receives `patientId, heartRate, spo2, ecg, activity, battery, sos`
over BLE and converts them into the exact backend API contract.

## 7. Software components

- **Backend (existing, Person 5):** Express + Firebase Firestore REST API. Lives in
  `server.js` / deployed at `https://cardiovascular-care-backend.onrender.com`.
  Do not create a second backend or database.
- **Wearable simulator:** CLI (`simulator/simulator.js`) and web
  (`frontend/simulator/`) versions. Same payloads either way.
- **Doctor dashboard:** vitals, synthetic ECG, history charts, alerts with
  acknowledgement, SOS panel, medications, appointments; polls every 4 s.
- **Patient app:** mobile-style UI with vitals, ECG, alerts, big SOS button,
  medications, appointments.
- **API service layer:** every backend call goes through
  `frontend/src/services/api.js` — no scattered fetches, no direct Firestore access
  from any UI.

## 8. API

All endpoints, field names, and behaviors are defined in `API_CONTRACT.md`
(the team's source of truth). Summary:

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/patients` | Create patient |
| GET | `/patients/{patientId}` | Get patient (+ thresholds) |
| POST | `/health-readings` | Save reading; backend evaluates alert rules |
| GET | `/health-readings/{patientId}` | Health history (newest first) |
| GET | `/alerts/{patientId}` | Patient alerts |
| POST | `/alerts/{alertId}/acknowledge` | Acknowledge alert |
| POST | `/sos` | Create SOS alert |
| POST | `/medications` | Add medication |
| GET | `/medications/{patientId}` | Get medications |
| POST | `/appointments` | Add appointment |
| GET | `/appointments/{patientId}` | Get appointments |

Fixed field names (never rename): `patientId, heartRate, spo2, ecg, activity,
battery, alertId, type, parameter, value, threshold, status, acknowledged,
message, createdAt, medicineName, dosage, instructions, doctorName, hospitalId,
doctorId`. Reading timestamps are generated by the backend.

## 9. Alert system

Backend rule-based alerts (prototype thresholds — demo configuration, not medical
advice): `heartRateMin 50`, `heartRateMax 100`, `spo2Min 94`.

Alert types (fixed): `ABNORMAL_HEART_RATE_HIGH`, `ABNORMAL_HEART_RATE_LOW`,
`LOW_SPO2`, `SOS`. Status values: `active`, `acknowledged`, `resolved`.
The dashboard visually distinguishes all of them and offers ACKNOWLEDGE for
active alerts. The frontend never decides medical abnormality — the backend does.

## 10. Demo instructions (quick version)

```bash
npm install            # once (backend + tooling deps)
npm run serve          # hub at http://localhost:3001
npm start              # run the backend locally on :3000 (optional; deployed one is used by default)
```

Open the hub → **Doctor Dashboard**, **Patient App**, **Wearable Simulator**.
Trigger scenarios in the simulator and watch the dashboard update within ~4 s
(polling; the contract has no WebSockets by design).

Full step-by-step demo script: [`docs/demo.md`](docs/demo.md).
CLI simulator: see [`simulator/README.md`](simulator/README.md).

### Live hosted demo + backend keep-alive

The demo frontend is hosted on GitHub Pages:
`https://rajjeet-saha.github.io/cardiovascular-care-assistant/`

The Render free tier sleeps the backend after ~15 min without traffic. A scheduled
GitHub Action (`.github/workflows/keep-alive.yml` in the Pages repository) pings
the backend every 10 minutes so it stays warm and the demo opens instantly. If the
schedule is ever disabled (GitHub auto-pauses schedules after 60 days without a
commit), re-enable it in the repo's Actions tab or push any commit.

## 11. Patent proposal

A formal invention disclosure for the system's core research direction — the
**context-aware cardiovascular monitoring and escalation architecture** (activity-aware
alert gating, persistence-verified verification, patient-response closed loop,
escalation ladder with evidence bundles, and a defined connectivity-fallback contract
between wearable / gateway / backend) — is in **`docs/patent-proposal.md`**.

It is written in industry-standard filing format: background & problem statement,
summary of the invention, prior-art analysis, five detailed embodiments, draft
independent + dependent claims (method / system / CRM), abstract, risk assessment,
and a prioritized filing plan (provisional-first strategy). The document clearly
separates what the prototype implements today from what is disclosed as a future
embodiment.

## 12. Future scope

- AI/ML cardiovascular intelligence: activity context, patient-specific baseline,
  signal quality, persistence, escalation states (NORMAL → EARLY WARNING →
  PATIENT CHECK → ESCALATION → RECOVERY) — **future direction, not implemented**.
- Real ESP32 + sensor firmware over BLE.
- Firebase Authentication with role-based access (doctor/patient).
- Caregiver escalation, GPS location, blood-pressure integration.

## 13. Limitations

- Academic prototype; synthetic data only; not clinically validated; non-diagnostic.
- Simulator replaces the physical wearable for the software demo.
- Single-patient demo (`P001`); no authentication yet; polling-based updates
  (3–5 s) instead of a streaming connection.

## 14. Security / privacy principles

No credentials in the frontend, no Firebase service-account keys in any client,
backend-controlled Firestore access, synthetic patient data only, clear prototype
labeling throughout the UI. Future: authentication, RBAC, encrypted BLE pairing,
audit logs.
