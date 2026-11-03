import {
  json,
  getCookie,
  hashPassword,
  sessionCookie
} from "../../_shared.js";

const encoder = new TextEncoder();

export async function onRequestPost({ request, env }) {
  const token = getCookie(request, "mjs_session");

  if (token) {
    const tokenHash = await hashPassword(
      token,
      encoder.encode(env.SESSION_PEPPER)
    );

    await env.DB.prepare(
      "DELETE FROM sessions WHERE token_hash = ?"
    ).bind(tokenHash).run();
  }

  return json(
    { success: true },
    200,
    { "Set-Cookie": sessionCookie("", 0) }
  );
}
