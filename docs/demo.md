# Demo Guide — Cardiovascular Care Assistant

Academic prototype. Synthetic data only. Not a medical device.

## Before the demo (5 minutes)

1. `npm run serve` → hub at http://localhost:3001
2. Open **three tabs**:
   - http://localhost:3001/frontend/doctor-dashboard/
   - http://localhost:3001/frontend/patient-app/
   - http://localhost:3001/frontend/simulator/
3. Verify "Backend Connected" (green dot) on all pages.
   (Render free tier sleeps after ~15 min idle — the first request takes
   30–60 s while it wakes, and the UI now auto-retries with a
   "Waking backend" indicator. **Tip:** open the hub ~5 minutes before the
   demo and leave the tab open — it pings the backend every 50 s to keep
   it warm for the whole session. A GitHub Action also pings the backend
   every 10 minutes automatically (keep-alive workflow), so this is just a
   second safety net.)
4. Optional CLI alternative for the simulator:
   `node simulator/simulator.js` (menu) or `--scenario high` flags.

## The story (say this, roughly)

> "Normally the wearable collects physiological data through the MAX30102, AD8232,
> and MPU6050 sensors and sends it via the ESP32 over BLE to the patient's mobile
> application. The mobile app synchronizes the readings with our cloud backend,
> which stores them in Firestore and evaluates configured prototype thresholds.
> The doctor dashboard retrieves everything through the backend APIs.
> Because the physical wearable is still under hardware development, we have
> implemented a software wearable simulator that produces the same type of sensor
> payload the mobile application is expected to receive from the ESP32. Therefore
> the backend, alert pipeline, and dashboard can be demonstrated independently of
> the hardware — and later only that first block is replaced."

## Step-by-step script

| # | Do | Say / show |
|---|---|---|
| 1 | Hub page | Architecture walk-through (diagram above or slides) |
| 2 | Dashboard | "This is our synthetic demonstration patient, P001" — point at patient header + thresholds |
| 3 | Simulator → **Normal** | Dashboard vitals turn ~HR 75-85, SpO2 97-99, Resting, battery; ECG trace sweeps; **no alert** |
| 4 | Simulator → **High Heart Rate** | HR jumps to ~120 (red card). Within ≤4 s an `ABNORMAL_HEART_RATE_HIGH` alert appears with value 120, threshold 100 |
| 5 | Dashboard → **ACKNOWLEDGE** | Badge flips ACTIVE → ACKNOWLEDGED, button disappears |
| 6 | Simulator → **Low SpO2** | SpO2 card goes red at ~90; `LOW_SPO2` alert appears |
| 7 | Simulator → **SOS** | Full-width red "SOS EMERGENCY" strip appears at the top of the dashboard + SOS panel event |
| 8 | Patient app tab | Show the same alerts, medications (Demo Medicine 08:00, Demo Statin 21:00), appointment (Dr. Demo, Oct 1), and the big SOS button |
| 9 | Dashboard → History | Point at HR/SpO2 charts with dashed prototype-threshold lines; switch Last 30 / 60 / All |
| 10 | Close | "The wearable layer is simulated; the same data contract lets the ESP32/BLE layer replace the simulator without redesigning the software." |

## Scenario reference (expected backend behavior)

| Scenario | Payload highlights | Expected alert |
|---|---|---|
| Normal | HR ~78, SpO2 ~98, battery 85, activity 0 | none |
| High HR | HR ~120 | `ABNORMAL_HEART_RATE_HIGH` |
| Low SpO2 | SpO2 ~90 | `LOW_SPO2` |
| Low HR | HR ~40 | `ABNORMAL_HEART_RATE_LOW` |
| SOS | `POST /sos` | `SOS` |

## Q&A ammunition

- **Why polling?** The contract defines REST only; we deliberately did not invent a
  WebSocket architecture for the prototype. 3–5 s polling gives near-real-time UX.
- **Who decides a reading is abnormal?** Only the backend, against configured
  patient thresholds. Frontends only display. Thresholds are demo values, not
  medical advice.
- **Where does the ECG come from?** A synthetic P-QRS-T-shaped waveform sample per
  reading ("Synthetic ECG Signal" — visualization only, not diagnostic).
- **Security?** No secrets in any frontend; Firestore access only via the backend;
  synthetic data; auth/RBAC is future scope.
- **What's next?** ESP32 firmware + BLE, authentication, caregiver escalation,
  and a future context-aware intelligence layer (persistence, baselines,
  escalation states) — not implemented yet.

## Troubleshooting

- **"Backend unavailable — retrying…"** → Render cold start; wait and it recovers
  automatically. First request of the day is slow.
- **No alert appeared** → Check the simulator log entry: `alertsCreated` must list
  the alert. If HTTP failed, check `Content-Type: application/json` and the payload.
- **Dashboard stale** → It polls every 4 s; the "Updated Xs ago" caption shows data
  freshness.
