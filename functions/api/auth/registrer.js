
import {
  json,
  readBody,
  hashPassword,
  randomBytes,
  toHex,
  createSession,
  sessionCookie
} from "../../_shared.js";

// TEST : vérifier que Cloudflare détecte cette route
export async function onRequestGet() {
  return json({
    route: "register",
    status: "fonction détectée",
    method: "GET"
  });
}

// INSCRIPTION
export async function onRequestPost({ request, env }) {
  try {
    // Vérification de la configuration
    if (!env.DB || !env.SESSION_PEPPER) {
      console.error("DB ou SESSION_PEPPER manquant.");

      return json({
        error: "Configuration du serveur incomplète."
      }, 500);
    }

    // Lecture des données
    const body = await readBody(request);

    if (
      !body ||
      typeof body.username !== "string" ||
      typeof body.password !== "string"
    ) {
      return json({
        error: "Informations invalides."
      }, 400);
    }

    const username = body.username.trim().toLowerCase();
    const password = body.password;

    // Vérification du pseudo
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      return json({
        error: "Le pseudo doit contenir 3 à 20 caractères (lettres, chiffres ou _)."
      }, 400);
    }

    // Vérification du mot de passe
    if (password.length < 10 || password.length > 128) {
      return json({
        error: "Le mot de passe doit contenir entre 10 et 128 caractères."
      }, 400);
    }

    // Vérifier si le pseudo existe déjà
    const existing = await env.DB.prepare(
      "SELECT id FROM users WHERE username = ?"
    ).bind(username).first();

    if (existing) {
      return json({
        error: "Ce pseudo est déjà utilisé."
      }, 409);
    }

    // Générer les identifiants
    const salt = randomBytes(16);
    const passwordHash = await hashPassword(password, salt);
    const id = crypto.randomUUID();

    // Créer l'utilisateur
    await env.DB.prepare(
      `INSERT INTO users (id, username, password_hash, salt)
       VALUES (?, ?, ?, ?)`
    ).bind(
      id,
      username,
      passwordHash,
      toHex(salt)
    ).run();

    // Créer la session
    const token = await createSession(
      env.DB,
      id,
      env.SESSION_PEPPER
    );

    // Réponse
    return json(
      {
        user: {
          id,
          username
        },
        favorites: []
      },
      201,
      {
        "Set-Cookie": sessionCookie(token)
      }
    );

  } catch (error) {
    console.error("Erreur inscription :", error);

    return json({
      error: "Erreur pendant la création du compte.",
      details: String(error?.message || error)
    }, 500);
  }
}
