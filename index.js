// index.js
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(bodyParser.json());

// Initialisation Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

const db = admin.firestore();

// ----------------- Middleware Auth -----------------
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: "Token manquant" });

    const token = authHeader.split(" ")[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken; // uid accessible via req.user.uid
    next();
  } catch (error) {
    console.error("Erreur auth:", error);
    return res.status(401).json({ message: "Token invalide" });
  }
}

// ----------------- Signup API -----------------
app.post("/api/signup", async (req, res) => {
  try {
    const { name, surname, email, password, phone, originCountry, residenceCountry, birthdate } = req.body;

    if (!email || !password || !name || !surname) {
      return res.status(400).json({ message: "Champs manquants" });
    }

    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: `${name} ${surname}`,
    });

    await db.collection("users").doc(userRecord.uid).set({
      uid: userRecord.uid,
      name,
      surname,
      email,
      phone,
      originCountry,
      residenceCountry,
      birthdate,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const customToken = await admin.auth().createCustomToken(userRecord.uid);

    return res.status(201).json({
      message: "Inscription réussie",
      uid: userRecord.uid,
      token: customToken,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message });
  }
});

// ----------------- Login API -----------------
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email et mot de passe requis" });

    const firebaseLoginUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`;
    
    const response = await fetch(firebaseLoginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });

    const data = await response.json();

    if (data.error) return res.status(400).json({ message: data.error.message });

    return res.status(200).json({
      message: "Connexion réussie",
      uid: data.localId,
      token: data.idToken,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message });
  }
});

// ----------------- Get User Info API -----------------
app.get("/api/user", authenticate, async (req, res) => {
  try {
    const uid = req.user.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ message: "Utilisateur non trouvé" });

    return res.status(200).json(userDoc.data());
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: error.message });
  }
});

// ----------------- Save Testimony API -----------------
app.post("/api/testimonies", authenticate, async (req, res) => {
  try {
    const uid = req.user.uid;
    const {
  ethnie,
  nationalite,
  communaute,
  dateVoyage,
  villes,
  countryVisited,      // ✅ Nouveau
  securityRating,       // ✅ Nouveau
  observedDiscrimination,
  contextDiscrimination,
  frequence,
  temoignage,
  recommande,
  anonyme,
} = req.body;

    if (!temoignage) return res.status(400).json({ message: "Le témoignage est obligatoire" });

   const testimonyRef = await db.collection("testimonies").add({
  uid,
  ethnie,
  nationalite,
  communaute,
  dateVoyage,
  villes,
  countryVisited,        // ✅ Nouveau
  securityRating,        // ✅ Nouveau
  observedDiscrimination,
  contextDiscrimination,
  frequence,
  temoignage,
  recommande,
  anonyme,
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
});

    return res.status(201).json({
      message: "Témoignage enregistré",
      id: testimonyRef.id,
    });
  } catch (error) {
    console.error("Erreur enregistrement témoignage:", error);
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/testimonies", authenticate, async (req, res) => {
  try {
    const { country } = req.query;

    if (!country) {
      return res
        .status(400)
        .json({ message: "Le pays est requis pour filtrer les témoignages." });
    }

    const snapshot = await db
      .collection("testimonies")
      .orderBy("createdAt", "desc")
      .get();

    const testimonies = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter(
        (t) =>
          t.countryVisited &&
          t.countryVisited.toLowerCase().includes(country.toLowerCase())
      );

    return res.status(200).json(testimonies);
  } catch (error) {
    console.error("Erreur récupération témoignages:", error);
    return res.status(500).json({ message: error.message });
  }
});
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
