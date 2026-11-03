import { json, readBody, getSession } from "../_shared.js";

export async function onRequestPost({ request, env }) {
  const user = await getSession(request, env);

  if (!user) {
    return json({ error: "Connecte-toi pour gérer tes favoris." }, 401);
  }

  const body = await readBody(request);
  const episodeId = body?.episodeId;

  if (
    typeof episodeId !== "string" ||
    !episodeId ||
    episodeId.length > 1000 ||
    typeof body.favorite !== "boolean"
  ) {
    return json({ error: "Informations invalides." }, 400);
  }

  try {
    if (body.favorite) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO favorites (user_id, episode_id)
         VALUES (?, ?)`
      ).bind(user.id, episodeId).run();
    } else {
      await env.DB.prepare(
        `DELETE FROM favorites
         WHERE user_id = ? AND episode_id = ?`
      ).bind(user.id, episodeId).run();
    }

    return json({ success: true });
  } catch {
    return json({ error: "Impossible de modifier ce favori." }, 500);
  }
}
