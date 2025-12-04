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
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });
}

const db = admin.firestore();

// 🔐 Middleware pour vérifier le token Firebase
async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Token manquant" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token invalide ou expiré" });
  }
}

// -------------------------- AUTH --------------------------

// 🔸 Signup
app.post("/api/signup", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email et mot de passe requis" });
    }

    const user = await admin.auth().createUser({
      email,
      password,
      displayName: name || "",
    });

    const token = await admin.auth().createCustomToken(user.uid);
    await db.collection("users").doc(user.uid).set({
      email,
      name: name || "",
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({ uid: user.uid, token });
  } catch (err) {
    console.error("Erreur signup:", err);
    res.status(500).json({ error: "Erreur lors de la création du compte" });
  }
});

// 🔸 Login
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email et mot de passe requis" });
  }

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      }
    );

    const data = await response.json();
    if (data.error) {
      return res.status(401).json({ error: "Identifiants incorrects" });
    }

    res.json({
      token: data.idToken,
      uid: data.localId,
      email: data.email,
    });
  } catch (err) {
    console.error("Erreur login:", err);
    res.status(500).json({ error: "Erreur serveur lors du login" });
  }
});

// 🔸 Récupérer l’utilisateur connecté
app.get("/api/user", verifyToken, async (req, res) => {
  try {
    const userDoc = await db.collection("users").doc(req.user.uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "Utilisateur non trouvé" });
    }
    res.json({ uid: req.user.uid, ...userDoc.data() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// -------------------------- TÉMOIGNAGES --------------------------

// 🔸 Ajouter un témoignage
app.post("/api/testimonies", verifyToken, async (req, res) => {
  try {
    const {
      countryVisited,
      villes,
      temoignage,
      securityRating,
      observedDiscrimination,
      contextDiscrimination,
      ethnie,
      recommande,
      anonyme,
      profil,
      frequence,
    } = req.body;

    // 🧩 Validation minimale
    if (!countryVisited || !temoignage) {
      return res
        .status(400)
        .json({ error: "Le pays et le témoignage sont requis." });
    }

    const testimonyData = {
      uid: req.user.uid,
      countryVisited,
      villes: villes || null,
      temoignage,
      securityRating: securityRating || "Non spécifié",
      observedDiscrimination: observedDiscrimination || "Non",
      contextDiscrimination: contextDiscrimination || null,
      ethnie: ethnie || null,
      recommande: recommande || null,
      anonyme: anonyme || "Non",
      profil: Array.isArray(profil) ? profil : [],
      frequence: Array.isArray(frequence) ? frequence : [],
      createdAt: new Date().toISOString(),
    };

    const docRef = await db.collection("testimonies").add(testimonyData);
    res.status(201).json({
      id: docRef.id,
      message: "Témoignage enregistré avec succès",
      data: testimonyData,
    });
  } catch (err) {
    console.error("Erreur lors de l’ajout du témoignage:", err);
    res.status(500).json({ error: "Erreur serveur lors de l’enregistrement" });
  }
});
app.get("/api/testimonies", async (req, res) => {
  try {
    let { country } = req.query;
    let query = db.collection("testimonies");

    // ✅ Si un filtre "country" est envoyé
    if (country && typeof country === "string" && country.trim() !== "") {
      // Normaliser (minuscules + trim)
      const normalizedCountry = country.trim().toLowerCase();

      // On va filtrer manuellement ensuite
      const snapshot = await query.get();

      const testimonies = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        // Filtrer manuellement (insensible à la casse et espaces)
        .filter((doc) => 
          doc.countryVisited &&
          doc.countryVisited.trim().toLowerCase() === normalizedCountry
        )
        // Trier par date
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return res.json(testimonies);
    }

    // Sinon, pas de filtre
    const snapshot = await query.get();

    const testimonies = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(testimonies);
  } catch (err) {
    console.error("❌ Erreur récupération témoignages:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// 🔸 Forgot Password - envoyer le code
app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email requis" });

  try {
    // Vérifier si l'utilisateur existe
    const user = await admin.auth().getUserByEmail(email);
    if (!user) return res.status(404).json({ message: "Utilisateur non trouvé" });

    // Générer un code aléatoire 6 chiffres
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Stocker le code dans Firestore avec expiration (10 minutes)
    await db.collection("passwordResets").doc(user.uid).set({
      code: resetCode,
      email,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min
    });

    // TODO: envoyer le code par email via un service email (SendGrid, nodemailer...)
    console.log(`Code de réinitialisation pour ${email}: ${resetCode}`);

    res.json({ message: "Code de réinitialisation envoyé par email (voir console pour test)" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur lors de la demande de réinitialisation" });
  }
});
// 🔸 Reset Password - vérifier code + changer mot de passe
app.post("/api/reset-password", async (req, res) => {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) {
    return res.status(400).json({ message: "Email, code et nouveau mot de passe requis" });
  }

  try {
    const user = await admin.auth().getUserByEmail(email);

    // Récupérer le code depuis Firestore
    const resetDoc = await db.collection("passwordResets").doc(user.uid).get();
    if (!resetDoc.exists) {
      return res.status(400).json({ message: "Aucune demande de réinitialisation trouvée" });
    }

    const data = resetDoc.data();
    const now = new Date();

    if (data.code !== code) {
      return res.status(400).json({ message: "Code incorrect" });
    }

    if (new Date(data.expiresAt) < now) {
      return res.status(400).json({ message: "Le code a expiré" });
    }

    // Mettre à jour le mot de passe
    await admin.auth().updateUser(user.uid, { password: newPassword });

    // Supprimer le code pour éviter réutilisation
    await db.collection("passwordResets").doc(user.uid).delete();

    res.json({ message: "Mot de passe réinitialisé avec succès" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur lors de la réinitialisation du mot de passe" });
  }
});



// --------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`🚀 Serveur Safetravel API en cours sur le port ${PORT}`);
});
