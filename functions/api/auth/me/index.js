import { json, getSession } from "../../../_shared.js";

export async function onRequestGet({ request, env }) {
  const user = await getSession(request, env);

  if (!user) {
    return json({ user: null, favorites: [] });
  }

  const result = await env.DB.prepare(
    "SELECT episode_id FROM favorites WHERE user_id = ?"
  ).bind(user.id).all();

  return json({
    user: {
      id: user.id,
      username: user.username
    },
    favorites: (result.results || []).map(row => row.episode_id)
  });
}
