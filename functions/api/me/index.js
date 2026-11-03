
import { json, getSession } from "../../_shared.js";

export async function onRequestGet({ request, env }) {
  try {
    const user = await getSession(request, env);

    if (!user) {
      return json({ user: null }, 200);
    }

    const favorites = await env.DB.prepare(
      "SELECT episode_id FROM favorites WHERE user_id = ?"
    )
      .bind(user.id)
      .all();

    return json({
      user: {
        id: user.id,
        username: user.username
      },
      favorites: (favorites.results || []).map(
        (favorite) => favorite.episode_id
      )
    });
  } catch (error) {
    console.error("Erreur API /api/me :", error);
    return json({ error: "Erreur interne du serveur" }, 500);
  }
}
