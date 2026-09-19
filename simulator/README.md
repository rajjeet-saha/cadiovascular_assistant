# Wearable Simulator

Software stand-in for the physical wristband during the software demonstration.

> **Academic prototype.** Synthetic demonstration data only. Not a medical device,
> not clinically validated, not diagnostic. Thresholds are prototype configuration
> values, not medical advice.

## Why a simulator?

The final architecture is:

```
MAX30102 / AD8232 / MPU6050 -> ESP32 -> BLE -> Mobile App -> HTTPS/JSON -> Backend
```

The physical hardware is under development, so for the software demo the simulator
produces **the same type of payload the mobile application is expected to receive
from the ESP32** and sends it to the **existing backend** using the exact contract
in `API_CONTRACT.md`.

```
DEMO:  Wearable Simulator -> POST /health-readings -> Backend -> Firestore -> Dashboard
FUTURE: ESP32 + sensors   -> BLE -> Mobile App -> POST /health-readings -> (same backend)
```

Only the left-most block changes. Nothing else in the system is redesigned.

## Usage

```bash
cd simulator
node simulator.js                 # interactive menu
```

Menu:

```
1. Normal Reading
2. High Heart Rate
3. Low SpO2
4. Low Heart Rate
5. SOS
6. Continuous Monitoring
7. Exit
```

Non-interactive (useful for scripted demos / CI):

```bash
node simulator.js --scenario normal     # one normal reading
node simulator.js --scenario high       # HR ~120  -> ABNORMAL_HEART_RATE_HIGH
node simulator.js --scenario lowspo2    # SpO2 ~90 -> LOW_SPO2
node simulator.js --scenario lowhr      # HR ~40   -> ABNORMAL_HEART_RATE_LOW
node simulator.js --scenario sos        # POST /sos -> SOS alert
node simulator.js --continuous 4        # a realistic reading every 4 s
node simulator.js --json --scenario normal   # machine-readable output
node simulator.js --patient P002        # override demo patient
node simulator.js --base-url http://localhost:3000   # target a local backend
```

Environment variables: `API_BASE_URL`, `DEMO_PATIENT_ID`.

Zero npm dependencies — only Node.js built-ins (Node >= 16).

## What it sends

Exactly the contract payload (backend generates the timestamp):

```json
{
  "patientId": "P001",
  "heartRate": 78,
  "spo2": 98,
  "battery": 85,
  "activity": 0,
  "ecg": 512
}
```

- `activity`: `0 = Resting`, `1 = Walking`, `2 = Running`
- `ecg`: one numeric sample from a synthetic P-QRS-T-shaped waveform
  (baseline 512, 10-bit-ADC style). Displayed by the dashboard as
  **"Synthetic ECG Signal"** — visualization only, not diagnostic.
- Battery decreases slowly over time, like a real device.
- Continuous mode varies values realistically (HR 62–92, SpO2 96–99) instead of
  sending identical numbers.

## Expected backend behavior (per API_CONTRACT.md)

| Simulator action | Expected alert |
|---|---|
| Normal reading | none (`alertsCreated: []`) |
| HR ≈ 120 | `ABNORMAL_HEART_RATE_HIGH` |
| SpO2 ≈ 90 | `LOW_SPO2` |
| HR ≈ 40 | `ABNORMAL_HEART_RATE_LOW` |
| SOS | `SOS` (via `POST /sos`) |

If a POST fails, the simulator prints the HTTP status and response body —
check the endpoint, `Content-Type: application/json`, and payload before
assuming a backend problem.
