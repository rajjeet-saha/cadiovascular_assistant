const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const express = require("express");
const cors = require("cors");
const fs = require("fs");

let serviceAccount;

if (fs.existsSync("./firebase-service-account.json")) {
  serviceAccount = require("./firebase-service-account.json");
} else {
  serviceAccount = {
    project_id: process.env.FIREBASE_PROJECT_ID,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    private_key: process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
      : undefined
  };
}

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

const app = express();

app.use(cors());
app.use(express.json());


// ============================================================
// DEFAULT PROTOTYPE THRESHOLDS
// ============================================================

const DEFAULT_THRESHOLDS = {
  heartRateMin: 50,
  heartRateMax: 100,
  spo2Min: 94
};


// ============================================================
// HOME / HEALTH CHECK
// ============================================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Cardiovascular Care Assistant Backend is running",
    version: "1.0"
  });
});


// ============================================================
// PATIENT API
// ============================================================

// ------------------------------------------------------------
// POST /patients
// Create a new patient
// ------------------------------------------------------------

app.post("/patients", async (req, res) => {
  try {
    const {
      patientId,
      name,
      hospitalId,
      doctorId,
      age
    } = req.body;

    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: "patientId is required"
      });
    }

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "name is required"
      });
    }

    const existingPatient = await db
      .collection("patients")
      .doc(patientId)
      .get();

    if (existingPatient.exists) {
      return res.status(400).json({
        success: false,
        message: "Patient already exists"
      });
    }

    const patient = {
      patientId,
      name: name || null,
      hospitalId: hospitalId || null,
      doctorId: doctorId || null,
      age: age ?? null,

      // Prototype configuration values only
      thresholds: {
        ...DEFAULT_THRESHOLDS
      },

      createdAt: new Date().toISOString()
    };

    await db
      .collection("patients")
      .doc(patientId)
      .set(patient);

    res.status(201).json({
      success: true,
      message: "Patient created successfully",
      patientId
    });

  } catch (error) {
    console.error("Create patient error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});


// ------------------------------------------------------------
// GET /patients/:patientId
// Get patient information
// ------------------------------------------------------------

app.get("/patients/:patientId", async (req, res) => {
  try {
    const { patientId } = req.params;

    const patientDoc = await db
      .collection("patients")
      .doc(patientId)
      .get();

    if (!patientDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Patient not found"
      });
    }

    res.json({
      success: true,
      data: patientDoc.data()
    });

  } catch (error) {
    console.error("Get patient error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});


// ============================================================
// HEALTH READINGS API
// ============================================================

// ------------------------------------------------------------
// POST /health-readings
// Save health reading and check alert conditions
// ------------------------------------------------------------

app.post("/health-readings", async (req, res) => {
  try {

    const {
      patientId,
      heartRate,
      spo2,
      battery,
      activity,
      ecg
    } = req.body;


    // --------------------------------------------------------
    // Validate patientId
    // --------------------------------------------------------

    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: "patientId is required"
      });
    }


    // --------------------------------------------------------
    // Check patient
    // --------------------------------------------------------

    const patientDoc = await db
      .collection("patients")
      .doc(patientId)
      .get();

    if (!patientDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Patient not found"
      });
    }


    const patient = patientDoc.data();


    // --------------------------------------------------------
    // Get patient thresholds
    // --------------------------------------------------------

    const thresholds = {
      ...DEFAULT_THRESHOLDS,
      ...(patient.thresholds || {})
    };


    // --------------------------------------------------------
    // Create health reading
    // --------------------------------------------------------

    const reading = {
      patientId,

      heartRate: heartRate ?? null,

      spo2: spo2 ?? null,

      battery: battery ?? null,

      activity: activity ?? null,

      ecg: ecg ?? null,

      timestamp: new Date().toISOString()
    };


    // --------------------------------------------------------
    // Save reading
    // --------------------------------------------------------

    const readingRef = await db
      .collection("healthReadings")
      .add(reading);


    // --------------------------------------------------------
    // Alert array
    // --------------------------------------------------------

    const alertsCreated = [];


    // ========================================================
    // HIGH HEART RATE
    // ========================================================

    if (
      typeof heartRate === "number" &&
      heartRate > thresholds.heartRateMax
    ) {

      const alert = {
        patientId,

        type: "ABNORMAL_HEART_RATE_HIGH",

        parameter: "heartRate",

        value: heartRate,

        threshold: thresholds.heartRateMax,

        status: "active",

        acknowledged: false,

        message: "Heart rate above configured threshold",

        createdAt: new Date().toISOString()
      };


      const alertRef = await db
        .collection("alerts")
        .add(alert);


      alertsCreated.push({
        alertId: alertRef.id,
        ...alert
      });
    }


    // ========================================================
    // LOW HEART RATE
    // ========================================================

    if (
      typeof heartRate === "number" &&
      heartRate < thresholds.heartRateMin
    ) {

      const alert = {
        patientId,

        type: "ABNORMAL_HEART_RATE_LOW",

        parameter: "heartRate",

        value: heartRate,

        threshold: thresholds.heartRateMin,

        status: "active",

        acknowledged: false,

        message: "Heart rate below configured threshold",

        createdAt: new Date().toISOString()
      };


      const alertRef = await db
        .collection("alerts")
        .add(alert);


      alertsCreated.push({
        alertId: alertRef.id,
        ...alert
      });
    }


    // ========================================================
    // LOW SPO2
    // ========================================================

    if (
      typeof spo2 === "number" &&
      spo2 < thresholds.spo2Min
    ) {

      const alert = {
        patientId,

        type: "LOW_SPO2",

        parameter: "spo2",

        value: spo2,

        threshold: thresholds.spo2Min,

        status: "active",

        acknowledged: false,

        message: "SpO2 below configured threshold",

        createdAt: new Date().toISOString()
      };


      const alertRef = await db
        .collection("alerts")
        .add(alert);


      alertsCreated.push({
        alertId: alertRef.id,
        ...alert
      });
    }


    // ========================================================
    // RESPONSE
    // ========================================================

    res.status(201).json({

      success: true,

      readingId: readingRef.id,

      data: {
        ...reading
      },

      alertsCreated

    });

  } catch (error) {

    console.error("Health reading error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});


// ------------------------------------------------------------
// GET /health-readings/:patientId
// Get patient's health history
// ------------------------------------------------------------

app.get("/health-readings/:patientId", async (req, res) => {

  try {

    const { patientId } = req.params;


    const patientDoc = await db
      .collection("patients")
      .doc(patientId)
      .get();


    if (!patientDoc.exists) {

      return res.status(404).json({
        success: false,
        message: "Patient not found"
      });

    }


    const snapshot = await db
      .collection("healthReadings")
      .where("patientId", "==", patientId)
      .get();


    const readings = snapshot.docs
      .map(doc => ({
        readingId: doc.id,
        ...doc.data()
      }))
      .sort((a, b) =>
        new Date(b.timestamp) - new Date(a.timestamp)
      );


    res.json({

      success: true,

      data: readings

    });

  } catch (error) {

    console.error("Health history error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });

  }

});


// ============================================================
// ALERT API
// ============================================================

// ------------------------------------------------------------
// GET /alerts/:patientId
// Get all alerts for patient
// ------------------------------------------------------------

app.get("/alerts/:patientId", async (req, res) => {

  try {

    const { patientId } = req.params;


    const snapshot = await db
      .collection("alerts")
      .where("patientId", "==", patientId)
      .get();


    const alerts = snapshot.docs
      .map(doc => ({
        alertId: doc.id,
        ...doc.data()
      }))
      .sort((a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt)
      );


    res.json({

      success: true,

      data: alerts

    });

  } catch (error) {

    console.error("Get alerts error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });

  }

});


// ------------------------------------------------------------
// POST /alerts/:alertId/acknowledge
// Acknowledge an alert
// ------------------------------------------------------------

app.post("/alerts/:alertId/acknowledge", async (req, res) => {

  try {

    const { alertId } = req.params;


    const alertRef = db
      .collection("alerts")
      .doc(alertId);


    const alertDoc = await alertRef.get();


    if (!alertDoc.exists) {

      return res.status(404).json({
        success: false,
        message: "Alert not found"
      });

    }


    await alertRef.update({

      status: "acknowledged",

      acknowledged: true,

      acknowledgedAt: new Date().toISOString()

    });


    res.json({

      success: true,

      message: "Alert acknowledged successfully"

    });

  } catch (error) {

    console.error("Acknowledge alert error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });

  }

});


// ============================================================
// SOS API
// ============================================================

// ------------------------------------------------------------
// POST /sos
// Create SOS alert
// ------------------------------------------------------------

app.post("/sos", async (req, res) => {

  try {

    const {
      patientId,
      message,
      location
    } = req.body;


    if (!patientId) {

      return res.status(400).json({
        success: false,
        message: "patientId is required"
      });

    }


    const patientDoc = await db
      .collection("patients")
      .doc(patientId)
      .get();


    if (!patientDoc.exists) {

      return res.status(404).json({
        success: false,
        message: "Patient not found"
      });

    }


    const alert = {

      patientId,

      type: "SOS",

      parameter: null,

      value: null,

      threshold: null,

      status: "active",

      acknowledged: false,

      message: message || "Emergency SOS triggered",

      location: location || null,

      createdAt: new Date().toISOString()

    };


    const alertRef = await db
      .collection("alerts")
      .add(alert);


    res.status(201).json({

      success: true,

      message: "SOS alert created successfully",

      alertId: alertRef.id

    });

  } catch (error) {

    console.error("SOS error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });

  }

});


// ============================================================
// MEDICATION API
// ============================================================

// ------------------------------------------------------------
// POST /medications
// Add medication
// ------------------------------------------------------------

app.post("/medications", async (req, res) => {

  try {

    const {
      patientId,
      medicineName,
      dosage,
      time,
      instructions
    } = req.body;


    if (!patientId) {

      return res.status(400).json({
        success: false,
        message: "patientId is required"
      });

    }


    if (!medicineName) {

      return res.status(400).json({
        success: false,
        message: "medicineName is required"
      });

    }


    const patientDoc = await db
      .collection("patients")
      .doc(patientId)
      .get();


    if (!patientDoc.exists) {

      return res.status(404).json({
        success: false,
        message: "Patient not found"
      });

    }


    const medication = {

      patientId,

      medicineName,

      dosage: dosage || null,

      time: time || null,

      instructions: instructions || null,

      createdAt: new Date().toISOString()

    };


    const medicationRef = await db
      .collection("medications")
      .add(medication);


    res.status(201).json({

      success: true,

      message: "Medication added successfully",

      medicationId: medicationRef.id

    });

  } catch (error) {

    console.error("Medication error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });

  }

});


// ------------------------------------------------------------
// GET /medications/:patientId
// Get medications
// ------------------------------------------------------------

app.get("/medications/:patientId", async (req, res) => {

  try {

    const { patientId } = req.params;


    const snapshot = await db
      .collection("medications")
      .where("patientId", "==", patientId)
      .get();


    const medications = snapshot.docs.map(doc => ({

      medicationId: doc.id,

      ...doc.data()

    }));


    res.json({

      success: true,

      data: medications

    });

  } catch (error) {

    console.error("Get medications error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });

  }

});


// ============================================================
// APPOINTMENT API
// ============================================================

// ------------------------------------------------------------
// POST /appointments
// Add appointment
// ------------------------------------------------------------

app.post("/appointments", async (req, res) => {

  try {

    const {
      patientId,
      doctorName,
      date,
      time,
      purpose
    } = req.body;


    if (!patientId) {

      return res.status(400).json({
        success: false,
        message: "patientId is required"
      });

    }


    if (!doctorName) {

      return res.status(400).json({
        success: false,
        message: "doctorName is required"
      });

    }


    const patientDoc = await db
      .collection("patients")
      .doc(patientId)
      .get();


    if (!patientDoc.exists) {

      return res.status(404).json({
        success: false,
        message: "Patient not found"
      });

    }


    const appointment = {

      patientId,

      doctorName,

      date: date || null,

      time: time || null,

      purpose: purpose || null,

      createdAt: new Date().toISOString()

    };


    const appointmentRef = await db
      .collection("appointments")
      .add(appointment);


    res.status(201).json({

      success: true,

      message: "Appointment added successfully",

      appointmentId: appointmentRef.id

    });

  } catch (error) {

    console.error("Appointment error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });

  }

});


// ------------------------------------------------------------
// GET /appointments/:patientId
// Get appointments
// ------------------------------------------------------------

app.get("/appointments/:patientId", async (req, res) => {

  try {

    const { patientId } = req.params;


    const snapshot = await db
      .collection("appointments")
      .where("patientId", "==", patientId)
      .get();


    const appointments = snapshot.docs
      .map(doc => ({

        appointmentId: doc.id,

        ...doc.data()

      }))
      .sort((a, b) => {

        const dateA = `${a.date || ""} ${a.time || ""}`;

        const dateB = `${b.date || ""} ${b.time || ""}`;

        return dateA.localeCompare(dateB);

      });


    res.json({

      success: true,

      data: appointments

    });

  } catch (error) {

    console.error("Get appointments error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });

  }

});


// ============================================================
// SERVER
// ============================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {

  console.log("--------------------------------------------");

  console.log("Cardiovascular Care Assistant Backend");

  console.log(`Server running on port ${PORT}`);

  console.log("--------------------------------------------");

});