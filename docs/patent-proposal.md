# PATENT PROPOSAL — CONFIDENTIAL DISCLOSURE

> **Notice.** This document is a confidential invention disclosure prepared for evaluation,
> prior-art review, and possible patent filing. It describes an academic prototype and
> *planned* embodiments. Nothing in this document constitutes medical advice, and the
> system described is **not** a medical device and is **not** clinically validated.
> Statements about features not yet implemented are explicitly labeled as future
> embodiments and are presented for completeness of disclosure only.

---

## Document Control

| Item | Value |
|---|---|
| Working title | Context-Aware Cardiovascular Monitoring and Escalation System |
| Provisional title (for filing) | *System and Method for Activity-Aware, Persistence-Verified Escalation of Cardiovascular Alerts in a Wearable Health-Monitoring Ecosystem* |
| Disclosure type | Provisional patent application draft / invention disclosure |
| Inventors | [Team member names + contributions — to be completed] |
| Institution | [College / university name, tech-transfer office contact] |
| Date of first disclosure | 2026-09-19 (this document) |
| Implementation status | Core concepts prototyped (rule-based tier); escalation engine specified as future embodiment |
| Classification (CPC, preliminary) | A61B 5/024 (heart rate), A61B 5/1455 (SpO2), A61B 5/316 (ECG), A61B 5/11 (movement/activity), A61B 5/7264 (alarm generation), G16H 40/63 (health-monitoring alert management), G16H 50/30 (health risk prediction) |

---

## 1. EXECUTIVE SUMMARY

Consumer wearables and hospital telemetry systems exist, but they fail in a specific,
recurring way at the moment that matters most: **deciding when a single abnormal
physiological reading deserves a human's attention, and who that human should be.**

Current systems do one of two things:

1. **Threshold alarm systems** (including our own current prototype tier) fire an alert
   whenever a reading crosses a numeric boundary. On a wrist worn by a real person —
   running for a bus, climbing stairs, wearing a loose strap — this produces
   **alert fatigue** (crying wolf) and **alarm blindness** (the responder ignores
   the monitor). This is a documented failure mode in clinical literature on
   alarm fatigue.
2. **Clinician-interpreted systems** defer judgment to a human watching a monitor,
   which does not scale and fails when the patient is alone.

**The invention** is an escalation *architecture* — not a new sensor, not a diagnostic
model — that sits between raw physiological signals and human notification. It fuses
six synchronized input streams (physiological measurement, activity context,
patient-specific baseline, signal-quality estimate, abnormality persistence, and
patient response/recovery) into a deterministic finite-state escalation machine with
these states:

```
NORMAL → VERIFYING → PATIENT CHECK → ESCALATED → RECOVERY → NORMAL
                                   ↘ STALE → EMERGENCY DISPATCH
```

The state machine is **patient-configurable** (each patient has their own thresholds,
baselines, persistence windows, and escalation timers), **activity-aware** (the same
heart rate of 115 BPM is *expected context* while running but a *candidate event* at
rest), and **closed-loop** (the patient's acknowledgement or lack of response is itself
an input that drives the next state transition).

The inventive contribution is the **combination and synchronization** of these
mechanisms in a single event pipeline spanning a wearable device, a patient gateway
(mobile device), and a clinical dashboard, with a well-defined contract between the
tiers. Individual components (accelerometers, PPG sensors, threshold alerts, escalation
timers) are known; the synchronized, closed-loop, patient-personalized pipeline is not,
to the best of the inventors' knowledge after the preliminary search in §4.

**Business framing for the college report:** the invention converts noisy single-sample
alarms into low-noise, escalating, evidence-accumulating events, which directly targets
the #1 operational complaint in remote patient monitoring programs — false-alarm load
on clinical staff.

---

## 2. BACKGROUND AND PROBLEM STATEMENT

### 2.1 The deployment gap

A wrist-worn cardiovascular monitor (PPG heart rate + SpO2, single-lead ECG,
accelerometry) is physically incapable of producing clean, stationary signals in daily
life. Three artefact classes dominate:

