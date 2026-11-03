const encoder = new TextEncoder();

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

export async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function getCookie(request, name) {
  const cookies = request.headers.get("Cookie") || "";
  const match = cookies.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]*)`)
  );

  return match ? decodeURIComponent(match[1]) : null;
}

export async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 310000,
      hash: "SHA-256"
    },
    key,
    256
  );

  return Array.from(new Uint8Array(bits))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function randomBytes(length = 32) {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function toHex(bytes) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function fromHex(hex) {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) {
    return new Uint8Array();
  }

  return new Uint8Array(
    hex.match(/.{2}/g).map((byte) => parseInt(byte, 16))
  );
}

export async function createSession(db, userId, pepper) {
  const token = toHex(randomBytes(32));
  const tokenHash = await hashPassword(token, encoder.encode(pepper));

  await db.prepare(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)"
  ).bind(
    tokenHash,
    userId,
    Date.now() + 30 * 24 * 60 * 60 * 1000
  ).run();

  return token;
}

export async function getSession(request, env) {
  const token = getCookie(request, "mjs_session");
  if (!token) return null;

  const tokenHash = await hashPassword(
    token,
    encoder.encode(env.SESSION_PEPPER)
  );

  const session = await env.DB.prepare(
    `SELECT users.id, users.username
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ? AND sessions.expires_at > ?`
  ).bind(tokenHash, Date.now()).first();

  return session || null;
}

export function sessionCookie(token, maxAge = 2592000) {
  return `mjs_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
