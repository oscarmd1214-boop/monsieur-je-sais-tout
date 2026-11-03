import {
  json,
  readBody,
  hashPassword,
  fromHex,
  createSession,
  sessionCookie
} from "../../_shared.js";

export async function onRequestPost({ request, env }) {
  const body = await readBody(request);

  if (!body || typeof body.username !== "string" ||
      typeof body.password !== "string") {
    return json({ error: "Informations invalides." }, 400);
  }

  const username = body.username.trim().toLowerCase();
  const password = body.password;

  const user = await env.DB.prepare(
    "SELECT id, username, password_hash, salt FROM users WHERE username = ?"
  ).bind(username).first();

  if (!user) {
    return json({ error: "Pseudo ou mot de passe incorrect." }, 401);
  }

  const salt = fromHex(user.salt);
  const passwordHash = await hashPassword(password, salt);

  if (passwordHash !== user.password_hash) {
    return json({ error: "Pseudo ou mot de passe incorrect." }, 401);
  }

  const token = await createSession(env.DB, user.id, env.SESSION_PEPPER);

  return json(
    {
      user: {
        id: user.id,
        username: user.username
      },
      favorites: []
    },
    200,
    { "Set-Cookie": sessionCookie(token) }
  );
}