| Artefact source | Physiological effect | Effect on a naive threshold system |
|---|---|---|
| Motion (walking, running) | PPG motion artefact, HR elevation | False HIGH-HR alarms during normal activity |
| Poor sensor coupling (loose strap) | Signal dropout, DC drift, implausible values | False LOW-SpO2 and flat-line ECG alarms |
| Natural inter-patient variation | Athlete resting HR of 45 BPM | False LOW-HR alarms for fit individuals; missed events for deconditioned patients at "normal" thresholds |

### 2.2 The alert-fatigue problem

When alarm rates exceed responder capacity, measured outcomes in clinical settings
include delayed response times, disabled alarms, and missed true events. Any remote
monitoring product that generates more than a few alerts per patient-day per responder
trains the responder to ignore the channel. Therefore **the value of the alert channel
is inversely proportional to its false-positive rate** — and single-sample thresholds
maximize false positives by construction.

### 2.3 Why existing approaches are insufficient

- **Threshold alarms** (all consumer fitness bands, most RPM platforms): no context,
  no persistence, no closed loop.
- ** arrhythmia-detection wearables**: strong single-parameter detection (e.g.,
  atrial fibrillation from PPG irregularity) but no *escalation choreography* — a
  flagged event becomes a passive report for later human review.
- **Hospital middleware escalation systems** (e.g., bed-to-pager escalation ladders):
  escalate on **time-since-alarm**, but have no patient-side signal at all — the
  system cannot know whether the patient is fine, responded, or is unresponsive —
  and no activity context, because the monitor is mains-powered and bed-bound.
- **ML anomaly detectors**: score events but produce a single confidence number;
  they do not define *what the system does* across time, across responders, or
  across recovery — and their opacity is a regulatory liability.

### 2.4 The precise problem statement

> Given a wearable cardiovascular monitor producing noisy, artefact-prone, episodic
> measurements of heart rate, blood oxygen, and cardiac electrical activity, together
> with an activity signal and an unreliable wireless link to a patient gateway;
> provide a mechanism that (a) suppresses contextually explainable abnormalities,
> (b) accumulates evidence over persistence windows before human notification,
> (c) personalizes all decision boundaries to the individual patient,
> (d) gives the patient a lightweight response channel whose use or non-use feeds
> back into the decision process, and (e) escalates along a defined ladder to
> caregiver and clinical endpoints with a complete, auditable event record —
> all while degrading gracefully when the wireless link is down.

---

## 3. SUMMARY OF THE INVENTION

### 3.1 The six fused inputs

The escalation engine computes state from a synchronized 6-tuple per evaluation cycle:

| # | Input | Source | Role in the invention |
|---|---|---|---|
| 1 | **Physiological measurement** `m(t)` — HR, SpO2, ECG features | PPG / single-lead ECG / backend features | The raw abnormality signal |
| 2 | **Activity context** `a(t)` — resting / walking / running (accelerometer-derived) | MPU-class IMU on the wearable | Gates and re-labels the same `m(t)`: abnormal-at-rest vs expected-under-exertion |
| 3 | **Patient-specific baseline** `B_p` — personal thresholds, personal resting ranges, personal SpO2 floor, learned from patient history | Backend per-patient profile (already in the prototype contract as `heartRateMin/heartRateMax/spo2Min`) | Replaces population thresholds; an athlete's 45 BPM is normal *for them* |
| 4 | **Signal-quality estimate** `q(t)` | On-device heuristics: ECG lead-on detection, PPG perfusion index, flat-line/dropout detection, wireless RSSI | Low-quality samples are *excluded* from evidence accumulation instead of generating alarms |
| 5 | **Persistence** `d(t, θ)` — duration for which the abnormality has held continuously within an evaluation window | Engine state | A 20-second excursion is noise; a 5-minute sustained excursion is an event |
| 6 | **Patient response** `r(t)` — acknowledged / interacted / no-response elapsed time | Patient app + wearable haptic/button | Converts the alert from broadcast to closed loop; non-response is itself diagnostic signal |

