
import {
  json,
  readBody,
  hashPassword,
  randomBytes,
  toHex,
  createSession,
  sessionCookie
} from "../../_shared.js";

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB || !env.SESSION_PEPPER) {
      console.error("Configuration DB ou SESSION_PEPPER manquante.");
      return json({ error: "Configuration du serveur incomplète." }, 500);
    }

    const body = await readBody(request);

    if (
      !body ||
      typeof body.username !== "string" ||
      typeof body.password !== "string"
    ) {
      return json({ error: "Informations invalides." }, 400);
    }

    const username = body.username.trim().toLowerCase();
    const password = body.password;

    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      return json({
        error: "Le pseudo doit contenir 3 à 20 caractères (lettres, chiffres ou _)."
      }, 400);
    }

    if (password.length < 10 || password.length > 128) {
      return json({
        error: "Le mot de passe doit contenir entre 10 et 128 caractères."
      }, 400);
    }

    const existing = await env.DB.prepare(
      "SELECT id FROM users WHERE username = ?"
    ).bind(username).first();

    if (existing) {
      return json({ error: "Ce pseudo est déjà utilisé." }, 409);
    }

    const salt = randomBytes(16);
    const passwordHash = await hashPassword(password, salt);
    const id = crypto.randomUUID();

    await env.DB.prepare(
      `INSERT INTO users (id, username, password_hash, salt)
       VALUES (?, ?, ?, ?)`
    ).bind(
      id,
      username,
      passwordHash,
      toHex(salt)
    ).run();

    const token = await createSession(
      env.DB,
      id,
      env.SESSION_PEPPER
    );

    return json(
      {
        user: { id, username },
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
      error: "Une erreur serveur est survenue pendant l'inscription."
    }, 500);
  }
}