### 3.2 The escalation state machine (core inventive concept)

Deterministic, auditable, per-patient-configurable states and transitions:

```
        ┌────────────────────────────────────────────────────────────┐
        │                                                            │
        ▼                                                            │
    ┌────────┐   m violates B_p          ┌───────────┐   persists    │
───▶│ NORMAL │──────────────────────────▶│ VERIFYING │──────────┐    │
    └────────┘   a(t) = rest, q high     └───────────┘          │    │
        ▲            │ persist < W_v        │                     ▼    │
        │            │                      │ violation    ┌──────────────┐
        │            ▼                      ▼ clears       │ PATIENT CHECK│
        │      (return to NORMAL,     (return to NORMAL)   └──────┬───────┘
        │       event logged, no alert)          │                │
        │                                        │ no response    │ patient acks
        │                                        ▼ within T_p     ▼
        │                                 ┌────────────┐   ┌────────────┐
        │              m recovers         │ ESCALATED  │   │  RECOVERY  │
        └────────────────────────────────┤ (caregiver)│   │ (monitoring│
                 within T_r               └─────┬──────┘   │  window)   │
                                                │           └────────────┘
                                                │ no response / worsening
                                                ▼
                                         ┌──────────────┐
                                         │   EMERGENCY  │  (auto-dispatch,
                                         │   DISPATCH   │   location attach)
                                         └──────────────┘
```

Key claims embedded in the machine:

1. **VERIFYING gate** — abnormality alone never alerts; it must persist ≥ `W_v` with
   acceptable `q(t)` and with `a(t)` in a state where the violation is not *expected*
   (running excursions route to a recovery check, not an alarm).
2. **PATIENT CHECK** — the first human-facing stage is the *patient*, not the clinician:
   a haptic prompt ("Tap if OK"). This is the closed loop: `r(t)` within `T_p`
   routes to RECOVERY; non-response escalates. The patient is the cheapest, fastest,
   most context-aware responder available.
3. **ESCALATED ladder with independent timers** — caregiver at `T_c`, then clinical
   endpoint; each rung carries the accumulated evidence bundle (§3.4).
4. **RECOVERY state** — after response, the system does not assume resolution; it
   re-arms with a tightened verification window and can re-enter the ladder.
5. **STALE/data-loss handling** — if the gateway loses connectivity *while in an
   active state*, the wearable enters a local fallback (§3.5): the state machine
   executes on-device with cached baselines, and SOS dispatch can occur directly
   from the wearable.

### 3.3 Activity-context modulation (the "same value, different meaning" mechanism)

The engine maintains, per patient and per activity state, an *expected envelope*:

```
expected_HR(a) = B_p.resting_HR × g(a)     where g(rest)=1.0, g(walk)≈1.2–1.4,
                                            g(run)≈1.6–2.2 (patient-calibrated)
```

A violation is only *candidate* if `m(t)` violates the envelope for the *current*
`a(t)`. Additionally, a **post-exertion recovery rule**: after activity drops to rest,
`m(t)` must return to `B_p.resting` envelope within `T_rec`; failure *there* is a
candidate event even though every instantaneous value looked "athletic." This
transition-time rule is not derivable from any single-sample threshold and is a
distinctly claimable mechanism.

### 3.4 The evidence bundle (auditability as a feature)

Every state transition emits an **Evidence Bundle** — the frozen record consumed by
each escalation rung:

```json
{
  "eventId": "EV-...",
  "patientId": "P001",
  "parameter": "heartRate",
  "observed": {"value": 118, "duration_s": 312, "firstSeenAt": "..."},
  "context":  {"activity": "resting", "activityHistory": [...],
               "signalQuality": 0.92, "linkState": "gateway-live"},
  "personal": {"baseline": {"restingHR": [52, 88], "spo2Floor": 93},
               "thresholds": {"heartRateMax": 100}},
  "escalationState": "ESCALATED",
  "responseTimeline": [{"stage": "patient_check", "result": "timeout_90s"}],
  "prototypeNotice": "academic prototype — not a medical device"
}
```

This is what makes the system *auditable and regulatable-by-design*: a reviewer can
reconstruct exactly why the machine escalated, which no raw-alarm stream provides.

### 3.5 Tiered architecture and the on-device fallback

```
TIER 1 — Wearable (ESP32-class MCU)
  Sensors → quality filter → envelope pre-check → local state cache
  • Can run a degraded single-parameter persistence check offline
  • Owns SOS button (direct dispatch path, independent of Tiers 2–3)
  • Haptic/buzzer output for PATIENT CHECK stage

TIER 2 — Patient Gateway (mobile)
  BLE ingestion → API translation (exact contract) → patient response channel
  • Executes the FULL state machine when link is up
  • Buffer-and-forward during outage; wearable fallback covers the gap

TIER 3 — Clinical Backend + Dashboard
  Authoritative baselines/thresholds, Evidence Bundle store, escalation ladder,
  responder UI with acknowledge and recovery monitoring
```

The invention is the **contract between tiers**: a defined division of which
transitions each tier may execute under which connectivity states, so that patient
safety behavior degrades in a specified way rather than silently stopping.

### 3.6 What is implemented today vs. disclosed as future

| Mechanism | Status in prototype |
|---|---|
| Threshold alerts (HR hi/lo, SpO2 lo) vs *population* defaults | **Implemented** (backend, live) |
| Patient-specific threshold fields in contract | **Implemented** (stored/served) |
| SOS closed loop with acknowledge | **Implemented** (live) |
| Activity field in the data contract | **Implemented** (transported; not yet used in gating) |
| VERIFYING persistence gate | **Future embodiment** (specified herein) |
| Activity-envelope modulation + recovery rule | **Future embodiment** |
| Signal-quality exclusion | **Future embodiment** |
| Full state machine + Evidence Bundle schema | **Future embodiment** |
| On-device degraded fallback | **Future embodiment** (SOS path already exists) |

This honesty is deliberate: it is both ethically required and strategically useful —
the provisional filing *preserves* priority on the full architecture while the
prototype continues to mature toward it.

---

## 4. PRIOR-ART ANALYSIS (PRELIMINARY — NON-EXHAUSTIVE)

> §101/§102/§103 note (US): novelty lives in the *specific combination, the
> activity-envelope mechanism, the closed patient-response loop, and the tiered
> connectivity-fallback contract* — asserted as non-obvious over the combinations
> below. A professional search is mandatory before any non-provisional filing.

| Prior art class | Examples | What it teaches | Why the invention differs |
|---|---|---|---|
| Threshold wearables | Consumer fitness bands, basic RPM | Single-sample threshold alarms | No context gating, no persistence, no closed loop |
| AF-detection wearables | PPG irregularity detectors | Single-parameter event detection | Detection ≠ escalation choreography; no patient-response input |
| Hospital alarm middleware | Bed-to-pager escalation ladders | Time-based escalation rungs | No patient-side state, no activity context, no baselines; bed-bound only |
| Motion-compensated PPG | Academic signal-processing papers | Artefact reduction at signal level | Cleans *signals*; does not gate *decisions* by activity context |
| Fall-detection wearables | Accelerometer fall alarms | On-device event + escalation | Single event class; no physiological persistence/fusion/recovery states |
| ML anomaly detection | Research systems | Learned event scoring | Opaque single score; no deterministic auditable ladder, no recovery state |
| Telecare response chains | Nurse triage call flows | Human escalation ladders | Human-in-the-loop only; no device-side evidence or automated gating |

Closest single combination: *hospital middleware ladder* + *wearable vitals*. The
invention adds what neither has: the patient-response closed loop, the
activity-envelope modulation, persistence-gated evidence, personal baselines, and
the defined degraded-mode contract between device/gateway/cloud tiers.

---

## 5. DETAILED DISCLOSURE OF EMBODIMENTS

### 5.1 Embodiment 1 — Baseline (as prototyped)

Data flow: sensors → wearable → gateway → `POST /health-readings` (exact JSON contract:
`patientId, heartRate, spo2, ecg, activity, battery`) → backend rule engine
(`heartRateMin/heartRateMax/spo2Min` per patient) → alerts
(`ABNORMAL_HEART_RATE_HIGH/LOW`, `LOW_SPO2`, `SOS`) → dashboard with acknowledge.
This tier is operational and demonstrates the complete transport and alert contract
that Embodiments 2–4 extend without breaking (backward-compatible field evolution:
add `activityContext`, `signalQuality`, `evidence` objects; never rename existing
fields — consistent with the team's API contract governance).

### 5.2 Embodiment 2 — Persistence-gated verification

Upon a candidate violation of `B_p` with `a(t)` not explaining the value:

1. Enter VERIFYING; open persistence window `W_v` (patient-configurable, e.g., 30–180 s).
2. Accumulate only samples with `q(t) ≥ q_min`.
3. If violation holds continuously (or ≥ `P_frac` fraction of window) → PATIENT CHECK.
4. If cleared → log near-miss to Evidence Bundle store; **no alert emitted**.

Novel element: the *near-miss log*. Suppressed events are stored, giving clinicians
population-level insight into how often thresholds were nearly breached — data that
threshold-only systems discard.

### 5.3 Embodiment 3 — Activity-envelope modulation

Per-patient activity envelopes `expected(a)` learned during an onboarding calibration
period (supervised "walk/run/rest" sessions) and updated slowly over time
(exponentially-weighted, anomaly-resistant). Modulation applies in both directions:

- *Suppress:* HR 118 during running → no candidate.
- *Expose:* HR 92 with `a(t)=rest` against personal envelope max 85 → candidate,
  even though 92 < population threshold 100.
- *Recovery rule:* post-exertion return window `T_rec` (novel single-sample-invisible event class).

### 5.4 Embodiment 4 — Closed-loop response and the full ladder

PATIENT CHECK delivery: wearable haptic pattern + app push + large-UI affordance.
Response classes: `ack`, `sos` (patient self-escalates), `timeout`. Consequences:

- `ack` → RECOVERY (tightened window `W_r < W_v` for `T_mon`).
- `timeout` → ESCALATED: caregiver rung with Evidence Bundle; second timer `T_c`.
- Caregiver `ack` → rung held; else clinical endpoint; else EMERGENCY DISPATCH with
  last-known location from the gateway.

### 5.5 Embodiment 5 — Degraded connectivity contract

- Link up: full machine at Tier 2, authoritative state at Tier 3.
- Link down > `T_stale`: wearable promotes its cached baseline set and executes
  Embodiment-2 logic single-parameter; SOS button remains hardwired to dispatch.
- On reconnect: buffered Evidence Bundles upload; reconciliation rule: an event that
  *self-resolved* offline is logged, not alerted; an event persisting at reconnect
  resumes at its reached state with timers adjusted by elapsed offline time.

### 5.6 Alternate embodiments (scope-widening)

- Multi-patient nursing-station deployment with ladder per responder load.
- Escalation states augmented with ECG-morphology features (still rule-gated, ML-assisted).
- Baseline learning engine as a separate module consumed by any alert system.
- The Evidence Bundle as an interoperability artifact (FHIR-resource-shaped export).

---

## 6. CLAIMS (DRAFT — FOR PROVISIONAL FILING)

> Draft claims establish priority scope; they will be reshaped by counsel and the
> professional search. Method claims lead; system and CRM claims follow.

**Claim 1 (method — core).** A computer-implemented method for escalating
cardiovascular monitoring events, comprising: receiving, from a wearable device worn
by a patient, a physiological measurement and an activity measurement; comparing the
physiological measurement against a patient-specific baseline associated with the
patient rather than a population threshold; when the physiological measurement
violates the patient-specific baseline and the activity measurement does not explain
the violation, opening a persistence window and accumulating only measurements whose
signal quality satisfies a quality criterion; when the violation persists across the
persistence window, issuing a patient-response prompt to the patient; classifying the
patient's response into a response class; selecting, based on the response class and
elapsed response time, a next state among a recovery state and one or more escalation
states of an escalation ladder; and emitting, at each state transition, an evidence
record comprising the physiological measurement, the activity measurement, the
patient-specific baseline, a signal-quality value, and a response timeline.

**Claim 2.** The method of Claim 1, wherein the patient-specific baseline comprises
per-activity expected envelopes learned during a calibration period and updated over
time, and the comparing comprises comparing against the envelope corresponding to the
current activity.

**Claim 3.** The method of Claim 2, further comprising a post-exertion recovery rule:
after the activity measurement changes from an elevated-activity state to a resting
state, verifying return of the physiological measurement into the resting envelope
within a recovery interval, and treating failure thereof as a candidate violation.

**Claim 4.** The method of Claim 1, wherein measurements failing the quality criterion
are excluded from accumulation and near-miss violations that resolve within the
persistence window are logged without alerting.

**Claim 5.** The method of Claim 1, wherein non-response to the patient-response
prompt within a response interval causes advancement along the escalation ladder, and
acknowledgement causes entry into the recovery state with a verification window
shorter than the persistence window.

**Claim 6.** The method of Claim 1, wherein the escalation ladder comprises a
caregiver stage and a clinical stage with independent timers, each stage receiving the
evidence record emitted at the preceding transition.

**Claim 7.** The method of Claim 1, further comprising: detecting loss of a wireless
link between the wearable device and a patient gateway; and in response, executing a
degraded on-device verification using baselines cached on the wearable device, wherein
a manual emergency input on the wearable device dispatches an emergency alert
independently of the gateway.

**Claim 8.** The method of Claim 7, wherein, upon restoration of the link, buffered
evidence records are uploaded and a persisting violation resumes at its reached
escalation state with timers adjusted by elapsed offline time.

**Claim 9 (system).** A cardiovascular monitoring system comprising: a wearable device
including physiological and activity sensors, a signal-quality evaluator, a haptic
output device, and a manual emergency input; a patient gateway in wireless
communication with the wearable device and configured to execute an escalation state
machine; and a clinical backend storing patient-specific baselines and evidence
records and configured to manage an escalation ladder and responder interfaces;
wherein the wearable device, gateway, and backend execute a predefined connectivity
contract that designates which state transitions each executes in each of a plurality
of connectivity states.

**Claim 10.** The system of Claim 9, wherein the connectivity contract specifies that
the wearable device executes degraded single-parameter verification when the link has
been down longer than a staleness interval.

**Claim 11.** The system of Claim 9, wherein the evidence record is structured to be
rendered at each escalation stage as a reconstruction of the causal chain leading to
escalation.

**Claim 12 (CRM).** A non-transitory computer-readable medium storing instructions
that, when executed, cause the method of any of Claims 1–8.

*Anticipated dependent additions (counsel to finalize):* SpO2 co-verification gating
HR-only events; multi-parameter simultaneous-violation escalation boost; ECG-morphology
features as additional evidence fields; responder-load-aware routing; family/caregiver
notification rung.

---

## 7. INDUSTRIAL APPLICABILITY & ADVANTAGES

Applicable to remote patient monitoring, post-discharge transitional care, elderly
independent-living programs, athletic health monitoring, occupational health, and
military/first-responder monitoring.

1. **Alert-noise reduction** — context gating + persistence + quality exclusion attack
   false positives at three independent stages.
2. **Faster true-event response** — the patient-check loop converts minutes of
   "alarm sitting unanswered" into a timed, escalating process.
3. **Personalization without ML opacity** — deterministic, auditable, per-patient
   logic that regulators and clinicians can inspect.
4. **Graceful degradation** — specified behavior under link loss, a real-world
   requirement most academic systems ignore.
5. **Backward-compatible evolution** — the escalation layer extends the existing
   transport contract (§5.1) without breaking it; the prototype is a living
   reference implementation of the baseline embodiment.

---

## 8. RISK ASSESSMENT & HONEST LIMITATIONS

- **§101 subject-matter risk (US):** the core is a method of organizing a monitoring
  workflow; claims must be drafted to tie steps to concrete machine improvements
  (specific sensor inputs, timers, on-device caching, BLE link states) — the §5.5
  contract and quality-evaluator elements materially help here.
- **Prior-art risk:** crowded field; the professional search (§10, step 2) may surface
  combinations requiring narrower claims. The activity-envelope + patient-response
  combination is the strongest asserted differentiator.
- **Medical-device regulatory boundary:** the invention as disclosed performs
  *monitoring and notification*, not diagnosis; claims and marketing must stay inside
  wellness/monitoring framing (and the prototype carries that notice everywhere).
- **Academic context:** the team's obligations to the institution's IP policy must be
  confirmed before filing; the provisional costs ~$65–$130 (USPTO micro-entity) plus
  counsel time if used.

---

## 9. PRIORITIZED FILING PLAN

| Step | Action | Cost (est., US) | Timing |
|---|---|---|---|
| 1 | Internal disclosure + team inventor agreement + institution IP check | $0 | Week 0 |
| 2 | Professional prior-art search (focused on Claims 1–3, 9) | $500–$2,000 | Week 1–2 |
| 3 | **Provisional application** (this document + figures + prototype screenshots as exhibits) | $65–$130 fee + counsel hours | Week 3–4 |
| 4 | Continue implementation of Embodiments 2–5; log enabling evidence | — | Months 1–6 |
| 5 | 12-month gate: convert to non-provisional **only if** search clean + a credible commercial/research path exists; otherwise abandon silently (priority was preserved at near-zero cost) | $1,600+ fee + counsel | Month 12 |

International note: if the institution supports it, a PCT filing at the non-provisional
stage preserves most major jurisdictions; otherwise US-only provisional → non-provisional
is the low-cost default for a student team.

---

## 10. IMMEDIATE CHECKLIST (THIS WEEK)

- [ ] Fill in inventors + contributions (§ Document Control) — order matters legally.
- [ ] Confirm the institution's student IP policy (some colleges claim IP; some waive for coursework).
- [ ] Sign intra-team confidential disclosure agreements (this document is now the disclosure).
- [ ] Run one focused search pass on: *"activity-aware heart rate alert escalation wearable"*, *"persistence window alarm suppression patient monitoring"*, *"escalation ladder wearable patient response timeout"*; save every hit.
- [ ] Keep the prototype repo private-to-team while the provisional is prepared, or file first.
- [ ] Archive the exact prototype state (commit hash + screenshots + live URLs) as **enablement exhibits** for Embodiment 1.

---

## ABSTRACT (DRAFT, ≤150 WORDS — FILING STYLE)

A system and method for escalating cardiovascular monitoring events in a wearable
health-monitoring ecosystem. A wearable device measures a physiological parameter and
activity of a patient; a patient-specific baseline, rather than a population
threshold, defines abnormality for the patient's current activity via learned
per-activity envelopes. Candidate violations open a persistence window in which only
signal-qualified measurements accumulate; persisting violations trigger a
patient-response prompt whose acknowledgement or timeout selects between a recovery
state and an escalation ladder comprising caregiver and clinical stages with
independent timers. Each transition emits an evidence record reconstructing the causal
chain of the event. A predefined connectivity contract assigns state-machine
executions among wearable, patient gateway, and clinical backend, including a degraded
on-device verification mode and an emergency input operative during link loss.
Suppressed near-miss violations are logged to support retrospective analysis.
---

*End of disclosure. Confidential — do not distribute outside the project team and the
institution's tech-transfer office.*
